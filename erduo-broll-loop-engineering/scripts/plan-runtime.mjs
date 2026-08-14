#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRecipeDirectory } from './validate-shot-recipes.mjs';
import { bindSharedArtifacts, computeRuntimePlanIdentity, validateRuntimePlan } from './validate-runtime-plan.mjs';
import { canonicalJson } from './runtime-schema-validator.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.join(skillRoot, 'references', 'runtime');
const defaultMatrix = path.join(runtimeRoot, 'capability-matrix.json');
const defaultRemotionIndex = path.join(skillRoot, 'references', 'shotcraft', 'remotion-sources', 'index.json');

export const DEFAULT_PRODUCTION_PROFILE = Object.freeze({
  schemaVersion: '1.0.0',
  raster: { width: 3840, height: 2160 },
  fps: { numerator: 30, denominator: 1 },
  mezzanine: {
    container: 'matroska', codec: 'ffv1', pixelFormat: 'yuv444p10le', class: 'lossless',
    color: { space: 'bt709', transfer: 'bt709', primaries: 'bt709', range: 'tv' },
    audio: { policy: 'silent', streams: 0, codec: null, sampleRate: null, channels: null },
  },
  master: {
    container: 'mp4', codec: 'h264', encoder: 'libx264', pixelFormat: 'yuv420p',
    preset: 'medium', crf: 16, fastStart: true,
    color: { space: 'bt709', transfer: 'bt709', primaries: 'bt709', range: 'tv' },
    audio: { policy: 'silent', streams: 0, codec: null, sampleRate: null, channels: null },
  },
});

export function bindProductionProfile(value = DEFAULT_PRODUCTION_PROFILE) {
  const profile = structuredClone(value);
  delete profile.identity;
  return {
    ...profile,
    identity: createHash('sha256').update(canonicalJson(profile)).digest('hex'),
  };
}

function planningMode(selection) {
  if (selection.selectedRuntime === 'auto') return 'auto';
  if (selection.selectedRuntime === 'hybrid') return 'forced-hybrid';
  return 'forced-single';
}

function nativeRuntime(classification) {
  if (classification === 'native-hyperframes') return 'hyperframes';
  if (classification === 'native-remotion') return 'remotion';
  return null;
}

function evidence(kind, id, runtime, priority, verification, locator) {
  return { kind, id, runtime, priority, verification, locator };
}

function buildBlocks(shots) {
  const blocks = [];
  for (const shot of shots) {
    const current = blocks.at(-1);
    if (current && current.runtime === shot.runtime && current.window.endMs === shot.window.startMs) {
      current.window.endMs = shot.window.endMs;
      current.shotIds.push(shot.shotId);
    } else {
      blocks.push({
        blockId: `B${String(blocks.length + 1).padStart(3, '0')}`,
        runtime: shot.runtime,
        window: { ...shot.window },
        shotIds: [shot.shotId],
      });
    }
  }
  return blocks;
}

function buildAuthoringUnits(blocks, shots, recipes, sharedArtifactBindings) {
  const recipeById = new Map(recipes.map((recipe) => [recipe.shotId, recipe]));
  const shotById = new Map(shots.map((shot) => [shot.shotId, shot]));
  const shotIndexById = new Map(shots.map((shot, index) => [shot.shotId, index]));
  const incoming = (recipe) => recipe.schemaVersion === '2.0.0'
    ? recipe.neighborHandoff.incoming : recipe.semantics.neighborConnection;
  const outgoing = (recipe) => recipe.schemaVersion === '2.0.0'
    ? recipe.neighborHandoff.outgoing : recipe.semantics.neighborConnection;
  const units = [];
  for (const block of blocks) {
    let pending = [];
    const flush = () => {
      if (!pending.length) return;
      const first = shotById.get(pending[0]);
      const last = shotById.get(pending.at(-1));
      const firstIndex = shotIndexById.get(first.shotId);
      const lastIndex = shotIndexById.get(last.shotId);
      const previousRecipe = firstIndex > 0 ? recipeById.get(shots[firstIndex - 1].shotId) : null;
      const nextRecipe = lastIndex < shots.length - 1 ? recipeById.get(shots[lastIndex + 1].shotId) : null;
      const firstRecipe = recipeById.get(first.shotId);
      const lastRecipe = recipeById.get(last.shotId);
      units.push({
        unitId: `U${String(units.length + 1).padStart(3, '0')}`,
        blockId: block.blockId,
        runtime: block.runtime,
        window: { startMs: first.window.startMs, endMs: last.window.endMs },
        shotIds: [...pending],
        context: {
          narrativeEnvelope: sharedArtifactBindings.narrativeEnvelope.locator,
          visualSystem: sharedArtifactBindings.visualSystem.locator,
          recipes: pending.map((shotId) => `shot-recipes/${shotId}.json`),
          previousSeam: previousRecipe
            ? `${outgoing(previousRecipe)} | ${incoming(firstRecipe)}` : null,
          nextSeam: nextRecipe
            ? `${outgoing(lastRecipe)} | ${incoming(nextRecipe)}` : null,
        },
      });
      pending = [];
    };
    for (const shotId of block.shotIds) {
      const shot = shotById.get(shotId);
      const recipe = recipeById.get(shotId);
      const solo = recipe.schemaVersion === '2.0.0' && recipe.authoring?.solo === true;
      const proposedStart = pending.length ? shotById.get(pending[0]).window.startMs : shot.window.startMs;
      if (solo || pending.length >= 3 || shot.window.endMs - proposedStart > 40_000) flush();
      pending.push(shotId);
      if (solo || shot.window.endMs - shot.window.startMs > 40_000) flush();
    }
    flush();
  }
  return units;
}

async function readRecipes(directory) {
  await validateRecipeDirectory(directory);
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.json');
  const recipes = await Promise.all(entries.map(async (entry) => (
    JSON.parse(await readFile(path.join(directory, entry.name), 'utf8'))
  )));
  return recipes.sort((left, right) => left.window.startMs - right.window.startMs || left.shotId.localeCompare(right.shotId));
}

function actionPlan(selection, mode, warnings, sharedArtifacts, productionProfile) {
  const plan = {
    schemaVersion: '2.0.0', status: 'action-required', planningMode: mode,
    selection: {
      schemaVersion: selection.schemaVersion,
      selectedRuntime: selection.selectedRuntime,
      selectionSource: selection.selectionSource,
    },
    sharedArtifacts,
    productionProfile,
    resultingRoute: null, requiredBackends: [], integrationMode: null,
    frozenMediaContractVersion: null, shots: [], blocks: [], authoringUnits: [], warnings: [...new Set(warnings)].sort(),
    identity: '',
  };
  plan.identity = computeRuntimePlanIdentity(plan);
  return plan;
}

export async function planRuntime({
  recipesDirectory,
  selectionFile,
  narrativeEnvelopeFile,
  visualSystemFile,
  matrixFile = defaultMatrix,
  remotionIndexFile = defaultRemotionIndex,
  productionProfile: requestedProductionProfile = DEFAULT_PRODUCTION_PROFILE,
}) {
  const [recipes, selection, matrix, remotionIndex, sharedArtifactData] = await Promise.all([
    readRecipes(recipesDirectory),
    readFile(selectionFile, 'utf8').then(JSON.parse),
    readFile(matrixFile, 'utf8').then(JSON.parse),
    readFile(remotionIndexFile, 'utf8').then(JSON.parse),
    bindSharedArtifacts({ narrativeEnvelopeFile, visualSystemFile }),
  ]);
  const sharedArtifacts = {
    narrativeEnvelope: sharedArtifactData.narrativeEnvelope.binding,
    visualSystem: sharedArtifactData.visualSystem.binding,
  };
  const productionProfile = bindProductionProfile(requestedProductionProfile);
  if (selection.status !== 'selected' || !['auto', 'hyperframes', 'hybrid', 'remotion'].includes(selection.selectedRuntime)) {
    throw new Error('runtime selection must be selected and name auto, hyperframes, hybrid, or remotion');
  }
  if (!['1.0.0', '2.0.0'].includes(selection.schemaVersion)) throw new Error('unsupported runtime selection schema version');
  const mode = planningMode(selection);
  const capabilityById = new Map(matrix.capabilities.map((item) => [item.id, item]));
  const remotionCards = new Map(remotionIndex.cards.map((item) => [item.name, item]));
  const warnings = [];
  const conflicts = [];
  const shots = [];

  for (const recipe of recipes) {
    if (recipe.window.endMs - recipe.window.startMs > 40_000) {
      conflicts.push(`${recipe.shotId}: semantic shot exceeds 40000ms; return to Director to split it`);
    }
    if (recipe.schemaVersion === '2.0.0'
      && !sharedArtifactData.visualSystem.value.compositionFamilies.includes(recipe.compositionFamily)) {
      conflicts.push(`${recipe.shotId}: composition family is not declared in visual-system.json`);
    }
    const candidates = [];
    const native = new Set();
    for (const capabilityId of recipe.requiredCapabilities) {
      const capability = capabilityById.get(capabilityId);
      if (!capability) throw new Error(`unknown capability ${capabilityId}`);
      const required = nativeRuntime(capability.classification);
      if (required) {
        native.add(required);
        candidates.push(evidence('native-capability', capabilityId, required, 1000, capability.verification, `capability-matrix.json#${capabilityId}`));
      }
      if (capability.planning) {
        candidates.push(evidence(
          'capability-preference', capabilityId, capability.planning.preferredRuntime,
          capability.planning.priority, capability.planning.verification,
          capability.planning.evidenceLocator,
        ));
      }
    }
    if (native.size > 1) conflicts.push(`${recipe.shotId}: incompatible native capabilities require both runtimes`);
    if (recipe.patternRef) {
      const entry = remotionCards.get(recipe.patternRef.cardId);
      if (entry?.sources?.length) {
        candidates.push(evidence(
          'pattern-reference', `${recipe.patternRef.cardId}/${recipe.patternRef.styleKey}`,
          matrix.patternPlanning.preferredRuntime, matrix.patternPlanning.priority,
          matrix.patternPlanning.verification,
          `references/shotcraft/remotion-sources/index.json#${recipe.patternRef.cardId}`,
        ));
      } else {
        warnings.push(`${recipe.shotId}: selected pattern has no backend reference-source evidence`);
      }
    }

    let runtime;
    let decision;
    if (mode === 'forced-single') {
      runtime = selection.selectedRuntime;
      decision = 'forced';
      candidates.unshift(evidence('forced', 'runtime-selection', runtime, 1000, 'explicit-or-existing-project', 'runtime-selection.json'));
      if ([...native].some((required) => required !== runtime)) conflicts.push(`${recipe.shotId}: forced ${runtime} conflicts with native capability`);
    } else {
      const maximum = Math.max(0, ...candidates.map(({ priority }) => priority));
      const strongest = candidates.filter(({ priority }) => priority === maximum);
      const strongestRuntimes = new Set(strongest.map(({ runtime: backend }) => backend));
      if (strongestRuntimes.size > 1) conflicts.push(`${recipe.shotId}: equal-priority backend evidence conflicts`);
      runtime = strongest[0]?.runtime ?? matrix.portableDefaultRuntime;
      if (strongest[0]?.kind === 'native-capability') decision = 'native-required';
      else if (strongest[0]?.kind === 'capability-preference') decision = 'capability-preference';
      else if (strongest[0]?.kind === 'pattern-reference') decision = 'pattern-reference';
      else {
        decision = 'portable-default';
        candidates.push(evidence('portable-default', 'portable-default-runtime', runtime, 0, 'contract-only', 'capability-matrix.json#portableDefaultRuntime'));
        warnings.push(`${recipe.shotId}: no stronger backend evidence; portable contract default used`);
      }
    }
    const chosenUnverified = candidates
      .filter((item) => item.runtime === runtime && item.verification === 'reference-source-unverified')
      .map((item) => `${item.id}: reference source is not a render witness`);
    if (chosenUnverified.length) warnings.push(`${recipe.shotId}: Remotion preference uses unverified reference source`);
    shots.push({
      shotId: recipe.shotId, window: { ...recipe.window }, runtime, decision,
      evidence: candidates.sort((a, b) => b.priority - a.priority || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)),
      unverifiedPreferences: chosenUnverified.sort(),
    });
  }

  for (let index = 0; index < shots.length; index += 1) {
    if (index === 0 && shots[index].window.startMs !== 0) conflicts.push('shot coverage must begin at 0');
    if (index > 0 && shots[index].window.startMs !== shots[index - 1].window.endMs) conflicts.push(`${shots[index].shotId}: shot coverage has a gap or overlap`);
  }
  const backends = [...new Set(shots.map(({ runtime }) => runtime))].sort();
  if (mode === 'forced-hybrid' && backends.length !== 2) conflicts.push('explicit hybrid requires evidence-backed assignments to both backends; do not force an artificial split');
  if (conflicts.length) {
    const plan = actionPlan(selection, mode, [...warnings, ...conflicts], sharedArtifacts, productionProfile);
    await validateRuntimePlan(plan, { narrativeEnvelopeFile, visualSystemFile });
    return plan;
  }
  const resultingRoute = backends.length === 2 ? 'hybrid' : backends[0];
  const blocks = buildBlocks(shots);
  const plan = {
    schemaVersion: '2.0.0', status: 'planned', planningMode: mode,
    selection: {
      schemaVersion: selection.schemaVersion,
      selectedRuntime: selection.selectedRuntime,
      selectionSource: selection.selectionSource,
    },
    sharedArtifacts,
    productionProfile,
    resultingRoute, requiredBackends: backends,
    integrationMode: 'frozen-block-media',
    frozenMediaContractVersion: '1.0.0',
    shots, blocks, authoringUnits: buildAuthoringUnits(blocks, shots, recipes, sharedArtifacts),
    warnings: [...new Set(warnings)].sort(), identity: '',
  };
  plan.identity = computeRuntimePlanIdentity(plan);
  await validateRuntimePlan(plan, { narrativeEnvelopeFile, visualSystemFile });
  return plan;
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !path.isAbsolute(relative)
    && relative !== '..' && !relative.startsWith(`..${path.sep}`);
}

function locator(root, file) {
  const absolute = path.resolve(file);
  if (!inside(root, absolute)) throw new Error('Director artifacts must be inside the production root');
  return path.relative(root, absolute).split(path.sep).join('/');
}

function unitDirectory(unit) {
  return unit.runtime === 'remotion'
    ? `03-remotion-build/${unit.unitId}`
    : `03-build/${unit.unitId}`;
}

export function buildBuilderAssignments(plan, {
  productionRoot,
  recipesDirectory,
  narrativeEnvelopeFile,
  visualSystemFile,
} = {}) {
  if (plan?.schemaVersion !== '2.0.0' || plan.status !== 'planned') {
    throw new Error('Builder assignments require one planned runtime plan v2');
  }
  const root = path.resolve(productionRoot);
  const recipeRoot = path.resolve(recipesDirectory);
  const narrativeEnvelope = locator(root, narrativeEnvelopeFile);
  const visualSystem = locator(root, visualSystemFile);
  return plan.authoringUnits.map((unit) => {
    const workDirectory = unitDirectory(unit);
    return {
      schemaVersion: '1.0.0',
      planIdentity: plan.identity,
      unitId: unit.unitId,
      blockId: unit.blockId,
      runtime: unit.runtime,
      window: unit.window,
      shotIds: unit.shotIds,
      stageSkill: unit.runtime === 'remotion' ? 'broll-remotion-build' : 'broll-master-build',
      contextFiles: {
        assignment: `01-runtime-plan/assignments/${unit.unitId}.json`,
        runtimePlan: '01-runtime-plan/runtime-plan.json',
        narrativeEnvelope,
        visualSystem,
        recipes: unit.shotIds.map((shotId) => locator(root, path.join(recipeRoot, `${shotId}.json`))),
        materialPlan: '02-assets/material-plan.md',
        fontPlan: '02-assets/font-plan.md',
      },
      productionProfile: plan.productionProfile,
      productionProfileIdentity: plan.productionProfile.identity,
      seams: {
        previous: unit.context.previousSeam,
        next: unit.context.nextSeam,
      },
      output: {
        workDirectory,
        editableSourceRequired: true,
        receipt: `${workDirectory}/receipt.json`,
        handoff: `${workDirectory}/handoff.md`,
        frozenMediaRequired: true,
        frozenMediaContract: `${workDirectory}/block-media.json`,
      },
      shared: {
        assetsRoot: '02-assets',
        copyAssetsIntoUnit: false,
        dependencyMode: unit.runtime === 'remotion'
          ? 'shared-by-exact-identity'
          : 'shared-pinned-runtime',
        dependencyRoot: unit.runtime === 'remotion' ? '.remotion-toolchains' : null,
      },
      contextPolicy: 'Load only the listed files, selected references named by the assigned Recipes, and files named by the shared asset plans. Do not inherit the parent transcript or read unrelated Recipes.',
      seamLimit: 'A live transition cannot cross independently rendered units. Keep a live shared-element transition inside one unit; otherwise close this unit on the planned readable state and use the declared matched seam.',
    };
  });
}

export async function writeProductionPlan({ productionRoot, ...planOptions }) {
  const root = path.resolve(productionRoot);
  await mkdir(root, { recursive: true });
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error('production root must be a real directory');
  }
  const finalDirectory = path.join(root, '01-runtime-plan');
  try {
    await lstat(finalDirectory);
    throw new Error('runtime plan output already exists; use a new production root');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const plan = await planRuntime(planOptions);
  if (plan.status !== 'planned') return { plan, directory: null, assignments: [] };
  const assignments = buildBuilderAssignments(plan, { productionRoot: root, ...planOptions });
  const temporaryDirectory = path.join(root, `.01-runtime-plan-${randomUUID()}`);
  try {
    await mkdir(path.join(temporaryDirectory, 'assignments'), { recursive: true });
    await writeFile(path.join(temporaryDirectory, 'runtime-plan.json'), `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' });
    await Promise.all(assignments.map((assignment) => writeFile(
      path.join(temporaryDirectory, 'assignments', `${assignment.unitId}.json`),
      `${JSON.stringify(assignment, null, 2)}\n`,
      { flag: 'wx' },
    )));
    await rename(temporaryDirectory, finalDirectory);
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
  return {
    plan,
    directory: finalDirectory,
    assignments: assignments.map(({ unitId }) => `01-runtime-plan/assignments/${unitId}.json`),
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === '--json') continue;
    if (!['--recipes', '--selection', '--narrative-envelope', '--visual-system', '--matrix', '--remotion-index', '--production-root', '--production-profile'].includes(name)) throw new Error(`unknown argument ${name}`);
    const value = argv[index + 1];
    if (!value) throw new Error(`${name} requires a path`);
    options[name.slice(2)] = path.resolve(value);
    index += 1;
  }
  if (!options.recipes || !options.selection || !options['narrative-envelope'] || !options['visual-system']) throw new Error('--recipes, --selection, --narrative-envelope, and --visual-system are required');
  const parsed = {
    recipesDirectory: options.recipes, selectionFile: options.selection,
    narrativeEnvelopeFile: options['narrative-envelope'], visualSystemFile: options['visual-system'],
    matrixFile: options.matrix, remotionIndexFile: options['remotion-index'],
    productionProfileFile: options['production-profile'],
  };
  return options['production-root']
    ? { productionRoot: options['production-root'], planOptions: parsed }
    : { productionRoot: null, planOptions: parsed };
}

async function main() {
  const { productionRoot, planOptions } = parseArgs(process.argv.slice(2));
  if (planOptions.productionProfileFile) {
    planOptions.productionProfile = JSON.parse(await readFile(planOptions.productionProfileFile, 'utf8'));
    delete planOptions.productionProfileFile;
  }
  const result = productionRoot
    ? await writeProductionPlan({ productionRoot, ...planOptions })
    : await planRuntime(planOptions);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if ((productionRoot ? result.plan : result).status === 'action-required') process.exitCode = 2;
}

if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
