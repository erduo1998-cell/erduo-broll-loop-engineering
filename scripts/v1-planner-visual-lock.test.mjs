import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { writeProductionPlan } from '../erduo-broll-loop-engineering/scripts/plan-runtime.mjs';
import { computeRepresentativeScenesIdentity, validateRuntimePlan } from '../erduo-broll-loop-engineering/scripts/validate-runtime-plan.mjs';
import {
  computeRuntimeSourceIdentity,
  computeVisualLockApprovalIdentity,
  computeVisualLockIdentity,
  validateVisualLock,
} from '../erduo-broll-loop-engineering/scripts/validate-visual-lock.mjs';
import {
  validateFrozenBlocks,
  validateFrozenV3IdentityBinding,
} from '../erduo-broll-loop-engineering/scripts/validate-frozen-blocks.mjs';
import {
  assembleFrozenPreview,
} from '../erduo-broll-loop-engineering/scripts/assemble-frozen-production.mjs';
import { gateBuilderAssignment } from '../erduo-broll-loop-engineering/scripts/gate-builder-assignment.mjs';

const commonCapabilities = ['semantic.integer-ms-window', 'semantic.visual-state-transition', 'semantic.readable-hold'];
const hash = (value) => createHash('sha256').update(value).digest('hex');

async function isolated(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'broll-v1-lock-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  return base;
}

async function writeV3Fixture(base, shotCount = 20) {
  const productionRoot = path.join(base, 'broll-production');
  const directorRoot = path.join(productionRoot, '01-director');
  const recipesDirectory = path.join(directorRoot, 'shot-recipes');
  await mkdir(recipesDirectory, { recursive: true });
  const endMs = shotCount * 9000;
  const narrativeEnvelopeFile = path.join(directorRoot, 'narrative-envelope.json');
  const visualSystemFile = path.join(directorRoot, 'visual-system.json');
  const representativeScenesFile = path.join(directorRoot, 'representative-scenes.json');
  const selectionFile = path.join(productionRoot, 'runtime-selection.json');
  await writeFile(narrativeEnvelopeFile, `${JSON.stringify({
    schemaVersion: '1.0.0', filmId: 'v1-fixture', window: { startMs: 0, endMs },
    premise: 'Prove v1 planning.', audienceJourney: ['understand'],
    chapters: [{ chapterId: 'C01', window: { startMs: 0, endMs }, purpose: 'Cover the fixture.' }], terms: [],
  })}\n`);
  await writeFile(visualSystemFile, `${JSON.stringify({
    schemaVersion: '1.0.0', conceptAngle: 'Clear paper system', visualWorld: 'Bright evidence desk',
    paletteRoles: [{ role: 'field', value: '#fff', use: 'background' }, { role: 'ink', value: '#111', use: 'focus' }],
    typographyRoles: [{ role: 'display', family: 'Fixture Sans', weight: '700', use: 'title', sourceLocator: '02-assets/font.woff2' }],
    materials: ['paper'], depthPlan: { background: 'field', midground: 'evidence', foreground: 'focus' },
    compositionFamilies: ['data-diagram-evidence', 'full-bleed-material', 'sparse-hold-chapter-outro'],
    motifSemantics: [], rhythmCurve: [{ startMs: 0, endMs, character: 'develop' }],
    prohibitedLazyDefaults: ['generic cards'], safeAreaPolicy: 'Keep all text inside ten percent.',
  })}\n`);
  await writeFile(selectionFile, `${JSON.stringify({
    schemaVersion: '2.0.0', status: 'selected', selectedRuntime: 'hyperframes', selectionSource: 'explicit',
  })}\n`);
  for (let index = 0; index < shotCount; index += 1) {
    const shotId = `S${String(index + 1).padStart(2, '0')}`;
    const startMs = index * 9000;
    const shotEndMs = startMs + 9000;
    await writeFile(path.join(recipesDirectory, `${shotId}.json`), `${JSON.stringify({
      schemaVersion: '3.0.0', shotId, window: { startMs, endMs: shotEndMs }, cueIds: [`cue-${index + 1}`],
      audienceUnderstanding: `Understand ${shotId}.`, visualJob: `Show ${shotId}.`, focus: shotId,
      compositionFamily: index % 2 ? 'data-diagram-evidence' : 'full-bleed-material',
      heroFrame: { relationship: 'Evidence supports the claim.', layers: { background: 'field', midground: 'evidence', foreground: 'focus' } },
      microBeats: [{ beatId: 'b1', startMs, endMs: shotEndMs, visibleState: 'Resolved state.', change: 'relationship', development: 'The relationship becomes explicit.' }],
      materialNeeds: [{ id: 'shared-paper', role: 'evidence', kind: 'native-structure', required: true, sourceRoute: 'native-support', fusion: 'Use as structural evidence.' }],
      requiredCapabilities: commonCapabilities,
      readableHold: { startMs, endMs: shotEndMs, items: [] },
      neighborHandoff: { incoming: 'Carry focus in.', outgoing: 'Carry focus out.' },
      ...([6, 7].includes(index) ? { authoring: { solo: false, reason: 'Keep the live transition together.', continuityGroup: 'live-pair' } } : {}),
    })}\n`);
  }
  const representativeScenes = {
    schemaVersion: '1.0.0',
    scenes: [
      { shotId: 'S01', coverage: 'opening', reason: 'Proves opening composition and material.', concerns: ['composition', 'material'] },
      { shotId: `S${String(Math.ceil(shotCount / 2)).padStart(2, '0')}`, coverage: 'information-dense', reason: 'Proves text and information density.', concerns: ['text'] },
      { shotId: `S${String(shotCount).padStart(2, '0')}`, coverage: 'late', reason: 'Proves late-film motion and closure.', concerns: ['motion'] },
    ],
    identity: '',
  };
  representativeScenes.identity = computeRepresentativeScenesIdentity(representativeScenes);
  await writeFile(representativeScenesFile, `${JSON.stringify(representativeScenes)}\n`);
  return { productionRoot, recipesDirectory, selectionFile, narrativeEnvelopeFile, visualSystemFile, representativeScenesFile, representativeScenes };
}

async function artifact(productionRoot, locator, contents) {
  const file = path.join(productionRoot, locator);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
  return { locator, sha256: hash(contents) };
}

test('runtime plan v3 aggregates a normal 180-second single-backend film into three Builder units without splitting live continuity', async (t) => {
  const fixture = await writeV3Fixture(await isolated(t));
  const result = await writeProductionPlan(fixture);
  assert.equal(result.plan.schemaVersion, '3.0.0');
  assert.equal(result.plan.authoringUnits.length, 3);
  assert.ok(result.plan.authoringUnits.every(({ shotIds }) => shotIds.length > 3));
  const liveUnit = result.plan.authoringUnits.find(({ shotIds }) => shotIds.includes('S07'));
  assert.ok(liveUnit.shotIds.includes('S08'));
  assert.equal(result.plan.visualLock.leadAssignmentLocators.length, 1);
  assert.deepEqual(await validateRuntimePlan(result.plan, fixture), {
    status: 'valid', shots: 20, blocks: 1, authoringUnits: 3, route: 'hyperframes',
  });
  const assignments = await Promise.all(result.assignments.map(async (locator) => JSON.parse(await readFile(path.join(fixture.productionRoot, locator), 'utf8'))));
  assert.equal(assignments.filter(({ role }) => role === 'lead').length, 1);
  assert.equal(assignments.filter(({ role }) => role === 'builder').length, 3);
  const lead = assignments.find(({ role }) => role === 'lead');
  assert.deepEqual(await gateBuilderAssignment(lead, { plan: result.plan, productionRoot: fixture.productionRoot }), {
    status: 'ready', role: 'lead', gate: 'visual-lock-production',
  });
  const wrongLeadRuntime = structuredClone(lead);
  wrongLeadRuntime.runtime = 'remotion';
  wrongLeadRuntime.shotIds = [];
  wrongLeadRuntime.representativeScenes = [];
  wrongLeadRuntime.stageSkill = 'broll-remotion-build';
  wrongLeadRuntime.output.workDirectory = '04-visual-lock/remotion';
  wrongLeadRuntime.output.representativeMediaRoot = '04-visual-lock/remotion/scenes';
  wrongLeadRuntime.output.sharedSourceRoot = '04-visual-lock/remotion/shared-source';
  wrongLeadRuntime.shared.mayImportRuntimeSourceFrom = 'remotion';
  await assert.rejects(
    gateBuilderAssignment(wrongLeadRuntime, { plan: result.plan, productionRoot: fixture.productionRoot }),
    /runtime differs from its planned backend/u,
  );
  const builder = assignments.find(({ role }) => role === 'builder');
  await assert.rejects(gateBuilderAssignment(builder, { plan: result.plan, productionRoot: fixture.productionRoot }), /blocked until visual lock/u);
});

test('approved visual lock binds representative media, executable source, tokens, witness, and user decision before Builder fan-out', async (t) => {
  const fixture = await writeV3Fixture(await isolated(t));
  const result = await writeProductionPlan(fixture);
  const assignments = await Promise.all(result.assignments.map(async (locator) => JSON.parse(await readFile(path.join(fixture.productionRoot, locator), 'utf8'))));
  const builder = assignments.find(({ role }) => role === 'builder');
  const font = await artifact(fixture.productionRoot, '02-assets/font.woff2', 'font-bytes');
  const asset = await artifact(fixture.productionRoot, '02-assets/paper.png', 'asset-bytes');
  const sourceFile = await artifact(fixture.productionRoot, '04-visual-lock/hyperframes/shared-source/visual-system.js', 'export const palette = ["#fff", "#111"];');
  const source = { runtime: 'hyperframes', rootLocator: '04-visual-lock/hyperframes/shared-source', files: [sourceFile], sourceIdentity: '' };
  source.sourceIdentity = computeRuntimeSourceIdentity(source);
  const representativeScenes = [];
  for (const scene of result.plan.visualLock.representativeScenes) {
    representativeScenes.push({
      shotId: scene.shotId, runtime: scene.runtime,
      media: await artifact(fixture.productionRoot, `04-visual-lock/${scene.runtime}/scenes/${scene.shotId}.mp4`, `media-${scene.shotId}`),
    });
  }
  const criteria = ['content-correspondence', 'first-glance-comprehension', 'text-readability', 'motion-result', 'whole-film-applicability'];
  const lock = {
    schemaVersion: '1.0.0', planIdentity: result.plan.identity,
    representativeScenesIdentity: fixture.representativeScenes.identity,
    status: 'approved',
    tokens: {
      fonts: [font], assets: [asset], colors: [{ role: 'field', value: '#fff' }],
      grid: { columns: 12, gutterPx: 24 }, safeArea: { insetPx: 96 }, hierarchy: [{ role: 'title', sizePx: 88 }],
      world: { background: 'bright paper', lighting: 'soft', material: 'paper', depth: 'three planes' },
      motion: [{ role: 'enter', durationMs: 420, easing: 'out-cubic', readableHoldMs: 1200 }],
    },
    representativeScenes, runtimeSources: [source],
    directorWitness: {
      status: 'passed',
      items: criteria.map((criterion, index) => ({
        shotId: result.plan.visualLock.representativeScenes[index % 3].shotId,
        criterion, observation: `${criterion} is visible.`, target: 'Keep this result.',
      })),
    },
    userDecision: { status: 'approved', riskAcknowledgement: null, approvedContentIdentity: '' },
    identity: '',
  };
  lock.userDecision.approvedContentIdentity = computeVisualLockApprovalIdentity(lock);
  lock.identity = computeVisualLockIdentity(lock);
  assert.deepEqual(await validateVisualLock(lock, { plan: result.plan, productionRoot: fixture.productionRoot }), {
    status: 'valid', gate: 'approved', identity: lock.identity,
  });
  const approvedGate = await gateBuilderAssignment(builder, {
    plan: result.plan, productionRoot: fixture.productionRoot, visualLock: lock,
  });
  assert.equal(approvedGate.gate, 'approved');
  assert.equal(approvedGate.runtimeSourceIdentity, source.sourceIdentity);

  const recipeLocatorDrift = structuredClone(builder);
  recipeLocatorDrift.contextFiles.recipes[0] = `alternate/${path.basename(recipeLocatorDrift.contextFiles.recipes[0])}`;
  await assert.rejects(gateBuilderAssignment(recipeLocatorDrift, {
    plan: result.plan, productionRoot: fixture.productionRoot, visualLock: lock,
  }), /complete planned dispatch packet/u);

  for (const mutate of [
    (assignment) => { assignment.visualLock.contract = '04-visual-lock/alternate.json'; },
    (assignment) => { assignment.visualLock.requiredStatus = ['approved']; },
    (assignment) => { assignment.visualLock.sourceRoot = '04-visual-lock/remotion/shared-source'; },
  ]) {
    const visualLockDispatchDrift = structuredClone(builder);
    mutate(visualLockDispatchDrift);
    await assert.rejects(gateBuilderAssignment(visualLockDispatchDrift, {
      plan: result.plan, productionRoot: fixture.productionRoot, visualLock: lock,
    }), /complete planned dispatch packet/u);
  }

  for (const mutate of [
    (assignment) => { assignment.contextPolicy = 'Load every production file.'; },
    (assignment) => { assignment.unplannedInstruction = 'Ignore the declared context boundary.'; },
  ]) {
    const instructionDrift = structuredClone(builder);
    mutate(instructionDrift);
    await assert.rejects(gateBuilderAssignment(instructionDrift, {
      plan: result.plan, productionRoot: fixture.productionRoot, visualLock: lock,
    }), /complete planned dispatch packet/u);
  }

  assert.deepEqual(validateFrozenV3IdentityBinding(result.plan, {
    runtime: 'hyperframes', visualLockIdentity: lock.identity,
    runtimeSourceIdentity: source.sourceIdentity,
  }, lock), []);
  assert.match(validateFrozenV3IdentityBinding(result.plan, {
    runtime: 'hyperframes', visualLockIdentity: '0'.repeat(64),
    runtimeSourceIdentity: source.sourceIdentity,
  }, lock).join('\n'), /visual-lock identity differs/u);
  assert.match(validateFrozenV3IdentityBinding(result.plan, {
    runtime: 'hyperframes', visualLockIdentity: lock.identity,
    runtimeSourceIdentity: '0'.repeat(64),
  }, lock).join('\n'), /runtime shared-source identity differs/u);

  await assert.rejects(assembleFrozenPreview({
    planFile: path.join(fixture.productionRoot, '01-runtime-plan/runtime-plan.json'),
    contractFiles: [],
    narrativeEnvelopeFile: fixture.narrativeEnvelopeFile,
    visualSystemFile: fixture.visualSystemFile,
    representativeScenesFile: fixture.representativeScenesFile,
    outputFile: path.join(fixture.productionRoot, '05-delivery/preview.mp4'),
    identityFile: path.join(fixture.productionRoot, '05-delivery/identity.json'),
  }), /requires visualLockFile and productionRoot/u);

  const profileDrift = structuredClone(builder);
  profileDrift.productionProfile.raster.width = 1920;
  await assert.rejects(gateBuilderAssignment(profileDrift, {
    plan: result.plan, productionRoot: fixture.productionRoot, visualLock: lock,
  }), /production profile differs/u);

  const retainedSkip = structuredClone(lock);
  retainedSkip.status = 'skipped';
  retainedSkip.userDecision = {
    status: 'skipped',
    riskAcknowledgement: 'User skips the approval stop but keeps the produced representative scenes and shared source without claiming aesthetic approval.',
    approvedContentIdentity: null,
  };
  retainedSkip.identity = computeVisualLockIdentity(retainedSkip);
  assert.equal((await gateBuilderAssignment(builder, {
    plan: result.plan, productionRoot: fixture.productionRoot, visualLock: retainedSkip,
  })).gate, 'skipped');

  const witnessDrift = structuredClone(lock);
  witnessDrift.directorWitness.items[0].observation = 'Changed after approval.';
  witnessDrift.identity = computeVisualLockIdentity(witnessDrift);
  await assert.rejects(validateVisualLock(witnessDrift, { plan: result.plan, productionRoot: fixture.productionRoot }), /approved content changed/u);
  const visualLockFile = path.join(fixture.productionRoot, '04-visual-lock/visual-lock.json');
  await writeFile(visualLockFile, `${JSON.stringify(lock, null, 2)}\n`);
  await writeFile(path.join(fixture.productionRoot, sourceFile.locator), 'source drift');
  await assert.rejects(validateVisualLock(lock, { plan: result.plan, productionRoot: fixture.productionRoot }), /shared source file hash differs/u);
  await assert.rejects(validateFrozenBlocks(result.plan, [], {
    narrativeEnvelopeFile: fixture.narrativeEnvelopeFile,
    visualSystemFile: fixture.visualSystemFile,
    representativeScenesFile: fixture.representativeScenesFile,
    visualLockFile,
    productionRoot: fixture.productionRoot,
  }), /shared source file hash differs/u);
});

test('explicit visual-lock skip records risk and identity while source-root drift remains blocked', async (t) => {
  const fixture = await writeV3Fixture(await isolated(t));
  const result = await writeProductionPlan(fixture);
  const assignmentLocator = result.assignments.find((locator) => /U001\.json$/u.test(locator));
  const builder = JSON.parse(await readFile(path.join(fixture.productionRoot, assignmentLocator), 'utf8'));
  const skipped = {
    schemaVersion: '1.0.0', planIdentity: result.plan.identity,
    representativeScenesIdentity: fixture.representativeScenes.identity,
    status: 'skipped', tokens: null, representativeScenes: [], runtimeSources: [],
    directorWitness: { status: 'skipped', items: [] },
    userDecision: { status: 'skipped', riskAcknowledgement: 'User accepts style drift and late rework risk.', approvedContentIdentity: null },
    identity: '',
  };
  skipped.identity = computeVisualLockIdentity(skipped);
  assert.equal((await gateBuilderAssignment(builder, { plan: result.plan, productionRoot: fixture.productionRoot, visualLock: skipped })).gate, 'skipped');
  const wrongRuntimeSource = structuredClone(builder);
  wrongRuntimeSource.visualLock.sourceRoot = '04-visual-lock/remotion/shared-source';
  await assert.rejects(gateBuilderAssignment(wrongRuntimeSource, {
    plan: result.plan, productionRoot: fixture.productionRoot, visualLock: skipped,
  }), /complete planned dispatch packet/u);
});

test('Hybrid planning creates one Lead Builder and one isolated shared-source root per actual backend', async (t) => {
  const fixture = await writeV3Fixture(await isolated(t));
  await writeFile(fixture.selectionFile, `${JSON.stringify({
    schemaVersion: '2.0.0', status: 'selected', selectedRuntime: 'auto', selectionSource: 'default',
  })}\n`);
  const remotionRecipeFile = path.join(fixture.recipesDirectory, 'S10.json');
  const remotionRecipe = JSON.parse(await readFile(remotionRecipeFile, 'utf8'));
  remotionRecipe.requiredCapabilities = [...commonCapabilities, 'effects.dom-pixel-postprocess'];
  await writeFile(remotionRecipeFile, `${JSON.stringify(remotionRecipe)}\n`);
  const result = await writeProductionPlan(fixture);
  assert.equal(result.plan.resultingRoute, 'hybrid');
  assert.deepEqual(result.plan.requiredBackends, ['hyperframes', 'remotion']);
  assert.equal(result.plan.visualLock.leadAssignmentLocators.length, 2);
  const leads = await Promise.all(result.plan.visualLock.leadAssignmentLocators.map(async (locator) => (
    JSON.parse(await readFile(path.join(fixture.productionRoot, locator), 'utf8'))
  )));
  assert.deepEqual(leads.map(({ output }) => output.sharedSourceRoot).toSorted(), [
    '04-visual-lock/hyperframes/shared-source',
    '04-visual-lock/remotion/shared-source',
  ]);
  const remotionLead = leads.find(({ runtime }) => runtime === 'remotion');
  remotionLead.output.sharedSourceRoot = '04-visual-lock/hyperframes/shared-source';
  await assert.rejects(
    gateBuilderAssignment(remotionLead, { plan: result.plan, productionRoot: fixture.productionRoot }),
    /complete planned dispatch packet/u,
  );
});

test('v3 preserves explicit complex solo work and requires a rationale instead of silently accepting an over-15-second shot', async (t) => {
  const base = await isolated(t);
  const soloFixture = await writeV3Fixture(path.join(base, 'solo'));
  const soloRecipeFile = path.join(soloFixture.recipesDirectory, 'S10.json');
  const soloRecipe = JSON.parse(await readFile(soloRecipeFile, 'utf8'));
  soloRecipe.authoring = { solo: true, reason: 'Complex 3D camera and heavy asset fusion require isolated state.' };
  await writeFile(soloRecipeFile, `${JSON.stringify(soloRecipe)}\n`);
  const soloResult = await writeProductionPlan(soloFixture);
  assert.deepEqual(
    soloResult.plan.authoringUnits.find(({ shotIds }) => shotIds.includes('S10')).shotIds,
    ['S10'],
  );
  assert.ok(soloResult.plan.authoringUnits.length > 3, 'complex exception must not be merged merely to hit the ordinary 2–3 target');

  const longFixture = await writeV3Fixture(path.join(base, 'long'), 3);
  const secondFile = path.join(longFixture.recipesDirectory, 'S02.json');
  const thirdFile = path.join(longFixture.recipesDirectory, 'S03.json');
  const second = JSON.parse(await readFile(secondFile, 'utf8'));
  const third = JSON.parse(await readFile(thirdFile, 'utf8'));
  second.window.endMs = 27000;
  second.microBeats[0].endMs = 27000;
  second.readableHold.endMs = 27000;
  third.window = { startMs: 27000, endMs: 36000 };
  third.microBeats[0].startMs = 27000;
  third.microBeats[0].endMs = 36000;
  third.readableHold = { startMs: 27000, endMs: 36000, items: [] };
  await writeFile(secondFile, `${JSON.stringify(second)}\n`);
  await writeFile(thirdFile, `${JSON.stringify(third)}\n`);
  const narrative = JSON.parse(await readFile(longFixture.narrativeEnvelopeFile, 'utf8'));
  narrative.window.endMs = 36000;
  narrative.chapters[0].window.endMs = 36000;
  await writeFile(longFixture.narrativeEnvelopeFile, `${JSON.stringify(narrative)}\n`);
  const visual = JSON.parse(await readFile(longFixture.visualSystemFile, 'utf8'));
  visual.rhythmCurve[0].endMs = 36000;
  await writeFile(longFixture.visualSystemFile, `${JSON.stringify(visual)}\n`);

  const stopped = await writeProductionPlan(longFixture);
  assert.equal(stopped.plan.status, 'action-required');
  assert.match(stopped.plan.warnings.join('\n'), /S02: semantic shot exceeds 15000ms without durationRationale/u);
  second.durationRationale = 'One uninterrupted causal transformation must remain visible from setup through resolved state.';
  await writeFile(secondFile, `${JSON.stringify(second)}\n`);
  const planned = await writeProductionPlan(longFixture);
  assert.equal(planned.plan.status, 'planned');
  assert.ok(planned.plan.authoringUnits.some(({ shotIds }) => shotIds.includes('S02')));
});
