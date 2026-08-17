#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, validateSchemaValue } from './runtime-schema-validator.mjs';
import { validateMezzaninePolicy } from './frozen-media-policy.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPaths = new Map([
  ['1.0.0', path.join(skillRoot, 'references', 'runtime', 'runtime-plan-v1.schema.json')],
  ['2.0.0', path.join(skillRoot, 'references', 'runtime', 'runtime-plan.schema.json')],
  ['3.0.0', path.join(skillRoot, 'references', 'runtime', 'runtime-plan.schema.json')],
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

export async function validateRuntimePlan(plan, sharedArtifactFiles = {}) {
  const schemaPath = schemaPaths.get(plan?.schemaVersion);
  if (!schemaPath) throw new Error(`runtime plan validation failed:\n#/schemaVersion: unsupported runtime plan schema version ${JSON.stringify(plan?.schemaVersion)}`);
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const errors = validateSchemaValue(plan, schema, schema);
  let shared;
  if (['2.0.0', '3.0.0'].includes(plan?.schemaVersion)) {
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
      if (plan.schemaVersion === '3.0.0') {
        const representativeScenes = await bindRepresentativeScenes(sharedArtifactFiles.representativeScenesFile);
        if (JSON.stringify(plan.sharedArtifacts?.representativeScenes) !== JSON.stringify(representativeScenes.binding)) {
          errors.push('#/sharedArtifacts/representativeScenes: locator, schema version, or content hash does not match the verified file');
        }
      }
    } catch (error) {
      errors.push(`#/sharedArtifacts: ${error.message}`);
    }
  }
  if (plan?.identity && computeRuntimePlanIdentity(plan) !== plan.identity) errors.push('#/identity: aggregate does not match plan contents');
  if (plan?.status === 'planned') {
    if (!plan.resultingRoute || !plan.integrationMode || plan.shots.length === 0 || plan.blocks.length === 0) errors.push('#: a planned route requires shots, blocks, and integration mode');
    if (['2.0.0', '3.0.0'].includes(plan.schemaVersion) && plan.integrationMode !== 'frozen-block-media') errors.push('#/integrationMode: runtime plan v2/v3 requires frozen authoring-unit media');
    if (['2.0.0', '3.0.0'].includes(plan.schemaVersion) && plan.frozenMediaContractVersion !== '1.0.0') errors.push('#/frozenMediaContractVersion: runtime plan v2/v3 requires the frozen media contract');
    if (plan.schemaVersion === '1.0.0' && plan.resultingRoute === 'hybrid' && plan.integrationMode !== 'frozen-block-media') errors.push('#/integrationMode: hybrid requires frozen-block-media');
    if (plan.schemaVersion === '1.0.0' && plan.resultingRoute !== 'hybrid' && plan.integrationMode !== 'single-runtime-source') errors.push('#/integrationMode: legacy single runtime route requires single-runtime-source');
    const expectedBackends = [...new Set(plan.shots.map(({ runtime }) => runtime))].sort();
    if (JSON.stringify(expectedBackends) !== JSON.stringify([...plan.requiredBackends].sort())) errors.push('#/requiredBackends: does not match shot assignments');
    const shots = [...plan.shots].sort((a, b) => a.window.startMs - b.window.startMs || a.shotId.localeCompare(b.shotId));
    if (shots[0]?.window.startMs !== 0) errors.push('#/shots: coverage must start at 0');
    for (let index = 0; index < shots.length; index += 1) {
      if (shots[index].window.endMs <= shots[index].window.startMs) errors.push(`#/shots/${index}/window: endMs must be greater than startMs`);
      if (index > 0 && shots[index].window.startMs !== shots[index - 1].window.endMs) errors.push(`#/shots/${index}/window: shots must be contiguous without gaps or overlaps`);
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
    if (['2.0.0', '3.0.0'].includes(plan.schemaVersion)) {
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
        }
      }
      if (plan.schemaVersion === '3.0.0') {
        const representatives = plan.visualLock?.representativeScenes ?? [];
        const expectedRepresentatives = sharedArtifactFiles.representativeScenesFile
          ? (await bindRepresentativeScenes(sharedArtifactFiles.representativeScenesFile)).value.scenes
          : [];
        if (plan.visualLock?.required !== true
          || plan.visualLock?.contractLocator !== '04-visual-lock/visual-lock.json'
          || plan.visualLock?.sourceIsolation !== 'per-runtime') {
          errors.push('#/visualLock: v3 requires the default visual-lock gate and per-runtime source isolation');
        }
        if (JSON.stringify(representatives.map(({ shotId, coverage, reason, concerns }) => ({ shotId, coverage, reason, concerns })))
          !== JSON.stringify(expectedRepresentatives)) {
          errors.push('#/visualLock/representativeScenes: must preserve the Director selection exactly');
        }
        for (const representative of representatives) {
          const planned = shots.find(({ shotId }) => shotId === representative.shotId);
          if (!planned || planned.runtime !== representative.runtime) {
            errors.push(`#/visualLock/representativeScenes: ${representative.shotId} runtime does not match the plan`);
          }
        }
        const representativeBackends = [...new Set(representatives.map(({ runtime }) => runtime))].toSorted();
        if (JSON.stringify(representativeBackends) !== JSON.stringify([...plan.requiredBackends].toSorted())) {
          errors.push('#/visualLock/representativeScenes: Hybrid selections must include every planned backend');
        }
        if (plan.visualLock?.leadAssignmentLocators?.length !== plan.requiredBackends.length) {
          errors.push('#/visualLock/leadAssignmentLocators: requires one Lead Builder assignment per backend');
        }
      }
    }
  } else if (plan?.resultingRoute !== null || plan?.requiredBackends?.length || plan?.blocks?.length
    || (['2.0.0', '3.0.0'].includes(plan?.schemaVersion) && plan?.authoringUnits?.length) || plan?.integrationMode !== null) {
    errors.push('#: action-required plan must not dispatch backends or integration');
  }
  if (errors.length) throw new Error(`runtime plan validation failed:\n${errors.join('\n')}`);
  return {
    status: 'valid', shots: plan.shots.length, blocks: plan.blocks.length,
    ...(['2.0.0', '3.0.0'].includes(plan.schemaVersion) ? { authoringUnits: plan.authoringUnits.length } : {}),
    route: plan.resultingRoute,
  };
}

async function main() {
  const [file, narrativeEnvelopeFile, visualSystemFile, representativeScenesFile] = process.argv.slice(2);
  if (!file) throw new Error('usage: node scripts/validate-runtime-plan.mjs <runtime-plan.json> [narrative-envelope.json visual-system.json representative-scenes.json]');
  const plan = JSON.parse(await readFile(path.resolve(file), 'utf8'));
  process.stdout.write(`${JSON.stringify(await validateRuntimePlan(plan, {
    narrativeEnvelopeFile, visualSystemFile, representativeScenesFile,
  }))}\n`);
}

if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
