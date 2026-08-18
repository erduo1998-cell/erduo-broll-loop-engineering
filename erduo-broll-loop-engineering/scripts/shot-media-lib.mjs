import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sanitizedEnvironment } from './safe-spawn.mjs';
import { canonicalJson, validateSchemaValue } from './runtime-schema-validator.mjs';
import { verifyRuntimePlanInputs } from './validate-runtime-plan.mjs';
import { computeRecipeIdentity, computeRecipeTruthIdentity } from './validate-shot-recipes.mjs';

const OUTPUT_LIMIT = 64 * 1024;
const runtimeSchemas = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'references', 'runtime',
);

export async function runCommand({ executable, args, cwd, env = process.env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd, env: sanitizedEnvironment(env), shell: false, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const append = (current, chunk) => `${current}${chunk.toString('utf8')}`.slice(-OUTPUT_LIMIT);
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

export function commandFailure(label, result) {
  const detail = result.stderr?.trim() || result.stdout?.trim() || `exit ${result.code}`;
  return new Error(`${label} failed: ${detail.slice(-2_000)}`);
}

export async function hashFile(file) {
  const digest = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on('data', (chunk) => digest.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return digest.digest('hex');
}

export async function requireRegularFile(file, label) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
}

function withinRoot(root, locator, label) {
  if (typeof locator !== 'string' || locator.length === 0 || path.isAbsolute(locator)) {
    throw new Error(`${label} must be a non-empty relative locator`);
  }
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(absoluteRoot, locator);
  const relative = path.relative(absoluteRoot, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its declared root`);
  }
  return absolute;
}

const PRODUCTION_PROOF_TOKENS = [
  ['data-erduo-trace', /data-erduo-trace/iu],
  ['erduoInspectionCompositions', /erduoInspectionCompositions/u],
  ['visualWeight', /\bvisualWeight\b/u],
  ['focusGroup', /\bfocusGroup\b/u],
  ['layer proof metadata', /data-erduo-layer|\b(?:inspection|proof)Layer\b/iu],
  ['manual motion windows', /data-erduo-motions|\bmotionWindows?\b/iu],
];

export async function assertProductionSourcePolicy(sourceRoot) {
  const root = path.resolve(sourceRoot);
  const visit = async (directory) => {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      if (directory === root && entry.name === 'node_modules') continue;
      const absolute = path.join(directory, entry.name);
      const info = await lstat(absolute);
      const locator = path.relative(root, absolute).split(path.sep).join('/');
      if (info.isSymbolicLink()) throw new Error(`production source contains symbolic link ${locator}`);
      if (info.isDirectory()) {
        await visit(absolute);
        continue;
      }
      if (!info.isFile()) throw new Error(`production source contains unsupported entry ${locator}`);
      if (path.basename(locator).toLowerCase() === 'inspection.tsx') {
        throw new Error(`production source contains forbidden unit inspection source ${locator}`);
      }
      if (!/\.(?:[cm]?[jt]sx?|html|css|json)$/iu.test(locator)) continue;
      const body = await readFile(absolute, 'utf8');
      const match = PRODUCTION_PROOF_TOKENS.find(([, pattern]) => pattern.test(body));
      if (match) throw new Error(`production source contains forbidden ${match[0]} in ${locator}`);
    }
  };
  await visit(root);
}

function exactArray(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

async function assertRuntimeSchema(value, schemaName, label) {
  const schema = await readJson(path.join(runtimeSchemas, schemaName), `${label} schema`);
  const errors = validateSchemaValue(value, schema, schema);
  if (errors.length > 0) throw new Error(`${label} failed schema validation:\n- ${errors.join('\n- ')}`);
}

export async function validateBuilderViewReceipt({
  assignment, productionRoot, recipeBindings, expectedShotIds = assignment.shotIds,
  receiptLocatorOverride,
}) {
  const receiptLocator = receiptLocatorOverride ?? assignment?.output?.viewReceipt;
  const handoffLocator = assignment?.output?.handoff;
  if (typeof receiptLocator !== 'string' || typeof handoffLocator !== 'string') {
    throw new Error('Builder assignment must declare output.viewReceipt and output.handoff');
  }
  const receiptFile = withinRoot(productionRoot, receiptLocator, 'Builder view receipt');
  const handoffFile = withinRoot(productionRoot, handoffLocator, 'Builder handoff');
  await Promise.all([
    requireRegularFile(receiptFile, 'Builder view receipt'),
    requireRegularFile(handoffFile, 'Builder handoff'),
  ]);
  const handoff = await readFile(handoffFile, 'utf8');
  const declaredReceiptLocator = assignment.output.viewReceipt;
  if (!handoff.includes(path.basename(declaredReceiptLocator)) && !handoff.includes(declaredReceiptLocator)) {
    throw new Error('Builder handoff must reference its view receipt');
  }
  const receipt = await readJson(receiptFile, 'Builder view receipt');
  await assertRuntimeSchema(receipt, 'chapter-creative-receipt.schema.json', 'Builder view receipt');
  const receiptUnitId = assignment.unitId ?? assignment.assignmentId;
  if (receipt.schemaVersion !== '1.0.0'
    || receipt.planIdentity !== assignment.planIdentity
    || receipt.assignmentId !== assignment.assignmentId
    || receipt.unitId !== receiptUnitId) {
    throw new Error('Builder view receipt identity differs from its assignment');
  }
  if (!exactArray(receipt.shotIds, expectedShotIds)) {
    throw new Error('Builder view receipt shotIds differ from the rendered chapter subset');
  }
  if (!exactArray(receipt.recipeBindings, recipeBindings)) {
    throw new Error('Builder view receipt Recipe bindings or truth identity changed');
  }
  if (!['accepted', 'revised'].includes(receipt.decision)) {
    throw new Error('Builder view receipt decision must be accepted or revised');
  }
  if (!Array.isArray(receipt.creativeProposalChanges)
    || receipt.creativeProposalChanges.some((item) => (
      !item || typeof item !== 'object' || !expectedShotIds.includes(item.shotId)
      || typeof item.change !== 'string' || item.change.trim().length === 0
      || Object.keys(item).some((key) => !['shotId', 'change'].includes(key))
    ))) {
    throw new Error('Builder view receipt creativeProposalChanges must name only proposal changes for assigned shots');
  }
  if (receipt.decision === 'accepted' && receipt.creativeProposalChanges.length !== 0) {
    throw new Error('accepted Builder view receipt must have empty creativeProposalChanges');
  }
  if (receipt.decision === 'revised' && receipt.creativeProposalChanges.length === 0) {
    throw new Error('revised Builder view receipt requires creativeProposalChanges');
  }
  const kind = receipt?.viewedArtifact?.kind;
  const locator = receipt?.viewedArtifact?.locator;
  if (!['six-frame-sheets', 'chapter-preview', 'both'].includes(kind)) {
    throw new Error('Builder view receipt must name six-frame-sheets, chapter-preview, or both');
  }
  const artifactFile = withinRoot(productionRoot, locator, 'viewed artifact');
  await requireRegularFile(artifactFile, 'viewed artifact');
  const isSubsetView = assignment?.canaryPhase?.mode === 'canary-first'
    && exactArray(expectedShotIds, assignment.canaryPhase.shotIds)
    && (assignment.canaryPhase.deferredShotIds?.length ?? 0) > 0;
  const chapterPreview = `05-delivery/chapter-previews/${receiptUnitId}${isSubsetView ? '.canary' : ''}.mp4`;
  const sheetPattern = /^05-delivery\/checks\/[0-9]{3}-([A-Za-z0-9][A-Za-z0-9._-]*)\.semantic-check\.png$/u;
  const sheetMatch = sheetPattern.exec(locator);
  if (kind === 'chapter-preview' && locator !== chapterPreview) {
    throw new Error('Builder view receipt chapter preview does not belong to its authoring unit');
  }
  if (kind === 'six-frame-sheets' && (!sheetMatch || !expectedShotIds.includes(sheetMatch[1]))) {
    throw new Error('Builder view receipt six-frame sheet does not belong to its rendered shot subset');
  }
  if (kind === 'both') {
    if (locator !== chapterPreview) throw new Error('both view receipt must bind the authoring unit chapter preview');
    const checksDirectory = path.join(path.resolve(productionRoot), '05-delivery', 'checks');
    const names = new Set(await readdir(checksDirectory));
    for (const shotId of expectedShotIds) {
      if (![...names].some((name) => name.endsWith(`-${shotId}.semantic-check.png`))) {
        throw new Error(`both view receipt is missing the six-frame sheet for ${shotId}`);
      }
    }
  }
  if (!/^[0-9a-f]{64}$/u.test(receipt.viewedSha256 ?? '')
    || receipt.viewedSha256 !== await hashFile(artifactFile)) {
    throw new Error('Builder view receipt viewed artifact hash is stale or invalid');
  }
  return {...receipt, receiptFile, receiptSha256: await hashFile(receiptFile)};
}

function identityFor(value) {
  const copy = {...value};
  delete copy.identity;
  return `sha256:${createHash('sha256').update(canonicalJson(copy)).digest('hex')}`;
}

async function readGateFile(productionRoot, locator, label) {
  const file = withinRoot(productionRoot, locator, label);
  try {
    await requireRegularFile(file, label);
    return {file, value: await readJson(file, label)};
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function recipeWindow(recipe) {
  return recipe?.schemaVersion === '4.0.0' ? recipe.truth?.srtWindowMs : recipe?.window;
}

function recipeViewBinding(recipe) {
  if (!recipe?.truth || typeof recipe.truth !== 'object' || Array.isArray(recipe.truth)) {
    throw new Error(`${recipe?.shotId ?? 'Recipe'} has no immutable truth object`);
  }
  return {
    shotId: recipe.shotId,
    recipeIdentity: computeRecipeIdentity(recipe),
    truthIdentity: computeRecipeTruthIdentity(recipe),
  };
}

async function validateCanaryEvidenceClosure({
  plan, productionRoot, technicalGate, previewFile,
  recipesDirectory = path.join(productionRoot, '01-director', 'shot-recipes'),
  ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', runner = runCommand,
}) {
  if (plan?.schemaVersion !== '4.0.0' || !plan.productionProfile || !Array.isArray(plan.shots)) {
    throw new Error('canary technical closure requires a validated runtime plan v4');
  }
  const shotSchema = await readJson(path.join(runtimeSchemas, 'shot-media.schema.json'), 'shot media schema');
  const contractBindingByShot = new Map(technicalGate.contractBindings.map((binding) => [binding.shotId, binding]));
  if (contractBindingByShot.size !== technicalGate.contractBindings.length) {
    throw new Error('canary technical gate repeats a shot contract binding');
  }
  const recipes = new Map();
  const contracts = new Map();
  for (const shotId of plan.canaryGate.shotIds) {
    const planIndex = plan.shots.findIndex((shot) => shot.shotId === shotId);
    const shot = plan.shots[planIndex];
    const binding = contractBindingByShot.get(shotId);
    if (!shot || !binding) throw new Error(`${shotId} has no canary contract closure`);
    const expectedLocator = `05-delivery/shots/${numberedName(planIndex + 1, shotId, '.shot-media.json')}`;
    if (binding.contractLocator !== expectedLocator) throw new Error(`${shotId} canary contract locator is not the planned shot contract`);
    const contractFile = withinRoot(productionRoot, binding.contractLocator, `${shotId} canary contract`);
    await requireRegularFile(contractFile, `${shotId} canary contract`);
    if (binding.contractSha256 !== await hashFile(contractFile)) throw new Error(`${shotId} canary contract hash is stale`);
    const contract = await readJson(contractFile, `${shotId} canary contract`);
    await assertRuntimeSchema(contract, 'shot-media.schema.json', `${shotId} canary contract`);
    const recipe = await readJson(path.join(recipesDirectory, `${shotId}.json`), `${shotId} Recipe`);
    const expectedFrames = framesForWindow(shot.window, plan.productionProfile.fps);
    const expectedRecipeIdentity = `sha256:${createHash('sha256').update(canonicalJson(recipe)).digest('hex')}`;
    if (contract.order !== planIndex + 1 || contract.shotId !== shotId
      || contract.renderTarget?.id !== shotId || contract.renderTarget?.mode !== 'direct-runtime-render'
      || contract.media?.fullDecode !== 'passed'
      || canonicalJson(contract.srtWindowMs) !== canonicalJson({start: shot.window.startMs, end: shot.window.endMs})
      || canonicalJson(contract.localTimeline) !== canonicalJson({startFrame: 0, frameCount: expectedFrames})
      || contract.backend !== shot.runtime
      || contract.recipeIdentity !== expectedRecipeIdentity
      || canonicalJson(recipeWindow(recipe)) !== canonicalJson(shot.window)
      || binding.sourceIdentity !== contract.sourceIdentity) {
      throw new Error(`${shotId} canary contract does not close over its runtime plan, Recipe, and source identity`);
    }
    const mediaFile = withinRoot(productionRoot, `05-delivery/${contract.media.path}`, `${shotId} canary media`);
    await requireRegularFile(mediaFile, `${shotId} canary media`);
    const mediaSha256 = await hashFile(mediaFile);
    if (mediaSha256 !== contract.media.sha256 || mediaSha256 !== binding.mediaSha256) {
      throw new Error(`${shotId} canary media hash is stale`);
    }
    const facts = await probeAndDecode(mediaFile, {
      ffmpeg, ffprobe, runner, cwd: path.dirname(mediaFile), shotId: `${shotId} canary media`,
    });
    assertMediaFacts(facts, {
      shotId: `${shotId} canary media`, frameCount: expectedFrames,
      window: shot.window, profile: plan.productionProfile,
    });
    const sheetFile = withinRoot(
      productionRoot, `05-delivery/${contract.semanticCheck.contactSheet}`, `${shotId} six-frame sheet`,
    );
    await requireRegularFile(sheetFile, `${shotId} six-frame sheet`);
    const sheetSha256 = await hashFile(sheetFile);
    const sheetHeader = (await readFile(sheetFile)).subarray(0, 8).toString('hex');
    if (sheetSha256 !== contract.semanticCheck.sha256 || sheetSha256 !== binding.semanticCheckSha256
      || contract.semanticCheck.sourceMedia !== contract.media.path
      || sheetHeader !== '89504e470d0a1a0a') {
      throw new Error(`${shotId} canary semantic check is stale or detached from its media`);
    }
    contracts.set(shotId, contract);
    recipes.set(shotId, recipe);
  }

  const assignmentsDirectory = path.join(path.resolve(productionRoot), '01-runtime-plan', 'assignments');
  const assignmentEntries = (await readdir(assignmentsDirectory, {withFileTypes: true}))
    .filter((entry) => entry.isFile() && path.extname(entry.name) === '.json');
  const assignments = await Promise.all(assignmentEntries.map(async ({name}) => ({
    file: path.join(assignmentsDirectory, name),
    value: await readJson(path.join(assignmentsDirectory, name), `assignment ${name}`),
  })));
  const leadShotIds = new Set((plan.leadProduction?.representativeScenes ?? [])
    .map(({shotId}) => shotId).filter((shotId) => plan.canaryGate.shotIds.includes(shotId)));
  const builderOwners = assignments.filter(({value}) => value.role === 'builder' && value.planIdentity === plan.identity)
    .map((entry) => ({
      ...entry,
      reviewShotIds: entry.value.shotIds.filter((shotId) => (
        plan.canaryGate.shotIds.includes(shotId) && !leadShotIds.has(shotId)
      )),
    }))
    .filter(({reviewShotIds}) => reviewShotIds.length > 0);
  const leadReviewers = assignments.filter(({value}) => value.role === 'lead' && value.planIdentity === plan.identity)
    .map((entry) => ({
      ...entry,
      reviewShotIds: entry.value.shotIds.filter((shotId) => leadShotIds.has(shotId)),
    }))
    .filter(({reviewShotIds}) => reviewShotIds.length > 0);
  const builderShotIds = builderOwners.flatMap(({reviewShotIds}) => reviewShotIds);
  const expectedBuilderShotIds = plan.canaryGate.shotIds.filter((shotId) => !leadShotIds.has(shotId));
  const reviewedLeadShotIds = leadReviewers.flatMap(({reviewShotIds}) => reviewShotIds);
  if (!exactArray(builderShotIds.toSorted(), expectedBuilderShotIds.toSorted())
    || new Set(builderShotIds).size !== builderShotIds.length) {
    throw new Error('canary Builder assignments do not own each non-Lead canary shot exactly once');
  }
  if (!exactArray(reviewedLeadShotIds.toSorted(), [...leadShotIds].toSorted())
    || new Set(reviewedLeadShotIds).size !== reviewedLeadShotIds.length) {
    throw new Error('canary Lead assignments do not provide a real view owner for every representative canary shot');
  }
  const reviewers = [...leadReviewers, ...builderOwners];
  const receiptBindingByAssignment = new Map(
    technicalGate.viewReceiptBindings.map((binding) => [binding.assignmentId, binding]),
  );
  if (receiptBindingByAssignment.size !== technicalGate.viewReceiptBindings.length
    || receiptBindingByAssignment.size !== reviewers.length) {
    throw new Error('canary technical gate does not bind every owning Lead/Builder receipt exactly once');
  }
  for (const owner of reviewers) {
    const assignment = owner.value;
    const binding = receiptBindingByAssignment.get(assignment.assignmentId);
    const expectedReceiptLocator = `05-delivery/canary-receipts/${assignment.assignmentId}.json`;
    if (!binding || binding.locator !== expectedReceiptLocator) {
      throw new Error(`${assignment.assignmentId} canary view receipt locator differs from its assignment`);
    }
    const recipeBindings = owner.reviewShotIds.map((shotId) => recipeViewBinding(recipes.get(shotId)));
    const receipt = await validateBuilderViewReceipt({
      assignment, productionRoot, recipeBindings, expectedShotIds: owner.reviewShotIds,
      receiptLocatorOverride: binding.locator,
    });
    if (receipt.receiptSha256 !== binding.sha256) {
      throw new Error(`${assignment.assignmentId} canary view receipt hash is stale`);
    }
    for (const shotId of owner.reviewShotIds) {
      if (assignment.role === 'builder' && contracts.get(shotId).unitId !== assignment.unitId) {
        throw new Error(`${shotId} canary contract unit differs from its owning Builder assignment`);
      }
    }
    if (['chapter-preview', 'both'].includes(receipt.viewedArtifact.kind)) {
      const viewedFile = withinRoot(productionRoot, receipt.viewedArtifact.locator, 'canary viewed chapter preview');
      const viewedFacts = await probeAndDecode(viewedFile, {
        ffmpeg, ffprobe, runner, cwd: path.dirname(viewedFile),
        shotId: `${assignment.assignmentId} viewed chapter preview`,
      });
      const previewRaster = boundedPreviewRaster(plan.productionProfile);
      const expectedDurationMs = owner.reviewShotIds.reduce(
        (total, shotId) => total + contracts.get(shotId).media.durationMs, 0,
      );
      const frameMs = 1_000 / fpsNumber(plan.productionProfile.fps);
      if (viewedFacts.codec !== 'h264' || viewedFacts.audioStreams !== 0
        || viewedFacts.width !== previewRaster.width
        || viewedFacts.height !== previewRaster.height
        || Math.abs(viewedFacts.fps - fpsNumber(plan.productionProfile.fps)) > 1e-6
        || Math.abs(viewedFacts.durationMs - expectedDurationMs) > frameMs + 1) {
        throw new Error(`${assignment.assignmentId} viewed chapter preview is not its decoded canary shot subset`);
      }
    }
  }

  const canaryPreviewFacts = await probeAndDecode(previewFile, {
    ffmpeg, ffprobe, runner, cwd: path.dirname(previewFile), shotId: 'canary preview',
  });
  const canaryPreviewRaster = boundedPreviewRaster(plan.productionProfile);
  const expectedCanaryDurationMs = plan.canaryGate.shotIds.reduce(
    (total, shotId) => total + contracts.get(shotId).media.durationMs, 0,
  );
  const previewFrameMs = 1_000 / fpsNumber(plan.productionProfile.fps);
  if (canaryPreviewFacts.codec !== 'h264' || canaryPreviewFacts.audioStreams !== 0
    || canaryPreviewFacts.width !== canaryPreviewRaster.width
    || canaryPreviewFacts.height !== canaryPreviewRaster.height
    || Math.abs(canaryPreviewFacts.fps - fpsNumber(plan.productionProfile.fps)) > 1e-6
    || Math.abs(canaryPreviewFacts.durationMs - expectedCanaryDurationMs) > previewFrameMs + 1) {
    throw new Error('canary preview is not the fully decoded five-shot contract subset');
  }

  const compositions = new Set([...recipes.values()].map((recipe) => recipe.creativeProposal?.composition).filter(Boolean));
  const materialShots = [...recipes.values()].filter((recipe) => (
    ['provided', 'search', 'generate', 'mixed'].includes(recipe.creativeProposal?.materialRoute)
  ));
  const designFile = withinRoot(
    productionRoot, plan.sourceContext?.originalDesign?.locator, 'original design',
  );
  await requireRegularFile(designFile, 'original design');
  const designText = (await readFile(designFile, 'utf8')).toLocaleLowerCase('en-US');
  const signatureMotions = new Set();
  for (const recipe of recipes.values()) {
    const idea = recipe.creativeProposal?.motionIdea ?? '';
    for (const token of idea.match(/[\p{L}][\p{L}\p{N}-]{3,}/gu) ?? []) {
      if (designText.includes(token.toLocaleLowerCase('en-US'))) signatureMotions.add(token.toLocaleLowerCase('en-US'));
    }
  }
  const signatureClause = designText.match(/(?:招牌|signature)[^\n]{0,40}(?:动效|motion)[：:]([^\n]+)/iu)?.[1] ?? '';
  const namedSignatureMotions = [...signatureClause.matchAll(/\b[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)?\b/gu)]
    .map(([value]) => value.toLocaleLowerCase('en-US'))
    .filter((value) => value.length >= 4 && value !== 'logo');
  const capabilityLocators = new Set(assignments
    .filter(({value}) => value.role === 'lead' && value.planIdentity === plan.identity)
    .flatMap(({value}) => value.leadSamples ?? [])
    .map(({capabilityIndex}) => capabilityIndex)
    .filter(Boolean));
  for (const locator of capabilityLocators) {
    const capabilityFile = withinRoot(productionRoot, locator, 'Lead capability index');
    await requireRegularFile(capabilityFile, 'Lead capability index');
    const capabilityText = (await readFile(capabilityFile, 'utf8')).toLocaleLowerCase('en-US');
    for (const name of namedSignatureMotions) {
      if (capabilityText.includes(name)) signatureMotions.add(name);
    }
  }
  if (compositions.size < 3) throw new Error('canary creative gate requires at least three distinct composition families');
  if (materialShots.length < 2) throw new Error('canary creative gate requires at least two real-or-generated material shots');
  if (signatureMotions.size < 2) throw new Error('canary creative gate requires at least two visible signature motions');

  const previewStats = await stat(previewFile);
  const assignmentStats = await Promise.all(reviewers.map(({file}) => stat(file)));
  const assignmentIssuedAt = Math.min(...assignmentStats.map((info) => info.mtimeMs));
  const wallTimeMs = previewStats.mtimeMs - assignmentIssuedAt;
  if (!Number.isFinite(wallTimeMs) || wallTimeMs < 0 || wallTimeMs > 45 * 60 * 1_000) {
    throw new Error('canary assignment-to-first-preview wall time exceeds 45 minutes');
  }
  return {
    contracts, recipes, owners: reviewers.map(({value}) => value),
    creativeChecks: {
      lowLevelErrors: 0, compositionFamilies: compositions.size,
      materialShots: materialShots.length, signatureMotions: signatureMotions.size, wallTimeMs,
    },
  };
}

export async function validateCanaryTechnicalGate({
  plan, productionRoot, recipesDirectory,
  ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', runner = runCommand,
  verifyPlanInputs = verifyRuntimePlanInputs,
}) {
  const gate = plan?.canaryGate;
  if (!gate?.required) return null;
  const director = path.join(path.resolve(productionRoot), '01-director');
  await verifyPlanInputs(plan, {
    productionRoot: path.resolve(productionRoot),
    narrativeEnvelopeFile: path.join(director, 'narrative-envelope.json'),
    visualSystemFile: path.join(director, 'visual-system.json'),
    representativeScenesFile: path.join(director, 'representative-scenes.json'),
    motionMapFile: path.join(director, 'motion-map.json'),
    recipesDirectory: path.resolve(recipesDirectory ?? path.join(director, 'shot-recipes')),
    originalSrtFile: path.resolve(productionRoot, plan.sourceContext?.originalSrt?.locator ?? '00-input/original.srt'),
    originalDesignFile: path.resolve(productionRoot, plan.sourceContext?.originalDesign?.locator ?? '00-input/original-design.md'),
  });
  const loaded = await readGateFile(productionRoot, gate.technicalLocator, 'canary technical gate');
  if (!loaded) return null;
  const value = loaded.value;
  await assertRuntimeSchema(value, 'canary-technical-gate.schema.json', 'canary technical gate');
  const requiredChecks = ['directRuntimeRender', 'fullDecode', 'sixFrameSheets', 'builderViews'];
  if (value.schemaVersion !== '1.0.0' || value.status !== 'passed'
    || value.planIdentity !== plan.identity || !exactArray(value.shotIds, gate.shotIds)
    || !Array.isArray(value.contractBindings) || value.contractBindings.length !== 5
    || !exactArray(value.contractBindings.map(({shotId}) => shotId), gate.shotIds)
    || !Array.isArray(value.viewReceiptBindings) || value.viewReceiptBindings.length === 0
    || requiredChecks.some((name) => value.checks?.[name] !== 'passed')
    || value.identity !== identityFor(value)) {
    throw new Error('canary technical gate is not a valid identity-bound five-shot pass');
  }
  const previewFile = withinRoot(productionRoot, value.canaryPreview?.locator, 'canary preview');
  await requireRegularFile(previewFile, 'canary preview');
  if (value.canaryPreview?.fullDecode !== 'passed'
    || value.canaryPreview.sha256 !== await hashFile(previewFile)) {
    throw new Error('canary technical gate preview identity is stale');
  }
  const closure = await validateCanaryEvidenceClosure({
    plan, productionRoot, technicalGate: value, previewFile,
    recipesDirectory, ffmpeg, ffprobe, runner,
  });
  return {...value, file: loaded.file, creativeChecks: closure.creativeChecks};
}

export async function validateCanaryUserDecision({plan, productionRoot, technicalGate}) {
  const gate = plan?.canaryGate;
  if (!gate?.required) return null;
  const loaded = await readGateFile(productionRoot, gate.userDecisionLocator, 'canary user decision');
  if (!loaded) return null;
  const value = loaded.value;
  await assertRuntimeSchema(value, 'canary-user-decision.schema.json', 'canary user decision');
  const choices = Array.isArray(value.decisions) ? value.decisions : [];
  const oursPreferred = choices.filter(({choice}) => choice === 'ours').length;
  const decisionsValid = choices.length === 5
    && exactArray(choices.map(({shotId}) => shotId), gate.shotIds)
    && choices.every(({choice, accepted, issue}) => (
      choice === 'ours' ? accepted === true : choice === 'comparison' && typeof issue === 'string' && issue.trim().length > 0
    ));
  if (value.schemaVersion !== '1.0.0' || value.status !== 'passed'
    || value.planIdentity !== plan.identity || !exactArray(value.shotIds, gate.shotIds)
    || value.technicalGateIdentity !== technicalGate?.identity
    || value.canaryPreviewIdentity !== technicalGate?.canaryPreview?.sha256
    || !decisionsValid || value.oursPreferred !== oursPreferred || oursPreferred < 3
    || value.identity !== identityFor(value)) {
    throw new Error('canary user decision is not a valid identity-bound 3-of-5 pass');
  }
  return {...value, file: loaded.file};
}

export async function resolveCanaryRenderShotIds({
  plan, assignment, productionRoot, recipesDirectory,
  ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', runner = runCommand,
  verifyPlanInputs = verifyRuntimePlanInputs,
}) {
  const phase = assignment?.canaryPhase;
  if (!plan?.canaryGate?.required || !phase) return [...assignment.shotIds];
  if (assignment.role === 'lead' && assignment.finalProductionSource === true) {
    return [...assignment.shotIds];
  }
  const technicalLocator = phase.technicalLocator ?? phase.gateLocator;
  if (technicalLocator !== plan.canaryGate.technicalLocator
    || phase.userDecisionLocator !== plan.canaryGate.userDecisionLocator) {
    throw new Error('assignment canary gate locators differ from the runtime plan');
  }
  const technical = await validateCanaryTechnicalGate({
    plan, productionRoot, recipesDirectory, ffmpeg, ffprobe, runner,
    verifyPlanInputs,
  });
  if (!technical) {
    if (phase.mode === 'canary-first' && phase.shotIds.length > 0) return [...phase.shotIds];
    throw new Error('canary technical gate has not passed; full production is blocked');
  }
  const userDecision = await validateCanaryUserDecision({plan, productionRoot, technicalGate: technical});
  if (!userDecision) throw new Error('canary user decision has not passed; full production is blocked');
  if (!['canary-first', 'full-production-after-gate'].includes(phase.mode)) {
    throw new Error('assignment canary phase mode is invalid');
  }
  return [...phase.deferredShotIds];
}

export function framesForWindow(window, fps) {
  const frameAt = (milliseconds) => Math.round(
    milliseconds * fps.numerator / (1_000 * fps.denominator),
  );
  return frameAt(window.endMs) - frameAt(window.startMs);
}

export function fpsNumber(fps) {
  return fps.numerator / fps.denominator;
}

function boundedPreviewRaster(profile) {
  const scale = Math.min(1, 1920 / profile.raster.width, 1080 / profile.raster.height);
  const even = (value) => Math.max(2, Math.floor(value * scale / 2) * 2);
  return {width: even(profile.raster.width), height: even(profile.raster.height)};
}

export function semanticSamplePoints(recipe, window, fps, frameCount) {
  if (frameCount < 6) throw new Error(`${recipe.shotId} needs at least six frames for semantic inspection`);
  const frameMs = 1_000 / fpsNumber(fps);
  const toLocalFrame = (absoluteMs) => Math.max(0, Math.min(
    frameCount - 1, Math.round((absoluteMs - window.startMs) / frameMs),
  ));
  const beats = [...(recipe.microBeats ?? [])]
    .filter((beat) => Number.isFinite(beat.startMs) && Number.isFinite(beat.endMs) && beat.endMs > beat.startMs)
    .sort((left, right) => left.startMs - right.startMs);
  const developingBeats = beats.filter(({ change }) => change !== 'deliberate-stillness');
  const actionBeats = developingBeats.length > 0 ? developingBeats : beats;
  const actionStartMs = actionBeats[0]?.startMs ?? window.startMs;
  const actionEndMs = actionBeats.at(-1)?.endMs ?? window.endMs;
  const actionDurationMs = actionEndMs - actionStartMs;
  const preparationMs = actionStartMs + actionDurationMs * 0.1;
  const actionAMs = actionStartMs + actionDurationMs * 0.4;
  const actionBMs = actionStartMs + actionDurationMs * 0.75;
  const resultMs = recipe.readableHold?.startMs ?? recipe.readableHold?.start
    ?? beats.at(-1)?.endMs ?? window.endMs - frameMs * 2;
  const anchors = [
    ['opening', 0],
    ['preparation', toLocalFrame(preparationMs)],
    ['action-a', toLocalFrame(actionAMs)],
    ['action-b', toLocalFrame(actionBMs)],
    ['result', toLocalFrame(resultMs)],
    ['settle-tail', frameCount - 1],
  ];
  // Preserve semantic anchors while ensuring the six-frame sheet is actually six distinct frames.
  const frames = anchors.map(([, frame]) => frame);
  for (let index = 1; index < frames.length; index += 1) frames[index] = Math.max(frames[index], frames[index - 1] + 1);
  for (let index = frames.length - 2; index >= 0; index -= 1) frames[index] = Math.min(frames[index], frames[index + 1] - 1);
  return anchors.map(([role], index) => ({
    role, frame: frames[index], localTimeMs: Math.round(frames[index] * frameMs),
  }));
}

export function numberedName(order, shotId, suffix) {
  return `${String(order).padStart(3, '0')}-${shotId}${suffix}`;
}

export async function probeAndDecode(file, { ffmpeg, ffprobe, runner, cwd, shotId }) {
  const probe = await runner({
    executable: ffprobe,
    args: ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file],
    cwd,
  });
  if (probe.code !== 0) throw commandFailure(`${shotId} FFprobe`, probe);
  let value;
  try { value = JSON.parse(probe.stdout); } catch { throw new Error(`${shotId} FFprobe returned invalid JSON`); }
  const videos = (value.streams ?? []).filter(({ codec_type: type }) => type === 'video');
  if (videos.length !== 1) throw new Error(`${shotId} media must contain exactly one video stream`);
  const decode = await runner({
    executable: ffmpeg,
    args: ['-v', 'error', '-nostdin', '-xerror', '-i', file, '-map', '0:v:0', '-f', 'null', '-'],
    cwd,
  });
  if (decode.code !== 0) throw commandFailure(`${shotId} full decode`, decode);
  const video = videos[0];
  const fpsText = video.avg_frame_rate ?? video.r_frame_rate;
  const fpsMatch = /^([0-9]+)\/([1-9][0-9]*)$/u.exec(String(fpsText ?? ''));
  const fps = fpsMatch ? Number(fpsMatch[1]) / Number(fpsMatch[2]) : Number(fpsText);
  const frameCount = Number(video.nb_read_frames ?? video.nb_frames);
  return {
    container: value.format?.format_name ?? '', codec: video.codec_name,
    width: Number(video.width), height: Number(video.height),
    fps,
    frameCount,
    durationMs: Number.isFinite(frameCount) && Number.isFinite(fps) && fps > 0
      ? Math.round(frameCount / fps * 1_000)
      : Math.round(Number(value.format?.duration ?? video.duration) * 1_000),
    startTimeSeconds: Number(video.start_time ?? value.format?.start_time ?? 0),
    audioStreams: (value.streams ?? []).filter(({ codec_type: type }) => type === 'audio').length,
  };
}

export function assertMediaFacts(facts, { shotId, frameCount, window, profile }) {
  const expectedFps = fpsNumber(profile.fps);
  const frameMs = 1_000 / expectedFps;
  const expectedDuration = window.endMs - window.startMs;
  if (facts.codec !== 'h264') throw new Error(`${shotId} codec must be h264`);
  if (facts.width !== profile.raster.width || facts.height !== profile.raster.height) {
    throw new Error(`${shotId} raster differs from the production profile`);
  }
  if (!Number.isFinite(facts.fps) || Math.abs(facts.fps - expectedFps) > 1e-6) {
    throw new Error(`${shotId} fps differs from the production profile`);
  }
  if (facts.frameCount !== frameCount) throw new Error(`${shotId} frame count differs from its absolute SRT boundaries`);
  if (!Number.isFinite(facts.durationMs) || Math.abs(facts.durationMs - expectedDuration) > frameMs + 1) {
    throw new Error(`${shotId} duration ${facts.durationMs}ms differs from its SRT window ${expectedDuration}ms by more than one frame`);
  }
  if (facts.startTimeSeconds !== 0) throw new Error(`${shotId} local media timeline must start at zero`);
  if (facts.audioStreams !== 0) throw new Error(`${shotId} shot delivery must be silent`);
}

export async function readJson(file, label = path.basename(file)) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

export function deliveryIndexFrom({ plan, contracts, recipes }) {
  const recipeById = new Map(recipes.map((recipe) => [recipe.shotId, recipe]));
  return {
    schemaVersion: '1.0.0',
    shots: contracts.map((contract, index) => ({
      order: index + 1,
      shotId: contract.shotId,
      file: contract.media.path,
      contract: `shots/${numberedName(index + 1, contract.shotId, '.shot-media.json')}`,
      srtWindowMs: { ...contract.srtWindowMs },
      previousShotId: contracts[index - 1]?.shotId ?? null,
      nextShotId: contracts[index + 1]?.shotId ?? null,
      seamType: recipeById.get(contract.shotId)?.neighborHandoff?.outgoing ?? 'cut',
    })),
  };
}
