#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { access, readFile, lstat, readdir } from 'node:fs/promises';
import { constants as fsConstants, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, validateSchemaValue } from './runtime-schema-validator.mjs';
import { validateMezzaninePolicy } from './frozen-media-policy.mjs';
import { validateMotionMap } from './validate-motion-map.mjs';
import {
  computeRecipeIdentity,
  computeRecipeTruthIdentity,
  validateRecipeDirectory,
} from './validate-shot-recipes.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPaths = new Map([
  ['1.0.0', path.join(skillRoot, 'references', 'runtime', 'runtime-plan-v1.schema.json')],
  ['2.0.0', path.join(skillRoot, 'references', 'runtime', 'runtime-plan-v3.schema.json')],
  ['3.0.0', path.join(skillRoot, 'references', 'runtime', 'runtime-plan-v3.schema.json')],
  ['4.0.0', path.join(skillRoot, 'references', 'runtime', 'runtime-plan.schema.json')],
]);
const narrativeSchemaPath = path.join(skillRoot, 'references', 'runtime', 'narrative-envelope.schema.json');
const visualSchemaPath = path.join(skillRoot, 'references', 'runtime', 'visual-system.schema.json');
const representativeSchemaPath = path.join(skillRoot, 'references', 'runtime', 'representative-scenes.schema.json');

export function computeRuntimePlanIdentity(plan) {
  const { identity: _identity, ...identityInput } = plan;
  return createHash('sha256').update(canonicalJson(identityInput)).digest('hex');
}

export function computeRepresentativeScenesIdentity(value) {
  const { identity: _identity, ...identityInput } = value;
  return createHash('sha256').update(canonicalJson(identityInput)).digest('hex');
}

function computeProductionProfileIdentity(profile) {
  const { identity: _identity, ...identityInput } = profile ?? {};
  return createHash('sha256').update(canonicalJson(identityInput)).digest('hex');
}

function validAudioProfile(audio) {
  if (audio?.policy === 'silent') {
    return audio.streams === 0 && audio.codec === null
      && audio.sampleRate === null && audio.channels === null;
  }
  return audio?.policy === 'preserve-source' && audio.streams === 1
    && typeof audio.codec === 'string' && audio.codec.length > 0
    && Number.isSafeInteger(audio.sampleRate) && audio.sampleRate > 0
    && Number.isSafeInteger(audio.channels) && audio.channels > 0;
}

async function readSharedArtifact(file, schemaPath, label, expectedLocator) {
  if (!file) throw new Error(`${label} file is required for runtime plan v2`);
  const absolute = path.resolve(file);
  if (path.basename(absolute) !== expectedLocator) throw new Error(`${label} locator must be ${expectedLocator}`);
  const info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be a real JSON file`);
  const body = await readFile(absolute);
  let value;
  try { value = JSON.parse(body.toString('utf8')); } catch { throw new Error(`${label} is invalid JSON`); }
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const schemaErrors = validateSchemaValue(value, schema, schema);
  if (schemaErrors.length) throw new Error(`${label} schema validation failed:\n${schemaErrors.join('\n')}`);
  if (label === 'representative scenes'
    && computeRepresentativeScenesIdentity(value) !== value.identity) {
    throw new Error('representative scenes identity does not match its contents');
  }
  return {
    value,
    binding: {
      locator: expectedLocator,
      schemaVersion: value.schemaVersion,
      sha256: createHash('sha256').update(body).digest('hex'),
    },
  };
}

export async function bindSharedArtifacts({ narrativeEnvelopeFile, visualSystemFile }) {
  const [narrativeEnvelope, visualSystem] = await Promise.all([
    readSharedArtifact(narrativeEnvelopeFile, narrativeSchemaPath, 'narrative envelope', 'narrative-envelope.json'),
    readSharedArtifact(visualSystemFile, visualSchemaPath, 'visual system', 'visual-system.json'),
  ]);
  const { startMs, endMs } = narrativeEnvelope.value.window;
  if (endMs <= startMs) throw new Error('narrative envelope window is invalid');
  let cursor = startMs;
  for (const chapter of narrativeEnvelope.value.chapters) {
    if (chapter.window.startMs !== cursor || chapter.window.endMs <= chapter.window.startMs
      || chapter.window.endMs > endMs) throw new Error('narrative chapters must close the envelope window contiguously');
    cursor = chapter.window.endMs;
  }
  if (cursor !== endMs) throw new Error('narrative chapters must close the envelope window contiguously');
  cursor = startMs;
  for (const segment of visualSystem.value.rhythmCurve) {
    if (segment.startMs !== cursor || segment.endMs <= segment.startMs
      || segment.endMs > endMs) throw new Error('visual rhythm curve must close the narrative window contiguously');
    cursor = segment.endMs;
  }
  if (cursor !== endMs) throw new Error('visual rhythm curve must close the narrative window contiguously');
  return { narrativeEnvelope, visualSystem };
}

export async function bindRepresentativeScenes(representativeScenesFile) {
  const representativeScenes = await readSharedArtifact(
    representativeScenesFile,
    representativeSchemaPath,
    'representative scenes',
    'representative-scenes.json',
  );
  const shotIds = representativeScenes.value.scenes.map(({ shotId }) => shotId);
  const coverage = representativeScenes.value.scenes.map(({ coverage }) => coverage).toSorted();
  const concerns = new Set(representativeScenes.value.scenes.flatMap(({ concerns: values }) => values));
  if (new Set(shotIds).size !== 3) throw new Error('representative scenes must name three different shots');
  if (JSON.stringify(coverage) !== JSON.stringify(['information-dense', 'late', 'opening'])) {
    throw new Error('representative scenes must cover opening, information-dense, and late');
  }
  for (const concern of ['composition', 'text', 'material', 'motion']) {
    if (!concerns.has(concern)) throw new Error(`representative scenes must collectively cover ${concern}`);
  }
  return representativeScenes;
}

async function verifyRawSourceBinding(binding, file, label, productionRoot) {
  if (!binding || !file) throw new Error(`${label} binding and readable file are required`);
  const absolute = path.resolve(file);
  const info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be a real file`);
  const body = await readFile(absolute);
  if (createHash('sha256').update(body).digest('hex') !== binding.sha256 || binding.readable !== true) {
    throw new Error(`${label} identity/readability binding differs from the source file`);
  }
  if (productionRoot) {
    const expectedLocator = path.relative(path.resolve(productionRoot), absolute).split(path.sep).join('/');
    if (!expectedLocator || expectedLocator.startsWith('../') || path.isAbsolute(expectedLocator)
      || binding.locator !== expectedLocator) {
      throw new Error(`${label} locator differs from the bound source file`);
    }
  }
}

async function verifyRecipeBindings(plan, recipesDirectory) {
  if (!recipesDirectory) throw new Error('Recipe directory is required for runtime plan v4');
  await validateRecipeDirectory(recipesDirectory);
  const entries = (await readdir(recipesDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
  const recipes = await Promise.all(entries.map(async (entry) => (
    JSON.parse(await readFile(path.join(recipesDirectory, entry.name), 'utf8'))
  )));
  const recipeById = new Map(recipes.map((recipe) => [recipe.shotId, recipe]));
  const bindings = plan.authoringUnits.flatMap(({ context }) => context?.recipeBindings ?? []);
  if (bindings.length !== plan.shots.length || new Set(bindings.map(({ shotId }) => shotId)).size !== plan.shots.length) {
    throw new Error('Recipe bindings must cover every planned shot exactly once');
  }
  for (const binding of bindings) {
    const recipe = recipeById.get(binding.shotId);
    if (!recipe) throw new Error(`${binding.shotId}: bound Recipe file is missing`);
    if (binding.recipeIdentity !== computeRecipeIdentity(recipe)) {
      throw new Error(`${binding.shotId}: Recipe identity differs from the planned binding`);
    }
    if (binding.truthIdentity !== computeRecipeTruthIdentity(recipe)) {
      throw new Error(`${binding.shotId}: Recipe truth identity differs from the planned binding`);
    }
  }
}

async function verifyRuntimeExecutable(binding, runtime) {
  if (!binding?.verified || typeof binding.locator !== 'string' || !path.isAbsolute(binding.locator)) {
    throw new Error(`${runtime} runtime executable requires one verified absolute locator`);
  }
  const canonical = realpathSync(binding.locator);
  if (canonical !== binding.locator) throw new Error(`${runtime} runtime executable locator is not canonical`);
  const info = await lstat(canonical);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${runtime} runtime executable must resolve to a real file`);
  await access(canonical, fsConstants.X_OK);
  const body = await readFile(canonical);
  if (createHash('sha256').update(body).digest('hex') !== binding.sha256) {
    throw new Error(`${runtime} runtime executable hash differs from the planned binding`);
  }
}

export async function verifyRuntimePlanInputs(plan, files = {}) {
  if (plan?.schemaVersion !== '4.0.0') return { status: 'not-required' };
  const productionRoot = files.productionRoot
    ? path.resolve(files.productionRoot)
    : files.narrativeEnvelopeFile
      ? path.dirname(path.dirname(path.resolve(files.narrativeEnvelopeFile)))
      : null;
  await Promise.all([
    verifyRawSourceBinding(plan.sourceContext?.originalSrt, files.originalSrtFile, 'original SRT', productionRoot),
    verifyRawSourceBinding(plan.sourceContext?.originalDesign, files.originalDesignFile, 'original design', productionRoot),
    verifyRecipeBindings(plan, files.recipesDirectory),
    validateMotionMap({
      motionMapFile: files.motionMapFile,
      recipesDirectory: files.recipesDirectory,
      representativeScenesFile: files.representativeScenesFile,
    }),
    ...plan.requiredBackends.map((runtime) => verifyRuntimeExecutable(plan.runtimeExecutables?.[runtime], runtime)),
  ]);
  const motionBody = await readFile(files.motionMapFile);
  const motionValue = JSON.parse(motionBody.toString('utf8'));
  const expectedMotionBinding = {
    locator: 'motion-map.json',
    schemaVersion: motionValue.schemaVersion,
    sha256: createHash('sha256').update(motionBody).digest('hex'),
  };
  if (JSON.stringify(plan.sharedArtifacts?.motionMap) !== JSON.stringify(expectedMotionBinding)) {
    throw new Error('motion map binding differs from the verified file');
  }
  return { status: 'valid', recipes: plan.shots.length };
}

export async function validateRuntimePlan(plan, sharedArtifactFiles = {}) {
  const schemaPath = schemaPaths.get(plan?.schemaVersion);
  if (!schemaPath) throw new Error(`runtime plan validation failed:\n#/schemaVersion: unsupported runtime plan schema version ${JSON.stringify(plan?.schemaVersion)}`);
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const errors = validateSchemaValue(plan, schema, schema);
  let shared;
  if (['2.0.0', '3.0.0', '4.0.0'].includes(plan?.schemaVersion)) {
    if (plan.productionProfile?.identity
      && computeProductionProfileIdentity(plan.productionProfile) !== plan.productionProfile.identity) {
      errors.push('#/productionProfile/identity: does not match the immutable production profile');
    }
    if (!validAudioProfile(plan.productionProfile?.mezzanine?.audio)
      || !validAudioProfile(plan.productionProfile?.master?.audio)
      || plan.productionProfile?.mezzanine?.audio?.policy !== plan.productionProfile?.master?.audio?.policy) {
      errors.push('#/productionProfile: audio policy must be internally complete and identical for mezzanine and master');
    }
    for (const error of validateMezzaninePolicy(plan.productionProfile?.mezzanine)) {
      errors.push(`#/productionProfile/mezzanine: ${error}`);
    }
    try {
      shared = await bindSharedArtifacts(sharedArtifactFiles);
      for (const [key, artifact] of Object.entries(shared)) {
        if (JSON.stringify(plan.sharedArtifacts?.[key]) !== JSON.stringify(artifact.binding)) {
          errors.push(`#/sharedArtifacts/${key}: locator, schema version, or content hash does not match the verified file`);
        }
      }
      if (['3.0.0', '4.0.0'].includes(plan.schemaVersion)) {
        const representativeScenes = await bindRepresentativeScenes(sharedArtifactFiles.representativeScenesFile);
        if (JSON.stringify(plan.sharedArtifacts?.representativeScenes) !== JSON.stringify(representativeScenes.binding)) {
          errors.push('#/sharedArtifacts/representativeScenes: locator, schema version, or content hash does not match the verified file');
        }
        if (!sharedArtifactFiles.motionMapFile) {
          errors.push('#/sharedArtifacts/motionMap: motion-map.json is required');
        } else {
          if (plan.schemaVersion === '3.0.0') {
            await validateMotionMap({
              motionMapFile: sharedArtifactFiles.motionMapFile,
              recipesDirectory: sharedArtifactFiles.recipesDirectory,
              representativeScenesFile: sharedArtifactFiles.representativeScenesFile,
            });
          }
          const body = await readFile(sharedArtifactFiles.motionMapFile);
          const value = JSON.parse(body.toString('utf8'));
          const binding = {
            locator: 'motion-map.json', schemaVersion: value.schemaVersion,
            sha256: createHash('sha256').update(body).digest('hex'),
          };
          if (JSON.stringify(plan.sharedArtifacts?.motionMap) !== JSON.stringify(binding)) {
            errors.push('#/sharedArtifacts/motionMap: locator, schema version, or content hash does not match the verified file');
          }
        }
      }
      if (plan.schemaVersion === '4.0.0') await verifyRuntimePlanInputs(plan, sharedArtifactFiles);
    } catch (error) {
      errors.push(`#/sharedArtifacts: ${error.message}`);
    }
  }
  if (plan?.identity && computeRuntimePlanIdentity(plan) !== plan.identity) errors.push('#/identity: aggregate does not match plan contents');
  if (['3.0.0', '4.0.0'].includes(plan?.schemaVersion)) {
    if (plan.backendFailurePolicy !== 'return-to-selected-backend') {
      errors.push('#/backendFailurePolicy: backend failure must return to the selected backend instead of changing route');
    }
    if (plan.mediaBoundary !== 'shot') {
      errors.push('#/mediaBoundary: runtime plan 3.0.0 requires shot');
    }
  }
  if (plan?.schemaVersion === '4.0.0'
    && plan.selection?.selectionSource !== 'explicit'
    && plan.selection?.selectedRuntime !== 'hyperframes') {
    errors.push('#/selection: auto, remotion, and hybrid require explicit runtime selection; implicit/default production uses hyperframes');
  }
  if (plan?.status === 'planned') {
    if (!plan.resultingRoute || !plan.integrationMode || plan.shots.length === 0 || plan.blocks.length === 0) errors.push('#: a planned route requires shots, blocks, and integration mode');
    if (plan.schemaVersion === '2.0.0' && plan.integrationMode !== 'frozen-block-media') errors.push('#/integrationMode: runtime plan v2 requires frozen authoring-unit media');
    if (plan.schemaVersion === '2.0.0' && (plan.frozenMediaContractVersion !== '1.0.0'
      || ![undefined, null].includes(plan.shotMediaContractVersion))) errors.push('#/frozenMediaContractVersion: runtime plan v2 requires only the frozen media contract');
    if (plan.schemaVersion === '3.0.0' && plan.integrationMode !== 'shot-media') errors.push('#/integrationMode: runtime plan v3 requires direct shot media');
    if (plan.schemaVersion === '3.0.0' && (plan.shotMediaContractVersion !== '1.0.0' || plan.frozenMediaContractVersion !== null)) errors.push('#/shotMediaContractVersion: runtime plan v3 requires only the shot media contract');
    if (plan.schemaVersion === '4.0.0' && plan.integrationMode !== 'shot-media') errors.push('#/integrationMode: runtime plan v4 requires direct shot media');
    if (plan.schemaVersion === '4.0.0' && (plan.shotMediaContractVersion !== '1.0.0' || plan.frozenMediaContractVersion !== null)) errors.push('#/shotMediaContractVersion: runtime plan v4 requires only the shot media contract');
    if (plan.schemaVersion === '1.0.0' && plan.resultingRoute === 'hybrid' && plan.integrationMode !== 'frozen-block-media') errors.push('#/integrationMode: hybrid requires frozen-block-media');
    if (plan.schemaVersion === '1.0.0' && plan.resultingRoute !== 'hybrid' && plan.integrationMode !== 'single-runtime-source') errors.push('#/integrationMode: legacy single runtime route requires single-runtime-source');
    const expectedBackends = [...new Set(plan.shots.map(({ runtime }) => runtime))].sort();
    if (JSON.stringify(expectedBackends) !== JSON.stringify([...plan.requiredBackends].sort())) errors.push('#/requiredBackends: does not match shot assignments');
    if (plan.schemaVersion === '4.0.0'
      && JSON.stringify(Object.keys(plan.runtimeExecutables ?? {}).sort()) !== JSON.stringify(expectedBackends)) {
      errors.push('#/runtimeExecutables: must bind exactly one verified executable per required backend');
    }
    const shots = [...plan.shots].sort((a, b) => a.window.startMs - b.window.startMs || a.shotId.localeCompare(b.shotId));
    if (shots[0]?.window.startMs !== 0) errors.push('#/shots: coverage must start at 0');
    for (let index = 0; index < shots.length; index += 1) {
      if (shots[index].window.endMs <= shots[index].window.startMs) errors.push(`#/shots/${index}/window: endMs must be greater than startMs`);
      if (index > 0 && shots[index].window.startMs !== shots[index - 1].window.endMs) errors.push(`#/shots/${index}/window: shots must be contiguous without gaps or overlaps`);
      if (['3.0.0', '4.0.0'].includes(plan.schemaVersion)) {
        const shot = shots[index];
        const rejected = shot.rejectedBackends ?? [];
        if (rejected.length !== 1 || rejected[0]?.runtime === shot.runtime) {
          errors.push(`#/shots/${index}/rejectedBackends: must explain the one backend not selected for this shot`);
        }
        const shouldBeForced = plan.planningMode === 'forced-single';
        if (shot.forced !== shouldBeForced || (shouldBeForced && shot.decision !== 'forced')) {
          errors.push(`#/shots/${index}/forced: must distinguish explicit single-backend forcing from auto routing`);
        }
      }
    }
    const flattened = plan.blocks.flatMap(({ shotIds }) => shotIds);
    if (JSON.stringify(flattened) !== JSON.stringify(shots.map(({ shotId }) => shotId))) errors.push('#/blocks: block shot order does not close over shot assignments');
    for (let index = 0; index < plan.blocks.length; index += 1) {
      const block = plan.blocks[index];
      const assigned = block.shotIds.map((id) => shots.find(({ shotId }) => shotId === id));
      if (assigned.some((item) => !item)) errors.push(`#/blocks/${index}: unknown shot`);
      else if (assigned.some(({ runtime }) => runtime !== block.runtime)
        || block.window.startMs !== assigned[0].window.startMs
        || block.window.endMs !== assigned.at(-1).window.endMs) errors.push(`#/blocks/${index}: runtime or window does not match its shots`);
    }
    if (['2.0.0', '3.0.0', '4.0.0'].includes(plan.schemaVersion)) {
      const authoringUnits = Array.isArray(plan.authoringUnits) ? plan.authoringUnits : [];
      const unitShotIds = authoringUnits.flatMap(({ shotIds }) => Array.isArray(shotIds) ? shotIds : []);
      const expectedShotIds = shots.map(({ shotId }) => shotId);
      if (shared && shots.length) {
        const narrativeWindow = shared.narrativeEnvelope.value.window;
        if (narrativeWindow.startMs !== shots[0].window.startMs
          || narrativeWindow.endMs !== shots.at(-1).window.endMs) {
          errors.push('#/sharedArtifacts/narrativeEnvelope: narrative window must equal planned shot coverage');
        }
        const families = new Set(shared.visualSystem.value.compositionFamilies);
        // v1 Recipes do not expose a composition family; v2 plan closure is checked by Planner before dispatch.
        if (families.size < 3) errors.push('#/sharedArtifacts/visualSystem: requires at least three composition families');
      }
      if (JSON.stringify(unitShotIds) !== JSON.stringify(expectedShotIds)) {
        errors.push('#/authoringUnits: units must close over every shot exactly once and in order');
      }
      const blocksById = new Map(plan.blocks.map((block) => [block.blockId, block]));
      for (let index = 0; index < authoringUnits.length; index += 1) {
        const unit = authoringUnits[index];
        const block = blocksById.get(unit.blockId);
        const unitShotIdsForEntry = Array.isArray(unit.shotIds) ? unit.shotIds : [];
        const assigned = unitShotIdsForEntry.map((id) => shots.find(({ shotId }) => shotId === id));
        if (!block) errors.push(`#/authoringUnits/${index}/blockId: unknown block`);
        if (assigned.some((item) => !item)) errors.push(`#/authoringUnits/${index}: unknown shot`);
        else {
          const duration = unit.window.endMs - unit.window.startMs;
          if (plan.schemaVersion === '2.0.0' && duration > 40_000) errors.push(`#/authoringUnits/${index}/window: authoring unit exceeds 40000ms; return to Director to split the semantic shot`);
          if (plan.schemaVersion === '2.0.0' && unitShotIdsForEntry.length > 3) errors.push(`#/authoringUnits/${index}/shotIds: legacy runtime plan v2 authoring units contain at most three shots`);
          if (unit.runtime !== block?.runtime
            || assigned.some(({ runtime }) => runtime !== unit.runtime)
            || unit.window.startMs !== assigned[0].window.startMs
            || unit.window.endMs !== assigned.at(-1).window.endMs
            || !unitShotIdsForEntry.every((id) => block?.shotIds.includes(id))) {
            errors.push(`#/authoringUnits/${index}: unit must contain whole shots from one backend block with an exact window`);
          }
          if (JSON.stringify(unit.context?.recipes)
            !== JSON.stringify(unitShotIdsForEntry.map((id) => `shot-recipes/${id}.json`))) {
            errors.push(`#/authoringUnits/${index}/context/recipes: must expose only this unit's recipe locators`);
          }
          if (unit.context?.narrativeEnvelope !== plan.sharedArtifacts?.narrativeEnvelope?.locator
            || unit.context?.visualSystem !== plan.sharedArtifacts?.visualSystem?.locator) {
            errors.push(`#/authoringUnits/${index}/context: shared locators must match the plan bindings`);
          }
          if (plan.schemaVersion === '4.0.0') {
            if (!['semantic-chapter', 'chapter-merge', 'chapter-split', 'planner-solo'].includes(unit.groupingReason)) {
              errors.push(`#/authoringUnits/${index}/groupingReason: must use the closed grouping enum`);
            }
            const soloReasons = ['exclusive-3d-webgl-gpu', 'external-project-toolchain', 'long-complete-chapter', 'resource-dependency-conflict'];
            if (unit.groupingReason === 'planner-solo') {
              if (unitShotIdsForEntry.length !== 1 || !soloReasons.includes(unit.soloReason)) {
                errors.push(`#/authoringUnits/${index}/soloReason: solo units require one shot and one allowed reason`);
              }
            } else if (unit.soloReason !== null) {
              errors.push(`#/authoringUnits/${index}/soloReason: non-solo units must use null`);
            }
            if ((unit.context?.recipeBindings ?? []).length !== unitShotIdsForEntry.length
              || !unit.context.recipeBindings.every((binding, bindingIndex) => (
                binding.shotId === unitShotIdsForEntry[bindingIndex]
                && binding.locator === `shot-recipes/${binding.shotId}.json`
              ))) {
              errors.push(`#/authoringUnits/${index}/context/recipeBindings: must bind each unit Recipe in shot order`);
            }
          }
        }
      }
      if (['3.0.0', '4.0.0'].includes(plan.schemaVersion)) {
        const leadPlan = plan.schemaVersion === '4.0.0' ? plan.leadProduction : plan.visualLock;
        const representatives = leadPlan?.representativeScenes ?? [];
        const expectedRepresentatives = sharedArtifactFiles.representativeScenesFile
          ? (await bindRepresentativeScenes(sharedArtifactFiles.representativeScenesFile)).value.scenes
          : [];
        if (plan.schemaVersion === '3.0.0' && (plan.visualLock?.required !== true
          || plan.visualLock?.contractLocator !== '04-visual-lock/visual-lock.json'
          || plan.visualLock?.sourceIsolation !== 'per-runtime')) {
          errors.push('#/visualLock: v3 requires the default visual-lock gate and per-runtime source isolation');
        }
        if (JSON.stringify(representatives.map(({ shotId, coverage, reason, concerns }) => ({ shotId, coverage, reason, concerns })))
          !== JSON.stringify(expectedRepresentatives)) {
          errors.push(`${plan.schemaVersion === '4.0.0' ? '#/leadProduction' : '#/visualLock'}/representativeScenes: must preserve the Director selection exactly`);
        }
        for (const representative of representatives) {
          const planned = shots.find(({ shotId }) => shotId === representative.shotId);
          if (!planned || planned.runtime !== representative.runtime) {
            errors.push(`${plan.schemaVersion === '4.0.0' ? '#/leadProduction' : '#/visualLock'}/representativeScenes: ${representative.shotId} runtime does not match the plan`);
          }
        }
        const representativeBackends = [...new Set(representatives.map(({ runtime }) => runtime))].toSorted();
        if (JSON.stringify(representativeBackends) !== JSON.stringify([...plan.requiredBackends].toSorted())) {
          errors.push(`${plan.schemaVersion === '4.0.0' ? '#/leadProduction' : '#/visualLock'}/representativeScenes: Hybrid selections must include every planned backend`);
        }
        if (leadPlan?.leadAssignmentLocators?.length !== plan.requiredBackends.length) {
          errors.push(`${plan.schemaVersion === '4.0.0' ? '#/leadProduction' : '#/visualLock'}/leadAssignmentLocators: requires one Lead Builder assignment per backend`);
        }
      }
      if (plan.schemaVersion === '4.0.0') {
        const ordinaryUnits = authoringUnits.filter(({ soloReason }) => soloReason === null);
        if (plan.shots.length >= 15 && plan.shots.length <= 24
          && plan.requiredBackends.length === 1 && ordinaryUnits.length > 0) {
          const sizes = ordinaryUnits.map(({ shotIds }) => shotIds.length).toSorted((left, right) => left - right);
          const median = sizes[Math.floor(sizes.length / 2)];
          if (median < 5 || median > 8) errors.push('#/authoringUnits: ordinary 15–24 shot plans require a 5–8 shot median');
          if (ordinaryUnits.length === authoringUnits.length
            && sizes.some((size) => size < 5 || size > 8)) {
            errors.push('#/authoringUnits: ordinary 15–24 shot plans must not dispatch sub-5-shot fragments');
          }
        }
        if (authoringUnits.length >= plan.shots.length
          && !authoringUnits.every(({ soloReason, shotIds }) => soloReason !== null && shotIds.length === 1)) {
          errors.push('#/authoringUnits: authoring units must be fewer than shots unless every unit is an allowed solo');
        }
        const canary = plan.canaryGate;
        if (canary?.shotIds?.length !== 5 || new Set(canary?.shotIds ?? []).size !== 5
          || !canary.shotIds.every((shotId) => expectedShotIds.includes(shotId))) {
          errors.push('#/canaryGate/shotIds: must name five unique planned shots');
        }
      }
    }
  } else if (plan?.resultingRoute !== null || plan?.requiredBackends?.length || plan?.blocks?.length
    || (['2.0.0', '3.0.0', '4.0.0'].includes(plan?.schemaVersion) && plan?.authoringUnits?.length) || plan?.integrationMode !== null) {
    errors.push('#: action-required plan must not dispatch backends or integration');
  }
  if (errors.length) throw new Error(`runtime plan validation failed:\n${errors.join('\n')}`);
  return {
    status: 'valid', shots: plan.shots.length, blocks: plan.blocks.length,
    ...(['2.0.0', '3.0.0', '4.0.0'].includes(plan.schemaVersion) ? { authoringUnits: plan.authoringUnits.length } : {}),
    route: plan.resultingRoute,
  };
}

function parseArgs(argv) {
  if (!argv[0]?.startsWith('--')) {
    const [file, narrativeEnvelopeFile, visualSystemFile, representativeScenesFile] = argv;
    return { file, narrativeEnvelopeFile, visualSystemFile, representativeScenesFile };
  }
  const allowed = new Set([
    '--plan', '--narrative-envelope', '--visual-system', '--representative-scenes', '--motion-map',
    '--recipes', '--original-srt', '--original-design', '--production-root',
  ]);
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(name) || !value) throw new Error(`invalid argument ${name ?? ''}`);
    values[name.slice(2)] = path.resolve(value);
  }
  return {
    file: values.plan,
    narrativeEnvelopeFile: values['narrative-envelope'],
    visualSystemFile: values['visual-system'],
    representativeScenesFile: values['representative-scenes'],
    motionMapFile: values['motion-map'],
    recipesDirectory: values.recipes,
    originalSrtFile: values['original-srt'],
    originalDesignFile: values['original-design'],
    productionRoot: values['production-root'],
  };
}

async function main() {
  const { file, ...sharedArtifactFiles } = parseArgs(process.argv.slice(2));
  if (!file) throw new Error('usage: validate-runtime-plan.mjs --plan <runtime-plan.json> --narrative-envelope <file> --visual-system <file> [v4 bound-input flags]');
  const plan = JSON.parse(await readFile(path.resolve(file), 'utf8'));
  process.stdout.write(`${JSON.stringify(await validateRuntimePlan(plan, sharedArtifactFiles))}\n`);
}

if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
