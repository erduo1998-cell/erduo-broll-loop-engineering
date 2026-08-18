import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  computeRecipeIdentity,
  computeRecipeTruthIdentity,
  validateCreativeRevision,
  validateRecipeDirectory,
} from '../erduo-broll-loop-engineering/scripts/validate-shot-recipes.mjs';
import {
  gateBuilderAssignment,
  validateCanaryReleaseGate,
} from '../erduo-broll-loop-engineering/scripts/gate-builder-assignment.mjs';
import { writeProductionPlan } from '../erduo-broll-loop-engineering/scripts/plan-runtime.mjs';
import { canonicalJson, validateSchemaValue } from '../erduo-broll-loop-engineering/scripts/runtime-schema-validator.mjs';
import {
  computeRuntimePlanIdentity,
  computeRepresentativeScenesIdentity,
  validateRuntimePlan,
} from '../erduo-broll-loop-engineering/scripts/validate-runtime-plan.mjs';

const skillRoot = path.resolve('erduo-broll-loop-engineering');
const execFileAsync = promisify(execFile);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const gateIdentity = (value) => {
  const { identity: _identity, ...identityInput } = value;
  return `sha256:${hash(canonicalJson(identityInput))}`;
};
const capabilities = ['semantic.integer-ms-window', 'semantic.visual-state-transition'];
const compositionFamilies = [
  'full-bleed-material',
  'data-diagram-evidence',
  'spatial-path-workflow',
];

async function isolated(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'broll-creative-loop-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function recipe(shotId, index, chapterId) {
  const startMs = index * 9_000;
  const endMs = startMs + 9_000;
  return {
    schemaVersion: '4.0.0',
    shotId,
    truth: {
      chapterId,
      srtWindowMs: { startMs, endMs },
      sourceCues: [`cue-${index + 1}`],
      spokenFacts: [`Fact ${index + 1} remains unchanged.`],
      audienceOutcome: `The audience understands result ${index + 1}.`,
      requiredReadableResult: `Result ${index + 1} is plainly readable.`,
      incomingSeam: index === 0 ? 'cut' : 'match',
      outgoingSeam: index === 19 ? 'cut' : 'match',
    },
    creativeProposal: {
      metaphor: `Metaphor ${index + 1}`,
      objects: [`object-${index + 1}`],
      composition: compositionFamilies[index % compositionFamilies.length],
      motionIdea: `One primary transformation resolves shot ${index + 1}.`,
      materialRoute: index % 4 === 0 ? 'generate' : 'native',
      keyStates: ['opening', 'turn', 'result', 'settle'],
      whyThisCouldWork: 'The suggested relationship makes the immutable result visible.',
    },
    craftIntent: ['staging', 'timing', 'appeal'],
    requiredCapabilities: capabilities,
    capabilityReasons: capabilities.map((capabilityId) => ({
      capabilityId,
      contentReason: `${shotId} genuinely needs ${capabilityId}.`,
    })),
  };
}

async function fixture(t, {
  shotCount = 20,
  parentSoloReasons = {},
  chapterSizes = null,
  selectedRuntime = 'hyperframes',
  selectionSource = 'explicit',
} = {}) {
  const base = await isolated(t);
  const productionRoot = path.join(base, 'broll-production');
  const directorRoot = path.join(productionRoot, '01-director');
  const recipesDirectory = path.join(directorRoot, 'shot-recipes');
  const inputRoot = path.join(productionRoot, '00-input');
  await mkdir(recipesDirectory, { recursive: true });
  await mkdir(inputRoot, { recursive: true });
  const endMs = shotCount * 9_000;
  const chapters = chapterSizes
    ? chapterSizes.map((size, index, values) => ({
      chapterId: `C${String(index + 1).padStart(2, '0')}`,
      window: {
        startMs: values.slice(0, index).reduce((sum, value) => sum + value, 0) * 9_000,
        endMs: values.slice(0, index + 1).reduce((sum, value) => sum + value, 0) * 9_000,
      },
      purpose: `Chapter ${index + 1}.`,
    }))
    : shotCount === 20
    ? [
      { chapterId: 'C01', window: { startMs: 0, endMs: 63_000 }, purpose: 'Opening cause.' },
      { chapterId: 'C02', window: { startMs: 63_000, endMs: 126_000 }, purpose: 'Working method.' },
      { chapterId: 'C03', window: { startMs: 126_000, endMs }, purpose: 'Resolved system.' },
    ]
    : [{ chapterId: 'C01', window: { startMs: 0, endMs }, purpose: 'One complete chapter.' }];
  const chapterAt = (index) => chapters.find(({ window }) => (
    index * 9_000 >= window.startMs && index * 9_000 < window.endMs
  )).chapterId;
  const recipes = [];
  for (let index = 0; index < shotCount; index += 1) {
    const shotId = `S${String(index + 1).padStart(2, '0')}`;
    const value = recipe(shotId, index, chapterAt(index));
    recipes.push(value);
    await writeFile(path.join(recipesDirectory, `${shotId}.json`), `${JSON.stringify(value)}\n`);
  }

  const narrativeEnvelopeFile = path.join(directorRoot, 'narrative-envelope.json');
  const visualSystemFile = path.join(directorRoot, 'visual-system.json');
  const representativeScenesFile = path.join(directorRoot, 'representative-scenes.json');
  const motionMapFile = path.join(directorRoot, 'motion-map.json');
  const selectionFile = path.join(productionRoot, 'runtime-selection.json');
  const originalSrtFile = path.join(inputRoot, 'original.srt');
  const originalDesignFile = path.join(inputRoot, 'SURGE-design.md');
  const hyperframesExecutable = path.join(inputRoot, 'hyperframes-0.7.104');
  const remotionExecutable = path.join(inputRoot, 'remotion-verified');
  await writeFile(originalSrtFile, '1\n00:00:00,000 --> 00:03:00,000\nComplete original narration.\n');
  await writeFile(originalDesignFile, '# SURGE design\n\nHigh energy, surgeFlow, ribbonDraw, punch-in, count-up.\n');
  await Promise.all([
    writeFile(hyperframesExecutable, '#!/bin/sh\nexit 0\n'),
    writeFile(remotionExecutable, '#!/bin/sh\nexit 0\n'),
  ]);
  await Promise.all([chmod(hyperframesExecutable, 0o755), chmod(remotionExecutable, 0o755)]);
  await writeFile(narrativeEnvelopeFile, `${JSON.stringify({
    schemaVersion: '1.0.0', filmId: 'creative-loop', window: { startMs: 0, endMs },
    premise: 'Restore chapter ownership.', audienceJourney: ['understand'], chapters, terms: [],
  })}\n`);
  await writeFile(visualSystemFile, `${JSON.stringify({
    schemaVersion: '1.0.0', conceptAngle: 'Visible creative ownership', visualWorld: 'Bright SURGE world',
    paletteRoles: [{ role: 'field', value: '#fff', use: 'background' }, { role: 'ink', value: '#111', use: 'focus' }],
    typographyRoles: [{ role: 'display', family: 'Fixture Sans', weight: '700', use: 'title', sourceLocator: '02-assets/font.woff2' }],
    materials: ['paper', 'generated imagery'], depthPlan: { background: 'field', midground: 'evidence', foreground: 'focus' },
    compositionFamilies, motifSemantics: [], rhythmCurve: [{ startMs: 0, endMs, character: 'develop' }],
    prohibitedLazyDefaults: ['generic cards'], safeAreaPolicy: 'Keep text readable.',
  })}\n`);
  await writeFile(selectionFile, `${JSON.stringify({
    schemaVersion: '2.0.0', status: 'selected', selectedRuntime, selectionSource,
  })}\n`);
  const informationDenseIndex = shotCount >= 11 ? 11 : Math.min(2, shotCount);
  const lateIndex = shotCount >= 15 ? 15 : Math.min(3, shotCount);
  const representativeScenes = {
    schemaVersion: '1.0.0',
    scenes: [
      { shotId: 'S01', coverage: 'opening', reason: 'Opening causal sample.', concerns: ['composition', 'material'] },
      { shotId: `S${String(informationDenseIndex).padStart(2, '0')}`, coverage: 'information-dense', reason: 'Dense sample.', concerns: ['text'] },
      { shotId: `S${String(lateIndex).padStart(2, '0')}`, coverage: 'late', reason: 'Late motion sample.', concerns: ['motion'] },
    ],
    identity: '',
  };
  representativeScenes.identity = computeRepresentativeScenesIdentity(representativeScenes);
  await writeFile(representativeScenesFile, `${JSON.stringify(representativeScenes)}\n`);
  const representativeCoverage = new Map(representativeScenes.scenes.map(({ shotId, coverage }) => [shotId, coverage]));
  const motionMap = {
    schemaVersion: '1.0.0',
    shots: recipes.map((value, index) => {
      const coverage = representativeCoverage.get(value.shotId);
      return {
        shotId: value.shotId,
        contentRelation: coverage === 'opening' ? 'compare'
          : coverage === 'information-dense' ? 'spatial'
            : coverage === 'late' ? 'state-change' : 'process',
        primaryAction: value.creativeProposal.motionIdea,
        compositionFamily: compositionFamilies[index % compositionFamilies.length],
        entryFamily: `entry-${index % 3}`,
        rhythm: coverage === 'opening' ? 'impact'
          : coverage === 'information-dense' ? 'progressive'
            : coverage === 'late' ? 'calm' : 'mixed',
        settleMs: 900,
      };
    }),
    identity: '',
  };
  motionMap.identity = hash(canonicalJson({ schemaVersion: motionMap.schemaVersion, shots: motionMap.shots }));
  await writeFile(motionMapFile, `${JSON.stringify(motionMap)}\n`);
  return {
    productionRoot, recipesDirectory, selectionFile, narrativeEnvelopeFile, visualSystemFile,
    representativeScenesFile, motionMapFile, originalSrtFile, originalDesignFile,
    runtimeExecutableFiles: { hyperframes: hyperframesExecutable, remotion: remotionExecutable },
    parentSoloReasons,
  };
}

test('Recipe v4 separates immutable truth from revisable creative proposal and rejects Director solo authority', async (t) => {
  const data = await fixture(t, { shotCount: 3 });
  assert.deepEqual(await validateRecipeDirectory(data.recipesDirectory), { status: 'valid', recipes: 3 });
  const originalFile = path.join(data.recipesDirectory, 'S01.json');
  const original = JSON.parse(await readFile(originalFile, 'utf8'));
  const revised = structuredClone(original);
  revised.creativeProposal.materialRoute = 'mixed';
  revised.creativeProposal.motionIdea = 'A stronger object-led transformation resolves the same result.';
  assert.deepEqual(validateCreativeRevision(original, revised), {
    status: 'valid', shotId: 'S01',
    truthIdentity: computeRecipeTruthIdentity(original),
    recipeIdentity: computeRecipeIdentity(revised),
  });
  const truthDrift = structuredClone(revised);
  truthDrift.truth.spokenFacts[0] = 'A rewritten fact.';
  assert.throws(() => validateCreativeRevision(original, truthDrift), /truth is immutable/u);

  const invalidProposal = structuredClone(revised);
  invalidProposal.creativeProposal = { materialRoute: 'bogus' };
  assert.throws(
    () => validateCreativeRevision(original, invalidProposal),
    /revised Recipe is invalid/u,
  );

  original.authoring = { solo: true, reason: 'No continuous camera.' };
  await writeFile(originalFile, `${JSON.stringify(original)}\n`);
  await assert.rejects(validateRecipeDirectory(data.recipesDirectory), /authoring\.solo is forbidden/u);
});

test('20 shot-media deliveries remain twenty shots but authoring is three contiguous chapter units', async (t) => {
  const data = await fixture(t);
  const result = await writeProductionPlan(data);
  assert.equal(result.plan.schemaVersion, '4.0.0');
  assert.equal(result.plan.integrationMode, 'shot-media');
  assert.equal(result.plan.shots.length, 20);
  assert.equal(result.plan.authoringUnits.length, 3);
  assert.ok(result.plan.authoringUnits.length < result.plan.shots.length);
  assert.deepEqual(result.plan.authoringUnits.map(({ shotIds }) => shotIds.length), [7, 7, 6]);
  assert.ok(result.plan.authoringUnits.every(({ shotIds, groupingReason, soloReason }) => (
    shotIds.length >= 5 && shotIds.length <= 8
      && groupingReason === 'semantic-chapter'
      && soloReason === null
  )));
  assert.deepEqual(await validateRuntimePlan(result.plan, data), {
    status: 'valid', shots: 20, blocks: 1, authoringUnits: 3, route: 'hyperframes',
  });

  const assignments = await Promise.all(result.assignments.map(async (locator) => (
    JSON.parse(await readFile(path.join(data.productionRoot, locator), 'utf8'))
  )));
  const lead = assignments.find(({ role }) => role === 'lead');
  const builders = assignments.filter(({ role }) => role === 'builder');
  const verifiedHyperframes = await realpath(data.runtimeExecutableFiles.hyperframes);
  assert.equal(builders.length, 3);
  assert.equal('visualLock' in result.plan, false);
  assert.equal(result.plan.leadProduction.representativeScenes.length, 3);
  assert.equal(lead.phase, 'lead-production');
  assert.equal(result.plan.runtimeExecutables.hyperframes.sha256, hash(await readFile(verifiedHyperframes)));
  assert.equal(lead.originalInputs.srt.sha256, hash(await readFile(data.originalSrtFile)));
  assert.equal(lead.originalInputs.design.sha256, hash(await readFile(data.originalDesignFile)));
  assert.equal(lead.contextFiles.originalSrt, '00-input/original.srt');
  assert.equal(lead.contextFiles.originalDesign, '00-input/SURGE-design.md');
  assert.equal(lead.leadSamples.length, 3);
  assert.equal(lead.output.viewReceipt, `${lead.output.workDirectory}/view-receipt.json`);
  assert.equal(lead.output.handoff, `${lead.output.workDirectory}/handoff.md`);
  assert.deepEqual(lead.viewLoop, {
    required: true,
    decision: ['accepted', 'revised'],
    artifacts: ['six-frame-sheets', 'short-preview'],
  });
  for (const builder of builders) {
    assert.equal(builder.originalInputs.srt.readable, true);
    assert.equal(builder.originalInputs.design.readable, true);
    assert.ok(builder.chapter.chapterIds.length >= 1);
    assert.ok(builder.seams.previous === null || ['cut', 'match', 'handoff'].includes(builder.seams.previous));
    assert.ok(builder.seams.next === null || ['cut', 'match', 'handoff'].includes(builder.seams.next));
    assert.equal(builder.leadSamples.length, 3);
    assert.deepEqual(builder.materialAccess.shotSpecificRoutes, ['native', 'provided', 'search', 'generate', 'mixed']);
    assert.equal(builder.output.viewReceipt, `${builder.output.workDirectory}/view-receipt.json`);
    assert.equal(builder.canaryPhase.gateLocator, '05-delivery/canary-technical-gate.json');
    assert.match(builder.standardCommand, /render-assigned-shots\.mjs/u);
    assert.match(builder.standardCommand, new RegExp(`--hyperframes '${verifiedHyperframes.replaceAll("'", "'\\''")}'`, 'u'));
    assert.deepEqual(builder.runtimeExecutable, result.plan.runtimeExecutables.hyperframes);
    assert.equal('runtimeInspection' in builder, false);
    assert.equal('visualLock' in builder, false);
    assert.deepEqual(builder.contextFiles.recipes, builder.chapter.shotIds.map(
      (shotId) => `01-director/shot-recipes/${shotId}.json`,
    ));
  }
  const canaryBuilders = builders.filter(({ canaryPhase }) => canaryPhase.shotIds.length > 0);
  for (const assignment of canaryBuilders) {
    assert.deepEqual(assignment.shotIds, assignment.canaryPhase.shotIds);
    assert.deepEqual(
      assignment.renderTargets.map(({ shotId }) => shotId),
      assignment.canaryPhase.shotIds,
    );
    assert.ok(assignment.canaryPhase.deferredShotIds.every(
      (shotId) => !assignment.shotIds.includes(shotId),
    ));
  }
  const v4GateOptions = { plan: result.plan, productionRoot: data.productionRoot };
  Object.defineProperty(v4GateOptions, 'visualLock', {
    get() { throw new Error('v4 gate must not read legacy visualLock'); },
  });
  assert.deepEqual(await gateBuilderAssignment(lead, v4GateOptions), {
    status: 'ready', role: 'lead', phase: 'lead-production',
  });
  assert.deepEqual(await gateBuilderAssignment(canaryBuilders[0], v4GateOptions), {
    status: 'ready', role: 'builder', phase: 'canary',
    allowedShotIds: canaryBuilders[0].canaryPhase.shotIds,
  });
  assert.deepEqual(result.plan.canaryGate, {
    required: true,
    technicalLocator: '05-delivery/canary-technical-gate.json',
    userDecisionLocator: '05-delivery/canary-user-decision.json',
    shotIds: ['S01', 'S05', 'S07', 'S09', 'S15'],
    fullProductionBlockedUntil: 'technical-and-user-passed',
  });

  const builder = builders[0];
  const drift = structuredClone(builder);
  delete drift.contextFiles.originalDesign;
  await assert.rejects(
    gateBuilderAssignment(drift, { plan: result.plan, productionRoot: data.productionRoot }),
    /complete planned dispatch packet/u,
  );
});

test('assignments bind each selected backend to a verified absolute executable instead of PATH fallback', async (t) => {
  const data = await fixture(t, {
    shotCount: 5,
    selectedRuntime: 'remotion',
    selectionSource: 'explicit',
  });
  const result = await writeProductionPlan(data);
  const verifiedRemotion = await realpath(data.runtimeExecutableFiles.remotion);
  assert.equal(result.plan.runtimeExecutables.remotion.locator, verifiedRemotion);
  const assignments = await Promise.all(result.assignments.map(async (locator) => (
    JSON.parse(await readFile(path.join(data.productionRoot, locator), 'utf8'))
  )));
  for (const assignment of assignments) {
    assert.deepEqual(assignment.runtimeExecutable, result.plan.runtimeExecutables.remotion);
    assert.match(assignment.standardCommand, new RegExp(`--remotion '${verifiedRemotion}'`, 'u'));
    assert.doesNotMatch(assignment.standardCommand, /--remotion 'remotion'(?:\s|$)/u);
  }
  const plannerScript = path.join(skillRoot, 'scripts/plan-runtime.mjs');
  const { stdout } = await execFileAsync(process.execPath, [
    plannerScript,
    '--recipes', data.recipesDirectory,
    '--selection', data.selectionFile,
    '--narrative-envelope', data.narrativeEnvelopeFile,
    '--visual-system', data.visualSystemFile,
    '--representative-scenes', data.representativeScenesFile,
    '--motion-map', data.motionMapFile,
    '--original-srt', data.originalSrtFile,
    '--original-design', data.originalDesignFile,
    '--remotion-executable', data.runtimeExecutableFiles.remotion,
  ]);
  assert.equal(JSON.parse(stdout).runtimeExecutables.remotion.locator, verifiedRemotion);

  const missing = await fixture(t, { shotCount: 5 });
  missing.runtimeExecutableFiles = {};
  await assert.rejects(
    writeProductionPlan(missing),
    /hyperframes requires an explicitly verified executable locator/u,
  );
});

test('Planner alone owns closed-enum solo decisions', async (t) => {
  const accepted = await fixture(t, {
    parentSoloReasons: { S10: 'resource-dependency-conflict' },
  });
  const result = await writeProductionPlan(accepted);
  const solo = result.plan.authoringUnits.find(({ shotIds }) => shotIds.includes('S10'));
  assert.deepEqual(solo.shotIds, ['S10']);
  assert.equal(solo.groupingReason, 'planner-solo');
  assert.equal(solo.soloReason, 'resource-dependency-conflict');

  const rejected = await fixture(t, {
    parentSoloReasons: { S10: 'no continuous camera' },
  });
  await assert.rejects(writeProductionPlan(rejected), /unsupported solo reason/u);
});

test('normal 15-shot plans rebalance a short tail instead of dispatching a singleton Builder', async (t) => {
  const data = await fixture(t, { shotCount: 15, chapterSizes: [7, 7, 1] });
  const { plan } = await writeProductionPlan(data);
  assert.deepEqual(plan.authoringUnits.map(({ shotIds }) => shotIds.length), [5, 5, 5]);
  assert.ok(plan.authoringUnits.every(({ shotIds, soloReason }) => (
    soloReason === null && shotIds.length >= 5 && shotIds.length <= 8
  )));
});

test('runtime policy permits implicit/default HyperFrames only', async (t) => {
  const implicitHyperFrames = await fixture(t, {
    shotCount: 5,
    selectedRuntime: 'hyperframes',
    selectionSource: 'default',
  });
  const implicitResult = await writeProductionPlan(implicitHyperFrames);
  assert.equal(implicitResult.plan.resultingRoute, 'hyperframes');
  const implicitPlan = structuredClone(implicitResult.plan);
  implicitPlan.selection.selectedRuntime = 'auto';
  implicitPlan.planningMode = 'auto';
  implicitPlan.identity = computeRuntimePlanIdentity(implicitPlan);
  await assert.rejects(
    validateRuntimePlan(implicitPlan, implicitHyperFrames),
    /auto, remotion, and hybrid require explicit runtime selection/u,
  );

  for (const selectedRuntime of ['auto', 'remotion', 'hybrid']) {
    const data = await fixture(t, {
      shotCount: 5,
      selectedRuntime,
      selectionSource: 'default',
    });
    await assert.rejects(
      writeProductionPlan(data),
      /auto, remotion, and hybrid require explicit runtime selection/u,
    );
  }
});

test('runtime plan v4 revalidates bound Recipes, motion map, and original locators', async (t) => {
  const data = await fixture(t);
  const { plan } = await writeProductionPlan(data);
  await writeFile(data.runtimeExecutableFiles.hyperframes, '#!/bin/sh\nexit 9\n');
  await assert.rejects(validateRuntimePlan(plan, data), /runtime executable hash differs/u);
  await writeFile(data.runtimeExecutableFiles.hyperframes, '#!/bin/sh\nexit 0\n');
  const recipeFile = path.join(data.recipesDirectory, 'S02.json');
  const changedRecipe = JSON.parse(await readFile(recipeFile, 'utf8'));
  changedRecipe.truth.spokenFacts[0] = 'Mutated after planning.';
  await writeFile(recipeFile, `${JSON.stringify(changedRecipe)}\n`);
  await assert.rejects(validateRuntimePlan(plan, data), /Recipe identity differs/u);

  const repairedRecipe = recipe('S02', 1, 'C01');
  await writeFile(recipeFile, `${JSON.stringify(repairedRecipe)}\n`);
  const motionMap = JSON.parse(await readFile(data.motionMapFile, 'utf8'));
  motionMap.shots.pop();
  motionMap.identity = hash(canonicalJson({ schemaVersion: motionMap.schemaVersion, shots: motionMap.shots }));
  await writeFile(data.motionMapFile, `${JSON.stringify(motionMap)}\n`);
  await assert.rejects(validateRuntimePlan(plan, data), /motion map validation failed/u);

  const locatorDrift = structuredClone(plan);
  locatorDrift.sourceContext.originalDesign.locator = '00-input/not-the-bound-design.md';
  locatorDrift.identity = '';
  await assert.rejects(validateRuntimePlan(locatorDrift, data), /locator differs/u);
});

test('runtime plan v4 CLI accepts every bound input needed for real validation', async (t) => {
  const data = await fixture(t);
  const { plan } = await writeProductionPlan(data);
  const planFile = path.join(data.productionRoot, '01-runtime-plan/runtime-plan.json');
  const script = path.join(skillRoot, 'scripts/validate-runtime-plan.mjs');
  const { stdout } = await execFileAsync(process.execPath, [
    script,
    '--plan', planFile,
    '--narrative-envelope', data.narrativeEnvelopeFile,
    '--visual-system', data.visualSystemFile,
    '--representative-scenes', data.representativeScenesFile,
    '--motion-map', data.motionMapFile,
    '--recipes', data.recipesDirectory,
    '--original-srt', data.originalSrtFile,
    '--original-design', data.originalDesignFile,
    '--production-root', data.productionRoot,
  ]);
  assert.deepEqual(JSON.parse(stdout), {
    status: 'valid', shots: 20, blocks: 1, authoringUnits: 3, route: 'hyperframes',
  });
});

test('legacy Recipe v3 schema and validator both reject Director authoring authority', async (t) => {
  const root = await isolated(t);
  const value = {
    schemaVersion: '3.0.0', shotId: 'S01',
    window: { startMs: 0, endMs: 9_000 }, cueIds: ['cue-1'],
    audienceUnderstanding: 'Understand the result.', visualJob: 'Show the result.', focus: 'result',
    keyStates: { start: 'start', turn: 'turn', result: 'result', hold: 'hold' },
    elementLifecycles: [{ elementId: 'hero', enter: 'enter', hold: 'hold', destination: 'retain', reason: 'remain readable' }],
    compositionFamily: 'full-bleed-material',
    heroFrame: { relationship: 'cause and result', layers: { background: 'field', midground: 'cause', foreground: 'result' } },
    microBeats: [{ beatId: 'B1', startMs: 0, endMs: 9_000, primaryFocus: 'hero', visibleState: 'result', change: 'relationship', development: 'cause resolves' }],
    materialNeeds: [], requiredCapabilities: capabilities,
    capabilityReasons: capabilities.map((capabilityId) => ({ capabilityId, contentReason: 'content need' })),
    readableHold: { startMs: 8_000, endMs: 9_000, items: ['result'] },
    neighborHandoff: { incoming: 'cut', outgoing: 'cut' },
    authoring: { solo: false, reason: 'Keep chapter continuity.', continuityGroup: 'C01' },
  };
  await writeFile(path.join(root, 'S01.json'), `${JSON.stringify(value)}\n`);
  await assert.rejects(validateRecipeDirectory(root), /authoring\.solo is forbidden/u);
});

test('chapter creative receipt is compact and binds viewed media plus immutable Recipe identities', async () => {
  const schema = JSON.parse(await readFile(path.join(
    skillRoot, 'references/runtime/chapter-creative-receipt.schema.json',
  ), 'utf8'));
  const source = recipe('S01', 0, 'C01');
  const receipt = {
    schemaVersion: '1.0.0',
    planIdentity: 'a'.repeat(64),
    assignmentId: 'U001',
    unitId: 'U001',
    shotIds: ['S01'],
    recipeBindings: [{
      shotId: 'S01',
      recipeIdentity: computeRecipeIdentity(source),
      truthIdentity: computeRecipeTruthIdentity(source),
    }],
    decision: 'revised',
    viewedArtifact: { kind: 'chapter-preview', locator: '05-delivery/chapter-previews/U001.mp4' },
    viewedSha256: 'b'.repeat(64),
    creativeProposalChanges: [{ shotId: 'S01', change: 'Changed native cards to a mixed object-led composition.' }],
  };
  assert.deepEqual(validateSchemaValue(receipt, schema, schema), []);
  const leadReceipt = {
    ...receipt,
    assignmentId: 'L001', unitId: 'L001', shotIds: ['S01'], decision: 'accepted',
    creativeProposalChanges: [],
  };
  assert.deepEqual(validateSchemaValue(leadReceipt, schema, schema), []);
  const invalid = structuredClone(receipt);
  invalid.creativeProposalChanges = [];
  assert.ok(validateSchemaValue(invalid, schema, schema).length > 0);
});

test('full production remains blocked until technical canary and independent user choice both pass', async (t) => {
  const data = await fixture(t);
  const result = await writeProductionPlan(data);
  const { plan } = result;
  const assignments = await Promise.all(result.assignments.map(async (locator) => (
    JSON.parse(await readFile(path.join(data.productionRoot, locator), 'utf8'))
  )));
  const builder = assignments.find(({ role, canaryPhase }) => (
    role === 'builder' && canaryPhase.shotIds.length > 0 && canaryPhase.deferredShotIds.length > 0
  ));
  await assert.rejects(
    validateCanaryReleaseGate(plan, { productionRoot: data.productionRoot }),
    /both canary technical gate and user decision/u,
  );
  const previewLocator = '05-delivery/canary-preview.mp4';
  const previewFile = path.join(data.productionRoot, previewLocator);
  await mkdir(path.dirname(previewFile), { recursive: true });
  await writeFile(previewFile, 'five-shot-preview');
  const technical = {
    schemaVersion: '1.0.0', status: 'passed', planIdentity: plan.identity,
    shotIds: plan.canaryGate.shotIds,
    canaryPreview: { locator: previewLocator, sha256: hash('five-shot-preview'), fullDecode: 'passed' },
    checks: { directRuntimeRender: 'passed', fullDecode: 'passed', sixFrameSheets: 'passed', builderViews: 'passed' },
    contractBindings: plan.canaryGate.shotIds.map((shotId) => ({
      shotId, contractLocator: `05-delivery/shots/${shotId}.shot-media.json`,
      contractSha256: '1'.repeat(64), mediaSha256: '2'.repeat(64),
      semanticCheckSha256: '3'.repeat(64), sourceIdentity: `sha256:${'4'.repeat(64)}`,
    })),
    viewReceiptBindings: [{ assignmentId: 'U001', locator: '03-build/U001/view-receipt.json', sha256: '5'.repeat(64) }],
    identity: '',
  };
  technical.identity = gateIdentity(technical);
  const decisions = plan.canaryGate.shotIds.map((shotId, index) => ({
    shotId,
    choice: index < 3 ? 'ours' : 'comparison',
    accepted: index < 3,
    issue: index < 3 ? null : 'Comparison is still stronger in this shot.',
  }));
  const userDecision = {
    schemaVersion: '1.0.0', status: 'passed', planIdentity: plan.identity,
    technicalGateIdentity: technical.identity,
    canaryPreviewIdentity: technical.canaryPreview.sha256,
    shotIds: plan.canaryGate.shotIds,
    decisions, oursPreferred: 3, identity: '',
  };
  userDecision.identity = gateIdentity(userDecision);
  assert.equal((await validateCanaryReleaseGate(plan, {
    productionRoot: data.productionRoot,
    canaryTechnicalGate: technical,
    canaryUserDecision: userDecision,
  })).status, 'passed');
  const fullGate = await gateBuilderAssignment(builder, {
    plan, productionRoot: data.productionRoot,
    canaryTechnicalGate: technical,
    canaryUserDecision: userDecision,
  });
  assert.deepEqual(fullGate.allowedShotIds, builder.canaryPhase.deferredShotIds);
  assert.notDeepEqual(fullGate.allowedShotIds, builder.shotIds);
  assert.equal(fullGate.status, 'ready');
  assert.equal(fullGate.phase, 'full-production');

  const insufficient = structuredClone(userDecision);
  insufficient.decisions[2] = {
    shotId: insufficient.decisions[2].shotId,
    choice: 'comparison', accepted: false, issue: 'Comparison is stronger.',
  };
  insufficient.oursPreferred = 2;
  insufficient.identity = gateIdentity(insufficient);
  await assert.rejects(validateCanaryReleaseGate(plan, {
    productionRoot: data.productionRoot,
    canaryTechnicalGate: technical,
    canaryUserDecision: insufficient,
  }), /at least 3/u);
});
