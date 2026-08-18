#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson, validateSchemaValue } from './runtime-schema-validator.mjs';
import { validateRuntimePlan } from './validate-runtime-plan.mjs';
import {
  assertProductionSourcePolicy,
  assertMediaFacts,
  deliveryIndexFrom,
  framesForWindow,
  hashFile,
  numberedName,
  probeAndDecode,
  readJson,
  requireRegularFile,
  runCommand,
  semanticSamplePoints,
  validateBuilderViewReceipt,
  validateCanaryTechnicalGate,
  validateCanaryUserDecision,
} from './shot-media-lib.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotSchemaFile = path.join(skillRoot, 'references', 'runtime', 'shot-media.schema.json');
const deliverySchemaFile = path.join(skillRoot, 'references', 'runtime', 'delivery-index.schema.json');

function runtimePlanInputs(productionRoot, recipesDirectory) {
  const director = path.join(path.resolve(productionRoot), '01-director');
  return {
    narrativeEnvelopeFile: path.join(director, 'narrative-envelope.json'),
    visualSystemFile: path.join(director, 'visual-system.json'),
    representativeScenesFile: path.join(director, 'representative-scenes.json'),
    motionMapFile: path.join(director, 'motion-map.json'),
    recipesDirectory: path.resolve(recipesDirectory),
  };
}

function assertSchema(value, schema, label) {
  const errors = validateSchemaValue(value, schema, schema);
  if (errors.length) throw new Error(`${label} failed schema validation:\n- ${errors.join('\n- ')}`);
}

async function sourceBinding(sourceManifestFile) {
  await requireRegularFile(sourceManifestFile, 'source manifest');
  const manifest = await readJson(sourceManifestFile, 'source manifest');
  if (manifest?.schemaVersion !== '1.0.0' || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('source manifest must contain one or more version 1.0.0 file bindings');
  }
  const sourceRoot = path.join(path.dirname(sourceManifestFile), manifest.root ?? 'source');
  await assertProductionSourcePolicy(sourceRoot);
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== 'string' || !/^[0-9a-f]{64}$/u.test(entry.sha256 ?? '')) {
      throw new Error('source manifest contains an invalid file binding');
    }
    const file = path.resolve(sourceRoot, entry.path);
    const relative = path.relative(sourceRoot, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('source manifest path escapes its source root');
    await requireRegularFile(file, `source ${entry.path}`);
    if (await hashFile(file) !== entry.sha256) throw new Error(`source ${entry.path} differs from its manifest hash`);
  }
  return {
    identity: `sha256:${createHash('sha256').update(canonicalJson(manifest)).digest('hex')}`,
    sourceRoot: path.resolve(sourceRoot),
  };
}

async function bindSourceIdentities({ sourceManifestFile, sourceManifestFiles = [], productionRoot, plan }) {
  const provided = [...new Set([sourceManifestFile, ...sourceManifestFiles].filter(Boolean).map((file) => path.resolve(file)))];
  if (['3.0.0', '4.0.0'].includes(plan.schemaVersion)) {
    const assignmentDirectory = path.join(path.resolve(productionRoot), '01-runtime-plan', 'assignments');
    const assignments = await Promise.all((await readdir(assignmentDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && path.extname(entry.name) === '.json')
      .map(({ name }) => readJson(path.join(assignmentDirectory, name), `assignment ${name}`)));
    const bindingCache = new Map();
    const loadBinding = async (manifestFile) => {
      const absolute = path.resolve(manifestFile);
      if (!bindingCache.has(absolute)) bindingCache.set(absolute, sourceBinding(absolute));
      return bindingCache.get(absolute);
    };
    const providedBindings = await Promise.all(provided.map(async (manifestFile) => ({
      manifestFile, binding: await loadBinding(manifestFile),
    })));
    const identities = new Map();
    for (const assignment of assignments.filter(({ planIdentity }) => planIdentity === plan.identity)) {
      if (typeof assignment.sourceRoot !== 'string' || !Array.isArray(assignment.shotIds)) continue;
      const expectedSourceRoot = path.resolve(productionRoot, assignment.sourceRoot);
      const matched = providedBindings.filter(({ binding }) => binding.sourceRoot === expectedSourceRoot);
      if (matched.length > 1) throw new Error(`${assignment.assignmentId} has multiple source manifests for one source root`);
      const manifestFile = matched[0]?.manifestFile
        ?? path.join(path.dirname(expectedSourceRoot), 'source-manifest.json');
      let binding;
      try { binding = await loadBinding(manifestFile); } catch (error) {
        throw new Error(`${assignment.assignmentId} source manifest is missing or invalid: ${error.message}`);
      }
      if (binding.sourceRoot !== expectedSourceRoot) {
        throw new Error(`${assignment.assignmentId} source manifest points outside its planned sourceRoot`);
      }
      const assignmentShotIds = plan.schemaVersion === '4.0.0'
        ? [...new Set([...assignment.shotIds, ...(assignment.canaryPhase?.deferredShotIds ?? [])])]
        : assignment.shotIds;
      for (const shotId of assignmentShotIds) {
        if (identities.has(shotId)) throw new Error(`${shotId} is bound to multiple production source assignments`);
        identities.set(shotId, binding.identity);
      }
    }
    for (const shot of plan.shots) if (!identities.has(shot.shotId)) throw new Error(`${shot.shotId} has no validated assignment source manifest`);
    return identities;
  }
  const identities = new Map();
  for (const file of provided) identities.set(path.basename(path.dirname(file)), (await sourceBinding(file)).identity);
  const units = plan.authoringUnits ?? [];
  for (const unit of units) {
    if (identities.has(unit.unitId)) continue;
    const conventional = path.join(path.resolve(productionRoot), '03-builders', unit.unitId, 'source-manifest.json');
    try {
      identities.set(unit.unitId, (await sourceBinding(conventional)).identity);
    } catch (error) {
      if (units.length === 1 && provided.length === 1) identities.set(unit.unitId, (await sourceBinding(provided[0])).identity);
      else throw new Error(`${unit.unitId} source manifest is missing or invalid: ${error.message}`);
    }
  }
  return identities;
}

function expectedUnit(plan, shotId) {
  const matches = (plan.authoringUnits ?? []).filter(({ shotIds }) => shotIds.includes(shotId));
  if (matches.length !== 1) throw new Error(`${shotId} must belong to exactly one authoring unit`);
  return matches[0];
}

function creativeRecipeBinding(recipe) {
  if (!recipe?.truth || typeof recipe.truth !== 'object' || Array.isArray(recipe.truth)) {
    throw new Error(`${recipe?.shotId ?? 'Recipe'} has no immutable truth object`);
  }
  return {
    shotId: recipe.shotId,
    recipeIdentity: createHash('sha256').update(canonicalJson(recipe)).digest('hex'),
    truthIdentity: createHash('sha256').update(canonicalJson(recipe.truth)).digest('hex'),
  };
}

export async function recordCanaryUserDecision({
  planFile, productionRoot, decisionsFile,
  recipesDirectory = path.join(productionRoot, '01-director', 'shot-recipes'),
  ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', runner = runCommand,
  verifyPlanInputs,
}) {
  const plan = await readJson(path.resolve(planFile), 'runtime plan');
  if (plan.schemaVersion !== '4.0.0' || !plan.canaryGate?.required) {
    throw new Error('runtime plan has no required creative canary gate');
  }
  const technicalGate = await validateCanaryTechnicalGate({
    plan, productionRoot, recipesDirectory, ffmpeg, ffprobe, runner,
    verifyPlanInputs,
  });
  if (!technicalGate) throw new Error('canary technical gate must pass before recording the user decision');
  const input = await readJson(path.resolve(decisionsFile), 'canary user decision input');
  const decisions = Array.isArray(input) ? input : input.decisions;
  if (!Array.isArray(decisions) || decisions.length !== 5
    || canonicalJson(decisions.map(({shotId}) => shotId)) !== canonicalJson(plan.canaryGate.shotIds)) {
    throw new Error('canary user decision input must contain the five planned shots in order');
  }
  const oursPreferred = decisions.filter(({choice}) => choice === 'ours').length;
  if (oursPreferred < 3) throw new Error('canary user decision blocks full production because ours was preferred fewer than 3 of 5 times');
  for (const decision of decisions) {
    if (decision.choice === 'ours' && decision.accepted !== true) {
      throw new Error(`${decision.shotId} chose ours but did not accept it`);
    }
    if (decision.choice === 'comparison'
      && (typeof decision.issue !== 'string' || decision.issue.trim().length === 0)) {
      throw new Error(`${decision.shotId} comparison preference requires one concrete local issue`);
    }
    if (!['ours', 'comparison'].includes(decision.choice)) throw new Error(`${decision.shotId} has an invalid canary choice`);
  }
  const record = {
    schemaVersion: '1.0.0', status: 'passed', planIdentity: plan.identity,
    technicalGateIdentity: technicalGate.identity,
    canaryPreviewIdentity: technicalGate.canaryPreview.sha256,
    shotIds: [...plan.canaryGate.shotIds], decisions, oursPreferred,
  };
  record.identity = `sha256:${createHash('sha256').update(canonicalJson(record)).digest('hex')}`;
  const output = path.resolve(productionRoot, plan.canaryGate.userDecisionLocator);
  const relative = path.relative(path.resolve(productionRoot), output);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('canary user decision locator escapes the production root');
  await mkdir(path.dirname(output), {recursive: true});
  try {
    await writeFile(output, `${JSON.stringify(record, null, 2)}\n`, {flag: 'wx'});
    await validateCanaryUserDecision({plan, productionRoot, technicalGate});
    return {status: 'passed', output, identity: record.identity, oursPreferred};
  } catch (error) {
    if (error?.code !== 'EEXIST') await rm(output, {force: true});
    throw error;
  }
}

export async function validateShotMedia({
  planFile,
  recipesDirectory,
  sourceManifestFile,
  sourceManifestFiles = [],
  productionRoot,
  deliveryRoot = path.join(productionRoot, '05-delivery'),
  ffmpeg = 'ffmpeg',
  ffprobe = 'ffprobe',
  runner = runCommand,
}) {
  const absoluteDelivery = path.resolve(deliveryRoot);
  const [plan, shotSchema, deliverySchema] = await Promise.all([
    readJson(path.resolve(planFile), 'runtime plan'),
    readJson(shotSchemaFile, 'shot media schema'),
    readJson(deliverySchemaFile, 'delivery index schema'),
  ]);
  await validateRuntimePlan(plan, runtimePlanInputs(productionRoot, recipesDirectory));
  const sourceIdentities = await bindSourceIdentities({
    sourceManifestFile, sourceManifestFiles, productionRoot, plan,
  });
  if (plan.mediaBoundary !== undefined && plan.mediaBoundary !== 'shot') {
    throw new Error('runtime plan mediaBoundary must be shot');
  }
  if (plan.integrationMode !== undefined && plan.integrationMode !== 'shot-media') {
    throw new Error('runtime plan integrationMode must be shot-media');
  }
  if (plan.shotMediaContractVersion !== undefined && plan.shotMediaContractVersion !== '1.0.0') {
    throw new Error('runtime plan shotMediaContractVersion must be 1.0.0');
  }
  const recipeFiles = (await readdir(recipesDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.json')
    .map(({ name }) => path.basename(name, '.json')).sort();
  const plannedRecipeIds = plan.shots.map(({ shotId }) => shotId).sort();
  if (canonicalJson(recipeFiles) !== canonicalJson(plannedRecipeIds)) {
    throw new Error('shot file count and identities must exactly equal the Recipe directory');
  }
  const contracts = [];
  const recipes = [];
  let previousEnd = null;
  for (const [index, shot] of plan.shots.entries()) {
    const order = index + 1;
    if (previousEnd !== null && shot.window.startMs !== previousEnd) {
      throw new Error(`${shot.shotId} does not continuously follow the previous SRT window`);
    }
    previousEnd = shot.window.endMs;
    const basename = numberedName(order, shot.shotId, '');
    const contractFile = path.join(absoluteDelivery, 'shots', `${basename}.shot-media.json`);
    const mediaFile = path.join(absoluteDelivery, 'shots', `${basename}.mp4`);
    const [contract, recipe] = await Promise.all([
      readJson(contractFile, `${shot.shotId} shot contract`),
      readJson(path.join(recipesDirectory, `${shot.shotId}.json`), `${shot.shotId} Recipe`),
    ]);
    assertSchema(contract, shotSchema, `${shot.shotId} shot contract`);
    const unit = expectedUnit(plan, shot.shotId);
    const expectedFrameCount = framesForWindow(shot.window, plan.productionProfile.fps);
    const expectedRecipeIdentity = `sha256:${createHash('sha256').update(canonicalJson(recipe)).digest('hex')}`;
    const errors = [];
    if (contract.order !== order) errors.push('order');
    if (contract.shotId !== shot.shotId) errors.push('shotId');
    if (contract.unitId !== unit.unitId) errors.push('unitId');
    if (contract.backend !== shot.runtime || unit.runtime !== shot.runtime) errors.push('backend');
    if (contract.renderTarget.id !== shot.shotId || contract.renderTarget.mode !== 'direct-runtime-render') errors.push('renderTarget');
    if (canonicalJson(contract.srtWindowMs) !== canonicalJson({ start: shot.window.startMs, end: shot.window.endMs })) errors.push('srtWindowMs');
    if (canonicalJson(contract.localTimeline) !== canonicalJson({ startFrame: 0, frameCount: expectedFrameCount })) errors.push('localTimeline');
    const sourceIdentity = ['3.0.0', '4.0.0'].includes(plan.schemaVersion)
      ? sourceIdentities.get(shot.shotId) : sourceIdentities.get(unit.unitId);
    if (contract.sourceIdentity !== sourceIdentity) errors.push('sourceIdentity');
    if (contract.recipeIdentity !== expectedRecipeIdentity) errors.push('recipeIdentity');
    if (contract.profileIdentity !== `sha256:${plan.productionProfile.identity}`) errors.push('profileIdentity');
    if (contract.media.path !== `shots/${basename}.mp4`) errors.push('media.path');
    const expectedSamples = semanticSamplePoints(recipe, shot.window, plan.productionProfile.fps, expectedFrameCount);
    if (contract.semanticCheck.sourceMedia !== contract.media.path
      || contract.semanticCheck.contactSheet !== `checks/${basename}.semantic-check.png`
      || canonicalJson(contract.semanticCheck.samples) !== canonicalJson(expectedSamples)) {
      errors.push('semanticCheck');
    }
    if (errors.length) throw new Error(`${shot.shotId} contract differs from planned direct shot delivery: ${errors.join(', ')}`);
    await requireRegularFile(mediaFile, `${shot.shotId} media`);
    const facts = await probeAndDecode(mediaFile, {
      ffmpeg, ffprobe, runner, cwd: absoluteDelivery, shotId: shot.shotId,
    });
    assertMediaFacts(facts, {
      shotId: shot.shotId, frameCount: expectedFrameCount, window: shot.window,
      profile: plan.productionProfile,
    });
    if (contract.media.sha256 !== await hashFile(mediaFile)) throw new Error(`${shot.shotId} media hash changed after rendering`);
    if (contract.media.durationMs !== facts.durationMs || contract.media.width !== facts.width
      || contract.media.height !== facts.height || contract.media.codec !== facts.codec) {
      throw new Error(`${shot.shotId} probed media facts differ from its contract`);
    }
    const contactSheet = path.join(absoluteDelivery, contract.semanticCheck.contactSheet);
    await requireRegularFile(contactSheet, `${shot.shotId} semantic contact sheet`);
    if (contract.semanticCheck.sha256 !== await hashFile(contactSheet)) {
      throw new Error(`${shot.shotId} semantic contact sheet changed after rendering`);
    }
    contracts.push(contract);
    recipes.push(recipe);
  }
  if (!contracts.length) throw new Error('runtime plan contains no shots');
  const deliveryIndexFile = path.join(absoluteDelivery, 'delivery-index.json');
  const deliveryIndex = await readJson(deliveryIndexFile, 'delivery index');
  assertSchema(deliveryIndex, deliverySchema, 'delivery index');
  const expectedIndex = deliveryIndexFrom({ plan, contracts, recipes });
  if (canonicalJson(deliveryIndex) !== canonicalJson(expectedIndex)) {
    throw new Error('delivery index differs from the ordered, verified shot contracts');
  }
  let canaryTechnicalGate = null;
  let canaryUserDecision = null;
  if (plan.schemaVersion === '4.0.0') {
    canaryTechnicalGate = await validateCanaryTechnicalGate({
      plan, productionRoot, recipesDirectory, ffmpeg, ffprobe, runner,
    });
    if (!canaryTechnicalGate) throw new Error('canary technical gate has not passed; full production validation is blocked');
    canaryUserDecision = await validateCanaryUserDecision({
      plan, productionRoot, technicalGate: canaryTechnicalGate,
    });
    if (!canaryUserDecision) throw new Error('canary user decision has not passed; full production validation is blocked');
    const assignmentsDirectory = path.join(path.resolve(productionRoot), '01-runtime-plan', 'assignments');
    const assignments = await Promise.all((await readdir(assignmentsDirectory, {withFileTypes: true}))
      .filter((entry) => entry.isFile() && path.extname(entry.name) === '.json')
      .map(({name}) => readJson(path.join(assignmentsDirectory, name), `assignment ${name}`)));
    const contractByShotId = new Map(contracts.map((contract) => [contract.shotId, contract]));
    const recipeByShotId = new Map(recipes.map((recipe) => [recipe.shotId, recipe]));
    for (const assignment of assignments.filter((item) => (
      ['builder', 'lead'].includes(item.role) && item.planIdentity === plan.identity
    ))) {
      const assignmentShotIds = [...new Set([
        ...assignment.shotIds, ...(assignment.canaryPhase?.deferredShotIds ?? []),
      ])];
      const recipeBindings = assignmentShotIds.map((shotId) => creativeRecipeBinding(recipeByShotId.get(shotId)));
      await validateBuilderViewReceipt({
        assignment, productionRoot, recipeBindings, expectedShotIds: assignmentShotIds,
      });
      if (assignment.role === 'lead') continue;
      const previewFile = path.join(absoluteDelivery, 'chapter-previews', `${assignment.unitId}.mp4`);
      const facts = await probeAndDecode(previewFile, {
        ffmpeg, ffprobe, runner, cwd: absoluteDelivery, shotId: `${assignment.unitId} chapter preview`,
      });
      const unitContracts = assignmentShotIds.map((shotId) => contractByShotId.get(shotId));
      const expectedDuration = unitContracts.reduce((total, contract) => total + contract.media.durationMs, 0);
      const frameMs = 1_000 / unitContracts[0].media.fps;
      if (facts.codec !== 'h264' || facts.audioStreams !== 0
        || Math.abs(facts.fps - unitContracts[0].media.fps) > 1e-6
        || Math.abs(facts.durationMs - expectedDuration) > frameMs + 1) {
        throw new Error(`${assignment.unitId} chapter preview differs from its verified shot contracts`);
      }
    }
    const checksDirectory = path.join(absoluteDelivery, 'checks');
    const proofArtifacts = (await readdir(checksDirectory, {withFileTypes: true})).filter((entry) => (
      /motion-layout-(?:trace|metadata)|diagnostic/iu.test(entry.name)
      || entry.name.endsWith('.failure.json')
    ));
    if (proofArtifacts.length > 0) {
      throw new Error(`passing production may not retain dense trace/diagnostic artifacts: ${proofArtifacts.map(({name}) => name).join(', ')}`);
    }
  }
  return {
    status: 'valid', shots: contracts.length, startMs: plan.shots[0].window.startMs,
    endMs: plan.shots.at(-1).window.endMs, contracts, deliveryIndex,
    deliveryIndexFile, canaryTechnicalGate, canaryUserDecision,
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value) throw new Error(`invalid argument ${name ?? ''}`);
    const key = name.slice(2);
    if (key === 'source-manifest') options[key] = [...(options[key] ?? []), value];
    else options[key] = value;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options['record-canary-user-decision']) {
    for (const required of ['plan', 'production-root']) {
      if (!options[required]) throw new Error(`--${required} is required`);
    }
    const result = await recordCanaryUserDecision({
      planFile: options.plan, productionRoot: options['production-root'],
      decisionsFile: options['record-canary-user-decision'],
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  for (const required of ['plan', 'recipes', 'source-manifest', 'production-root']) {
    if (!options[required]) throw new Error(`--${required} is required`);
  }
  const result = await validateShotMedia({
    planFile: options.plan, recipesDirectory: options.recipes,
    sourceManifestFiles: options['source-manifest'], productionRoot: options['production-root'],
    deliveryRoot: options['delivery-root'], ffmpeg: options.ffmpeg, ffprobe: options.ffprobe,
  });
  process.stdout.write(`${JSON.stringify({ status: result.status, shots: result.shots })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
