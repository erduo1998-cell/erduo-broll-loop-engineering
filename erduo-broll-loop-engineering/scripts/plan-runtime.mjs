#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { constants as fsConstants, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeRecipeIdentity,
  computeRecipeTruthIdentity,
  recipeWindow,
  validateRecipeDirectory,
} from './validate-shot-recipes.mjs';
import {
  bindRepresentativeScenes,
  bindSharedArtifacts,
  computeRuntimePlanIdentity,
  validateRuntimePlan,
} from './validate-runtime-plan.mjs';
import { canonicalJson } from './runtime-schema-validator.mjs';
import { roleInjection } from './generate-role-files.mjs';
import { validateMotionMap } from './validate-motion-map.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.join(skillRoot, 'references', 'runtime');
const defaultMatrix = path.join(runtimeRoot, 'capability-matrix.json');
const defaultRemotionIndex = path.join(skillRoot, 'references', 'shotcraft', 'remotion-sources', 'index.json');
const SOLO_REASONS = new Set([
  'exclusive-3d-webgl-gpu',
  'external-project-toolchain',
  'long-complete-chapter',
  'resource-dependency-conflict',
]);
const CANARY_SHOT_PREFERENCES = ['S01', 'S05', 'S07', 'S09', 'S15'];

export const DEFAULT_PRODUCTION_PROFILE = Object.freeze({
  schemaVersion: '1.0.0',
  raster: { width: 3840, height: 2160 },
  fps: { numerator: 30, denominator: 1 },
  mezzanine: {
    container: 'mp4', codec: 'h264', encoder: 'libx264', pixelFormat: 'yuv420p',
    class: 'visually-lossless', preset: 'medium', crf: 12, gopFrames: 60,
    keyframeScenecut: false, upgradeReason: null,
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

function explainRouting({ mode, runtime, decision, candidates }) {
  const rejectedRuntime = runtime === 'remotion' ? 'hyperframes' : 'remotion';
  if (mode === 'forced-single') {
    return {
      forced: true,
      selectionReason: `Selected ${runtime} because explicit runtime selection forces every compatible shot to that backend.`,
      rejectedBackends: [{
        runtime: rejectedRuntime,
        reason: `Rejected for this shot because explicit runtime selection forces ${runtime}; backend failure must return to ${runtime} for repair.`,
      }],
    };
  }
  const selectedEvidence = candidates.filter((item) => item.runtime === runtime);
  const rejectedEvidence = candidates.filter((item) => item.runtime === rejectedRuntime);
  const selectedPriority = Math.max(0, ...selectedEvidence.map(({ priority }) => priority));
  const rejectedPriority = Math.max(0, ...rejectedEvidence.map(({ priority }) => priority));
  const selectedIds = selectedEvidence.filter(({ priority }) => priority === selectedPriority).map(({ id }) => id).sort();
  const reason = selectedIds.length > 0
    ? `${decision} selected ${runtime} from strongest evidence ${selectedIds.join(', ')} at priority ${selectedPriority}.`
    : `${decision} selected ${runtime} from the portable backend default.`;
  const rejectedReason = rejectedEvidence.length === 0
    ? `Rejected for this shot because it has no stronger routing evidence than selected ${runtime}.`
    : `Rejected for this shot because its strongest evidence priority ${rejectedPriority} is below selected ${runtime} priority ${selectedPriority}.`;
  return {
    forced: false,
    selectionReason: reason,
    rejectedBackends: [{ runtime: rejectedRuntime, reason: rejectedReason }],
  };
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

function makeUnitFactory(shots, recipes, sharedArtifactBindings) {
  const recipeById = new Map(recipes.map((recipe) => [recipe.shotId, recipe]));
  const shotById = new Map(shots.map((shot) => [shot.shotId, shot]));
  const shotIndexById = new Map(shots.map((shot, index) => [shot.shotId, index]));
  const incoming = (recipe) => recipe.schemaVersion === '4.0.0'
    ? recipe.truth.incomingSeam
    : ['2.0.0', '3.0.0'].includes(recipe.schemaVersion)
      ? recipe.neighborHandoff.incoming : recipe.semantics.neighborConnection;
  const outgoing = (recipe) => recipe.schemaVersion === '4.0.0'
    ? recipe.truth.outgoingSeam
    : ['2.0.0', '3.0.0'].includes(recipe.schemaVersion)
      ? recipe.neighborHandoff.outgoing : recipe.semantics.neighborConnection;
  return (units, block, pending, metadata = {}) => {
    if (!pending.length) return;
    const first = shotById.get(pending[0]);
    const last = shotById.get(pending.at(-1));
    const firstIndex = shotIndexById.get(first.shotId);
    const lastIndex = shotIndexById.get(last.shotId);
    const previousRecipe = firstIndex > 0 ? recipeById.get(shots[firstIndex - 1].shotId) : null;
    const nextRecipe = lastIndex < shots.length - 1 ? recipeById.get(shots[lastIndex + 1].shotId) : null;
    const firstRecipe = recipeById.get(first.shotId);
    const lastRecipe = recipeById.get(last.shotId);
    const v4 = firstRecipe.schemaVersion === '4.0.0';
    units.push({
      unitId: `U${String(units.length + 1).padStart(3, '0')}`,
      blockId: block.blockId,
      runtime: block.runtime,
      window: { startMs: first.window.startMs, endMs: last.window.endMs },
      shotIds: [...pending],
      ...(v4 ? {
        chapterIds: [...new Set(pending.map((shotId) => recipeById.get(shotId).truth.chapterId))],
        groupingReason: metadata.groupingReason,
        soloReason: metadata.soloReason ?? null,
      } : {}),
      context: {
        narrativeEnvelope: sharedArtifactBindings.narrativeEnvelope.locator,
        visualSystem: sharedArtifactBindings.visualSystem.locator,
        recipes: pending.map((shotId) => `shot-recipes/${shotId}.json`),
        ...(v4 ? {
          recipeBindings: pending.map((shotId) => {
            const recipe = recipeById.get(shotId);
            return {
              shotId,
              locator: `shot-recipes/${shotId}.json`,
              recipeIdentity: computeRecipeIdentity(recipe),
              truthIdentity: computeRecipeTruthIdentity(recipe),
            };
          }),
        } : {}),
        previousSeam: previousRecipe ? incoming(firstRecipe) : null,
        nextSeam: nextRecipe ? outgoing(lastRecipe) : null,
      },
    });
  };
}

function buildLegacyAuthoringUnits(blocks, shots, recipes, sharedArtifactBindings) {
  const recipeById = new Map(recipes.map((recipe) => [recipe.shotId, recipe]));
  const shotById = new Map(shots.map((shot) => [shot.shotId, shot]));
  const appendUnit = makeUnitFactory(shots, recipes, sharedArtifactBindings);
  const units = [];
  for (const block of blocks) {
    let pending = [];
    const flush = () => {
      appendUnit(units, block, pending);
      pending = [];
    };
    for (const shotId of block.shotIds) {
      const shot = shotById.get(shotId);
      const recipe = recipeById.get(shotId);
      const solo = ['2.0.0', '3.0.0'].includes(recipe.schemaVersion)
        && recipe.authoring?.solo === true;
      const proposedStart = pending.length ? shotById.get(pending[0]).window.startMs : shot.window.startMs;
      if (solo || pending.length >= 3 || shot.window.endMs - proposedStart > 40_000) flush();
      pending.push(shotId);
      if (solo || shot.window.endMs - shot.window.startMs > 40_000) flush();
    }
    flush();
  }
  return units;
}

const TARGET_MAX_SHOTS_PER_UNIT = 8;

function continuityAtoms(shotIds, recipeById) {
  return shotIds.map((shotId) => ({ shotIds: [shotId], continuityGroup: null, solo: false }));
}

function balancedChunks(atoms) {
  const chunks = [];
  let run = [];
  const flushRun = () => {
    if (!run.length) return;
    const totalShots = run.reduce((sum, atom) => sum + atom.shotIds.length, 0);
    const targetUnits = Math.max(1, Math.ceil(totalShots / TARGET_MAX_SHOTS_PER_UNIT));
    let remainingShots = totalShots;
    let remainingUnits = targetUnits;
    let pending = [];
    let pendingCount = 0;
    for (const atom of run) {
      const desired = Math.ceil(remainingShots / remainingUnits);
      if (pending.length && pendingCount + atom.shotIds.length > desired && remainingUnits > 1) {
        chunks.push(pending.flatMap(({ shotIds }) => shotIds));
        remainingShots -= pendingCount;
        remainingUnits -= 1;
        pending = [];
        pendingCount = 0;
      }
      pending.push(atom);
      pendingCount += atom.shotIds.length;
    }
    if (pending.length) chunks.push(pending.flatMap(({ shotIds }) => shotIds));
    run = [];
  };
  for (const atom of atoms) {
    if (atom.solo) {
      flushRun();
      chunks.push([...atom.shotIds]);
    } else run.push(atom);
  }
  flushRun();
  return chunks;
}

function buildV3AuthoringUnits(blocks, shots, recipes, sharedArtifactBindings) {
  const recipeById = new Map(recipes.map((recipe) => [recipe.shotId, recipe]));
  const appendUnit = makeUnitFactory(shots, recipes, sharedArtifactBindings);
  const units = [];
  for (const block of blocks) {
    for (const chunk of balancedChunks(continuityAtoms(block.shotIds, recipeById))) {
      appendUnit(units, block, chunk);
    }
  }
  return units;
}

function splitBalancedShots(shotIds, shotById) {
  const buildChunks = (unitCount) => {
    const chunks = [];
    let cursor = 0;
    for (let index = 0; index < unitCount; index += 1) {
      const remaining = shotIds.length - cursor;
      const size = Math.ceil(remaining / (unitCount - index));
      chunks.push(shotIds.slice(cursor, cursor + size));
      cursor += size;
    }
    return chunks;
  };
  const durationOf = (chunk) => shotById.get(chunk.at(-1)).window.endMs
    - shotById.get(chunk[0]).window.startMs;
  const minimumUnits = Math.max(1, Math.ceil(shotIds.length / 8));
  let relaxed = null;
  for (let unitCount = minimumUnits; unitCount <= shotIds.length; unitCount += 1) {
    const chunks = buildChunks(unitCount);
    if (chunks.some((chunk) => chunk.length > 8 || durationOf(chunk) > 70_000)) continue;
    relaxed ??= chunks;
    if (shotIds.length < 5 || chunks.every((chunk) => chunk.length >= 5)) return chunks;
  }
  return relaxed ?? buildChunks(shotIds.length);
}

function buildV4AuthoringUnits(
  blocks,
  shots,
  recipes,
  sharedArtifactBindings,
  chapters,
  parentSoloReasons = {},
) {
  const recipeById = new Map(recipes.map((recipe) => [recipe.shotId, recipe]));
  const shotById = new Map(shots.map((shot) => [shot.shotId, shot]));
  const chapterById = new Map(chapters.map((chapter) => [chapter.chapterId, chapter]));
  const appendUnit = makeUnitFactory(shots, recipes, sharedArtifactBindings);
  for (const [shotId, reason] of Object.entries(parentSoloReasons)) {
    if (!recipeById.has(shotId)) throw new Error(`unknown solo shot ${shotId}`);
    if (!SOLO_REASONS.has(reason)) throw new Error(`${shotId}: unsupported solo reason ${JSON.stringify(reason)}`);
  }
  const soloReasonFor = (shotId) => {
    if (parentSoloReasons[shotId]) return parentSoloReasons[shotId];
    const recipe = recipeById.get(shotId);
    if ((recipe.technicalRisks ?? []).length > 1) {
      throw new Error(`${shotId}: multiple isolation risks require an explicit Parent solo reason`);
    }
    if (recipe.technicalRisks?.length === 1) return recipe.technicalRisks[0];
    const chapter = chapterById.get(recipe.truth.chapterId);
    const shot = shotById.get(shotId);
    if (shot.window.endMs - shot.window.startMs > 35_000
      && chapter?.window.startMs === shot.window.startMs
      && chapter?.window.endMs === shot.window.endMs) return 'long-complete-chapter';
    return null;
  };
  const units = [];
  for (const block of blocks) {
    const atoms = [];
    let chapterRun = null;
    const flushChapter = () => {
      if (chapterRun) atoms.push(chapterRun);
      chapterRun = null;
    };
    for (const shotId of block.shotIds) {
      const soloReason = soloReasonFor(shotId);
      if (soloReason) {
        flushChapter();
        atoms.push({ shotIds: [shotId], chapterIds: [recipeById.get(shotId).truth.chapterId], soloReason });
        continue;
      }
      const chapterId = recipeById.get(shotId).truth.chapterId;
      if (chapterRun?.chapterIds[0] === chapterId) chapterRun.shotIds.push(shotId);
      else {
        flushChapter();
        chapterRun = { shotIds: [shotId], chapterIds: [chapterId], soloReason: null };
      }
    }
    flushChapter();

    for (let index = 0; index < atoms.length; index += 1) {
      const atom = atoms[index];
      const atomDuration = shotById.get(atom.shotIds.at(-1)).window.endMs
        - shotById.get(atom.shotIds[0]).window.startMs;
      if (atom.soloReason || (atom.shotIds.length >= 3 && atomDuration >= 35_000)) continue;
      const previous = atoms[index - 1];
      const next = atoms[index + 1];
      const mergeTarget = previous && !previous.soloReason
        ? previous
        : next && !next.soloReason ? next : null;
      if (!mergeTarget) continue;
      const combined = mergeTarget === previous
        ? [...previous.shotIds, ...atom.shotIds]
        : [...atom.shotIds, ...next.shotIds];
      const combinedDuration = shotById.get(combined.at(-1)).window.endMs - shotById.get(combined[0]).window.startMs;
      if (combined.length > 8 || combinedDuration > 70_000) continue;
      mergeTarget.shotIds = combined;
      mergeTarget.chapterIds = mergeTarget === previous
        ? [...previous.chapterIds, ...atom.chapterIds]
        : [...atom.chapterIds, ...next.chapterIds];
      atoms.splice(index, 1);
      index -= 1;
    }

    let ordinaryShotIds = [];
    const flushOrdinary = () => {
      if (!ordinaryShotIds.length) return;
      const chunks = splitBalancedShots(ordinaryShotIds, shotById);
      const chapterChunkCounts = new Map();
      for (const chunk of chunks) {
        for (const chapterId of new Set(chunk.map((shotId) => recipeById.get(shotId).truth.chapterId))) {
          chapterChunkCounts.set(chapterId, (chapterChunkCounts.get(chapterId) ?? 0) + 1);
        }
      }
      for (const chunk of chunks) {
        const chapterIds = [...new Set(chunk.map((shotId) => recipeById.get(shotId).truth.chapterId))];
        appendUnit(units, block, chunk, {
          groupingReason: chapterIds.length > 1
            ? 'chapter-merge'
            : chapterChunkCounts.get(chapterIds[0]) > 1 ? 'chapter-split' : 'semantic-chapter',
          soloReason: null,
        });
      }
      ordinaryShotIds = [];
    };
    for (const atom of atoms) {
      if (!atom.soloReason) {
        ordinaryShotIds.push(...atom.shotIds);
        continue;
      }
      flushOrdinary();
      appendUnit(units, block, atom.shotIds, { groupingReason: 'planner-solo', soloReason: atom.soloReason });
    }
    flushOrdinary();
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
  return recipes.sort((left, right) => (
    recipeWindow(left).startMs - recipeWindow(right).startMs || left.shotId.localeCompare(right.shotId)
  ));
}

function actionPlan(
  selection,
  mode,
  warnings,
  sharedArtifacts,
  productionProfile,
  schemaVersion = '2.0.0',
  extras = {},
) {
  const plan = {
    schemaVersion, status: 'action-required', planningMode: mode,
    selection: {
      schemaVersion: selection.schemaVersion,
      selectedRuntime: selection.selectedRuntime,
      selectionSource: selection.selectionSource,
    },
    sharedArtifacts,
    productionProfile,
    backendFailurePolicy: 'return-to-selected-backend',
    mediaBoundary: ['3.0.0', '4.0.0'].includes(schemaVersion) ? 'shot' : 'authoring-unit',
    resultingRoute: null, requiredBackends: [], integrationMode: null,
    frozenMediaContractVersion: null, shotMediaContractVersion: null,
    shots: [], blocks: [], authoringUnits: [], warnings: [...new Set(warnings)].sort(),
    ...(schemaVersion === '4.0.0' ? {
      sourceContext: extras.sourceContext,
      runtimeExecutables: extras.runtimeExecutables,
      leadProduction: extras.leadProduction,
      canaryGate: extras.canaryGate,
    } : {}),
    identity: '',
  };
  plan.identity = computeRuntimePlanIdentity(plan);
  return plan;
}

async function bindOriginalInput(file, productionRoot, label) {
  if (!file) throw new Error(`${label} is required for creative-loop planning`);
  const absolute = path.resolve(file);
  if (!inside(productionRoot, absolute)) throw new Error(`${label} must be inside the production root`);
  const info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be a readable real file`);
  const body = await readFile(absolute);
  return {
    locator: path.relative(productionRoot, absolute).split(path.sep).join('/'),
    sha256: createHash('sha256').update(body).digest('hex'),
    readable: true,
  };
}

async function bindRuntimeExecutable(file, runtime) {
  if (!file) throw new Error(`${runtime} requires an explicitly verified executable locator`);
  const canonical = realpathSync(path.resolve(file));
  const info = await lstat(canonical);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${runtime} executable must resolve to a real file`);
  await access(canonical, fsConstants.X_OK);
  const body = await readFile(canonical);
  return {
    locator: canonical,
    sha256: createHash('sha256').update(body).digest('hex'),
    verified: true,
  };
}

function selectedExecutableLocator(selection, runtime, explicitFiles) {
  const evidence = selection.evidence?.[runtime]?.cliEvidence;
  if (evidence?.passed === true && typeof evidence.locator === 'string' && evidence.locator.length > 0) {
    return evidence.locator;
  }
  return explicitFiles?.[runtime] ?? null;
}

function selectCanaryShotIds(shots) {
  const available = new Set(shots.map(({ shotId }) => shotId));
  const preferred = CANARY_SHOT_PREFERENCES.filter((shotId) => available.has(shotId));
  if (preferred.length === 5) return preferred;
  const selected = [...preferred];
  const candidates = shots.map(({ shotId }) => shotId).filter((shotId) => !selected.includes(shotId));
  while (selected.length < 5 && candidates.length > 0) {
    const index = selected.length === 0
      ? 0
      : Math.round((candidates.length - 1) * selected.length / Math.max(1, 5 - preferred.length));
    selected.push(candidates.splice(Math.min(index, candidates.length - 1), 1)[0]);
  }
  if (selected.length !== 5) throw new Error('creative-loop planning requires five canary shots');
  return selected.sort((left, right) => (
    shots.findIndex(({ shotId }) => shotId === left) - shots.findIndex(({ shotId }) => shotId === right)
  ));
}

export async function planRuntime({
  recipesDirectory,
  selectionFile,
  narrativeEnvelopeFile,
  visualSystemFile,
  representativeScenesFile,
  motionMapFile,
  originalSrtFile,
  originalDesignFile,
  runtimeExecutableFiles = {},
  parentSoloReasons = {},
  matrixFile = defaultMatrix,
  remotionIndexFile = defaultRemotionIndex,
  productionProfile: requestedProductionProfile = DEFAULT_PRODUCTION_PROFILE,
}) {
  const [recipes, selection, matrix, remotionIndex, sharedArtifactData, representativeSceneData] = await Promise.all([
    readRecipes(recipesDirectory),
    readFile(selectionFile, 'utf8').then(JSON.parse),
    readFile(matrixFile, 'utf8').then(JSON.parse),
    readFile(remotionIndexFile, 'utf8').then(JSON.parse),
    bindSharedArtifacts({ narrativeEnvelopeFile, visualSystemFile }),
    representativeScenesFile ? bindRepresentativeScenes(representativeScenesFile) : null,
  ]);
  const recipeSchemaVersion = recipes[0]?.schemaVersion;
  const planSchemaVersion = representativeSceneData
    ? recipeSchemaVersion === '4.0.0' ? '4.0.0' : '3.0.0'
    : '2.0.0';
  const sharedArtifacts = {
    narrativeEnvelope: sharedArtifactData.narrativeEnvelope.binding,
    visualSystem: sharedArtifactData.visualSystem.binding,
    ...(representativeSceneData ? { representativeScenes: representativeSceneData.binding } : {}),
  };
  const inferredProductionRoot = path.dirname(path.dirname(path.resolve(narrativeEnvelopeFile)));
  const sourceContext = planSchemaVersion === '4.0.0' ? {
    originalSrt: await bindOriginalInput(originalSrtFile, inferredProductionRoot, 'original SRT'),
    originalDesign: await bindOriginalInput(originalDesignFile, inferredProductionRoot, 'original design'),
  } : null;
  const productionProfile = bindProductionProfile(requestedProductionProfile);
  if (['3.0.0', '4.0.0'].includes(planSchemaVersion)) {
    if (!motionMapFile) throw new Error('runtime plan v3 requires motion-map.json');
    if (planSchemaVersion === '3.0.0') {
      await validateMotionMap({ motionMapFile, recipesDirectory, representativeScenesFile });
    }
    const motionMapBody = await readFile(motionMapFile);
    const motionMap = JSON.parse(motionMapBody.toString('utf8'));
    sharedArtifacts.motionMap = {
      locator: 'motion-map.json',
      schemaVersion: motionMap.schemaVersion,
      sha256: createHash('sha256').update(motionMapBody).digest('hex'),
    };
  }
  if (selection.status !== 'selected' || !['auto', 'hyperframes', 'hybrid', 'remotion'].includes(selection.selectedRuntime)) {
    throw new Error('runtime selection must be selected and name auto, hyperframes, hybrid, or remotion');
  }
  if (!['1.0.0', '2.0.0'].includes(selection.schemaVersion)) throw new Error('unsupported runtime selection schema version');
  if (selection.selectionSource !== 'explicit' && selection.selectedRuntime !== 'hyperframes') {
    throw new Error('auto, remotion, and hybrid require explicit runtime selection; implicit/default production uses hyperframes');
  }
  const mode = planningMode(selection);
  const capabilityById = new Map(matrix.capabilities.map((item) => [item.id, item]));
  const remotionCards = new Map(remotionIndex.cards.map((item) => [item.name, item]));
  const warnings = [];
  const conflicts = [];
  const shots = [];
  const chapterById = new Map(sharedArtifactData.narrativeEnvelope.value.chapters.map(
    (chapter) => [chapter.chapterId, chapter],
  ));

  if (representativeSceneData && !['3.0.0', '4.0.0'].includes(recipeSchemaVersion)) {
    conflicts.push('visual-lock production requires shot recipe schema v3; legacy v1/v2 Recipes remain read-only compatible');
  }
  if (!representativeSceneData && ['3.0.0', '4.0.0'].includes(recipeSchemaVersion)) {
    conflicts.push('shot recipe schema v3 requires representative-scenes.json and runtime plan v3');
  }

  for (const recipe of recipes) {
    const window = recipeWindow(recipe);
    if (recipe.schemaVersion === '4.0.0') {
      const chapter = chapterById.get(recipe.truth.chapterId);
      if (!chapter) conflicts.push(`${recipe.shotId}: truth.chapterId does not name a narrative chapter`);
      else if (window.startMs < chapter.window.startMs || window.endMs > chapter.window.endMs) {
        conflicts.push(`${recipe.shotId}: truth window must stay inside its narrative chapter`);
      }
    }
    if (planSchemaVersion === '2.0.0' && window.endMs - window.startMs > 40_000) {
      conflicts.push(`${recipe.shotId}: semantic shot exceeds 40000ms; return to Director to split it`);
    }
    if (planSchemaVersion === '3.0.0'
      && window.endMs - window.startMs > 15_000
      && !recipe.durationRationale) {
      conflicts.push(`${recipe.shotId}: semantic shot exceeds 15000ms without durationRationale`);
    }
    if (['2.0.0', '3.0.0'].includes(recipe.schemaVersion)
      && !sharedArtifactData.visualSystem.value.compositionFamilies.includes(recipe.compositionFamily)) {
      conflicts.push(`${recipe.shotId}: composition family is not declared in visual-system.json`);
    }
    const candidates = [];
    const native = new Set();
    for (const capabilityId of recipe.requiredCapabilities ?? []) {
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
    const routing = explainRouting({ mode, runtime, decision, candidates });
    shots.push({
      shotId: recipe.shotId, window: { ...window }, runtime, decision,
      ...routing,
      evidence: candidates.sort((a, b) => b.priority - a.priority || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)),
      unverifiedPreferences: chosenUnverified.sort(),
    });
  }

  for (let index = 0; index < shots.length; index += 1) {
    if (index === 0 && shots[index].window.startMs !== 0) conflicts.push('shot coverage must begin at 0');
    if (index > 0 && shots[index].window.startMs !== shots[index - 1].window.endMs) conflicts.push(`${shots[index].shotId}: shot coverage has a gap or overlap`);
  }
  if (['3.0.0', '4.0.0'].includes(planSchemaVersion)) {
    const shotIds = new Set(shots.map(({ shotId }) => shotId));
    for (const scene of representativeSceneData.value.scenes) {
      if (!shotIds.has(scene.shotId)) conflicts.push(`${scene.shotId}: representative scene does not name a planned shot`);
    }
  }
  const backends = [...new Set(shots.map(({ runtime }) => runtime))].sort();
  const runtimeExecutables = planSchemaVersion === '4.0.0'
    ? Object.fromEntries(await Promise.all(backends.map(async (runtime) => [
      runtime,
      await bindRuntimeExecutable(selectedExecutableLocator(selection, runtime, runtimeExecutableFiles), runtime),
    ])))
    : null;
  if (['3.0.0', '4.0.0'].includes(planSchemaVersion)) {
    const representativeBackends = new Set(representativeSceneData.value.scenes.map(
      ({ shotId }) => shots.find((shot) => shot.shotId === shotId)?.runtime,
    ));
    for (const backend of backends) {
      if (!representativeBackends.has(backend)) conflicts.push(`representative scenes must include the planned ${backend} backend`);
    }
  }
  if (mode === 'forced-hybrid' && backends.length !== 2) conflicts.push('explicit hybrid requires evidence-backed assignments to both backends; do not force an artificial split');
  if (conflicts.length) {
    const plan = actionPlan(
      selection,
      mode,
      [...warnings, ...conflicts],
      sharedArtifacts,
      productionProfile,
      planSchemaVersion,
      planSchemaVersion === '4.0.0' ? {
        sourceContext,
        runtimeExecutables,
        leadProduction: {
          representativeScenes: representativeSceneData.value.scenes.map((scene) => ({
            ...scene,
            runtime: shots.find(({ shotId }) => shotId === scene.shotId)?.runtime ?? 'hyperframes',
          })),
          leadAssignmentLocators: backends.map((_, index) => (
            `01-runtime-plan/assignments/L${String(index + 1).padStart(3, '0')}.json`
          )),
        },
        canaryGate: {
          required: true,
          technicalLocator: '05-delivery/canary-technical-gate.json',
          userDecisionLocator: '05-delivery/canary-user-decision.json',
          shotIds: selectCanaryShotIds(shots),
          fullProductionBlockedUntil: 'technical-and-user-passed',
        },
      } : {},
    );
    await validateRuntimePlan(plan, {
      narrativeEnvelopeFile, visualSystemFile, representativeScenesFile, motionMapFile, recipesDirectory,
      originalSrtFile, originalDesignFile, productionRoot: inferredProductionRoot,
    });
    return plan;
  }
  const resultingRoute = backends.length === 2 ? 'hybrid' : backends[0];
  const blocks = buildBlocks(shots);
  const authoringUnits = planSchemaVersion === '4.0.0'
    ? buildV4AuthoringUnits(
      blocks, shots, recipes, sharedArtifacts,
      sharedArtifactData.narrativeEnvelope.value.chapters,
      parentSoloReasons,
    )
    : planSchemaVersion === '3.0.0'
      ? buildV3AuthoringUnits(blocks, shots, recipes, sharedArtifacts)
      : buildLegacyAuthoringUnits(blocks, shots, recipes, sharedArtifacts);
  const representativeScenes = representativeSceneData?.value.scenes.map((scene) => ({
    ...scene,
    runtime: shots.find(({ shotId }) => shotId === scene.shotId).runtime,
  }));
  const leadAssignmentLocators = backends.map((_, index) => (
    `01-runtime-plan/assignments/L${String(index + 1).padStart(3, '0')}.json`
  ));
  const plan = {
    schemaVersion: planSchemaVersion, status: 'planned', planningMode: mode,
    selection: {
      schemaVersion: selection.schemaVersion,
      selectedRuntime: selection.selectedRuntime,
      selectionSource: selection.selectionSource,
    },
    sharedArtifacts,
    productionProfile,
    backendFailurePolicy: 'return-to-selected-backend',
    ...(planSchemaVersion === '4.0.0' ? { sourceContext } : {}),
    ...(planSchemaVersion === '4.0.0' ? { runtimeExecutables } : {}),
    mediaBoundary: ['3.0.0', '4.0.0'].includes(planSchemaVersion) ? 'shot' : 'authoring-unit',
    resultingRoute, requiredBackends: backends,
    integrationMode: ['3.0.0', '4.0.0'].includes(planSchemaVersion) ? 'shot-media' : 'frozen-block-media',
    frozenMediaContractVersion: ['3.0.0', '4.0.0'].includes(planSchemaVersion) ? null : '1.0.0',
    shotMediaContractVersion: ['3.0.0', '4.0.0'].includes(planSchemaVersion) ? '1.0.0' : null,
    shots, blocks, authoringUnits,
    ...(['3.0.0', '4.0.0'].includes(planSchemaVersion) ? {
      ...(planSchemaVersion === '4.0.0' ? { leadProduction: {
        representativeScenes,
        leadAssignmentLocators,
      } } : { visualLock: {
        required: true,
        contractLocator: '04-visual-lock/visual-lock.json',
        sourceIsolation: 'per-runtime',
        representativeScenes,
        leadAssignmentLocators,
      } }),
    } : {}),
    ...(planSchemaVersion === '4.0.0' ? {
      canaryGate: {
        required: true,
        technicalLocator: '05-delivery/canary-technical-gate.json',
        userDecisionLocator: '05-delivery/canary-user-decision.json',
        shotIds: selectCanaryShotIds(shots),
        fullProductionBlockedUntil: 'technical-and-user-passed',
      },
    } : {}),
    warnings: [...new Set(warnings)].sort(), identity: '',
  };
  plan.identity = computeRuntimePlanIdentity(plan);
  await validateRuntimePlan(plan, {
    narrativeEnvelopeFile, visualSystemFile, representativeScenesFile, motionMapFile, recipesDirectory,
    originalSrtFile, originalDesignFile, productionRoot: inferredProductionRoot,
  });
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

function shellArgument(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function standardRenderCommand({ root, assignmentId, sourceRoot, runtime, runtimeExecutable }) {
  const renderScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'render-assigned-shots.mjs');
  const values = [
    '--plan', path.join(root, '01-runtime-plan/runtime-plan.json'),
    '--assignment', path.join(root, `01-runtime-plan/assignments/${assignmentId}.json`),
    '--recipes', path.join(root, '01-director/shot-recipes'),
    '--source-root', path.join(root, sourceRoot),
    '--production-root', root,
    ...(runtimeExecutable ? [`--${runtime}`, runtimeExecutable] : []),
  ];
  return `node ${shellArgument(renderScript)} ${values.map((value, index) => (
    index % 2 === 0 ? value : shellArgument(value)
  )).join(' ')}`;
}

export function runtimeInspectionContract(runtime, assignmentId) {
  const inspectionRoot = `05-delivery/checks/${assignmentId}`;
  const remotion = runtime === 'remotion';
  return {
    mode: 'parent-runtime-inspection',
    adapter: remotion ? 'remotion-dom-trace' : 'hyperframes-check',
    resultLocator: `${inspectionRoot}.runtime-inspection.json`,
    traceLocator: remotion ? `${inspectionRoot}.motion-layout-trace.json` : null,
    metadataLocator: remotion ? `${inspectionRoot}.motion-layout-metadata.json` : null,
    diagnosticRoot: `${inspectionRoot}-diagnostics`,
    escalation: 'bounded-dense-only',
  };
}

function unitDirectory(unit) {
  return unit.runtime === 'remotion'
    ? `03-remotion-build/${unit.unitId}`
    : `03-build/${unit.unitId}`;
}

function plannedLeadSamples(plan) {
  const leadPlan = plan.schemaVersion === '4.0.0' ? plan.leadProduction : plan.visualLock;
  return leadPlan.representativeScenes.map(({ shotId, runtime }) => ({
    shotId,
    runtime,
    mediaLocator: `04-visual-lock/${runtime}/scenes/${shotId}.mp4`,
    capabilityIndex: `04-visual-lock/${runtime}/capability-index.md`,
  }));
}

function canaryPhase(plan, shotIds) {
  const canaryShotIds = shotIds.filter((shotId) => plan.canaryGate.shotIds.includes(shotId));
  const deferredShotIds = shotIds.filter((shotId) => !plan.canaryGate.shotIds.includes(shotId));
  return {
    gateLocator: plan.canaryGate.technicalLocator,
    userDecisionLocator: plan.canaryGate.userDecisionLocator,
    mode: canaryShotIds.length > 0 ? 'canary-first' : 'full-production-after-gate',
    shotIds: canaryShotIds,
    deferredShotIds,
  };
}

function creativeContext(plan) {
  return {
    originalInputs: {
      srt: plan.sourceContext.originalSrt,
      design: plan.sourceContext.originalDesign,
    },
    leadSamples: plannedLeadSamples(plan),
    materialAccess: {
      sharedAssetsRoot: '02-assets',
      assetIndex: '02-assets/asset-index.json',
      shotSpecificRoutes: ['native', 'provided', 'search', 'generate', 'mixed'],
    },
  };
}

export function buildBuilderAssignments(plan, {
  productionRoot,
  recipesDirectory,
  narrativeEnvelopeFile,
  visualSystemFile,
  representativeScenesFile,
  motionMapFile,
} = {}) {
  if (!['2.0.0', '3.0.0', '4.0.0'].includes(plan?.schemaVersion) || plan.status !== 'planned') {
    throw new Error('Builder assignments require one planned runtime plan v2, v3, or v4');
  }
  const root = path.resolve(productionRoot);
  const recipeRoot = path.resolve(recipesDirectory);
  const narrativeEnvelope = locator(root, narrativeEnvelopeFile);
  const visualSystem = locator(root, visualSystemFile);
  const motionMap = motionMapFile ? locator(root, motionMapFile) : null;
  const representativeShotIds = new Set(
    ['3.0.0', '4.0.0'].includes(plan.schemaVersion)
      ? (plan.schemaVersion === '4.0.0' ? plan.leadProduction : plan.visualLock)
        .representativeScenes.map(({ shotId }) => shotId)
      : [],
  );
  const productionAssignments = plan.authoringUnits.flatMap((unit) => {
    const leadFinalShotIds = unit.shotIds.filter((shotId) => representativeShotIds.has(shotId));
    const fullProductionShotIds = unit.shotIds.filter((shotId) => !representativeShotIds.has(shotId));
    if (['3.0.0', '4.0.0'].includes(plan.schemaVersion) && fullProductionShotIds.length === 0) return [];
    const phasePlan = plan.schemaVersion === '4.0.0' ? canaryPhase(plan, fullProductionShotIds) : null;
    const assignedShotIds = phasePlan?.shotIds.length > 0 ? phasePlan.shotIds : fullProductionShotIds;
    const workDirectory = unitDirectory(unit);
    const sourceRoot = `${workDirectory}/source`;
    const injection = roleInjection('builder');
    return [{
      schemaVersion: plan.schemaVersion === '4.0.0' ? '3.0.0' : plan.schemaVersion === '3.0.0' ? '2.0.0' : '1.0.0',
      ...(['3.0.0', '4.0.0'].includes(plan.schemaVersion) ? {
        assignmentId: unit.unitId,
        role: 'builder',
        phase: 'production',
      } : {}),
      planIdentity: plan.identity,
      unitId: unit.unitId,
      blockId: unit.blockId,
      runtime: unit.runtime,
      ...(plan.schemaVersion === '4.0.0' ? { runtimeExecutable: plan.runtimeExecutables[unit.runtime] } : {}),
      window: unit.window,
      shotIds: assignedShotIds,
      backendFailurePolicy: plan.backendFailurePolicy,
      mediaBoundary: plan.mediaBoundary,
      renderTargets: assignedShotIds.map((shotId) => ({ shotId, mode: 'direct-runtime-render' })),
      ...injection,
      ...(['3.0.0', '4.0.0'].includes(plan.schemaVersion) ? {
        leadFinalShotIds,
        sourceRoot,
        standardCommand: standardRenderCommand({
          root,
          assignmentId: unit.unitId,
          sourceRoot,
          runtime: unit.runtime,
          runtimeExecutable: plan.schemaVersion === '4.0.0'
            ? plan.runtimeExecutables[unit.runtime].locator
            : null,
        }),
        ...(plan.schemaVersion === '3.0.0'
          ? { runtimeInspection: runtimeInspectionContract(unit.runtime, unit.unitId) }
          : {}),
      } : {}),
      stageSkill: unit.runtime === 'remotion' ? 'broll-remotion-build' : 'broll-master-build',
      contextFiles: {
        assignment: `01-runtime-plan/assignments/${unit.unitId}.json`,
        runtimePlan: '01-runtime-plan/runtime-plan.json',
        narrativeEnvelope,
        visualSystem,
        recipes: (plan.schemaVersion === '4.0.0' ? unit.shotIds : assignedShotIds)
          .map((shotId) => locator(root, path.join(recipeRoot, `${shotId}.json`))),
        materialPlan: '02-assets/material-plan.md',
        fontPlan: '02-assets/font-plan.md',
        ...(plan.schemaVersion === '4.0.0' ? {
          originalSrt: plan.sourceContext.originalSrt.locator,
          originalDesign: plan.sourceContext.originalDesign.locator,
          assetIndex: '02-assets/asset-index.json',
          leadCapabilityIndexes: [...new Set(plannedLeadSamples(plan).map(({ capabilityIndex }) => capabilityIndex))],
        } : {}),
      },
      ...(plan.schemaVersion === '4.0.0' ? {
        ...creativeContext(plan),
        recipeBindings: unit.context.recipeBindings,
        chapter: {
          chapterIds: unit.chapterIds,
          groupingReason: unit.groupingReason,
          window: unit.window,
          shotIds: unit.shotIds,
          leadFinalShotIds,
        },
        canaryPhase: phasePlan,
      } : {}),
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
        ...(['3.0.0', '4.0.0'].includes(plan.schemaVersion)
          ? {
            shotMediaRequired: true,
            ...(plan.schemaVersion === '4.0.0' ? { viewReceipt: `${workDirectory}/view-receipt.json` } : {}),
          }
          : {
            frozenMediaRequired: true,
            frozenMediaContract: `${workDirectory}/block-media.json`,
          }),
      },
      shared: {
        assetsRoot: '02-assets',
        copyAssetsIntoUnit: false,
        dependencyMode: unit.runtime === 'remotion'
          ? 'shared-by-exact-identity'
          : 'shared-pinned-runtime',
        dependencyRoot: unit.runtime === 'remotion' ? '.remotion-toolchains' : null,
      },
      ...(plan.schemaVersion === '3.0.0' ? {
        visualLock: {
          required: true,
          contract: plan.visualLock.contractLocator,
          requiredStatus: ['approved', 'skipped'],
          sourceRoot: `04-visual-lock/${unit.runtime}/shared-source`,
          sourceIsolation: 'same-runtime-only',
        },
      } : plan.schemaVersion === '4.0.0' ? {
        leadProduction: {
          sourceRoot: `04-visual-lock/${unit.runtime}/shared-source`,
          sourceIsolation: 'same-runtime-only',
        },
      } : {}),
      contextPolicy: plan.schemaVersion === '4.0.0'
        ? 'Read the complete original SRT and original design, this chapter packet, its Recipes, declared seams, Lead samples/capability indexes, and shared asset plans. Do not read parent transcripts, other chapters, generic schemas, validators, or unrelated references.'
        : 'Load only the listed files, selected references named by the assigned Recipes, and files named by the shared asset plans. Do not inherit the parent transcript or read unrelated Recipes.',
      seamLimit: 'A live transition cannot cross independently rendered units. Keep a live shared-element transition inside one unit; otherwise close this unit on the planned readable state and use the declared matched seam.',
    }];
  });
  if (!['3.0.0', '4.0.0'].includes(plan.schemaVersion)) return productionAssignments;
  const leadAssignments = plan.requiredBackends.map((runtime, index) => {
    const assignmentId = `L${String(index + 1).padStart(3, '0')}`;
    const leadPlan = plan.schemaVersion === '4.0.0' ? plan.leadProduction : plan.visualLock;
    const scenes = leadPlan.representativeScenes.filter((scene) => scene.runtime === runtime);
    const workDirectory = `04-visual-lock/${runtime}`;
    const sourceRoot = `${workDirectory}/shared-source`;
    const injection = roleInjection('lead');
    return {
      schemaVersion: plan.schemaVersion === '4.0.0' ? '3.0.0' : '2.0.0',
      assignmentId,
      planIdentity: plan.identity,
      role: 'lead',
      phase: plan.schemaVersion === '4.0.0' ? 'lead-production' : 'visual-lock',
      runtime,
      ...(plan.schemaVersion === '4.0.0' ? { runtimeExecutable: plan.runtimeExecutables[runtime] } : {}),
      backendFailurePolicy: plan.backendFailurePolicy,
      mediaBoundary: plan.mediaBoundary,
      renderTargets: scenes.map(({ shotId }) => ({ shotId, mode: 'direct-runtime-render' })),
      ...injection,
      finalProductionSource: true,
      sourceRoot,
      standardCommand: standardRenderCommand({
        root,
        assignmentId,
        sourceRoot,
        runtime,
        runtimeExecutable: plan.schemaVersion === '4.0.0'
          ? plan.runtimeExecutables[runtime].locator
          : null,
      }),
      ...(plan.schemaVersion === '3.0.0'
        ? { runtimeInspection: runtimeInspectionContract(runtime, assignmentId) }
        : {}),
      shotIds: scenes.map(({ shotId }) => shotId),
      representativeScenes: scenes,
      stageSkill: runtime === 'remotion' ? 'broll-remotion-build' : 'broll-master-build',
      contextFiles: {
        assignment: `01-runtime-plan/assignments/${assignmentId}.json`,
        runtimePlan: '01-runtime-plan/runtime-plan.json',
        narrativeEnvelope,
        visualSystem,
        representativeScenes: locator(root, representativeScenesFile),
        motionMap,
        recipes: scenes.map(({ shotId }) => locator(root, path.join(recipeRoot, `${shotId}.json`))),
        materialPlan: '02-assets/material-plan.md',
        fontPlan: '02-assets/font-plan.md',
        ...(plan.schemaVersion === '4.0.0' ? {
          originalSrt: plan.sourceContext.originalSrt.locator,
          originalDesign: plan.sourceContext.originalDesign.locator,
          assetIndex: '02-assets/asset-index.json',
        } : {}),
      },
      ...(plan.schemaVersion === '4.0.0' ? {
        ...creativeContext(plan),
        recipeBindings: scenes.map(({ shotId }) => plan.authoringUnits
          .flatMap(({ context }) => context.recipeBindings)
          .find((binding) => binding.shotId === shotId)),
        canaryPhase: canaryPhase(plan, scenes.map(({ shotId }) => shotId)),
      } : {}),
      productionProfile: plan.productionProfile,
      productionProfileIdentity: plan.productionProfile.identity,
      output: {
        workDirectory,
        representativeMediaRoot: `${workDirectory}/scenes`,
        sharedSourceRoot: `${workDirectory}/shared-source`,
        ...(plan.schemaVersion === '3.0.0' ? { visualLockContract: plan.visualLock.contractLocator } : {}),
        ...(plan.schemaVersion === '4.0.0' ? {
          viewReceipt: `${workDirectory}/view-receipt.json`,
          handoff: `${workDirectory}/handoff.md`,
        } : {}),
        editableSourceRequired: true,
        frozenMediaRequired: false,
      },
      ...(plan.schemaVersion === '4.0.0' ? {
        viewLoop: {
          required: true,
          decision: ['accepted', 'revised'],
          artifacts: ['six-frame-sheets', 'short-preview'],
        },
      } : {}),
      shared: {
        assetsRoot: '02-assets',
        copyAssetsIntoUnit: false,
        sourceIsolation: 'per-runtime',
        mayImportRuntimeSourceFrom: runtime,
      },
      contextPolicy: plan.schemaVersion === '4.0.0'
        ? 'Read the complete original SRT and original design, the three representative Recipes, motion map, shared asset plans, and only the explicitly listed creative references. Do not read parent transcripts, unrelated Recipes, schemas, validators, or other stage Skills.'
        : 'Load only the listed representative Recipes and shared plans. Do not inherit the parent transcript or read unrelated Recipes.',
    };
  });
  return [...leadAssignments, ...productionAssignments];
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
      path.join(temporaryDirectory, 'assignments', `${assignment.assignmentId ?? assignment.unitId}.json`),
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
    assignments: assignments.map((assignment) => `01-runtime-plan/assignments/${assignment.assignmentId ?? assignment.unitId}.json`),
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === '--json') continue;
    if (!['--recipes', '--selection', '--narrative-envelope', '--visual-system', '--representative-scenes', '--motion-map', '--original-srt', '--original-design', '--hyperframes-executable', '--remotion-executable', '--solo-reasons', '--matrix', '--remotion-index', '--production-root', '--production-profile'].includes(name)) throw new Error(`unknown argument ${name}`);
    const value = argv[index + 1];
    if (!value) throw new Error(`${name} requires a path`);
    options[name.slice(2)] = path.resolve(value);
    index += 1;
  }
  if (!options.recipes || !options.selection || !options['narrative-envelope'] || !options['visual-system']) throw new Error('--recipes, --selection, --narrative-envelope, and --visual-system are required');
  const parsed = {
    recipesDirectory: options.recipes, selectionFile: options.selection,
    narrativeEnvelopeFile: options['narrative-envelope'], visualSystemFile: options['visual-system'],
    representativeScenesFile: options['representative-scenes'],
    motionMapFile: options['motion-map'],
    originalSrtFile: options['original-srt'],
    originalDesignFile: options['original-design'],
    runtimeExecutableFiles: {
      ...(options['hyperframes-executable'] ? { hyperframes: options['hyperframes-executable'] } : {}),
      ...(options['remotion-executable'] ? { remotion: options['remotion-executable'] } : {}),
    },
    parentSoloReasonsFile: options['solo-reasons'],
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
  if (planOptions.parentSoloReasonsFile) {
    planOptions.parentSoloReasons = JSON.parse(await readFile(planOptions.parentSoloReasonsFile, 'utf8'));
    delete planOptions.parentSoloReasonsFile;
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
