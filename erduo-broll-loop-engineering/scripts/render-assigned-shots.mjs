#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson, validateSchemaValue } from './runtime-schema-validator.mjs';
import { validateRuntimePlan } from './validate-runtime-plan.mjs';
import { computeRecipeIdentity, computeRecipeTruthIdentity } from './validate-shot-recipes.mjs';
import { prepareSharedToolchain, renderRemotionCompositions } from './remotion-toolchain.mjs';
import {
  clearMinimalFailureEvidence,
  inspectAssignmentRuntime,
  shouldRunRuntimeInspection,
  writeMinimalFailureEvidence,
} from './backend-inspection.mjs';
import { assembleCanaryPreview, assembleChapterPreview } from './assemble-shot-preview.mjs';
import {
  assertProductionSourcePolicy,
  assertMediaFacts,
  commandFailure,
  deliveryIndexFrom,
  fpsNumber,
  framesForWindow,
  hashFile,
  numberedName,
  probeAndDecode,
  readJson,
  requireRegularFile,
  resolveCanaryRenderShotIds,
  runCommand,
  semanticSamplePoints,
  validateBuilderViewReceipt,
  validateCanaryTechnicalGate,
} from './shot-media-lib.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotSchemaFile = path.join(skillRoot, 'references', 'runtime', 'shot-media.schema.json');
const deliverySchemaFile = path.join(skillRoot, 'references', 'runtime', 'delivery-index.schema.json');

function runtimePlanInputs(productionRoot, recipesDirectory, plan) {
  const root = path.resolve(productionRoot);
  const director = path.join(root, '01-director');
  return {
    productionRoot: root,
    narrativeEnvelopeFile: path.join(director, 'narrative-envelope.json'),
    visualSystemFile: path.join(director, 'visual-system.json'),
    representativeScenesFile: path.join(director, 'representative-scenes.json'),
    motionMapFile: path.join(director, 'motion-map.json'),
    recipesDirectory: path.resolve(recipesDirectory),
    originalSrtFile: path.resolve(root, plan?.sourceContext?.originalSrt?.locator ?? '00-input/original.srt'),
    originalDesignFile: path.resolve(root, plan?.sourceContext?.originalDesign?.locator ?? '00-input/original-design.md'),
  };
}

function assertSchema(value, schema, label) {
  const errors = validateSchemaValue(value, schema, schema);
  if (errors.length) throw new Error(`${label} failed schema validation:\n- ${errors.join('\n- ')}`);
}

function ensureWithin(root, locator, label) {
  if (path.isAbsolute(locator)) throw new Error(`${label} must be relative`);
  const absolute = path.resolve(root, locator);
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} escapes its declared root`);
  return absolute;
}

async function bindSourceManifest(sourceRoot, sourceManifestFile) {
  await requireRegularFile(sourceManifestFile, 'source manifest');
  const manifest = await readJson(sourceManifestFile, 'source manifest');
  if (manifest?.schemaVersion !== '1.0.0' || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('source manifest must contain one or more version 1.0.0 file bindings');
  }
  const seen = new Set();
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== 'string' || !/^[0-9a-f]{64}$/u.test(entry.sha256 ?? '')) {
      throw new Error('source manifest contains an invalid file binding');
    }
    if (seen.has(entry.path)) throw new Error(`source manifest repeats ${entry.path}`);
    seen.add(entry.path);
    const file = ensureWithin(sourceRoot, entry.path, 'source manifest path');
    await requireRegularFile(file, `source ${entry.path}`);
    if (await hashFile(file) !== entry.sha256) throw new Error(`source ${entry.path} differs from its manifest hash`);
  }
  const actualFiles = await enumerateSource(sourceRoot);
  const expectedClosure = manifest.files.map(({ path: locator, sha256 }) => ({ path: locator, sha256 }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const actualClosure = actualFiles.map(({ path: locator, sha256 }) => ({ path: locator, sha256 }));
  if (canonicalJson(actualClosure) !== canonicalJson(expectedClosure)) {
    throw new Error('source tree differs from the complete source manifest closure');
  }
  return {
    identity: `sha256:${createHash('sha256').update(canonicalJson(manifest)).digest('hex')}`,
    paths: seen,
  };
}

const FORBIDDEN_EVIDENCE_TOOL = /^(?:capture|trace|verify)[A-Za-z0-9._-]*\.(?:mjs|cjs|js|ts|tsx|py|sh)$/iu;

async function enumerateSource(sourceRoot, current = sourceRoot, files = []) {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (current === sourceRoot && entry.name === 'node_modules') continue;
    const absolute = path.join(current, entry.name);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error(`source tree contains symbolic link ${path.relative(sourceRoot, absolute)}`);
    if (info.isDirectory()) {
      await enumerateSource(sourceRoot, absolute, files);
      continue;
    }
    if (!info.isFile()) throw new Error(`source tree contains unsupported entry ${path.relative(sourceRoot, absolute)}`);
    const locator = path.relative(sourceRoot, absolute).split(path.sep).join('/');
    if (FORBIDDEN_EVIDENCE_TOOL.test(path.basename(locator))) {
      throw new Error(`production unit contains forbidden self-built evidence tool ${locator}`);
    }
    files.push({ path: locator, sha256: await hashFile(absolute), sizeBytes: info.size });
  }
  return files;
}

async function bindSharedAssets(productionRoot, assignment) {
  const locator = assignment?.shared?.assetsRoot;
  if (typeof locator !== 'string' || locator.length === 0) {
    throw new Error('assignment.shared.assetsRoot is required');
  }
  const directory = ensureWithin(path.resolve(productionRoot), locator, 'shared assets root');
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('shared assets root must be a real directory');
  }
  const files = await enumerateSource(directory);
  if (files.length === 0) throw new Error('shared assets root is empty');
  return {
    directory,
    identity: `sha256:${createHash('sha256').update(canonicalJson(files)).digest('hex')}`,
  };
}

async function prepareSourceManifest(sourceRoot, requestedFile) {
  const manifestFile = requestedFile
    ? path.resolve(requestedFile)
    : path.join(path.dirname(sourceRoot), 'source-manifest.json');
  if (requestedFile) return { ...(await bindSourceManifest(sourceRoot, manifestFile)), manifestFile };
  let generatedManifestExists = false;
  try {
    const info = await lstat(manifestFile);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('generated source manifest must be a real file');
    generatedManifestExists = true;
    try {
      return { ...(await bindSourceManifest(sourceRoot, manifestFile)), manifestFile };
    } catch {
      // A concrete Builder repair changes the source closure. Parent owns this
      // generated manifest, so refresh it instead of trapping every retry on
      // stale pre-typecheck metadata.
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const manifest = {
    schemaVersion: '1.0.0',
    root: path.relative(path.dirname(manifestFile), sourceRoot).split(path.sep).join('/'),
    files: await enumerateSource(sourceRoot),
  };
  if (!manifest.files.length) throw new Error('source root contains no editable files');
  const body = `${JSON.stringify(manifest, null, 2)}\n`;
  if (generatedManifestExists) {
    const temporary = `${manifestFile}.tmp-${process.pid}-${Date.now()}`;
    try {
      await writeFile(temporary, body, { flag: 'wx' });
      await rename(temporary, manifestFile);
    } finally {
      await rm(temporary, { force: true });
    }
  } else {
    await writeFile(manifestFile, body, { flag: 'wx' });
  }
  return {
    identity: `sha256:${createHash('sha256').update(canonicalJson(manifest)).digest('hex')}`,
    paths: new Set(manifest.files.map(({ path: locator }) => locator)),
    manifestFile,
  };
}

async function createSemanticCheck({
  recipe, shot, output, contractMediaPath, basename, checksDirectory,
  frameCount, profile, ffmpeg, runner,
}) {
  const samples = semanticSamplePoints(recipe, shot.window, profile.fps, frameCount);
  const contactSheet = path.join(checksDirectory, `${basename}.semantic-check.png`);
  const select = samples.map(({ frame }) => `eq(n\\,${frame})`).join('+');
  const result = await runner({
    executable: ffmpeg,
    args: [
      '-v', 'error', '-nostdin', '-i', output,
      '-vf', `select=${select},scale=480:-2,tile=3x2:padding=8:margin=8`,
      '-frames:v', '1', contactSheet,
    ],
    cwd: checksDirectory,
  });
  if (result.code !== 0) throw commandFailure(`${shot.shotId} semantic contact sheet`, result);
  await requireRegularFile(contactSheet, `${shot.shotId} semantic contact sheet`);
  return {
    sourceMedia: contractMediaPath,
    contactSheet: `checks/${basename}.semantic-check.png`,
    sha256: await hashFile(contactSheet),
    samples,
  };
}

function targetFor(assignment, shotId) {
  const targets = assignment.renderTargets ?? assignment.render?.targets;
  const target = Array.isArray(targets)
    ? targets.find((candidate) => candidate.shotId === shotId)
    : null;
  const resolved = target ?? { shotId, mode: 'direct-runtime-render' };
  if (resolved.mode !== 'direct-runtime-render' || resolved.shotId !== shotId) {
    throw new Error(`${shotId} must bind its own direct-runtime-render target`);
  }
  return { id: resolved.id ?? shotId, mode: resolved.mode };
}

function creativeRecipeBinding(recipe) {
  if (!recipe?.truth || typeof recipe.truth !== 'object' || Array.isArray(recipe.truth)) {
    throw new Error(`${recipe?.shotId ?? 'Recipe'} has no immutable truth object`);
  }
  return {
    shotId: recipe.shotId,
    recipeIdentity: computeRecipeIdentity(recipe),
    truthIdentity: computeRecipeTruthIdentity(recipe),
  };
}

function recipeWindow(recipe) {
  return recipe?.schemaVersion === '4.0.0' ? recipe.truth?.srtWindowMs : recipe?.window;
}

async function remotionEntrypoint(sourceRoot) {
  for (const locator of ['src/index.tsx', 'src/index.ts', 'src/index.jsx', 'src/index.js']) {
    const file = path.join(sourceRoot, locator);
    try {
      const info = await lstat(file);
      if (info.isFile() && !info.isSymbolicLink()) return locator;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  throw new Error('Remotion source must contain a regular src/index entrypoint');
}

async function renderInvocation({ backend, target, sourceRoot, sourcePaths, output, frameCount, profile, hyperframes, remotion }) {
  if (target.id !== path.basename(target.id) || target.id.startsWith('.')) {
    throw new Error(`${target.id} is not a safe runtime target id`);
  }
  if (backend === 'hyperframes') {
    const composition = `compositions/${target.id}.html`;
    if (!sourcePaths.has(composition)) throw new Error(`${target.id} has no source-bound HyperFrames composition`);
    return {
      executable: hyperframes,
      args: [
        'render', sourceRoot, '--composition', composition,
        '--fps', `${profile.fps.numerator}/${profile.fps.denominator}`,
        '--quality', 'high', '--strict', '--no-best-effort', '--output', output,
      ],
      cwd: sourceRoot,
    };
  }
  if (backend === 'remotion') {
    const entrypoint = await remotionEntrypoint(sourceRoot);
    return {
      executable: remotion,
      args: [
        'render', entrypoint, target.id, output,
        `--frames=0-${frameCount - 1}`, '--codec=h264', '--pixel-format=yuv420p',
      ],
      cwd: sourceRoot,
    };
  }
  throw new Error(`unsupported shot backend ${backend}`);
}

async function exists(file) {
  try { await lstat(file); return true; } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function runInspectionForPlan({plan, inspectRuntime, inspectionOptions}) {
  if (!shouldRunRuntimeInspection(plan)) return null;
  return inspectRuntime(inspectionOptions);
}

function contentIdentity(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

async function tryFinalizeCanaryTechnicalGate({
  plan, productionRoot, deliveryRoot, recipesDirectory, shotSchema,
  ffmpeg, ffprobe, runner,
}) {
  if (!plan?.canaryGate?.required) return null;
  const existing = await validateCanaryTechnicalGate({
    plan, productionRoot, recipesDirectory, ffmpeg, ffprobe, runner,
  });
  if (existing) return existing;
  const ordered = plan.canaryGate.shotIds.map((shotId) => {
    const index = plan.shots.findIndex((shot) => shot.shotId === shotId);
    if (index < 0) throw new Error(`canary shot ${shotId} is absent from the runtime plan`);
    return {shotId, order: index + 1};
  });
  const contracts = [];
  const contractFiles = [];
  for (const {shotId, order} of ordered) {
    const file = path.join(path.resolve(deliveryRoot), 'shots', numberedName(order, shotId, '.shot-media.json'));
    if (!await exists(file)) return null;
    const contract = await readJson(file, `${shotId} canary shot contract`);
    assertSchema(contract, shotSchema, `${shotId} canary shot contract`);
    if (contract.shotId !== shotId || contract.renderTarget?.id !== shotId
      || contract.renderTarget?.mode !== 'direct-runtime-render' || contract.media?.fullDecode !== 'passed') {
      throw new Error(`${shotId} cannot enter the canary technical gate`);
    }
    contracts.push(contract);
    contractFiles.push(file);
  }
  const preview = await assembleCanaryPreview({contracts, deliveryRoot, ffmpeg, ffprobe, runner});
  const assignmentDirectory = path.join(path.resolve(productionRoot), '01-runtime-plan', 'assignments');
  const assignments = await Promise.all((await readdir(assignmentDirectory, {withFileTypes: true}))
    .filter((entry) => entry.isFile() && path.extname(entry.name) === '.json')
    .map(({name}) => readJson(path.join(assignmentDirectory, name), `assignment ${name}`)));
  const leadShotIds = new Set((plan.leadProduction?.representativeScenes ?? [])
    .map(({shotId}) => shotId).filter((shotId) => plan.canaryGate.shotIds.includes(shotId)));
  const receiptBindings = [];
  for (const candidate of assignments.filter((item) => (
    ['builder', 'lead'].includes(item.role) && item.planIdentity === plan.identity
  ))) {
    const touchesCanary = candidate.shotIds.some((shotId) => leadShotIds.has(shotId));
    if (candidate.role === 'lead' && !touchesCanary) continue;
    const expectedShotIds = candidate.role === 'lead'
      ? candidate.shotIds.filter((shotId) => leadShotIds.has(shotId))
      : candidate.shotIds.filter((shotId) => (
        plan.canaryGate.shotIds.includes(shotId) && !leadShotIds.has(shotId)
      ));
    if (expectedShotIds.length === 0) continue;
    const recipeBindings = await Promise.all(expectedShotIds.map(async (shotId) => (
      creativeRecipeBinding(await readJson(path.join(recipesDirectory, `${shotId}.json`), `${shotId} Recipe`))
    )));
    let receipt;
    let snapshotBody;
    try {
      if (candidate.role === 'lead') {
        const fullRecipeBindings = await Promise.all(candidate.shotIds.map(async (shotId) => (
          creativeRecipeBinding(await readJson(path.join(recipesDirectory, `${shotId}.json`), `${shotId} Recipe`))
        )));
        receipt = await validateBuilderViewReceipt({
          assignment: candidate, productionRoot, recipeBindings: fullRecipeBindings,
          expectedShotIds: candidate.shotIds,
        });
        const creativeProposalChanges = receipt.creativeProposalChanges
          .filter(({shotId}) => expectedShotIds.includes(shotId));
        const first = ordered.find(({shotId}) => shotId === expectedShotIds[0]);
        const viewedLocator = `05-delivery/checks/${numberedName(first.order, first.shotId, '.semantic-check.png')}`;
        const viewedFile = ensureWithin(path.resolve(productionRoot), viewedLocator, 'Lead canary six-frame sheet');
        snapshotBody = `${JSON.stringify({
          schemaVersion: receipt.schemaVersion,
          planIdentity: receipt.planIdentity,
          assignmentId: receipt.assignmentId,
          unitId: receipt.unitId,
          shotIds: expectedShotIds,
          recipeBindings,
          decision: creativeProposalChanges.length > 0 ? 'revised' : 'accepted',
          viewedArtifact: {kind: 'six-frame-sheets', locator: viewedLocator},
          viewedSha256: await hashFile(viewedFile),
          creativeProposalChanges,
        }, null, 2)}\n`;
      } else {
        receipt = await validateBuilderViewReceipt({
          assignment: candidate, productionRoot, recipeBindings, expectedShotIds,
        });
        snapshotBody = await readFile(receipt.receiptFile);
      }
    } catch (error) {
      if (error?.code === 'ENOENT' || /ENOENT/u.test(error.message)) return null;
      throw error;
    }
    const snapshotLocator = `05-delivery/canary-receipts/${candidate.assignmentId}.json`;
    const snapshotFile = ensureWithin(path.resolve(productionRoot), snapshotLocator, 'canary receipt snapshot');
    await mkdir(path.dirname(snapshotFile), {recursive: true});
    try {
      await writeFile(snapshotFile, snapshotBody, {flag: 'wx'});
    } catch (error) {
      if (error?.code !== 'EEXIST' || await hashFile(snapshotFile) !== createHash('sha256').update(snapshotBody).digest('hex')) throw error;
    }
    const snapshotSha256 = await hashFile(snapshotFile);
    receiptBindings.push({
      assignmentId: candidate.assignmentId,
      locator: snapshotLocator, sha256: snapshotSha256,
    });
  }
  if (receiptBindings.length === 0) return null;
  const gate = {
    schemaVersion: '1.0.0', status: 'passed', planIdentity: plan.identity,
    shotIds: [...plan.canaryGate.shotIds],
    canaryPreview: {locator: '05-delivery/canary-preview.mp4', sha256: preview.sha256, fullDecode: 'passed'},
    checks: {directRuntimeRender: 'passed', fullDecode: 'passed', sixFrameSheets: 'passed', builderViews: 'passed'},
    contractBindings: contracts.map((contract, index) => ({
      shotId: contract.shotId,
      contractLocator: path.relative(path.resolve(productionRoot), contractFiles[index]).split(path.sep).join('/'),
      contractSha256: null,
      mediaSha256: contract.media.sha256,
      semanticCheckSha256: contract.semanticCheck.sha256,
      sourceIdentity: contract.sourceIdentity,
    })),
    viewReceiptBindings: receiptBindings,
  };
  for (const [index, file] of contractFiles.entries()) gate.contractBindings[index].contractSha256 = await hashFile(file);
  gate.identity = contentIdentity(gate);
  const gateFile = ensureWithin(path.resolve(productionRoot), plan.canaryGate.technicalLocator, 'canary technical gate');
  await mkdir(path.dirname(gateFile), {recursive: true});
  await writeFile(gateFile, `${JSON.stringify(gate, null, 2)}\n`, {flag: 'wx'});
  return validateCanaryTechnicalGate({
    plan, productionRoot, recipesDirectory, ffmpeg, ffprobe, runner,
  });
}

async function renderAssignedShotsInternal({
  planFile,
  assignmentFile,
  recipesDirectory,
  sourceRoot,
  sourceManifestFile,
  productionRoot,
  deliveryRoot = path.join(productionRoot, '05-delivery'),
  hyperframes = 'hyperframes',
  remotion = 'remotion',
  ffmpeg = 'ffmpeg',
  ffprobe = 'ffprobe',
  runner = runCommand,
  prepareRemotionToolchain = prepareSharedToolchain,
  renderRemotionUnit = renderRemotionCompositions,
  inspectRuntime = inspectAssignmentRuntime,
}) {
  const absoluteSourceRoot = path.resolve(sourceRoot);
  await assertProductionSourcePolicy(absoluteSourceRoot);
  const [plan, assignment, shotSchema, deliverySchema, sourceBinding] = await Promise.all([
    readJson(path.resolve(planFile), 'runtime plan'),
    readJson(path.resolve(assignmentFile), 'assignment'),
    readJson(shotSchemaFile, 'shot media schema'),
    readJson(deliverySchemaFile, 'delivery index schema'),
    prepareSourceManifest(absoluteSourceRoot, sourceManifestFile),
  ]);
  await validateRuntimePlan(plan, runtimePlanInputs(productionRoot, recipesDirectory, plan));
  if (assignment.planIdentity !== plan.identity) throw new Error('assignment does not bind the runtime plan');
  if (typeof assignment.sourceRoot !== 'string'
    || path.resolve(productionRoot, assignment.sourceRoot) !== absoluteSourceRoot) {
    throw new Error('sourceRoot must equal the Parent-planned assignment sourceRoot');
  }
  if (plan.integrationMode !== undefined && plan.integrationMode !== 'shot-media') {
    throw new Error('runtime plan must use shot-media integration');
  }
  if (plan.mediaBoundary !== undefined && plan.mediaBoundary !== 'shot') {
    throw new Error('runtime plan media boundary must be shot');
  }
  if (plan.shotMediaContractVersion !== undefined && plan.shotMediaContractVersion !== '1.0.0') {
    throw new Error('runtime plan must use shot media contract 1.0.0');
  }
  if (assignment.backendFailurePolicy !== undefined
    && assignment.backendFailurePolicy !== 'return-to-selected-backend') {
    throw new Error('assignment may not silently reroute after a backend failure');
  }
  const sharedAssets = await bindSharedAssets(productionRoot, assignment);
  const unit = plan.authoringUnits?.find(({ unitId }) => unitId === assignment.unitId) ?? null;
  const isLead = assignment.role === 'lead' && assignment.finalProductionSource === true;
  const assignmentScope = new Set([
    ...assignment.shotIds,
    ...(plan.schemaVersion === '4.0.0' ? assignment.canaryPhase?.deferredShotIds ?? [] : []),
  ]);
  const assignmentScopeShotIds = plan.shots
    .map(({shotId}) => shotId)
    .filter((shotId) => assignmentScope.has(shotId));
  if (isLead) {
    const representativeIds = (plan.schemaVersion === '4.0.0'
      ? plan.leadProduction?.representativeScenes : plan.visualLock?.representativeScenes)
      ?.filter(({ runtime }) => runtime === assignment.runtime).map(({ shotId }) => shotId) ?? [];
    if (JSON.stringify(representativeIds) !== JSON.stringify(assignmentScopeShotIds)) {
      throw new Error('Lead assignment does not match its planned final representative shots');
    }
  } else if (!unit || unit.runtime !== assignment.runtime
    || JSON.stringify(unit.shotIds.filter((shotId) => assignmentScopeShotIds.includes(shotId))) !== JSON.stringify(assignmentScopeShotIds)) {
    throw new Error('assignment does not match its planned authoring unit subset');
  }
  const renderShotIds = await resolveCanaryRenderShotIds({
    plan, assignment, productionRoot, recipesDirectory, ffmpeg, ffprobe, runner,
  });
  const orderedPlanShots = plan.shots.map((shot, index) => ({ ...shot, order: index + 1 }));
  const assignmentShots = orderedPlanShots.filter(({shotId}) => assignmentScopeShotIds.includes(shotId));
  if (assignmentShots.length !== assignmentScopeShotIds.length) throw new Error('assignment contains an unplanned shot');
  const assigned = orderedPlanShots.filter(({ shotId }) => renderShotIds.includes(shotId));
  if (assigned.length !== renderShotIds.length) throw new Error('assignment contains an unplanned active shot');
  const recipeById = new Map();
  for (const shot of assignmentShots) {
    const recipe = await readJson(path.join(recipesDirectory, `${shot.shotId}.json`), `${shot.shotId} Recipe`);
    if (recipe.shotId !== shot.shotId || canonicalJson(recipeWindow(recipe)) !== canonicalJson(shot.window)) {
      throw new Error(`${shot.shotId} Recipe differs from the runtime plan`);
    }
    recipeById.set(shot.shotId, recipe);
  }
  const shotsDirectory = path.join(path.resolve(deliveryRoot), 'shots');
  const checksDirectory = path.join(path.resolve(deliveryRoot), 'checks');
  await Promise.all([mkdir(shotsDirectory, { recursive: true }), mkdir(checksDirectory, { recursive: true })]);
  const contracts = [];
  const contractFiles = [];
  const descriptors = assignmentShots.map((shot) => {
    const recipe = recipeById.get(shot.shotId);
    const target = targetFor(assignment, shot.shotId);
    if (target.id !== shot.shotId) throw new Error(`${shot.shotId} render target id must equal its shot id`);
    const frameCount = framesForWindow(shot.window, plan.productionProfile.fps);
    if (frameCount < 1) throw new Error(`${shot.shotId} has no output frames`);
    const basename = numberedName(shot.order, shot.shotId, '');
    const output = path.join(shotsDirectory, `${basename}.mp4`);
    const contractFile = path.join(shotsDirectory, `${basename}.shot-media.json`);
    const semanticCheckFile = path.join(checksDirectory, `${basename}.semantic-check.png`);
    const shotUnit = plan.authoringUnits.find(({ shotIds }) => shotIds.includes(shot.shotId));
    if (!shotUnit || shotUnit.runtime !== shot.runtime) throw new Error(`${shot.shotId} has no unique planned authoring unit`);
    return { shot, unit: shotUnit, recipe, target, frameCount, basename, output, contractFile, semanticCheckFile };
  });

  const validateBoundContract = async (descriptor, contract, { decode = true } = {}) => {
    const { shot, unit: shotUnit, recipe, target, frameCount, basename, output, semanticCheckFile } = descriptor;
    assertSchema(contract, shotSchema, `${shot.shotId} shot contract`);
    const expectedSamples = semanticSamplePoints(recipe, shot.window, plan.productionProfile.fps, frameCount);
    const mismatches = [];
    if (contract.order !== shot.order || contract.shotId !== shot.shotId || contract.unitId !== shotUnit.unitId) mismatches.push('shot binding');
    if (contract.backend !== shot.runtime || canonicalJson(contract.renderTarget) !== canonicalJson(target)) mismatches.push('runtime target');
    if (contract.sourceIdentity !== sourceBinding.identity) mismatches.push('source identity');
    if (contract.recipeIdentity !== `sha256:${createHash('sha256').update(canonicalJson(recipe)).digest('hex')}`) mismatches.push('Recipe identity');
    if (contract.profileIdentity !== `sha256:${plan.productionProfile.identity}`) mismatches.push('profile identity');
    if (contract.media.path !== `shots/${basename}.mp4` || contract.semanticCheck.contactSheet !== `checks/${basename}.semantic-check.png`
      || contract.semanticCheck.sourceMedia !== contract.media.path
      || canonicalJson(contract.semanticCheck.samples) !== canonicalJson(expectedSamples)) mismatches.push('media/check binding');
    if (mismatches.length) throw new Error(`${shot.shotId} existing delivery conflicts with the current plan: ${mismatches.join(', ')}`);
    await Promise.all([
      requireRegularFile(output, `${shot.shotId} rendered media`),
      requireRegularFile(semanticCheckFile, `${shot.shotId} semantic contact sheet`),
    ]);
    if (await hashFile(output) !== contract.media.sha256
      || await hashFile(semanticCheckFile) !== contract.semanticCheck.sha256) {
      throw new Error(`${shot.shotId} existing delivery hash is invalid`);
    }
    if (decode) {
      const facts = await probeAndDecode(output, { ffmpeg, ffprobe, runner, cwd: shotsDirectory, shotId: shot.shotId });
      assertMediaFacts(facts, { shotId: shot.shotId, frameCount, window: shot.window, profile: plan.productionProfile });
    }
  };

  const activeDescriptors = descriptors.filter(({shot}) => renderShotIds.includes(shot.shotId));
  const recovered = new Set();
  for (const descriptor of activeDescriptors) {
    const states = await Promise.all([
      exists(descriptor.output), exists(descriptor.contractFile), exists(descriptor.semanticCheckFile),
    ]);
    if (states.every(Boolean)) {
      const contract = await readJson(descriptor.contractFile, `${descriptor.shot.shotId} shot contract`);
      await validateBoundContract(descriptor, contract);
      recovered.add(descriptor.shot.shotId);
      contracts.push(contract);
      contractFiles.push(descriptor.contractFile);
    } else if (states.some(Boolean)) {
      throw new Error(`${descriptor.shot.shotId} has partial or conflicting recovery artifacts`);
    }
  }

  const finalizeShot = async (descriptor) => {
    const { shot, unit: shotUnit, recipe, target, frameCount, basename, output, contractFile, semanticCheckFile } = descriptor;
    try {
      await requireRegularFile(output, `${shot.shotId} rendered media`);
      const facts = await probeAndDecode(output, {
        ffmpeg, ffprobe, runner, cwd: shotsDirectory, shotId: shot.shotId,
      });
      assertMediaFacts(facts, {
        shotId: shot.shotId, frameCount, window: shot.window, profile: plan.productionProfile,
      });
      const mediaPath = `shots/${basename}.mp4`;
      const semanticCheck = await createSemanticCheck({
        recipe, shot, output, contractMediaPath: mediaPath, basename, checksDirectory,
        frameCount, profile: plan.productionProfile, ffmpeg, runner,
      });
      const contract = {
        schemaVersion: '1.0.0', order: shot.order, shotId: shot.shotId, unitId: shotUnit.unitId,
        srtWindowMs: { start: shot.window.startMs, end: shot.window.endMs },
        localTimeline: { startFrame: 0, frameCount }, backend: shot.runtime,
        renderTarget: target,
        sourceIdentity: sourceBinding.identity,
        recipeIdentity: `sha256:${createHash('sha256').update(canonicalJson(recipe)).digest('hex')}`,
        profileIdentity: `sha256:${plan.productionProfile.identity}`,
        media: {
          path: mediaPath, durationMs: facts.durationMs,
          width: facts.width, height: facts.height, fps: fpsNumber(plan.productionProfile.fps),
          codec: facts.codec, sha256: await hashFile(output), fullDecode: 'passed',
        },
        semanticCheck,
      };
      assertSchema(contract, shotSchema, `${shot.shotId} shot contract`);
      await writeFile(contractFile, `${JSON.stringify(contract, null, 2)}\n`, { flag: 'wx' });
      contracts.push(contract);
      contractFiles.push(contractFile);
      return contract;
    } catch (error) {
      await Promise.all([rm(output, { force: true }), rm(semanticCheckFile, { force: true })]);
      throw error;
    }
  };

  const pending = activeDescriptors.filter(({ shot }) => !recovered.has(shot.shotId));
  let backendReceipt = null;
  if (assignment.runtime === 'remotion' && pending.length) {
    const assignmentKey = assignment.assignmentId ?? unit?.unitId;
    const entryPoint = await remotionEntrypoint(absoluteSourceRoot);
    await prepareRemotionToolchain({
      project: absoluteSourceRoot, productionRoot,
      receiptPath: path.join(path.resolve(productionRoot), '.remotion-toolchains', 'receipts', `${assignmentKey}.json`),
    });
    backendReceipt = await renderRemotionUnit({
      productionRoot, project: absoluteSourceRoot, entryPoint,
      publicDirectory: sharedAssets.directory,
      bundleDirectory: path.join(path.resolve(deliveryRoot), '.remotion-bundles', assignmentKey),
      bundleIdentity: `sha256:${createHash('sha256').update(canonicalJson({
        sourceIdentity: sourceBinding.identity,
        sharedAssetsIdentity: sharedAssets.identity,
      })).digest('hex')}`,
      renderTargets: pending.map(({ shot, target, output }) => ({ shotId: shot.shotId, id: target.id, output })),
      onRendered: async ({ shotId }) => finalizeShot(pending.find(({ shot }) => shot.shotId === shotId)),
    });
  } else {
    for (const descriptor of pending) {
      const invocation = await renderInvocation({
        backend: descriptor.shot.runtime, target: descriptor.target, sourceRoot: absoluteSourceRoot,
        sourcePaths: sourceBinding.paths, output: descriptor.output, frameCount: descriptor.frameCount,
        profile: plan.productionProfile, hyperframes, remotion,
      });
      const rendered = await runner(invocation);
      if (rendered.code !== 0) throw commandFailure(`${descriptor.shot.shotId} direct runtime render`, rendered);
      await finalizeShot(descriptor);
    }
  }
  const inspectionReceipt = await runInspectionForPlan({
    plan, inspectRuntime,
    inspectionOptions: renderShotIds.length > 0 ? {
      assignment: {...assignment, shotIds: renderShotIds}, plan, recipesDirectory, sourceRoot: absoluteSourceRoot,
      sourceIdentity: sourceBinding.identity, productionRoot, hyperframes, runner,
    } : {
      status: 'pass', adapter: 'deterministic-media-contract', assignmentId: assignment.assignmentId,
      sourceIdentity: sourceBinding.identity,
    },
  });
  const canarySubset = assignment?.canaryPhase?.mode === 'canary-first'
    && canonicalJson(renderShotIds) === canonicalJson(assignment.canaryPhase.shotIds);
  const viewedShotIds = canarySubset ? renderShotIds : assignmentScopeShotIds;
  let chapterPreview = null;
  let viewReceipt = null;
  if (!isLead) {
    const viewedContracts = [];
    for (const shotId of viewedShotIds) {
      const descriptor = descriptors.find(({shot}) => shot.shotId === shotId);
      const contract = await readJson(descriptor.contractFile, `${shotId} shot contract`);
      await validateBoundContract(descriptor, contract, {decode: false});
      viewedContracts.push(contract);
    }
    const chapterOutput = path.join(
      path.resolve(deliveryRoot), 'chapter-previews',
      `${assignment.unitId}${canarySubset ? '.canary' : ''}.mp4`,
    );
    chapterPreview = await assembleChapterPreview({
      unitId: assignment.unitId, contracts: viewedContracts, deliveryRoot,
      outputFile: chapterOutput, ffmpeg, ffprobe, runner,
    });
    if (plan.schemaVersion === '4.0.0') {
      const recipeBindings = viewedShotIds.map((shotId) => creativeRecipeBinding(recipeById.get(shotId)));
      try {
        viewReceipt = await validateBuilderViewReceipt({
          assignment, productionRoot, recipeBindings, expectedShotIds: viewedShotIds,
        });
      } catch (error) {
        if (error?.code === 'ENOENT' || /ENOENT|shotIds differ|Recipe bindings/iu.test(error.message)) {
          return {
            status: 'view-required', shots: viewedContracts.length, shotIds: viewedShotIds,
            chapterPreview: chapterPreview.preview,
            sixFrameSheets: viewedContracts.map(({semanticCheck}) => semanticCheck.contactSheet),
            viewReceipt: assignment.output.viewReceipt,
            sourceManifest: sourceBinding.manifestFile,
          };
        }
        throw error;
      }
    }
  } else if (plan.schemaVersion === '4.0.0') {
    const receiptShotIds = canarySubset ? renderShotIds : assignmentScopeShotIds;
    const recipeBindings = receiptShotIds.map((shotId) => creativeRecipeBinding(recipeById.get(shotId)));
    try {
      viewReceipt = await validateBuilderViewReceipt({
        assignment, productionRoot, recipeBindings, expectedShotIds: receiptShotIds,
      });
    } catch (error) {
      if (error?.code === 'ENOENT' || /ENOENT|shotIds differ|Recipe bindings/iu.test(error.message)) {
        return {
          status: 'view-required', shots: contracts.length, shotIds: receiptShotIds,
          sixFrameSheets: contracts.map(({semanticCheck}) => semanticCheck.contactSheet),
          viewReceipt: assignment.output.viewReceipt, sourceManifest: sourceBinding.manifestFile,
        };
      }
      throw error;
    }
  }
  const canaryTechnicalGate = await tryFinalizeCanaryTechnicalGate({
    plan, productionRoot, deliveryRoot, recipesDirectory, shotSchema, ffmpeg, ffprobe, runner,
  });
  if (canarySubset) {
    return {
      status: canaryTechnicalGate ? 'canary-technical-ready' : 'canary-shots-ready',
      shots: contracts.length, contractFiles, chapterPreview: chapterPreview?.preview,
      canaryPreview: canaryTechnicalGate?.canaryPreview?.locator ?? null,
      canaryTechnicalGate: canaryTechnicalGate?.identity ?? null,
      sourceManifest: sourceBinding.manifestFile, viewReceipt,
      ...(inspectionReceipt ? {inspectionReceipt} : {}),
    };
  }
  const allContractFiles = orderedPlanShots.map(({ order, shotId }) => (
    path.join(shotsDirectory, numberedName(order, shotId, '.shot-media.json'))
  ));
  const allContracts = [];
  for (const [index, contractFile] of allContractFiles.entries()) {
    try { allContracts.push(await readJson(contractFile, 'shot contract')); } catch (error) {
      if (error.cause?.code === 'ENOENT' || /ENOENT/u.test(error.message)) {
        return {
          status: 'unit-shots-ready', shots: contracts.length, contractFiles,
          sourceManifest: sourceBinding.manifestFile,
          chapterPreview: chapterPreview?.preview, viewReceipt,
          ...(inspectionReceipt ? {inspectionReceipt} : {}),
        };
      }
      throw error;
    }
    const contract = allContracts.at(-1);
    const plannedShot = orderedPlanShots[index];
    assertSchema(contract, shotSchema, `${plannedShot.shotId} shot contract`);
    if (contract.order !== plannedShot.order || contract.shotId !== plannedShot.shotId
      || contract.backend !== plannedShot.runtime
      || contract.renderTarget.id !== plannedShot.shotId
      || contract.renderTarget.mode !== 'direct-runtime-render'
      || canonicalJson(contract.srtWindowMs) !== canonicalJson({
        start: plannedShot.window.startMs, end: plannedShot.window.endMs,
      })) {
      throw new Error(`${plannedShot.shotId} existing contract cannot enter the delivery index`);
    }
    const boundMedia = path.join(path.resolve(deliveryRoot), contract.media.path);
    await requireRegularFile(boundMedia, `${plannedShot.shotId} indexed media`);
    if (await hashFile(boundMedia) !== contract.media.sha256) {
      throw new Error(`${plannedShot.shotId} media changed before delivery index creation`);
    }
  }
  const allRecipes = await Promise.all(orderedPlanShots.map(({ shotId }) => (
    readJson(path.join(recipesDirectory, `${shotId}.json`), `${shotId} Recipe`)
  )));
  const deliveryIndex = deliveryIndexFrom({ plan, contracts: allContracts, recipes: allRecipes });
  assertSchema(deliveryIndex, deliverySchema, 'delivery index');
  const deliveryIndexFile = path.join(path.resolve(deliveryRoot), 'delivery-index.json');
  await writeFile(deliveryIndexFile, `${JSON.stringify(deliveryIndex, null, 2)}\n`, { flag: 'wx' });
  return {
    status: 'shots-ready', shots: allContracts.length, contractFiles: allContractFiles,
    deliveryIndex: deliveryIndexFile, sourceManifest: sourceBinding.manifestFile,
    backendReceipt, chapterPreview: chapterPreview?.preview, viewReceipt,
    ...(inspectionReceipt ? {inspectionReceipt} : {}),
  };
}

export async function renderAssignedShots(options) {
  const assignment = await readJson(path.resolve(options.assignmentFile), 'assignment');
  try {
    const result = await renderAssignedShotsInternal(options);
    await clearMinimalFailureEvidence({productionRoot: options.productionRoot, assignment});
    return result;
  } catch (error) {
    await writeMinimalFailureEvidence({
      productionRoot: options.productionRoot, assignment, sourceIdentity: null, error,
    });
    throw error;
  }
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value) throw new Error(`invalid argument ${name ?? ''}`);
    options[name.slice(2)] = value;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  for (const required of ['plan', 'assignment', 'recipes', 'source-root', 'production-root']) {
    if (!options[required]) throw new Error(`--${required} is required`);
  }
  const result = await renderAssignedShots({
    planFile: options.plan, assignmentFile: options.assignment,
    recipesDirectory: options.recipes, sourceRoot: options['source-root'],
    sourceManifestFile: options['source-manifest'], productionRoot: options['production-root'],
    deliveryRoot: options['delivery-root'], hyperframes: options.hyperframes,
    remotion: options.remotion, ffmpeg: options.ffmpeg, ffprobe: options.ffprobe,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
