import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, rm, utimes, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {assembleChapterPreview} from '../erduo-broll-loop-engineering/scripts/assemble-shot-preview.mjs';
import {
  clearMinimalFailureEvidence,
  inspectAssignmentRuntime,
  shouldRunRuntimeInspection,
  writeMinimalFailureEvidence,
} from '../erduo-broll-loop-engineering/scripts/backend-inspection.mjs';
import {validateCanaryReleaseGate} from '../erduo-broll-loop-engineering/scripts/gate-builder-assignment.mjs';
import {runInspectionForPlan} from '../erduo-broll-loop-engineering/scripts/render-assigned-shots.mjs';
import {canonicalJson} from '../erduo-broll-loop-engineering/scripts/runtime-schema-validator.mjs';
import {
  assertProductionSourcePolicy,
  hashFile,
  resolveCanaryRenderShotIds,
  validateBuilderViewReceipt,
  validateCanaryTechnicalGate,
} from '../erduo-broll-loop-engineering/scripts/shot-media-lib.mjs';
import {recordCanaryUserDecision} from '../erduo-broll-loop-engineering/scripts/validate-shot-media.mjs';
import {
  computeRecipeIdentity,
  computeRecipeTruthIdentity,
} from '../erduo-broll-loop-engineering/scripts/validate-shot-recipes.mjs';

async function temporaryRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'creative-loop-delivery-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  return root;
}

function gateIdentity(value) {
  const {identity: _identity, ...content} = value;
  return `sha256:${createHash('sha256').update(canonicalJson(content)).digest('hex')}`;
}

const fixturePlanVerification = async () => ({status: 'valid', recipes: 5});

async function validCanaryClosure(t, {
  compositionCount = 3, materialCount = 2, signatureMotionCount = 2, wallTimeMinutes = 0,
  includeLead = false,
} = {}) {
  const productionRoot = await temporaryRoot(t);
  const canaryShotIds = ['S01', 'S05', 'S07', 'S09', 'S15'];
  const technicalLocator = '05-delivery/canary-technical-gate.json';
  const userDecisionLocator = '05-delivery/canary-user-decision.json';
  const plan = {
    schemaVersion: '4.0.0', identity: '9'.repeat(64),
    productionProfile: {
      identity: '8'.repeat(64), raster: {width: 640, height: 360},
      fps: {numerator: 30, denominator: 1},
    },
    shots: Array.from({length: 20}, (_, index) => ({
      shotId: `S${String(index + 1).padStart(2, '0')}`,
      window: {startMs: index * 1000, endMs: (index + 1) * 1000}, runtime: 'hyperframes',
    })),
    canaryGate: {
      required: true, technicalLocator, userDecisionLocator, shotIds: canaryShotIds,
      fullProductionBlockedUntil: 'technical-and-user-passed',
    },
    sourceContext: {
      originalSrt: {locator: '00-input/original.srt'},
      originalDesign: {locator: '00-input/original-design.md'},
    },
    ...(includeLead ? {leadProduction: {
      representativeScenes: [{shotId: 'S01', runtime: 'hyperframes'}],
      leadAssignmentLocators: ['01-runtime-plan/assignments/L001.json'],
    }} : {}),
  };
  const planFile = path.join(productionRoot, '01-runtime-plan', 'runtime-plan.json');
  const assignmentsDirectory = path.join(productionRoot, '01-runtime-plan', 'assignments');
  const recipesDirectory = path.join(productionRoot, '01-director', 'shot-recipes');
  const workDirectory = '03-build/U001';
  const assignment = {
    schemaVersion: '3.0.0', assignmentId: 'U001', unitId: 'U001', role: 'builder',
    planIdentity: plan.identity, shotIds: includeLead ? canaryShotIds.slice(1) : canaryShotIds,
    output: {
      workDirectory, handoff: `${workDirectory}/handoff.md`,
      viewReceipt: `${workDirectory}/view-receipt.json`,
    },
  };
  await Promise.all([
    mkdir(assignmentsDirectory, {recursive: true}), mkdir(recipesDirectory, {recursive: true}),
    mkdir(path.join(productionRoot, '00-input'), {recursive: true}),
    mkdir(path.join(productionRoot, '05-delivery', 'shots'), {recursive: true}),
    mkdir(path.join(productionRoot, '05-delivery', 'checks'), {recursive: true}),
    mkdir(path.join(productionRoot, '05-delivery', 'chapter-previews'), {recursive: true}),
    mkdir(path.join(productionRoot, '05-delivery', 'canary-receipts'), {recursive: true}),
    mkdir(path.join(productionRoot, workDirectory), {recursive: true}),
  ]);
  await Promise.all([
    writeFile(planFile, `${JSON.stringify(plan)}\n`),
    writeFile(path.join(assignmentsDirectory, 'U001.json'), `${JSON.stringify(assignment)}\n`),
    writeFile(path.join(productionRoot, '00-input', 'original.srt'), '1\n00:00:00,000 --> 00:00:20,000\nCanary.\n'),
    writeFile(path.join(productionRoot, '00-input', 'original-design.md'), '# Design\nSignature motions: surgeFlow and ribbonDraw.\n'),
  ]);
  let leadAssignment = null;
  if (includeLead) {
    leadAssignment = {
      schemaVersion: '3.0.0', assignmentId: 'L001', role: 'lead', phase: 'lead-production',
      planIdentity: plan.identity, shotIds: ['S01'],
      output: {
        workDirectory: '04-visual-lock/hyperframes',
        handoff: '04-visual-lock/hyperframes/handoff.md',
        viewReceipt: '04-visual-lock/hyperframes/view-receipt.json',
      },
    };
    await mkdir(path.join(productionRoot, leadAssignment.output.workDirectory), {recursive: true});
    await writeFile(path.join(assignmentsDirectory, 'L001.json'), `${JSON.stringify(leadAssignment)}\n`);
  }

  const contracts = [];
  const recipes = [];
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  for (const [canaryIndex, shotId] of canaryShotIds.entries()) {
    const planIndex = plan.shots.findIndex((shot) => shot.shotId === shotId);
    const order = planIndex + 1;
    const basename = `${String(order).padStart(3, '0')}-${shotId}`;
    const shot = plan.shots[planIndex];
    const recipe = {
      schemaVersion: '4.0.0', shotId,
      truth: {
        chapterId: 'C01', srtWindowMs: shot.window, sourceCues: [`cue-${shotId}`],
        spokenFacts: [`Fact ${shotId}.`], audienceOutcome: `Understand ${shotId}.`,
        requiredReadableResult: `Result ${shotId}.`, incomingSeam: 'cut', outgoingSeam: 'cut',
      },
      creativeProposal: {
        metaphor: `Metaphor ${shotId}.`, objects: [`object-${shotId}`],
        composition: ['full-bleed-material', 'data-diagram-evidence', 'spatial-path-workflow'][canaryIndex % compositionCount],
        motionIdea: ['surgeFlow resolves the relationship.', 'ribbonDraw reveals the result.'][canaryIndex % signatureMotionCount],
        materialRoute: canaryIndex < materialCount ? 'generate' : 'native',
        keyStates: ['opening', 'turn', 'result', 'settle'], whyThisCouldWork: 'It makes truth visible.',
      },
      craftIntent: ['staging', 'timing'], requiredCapabilities: ['semantic.integer-ms-window'],
      capabilityReasons: [{capabilityId: 'semantic.integer-ms-window', contentReason: 'Exact timing.'}],
    };
    const recipeFile = path.join(recipesDirectory, `${shotId}.json`);
    const mediaPath = `shots/${basename}.mp4`;
    const sheetPath = `checks/${basename}.semantic-check.png`;
    await Promise.all([
      writeFile(recipeFile, `${JSON.stringify(recipe)}\n`),
      writeFile(path.join(productionRoot, '05-delivery', mediaPath), `DIRECT-${shotId}`),
      writeFile(path.join(productionRoot, '05-delivery', sheetPath), png),
    ]);
    const mediaSha256 = await hashFile(path.join(productionRoot, '05-delivery', mediaPath));
    const sheetSha256 = await hashFile(path.join(productionRoot, '05-delivery', sheetPath));
    const contract = {
      schemaVersion: '1.0.0', order, shotId, unitId: 'U001',
      srtWindowMs: {start: shot.window.startMs, end: shot.window.endMs},
      localTimeline: {startFrame: 0, frameCount: 30}, backend: 'hyperframes',
      renderTarget: {id: shotId, mode: 'direct-runtime-render'},
      sourceIdentity: `sha256:${'d'.repeat(64)}`,
      recipeIdentity: `sha256:${computeRecipeIdentity(recipe)}`,
      profileIdentity: `sha256:${plan.productionProfile.identity}`,
      media: {path: mediaPath, durationMs: 1000, width: 640, height: 360, fps: 30, codec: 'h264', sha256: mediaSha256, fullDecode: 'passed'},
      semanticCheck: {
        sourceMedia: mediaPath, contactSheet: sheetPath, sha256: sheetSha256,
        samples: ['opening', 'preparation', 'action-a', 'action-b', 'result', 'settle-tail']
          .map((role, frame) => ({role, frame, localTimeMs: frame * 33})),
      },
    };
    const contractLocator = `05-delivery/shots/${basename}.shot-media.json`;
    await writeFile(path.join(productionRoot, contractLocator), `${JSON.stringify(contract)}\n`);
    contracts.push({contract, contractLocator});
    recipes.push(recipe);
  }
  const chapterLocator = '05-delivery/chapter-previews/U001.mp4';
  const previewLocator = '05-delivery/canary-preview.mp4';
  await Promise.all([
    writeFile(path.join(productionRoot, chapterLocator), 'FIVE SHOT CHAPTER PREVIEW'),
    writeFile(path.join(productionRoot, previewLocator), 'FIVE SHOT CANARY PREVIEW'),
    writeFile(path.join(productionRoot, assignment.output.handoff), '# U001 handoff\n- view-receipt: view-receipt.json\n'),
  ]);
  const receipt = {
    schemaVersion: '1.0.0', planIdentity: plan.identity, assignmentId: 'U001', unitId: 'U001',
    shotIds: assignment.shotIds,
    recipeBindings: recipes.filter((recipe) => assignment.shotIds.includes(recipe.shotId)).map((recipe) => ({
      shotId: recipe.shotId,
      recipeIdentity: computeRecipeIdentity(recipe),
      truthIdentity: computeRecipeTruthIdentity(recipe),
    })),
    decision: 'accepted', viewedArtifact: {kind: 'chapter-preview', locator: chapterLocator},
    viewedSha256: await hashFile(path.join(productionRoot, chapterLocator)), creativeProposalChanges: [],
  };
  await writeFile(path.join(productionRoot, assignment.output.viewReceipt), `${JSON.stringify(receipt)}\n`);
  const builderSnapshot = '05-delivery/canary-receipts/U001.json';
  await writeFile(path.join(productionRoot, builderSnapshot), `${JSON.stringify(receipt)}\n`);
  let leadReceipt = null;
  if (leadAssignment) {
    const leadRecipe = recipes.find(({shotId}) => shotId === 'S01');
    const leadSheetLocator = '05-delivery/checks/001-S01.semantic-check.png';
    await writeFile(
      path.join(productionRoot, leadAssignment.output.handoff),
      '# L001 handoff\n- view-receipt: view-receipt.json\n',
    );
    leadReceipt = {
      schemaVersion: '1.0.0', planIdentity: plan.identity, assignmentId: 'L001', unitId: 'L001',
      shotIds: ['S01'], recipeBindings: [{
        shotId: 'S01',
        recipeIdentity: computeRecipeIdentity(leadRecipe),
        truthIdentity: computeRecipeTruthIdentity(leadRecipe),
      }],
      decision: 'accepted', viewedArtifact: {kind: 'six-frame-sheets', locator: leadSheetLocator},
      viewedSha256: await hashFile(path.join(productionRoot, leadSheetLocator)), creativeProposalChanges: [],
    };
    await writeFile(path.join(productionRoot, leadAssignment.output.viewReceipt), `${JSON.stringify(leadReceipt)}\n`);
    await writeFile(
      path.join(productionRoot, '05-delivery/canary-receipts/L001.json'),
      `${JSON.stringify(leadReceipt)}\n`,
    );
  }
  const technical = {
    schemaVersion: '1.0.0', status: 'passed', planIdentity: plan.identity, shotIds: canaryShotIds,
    canaryPreview: {locator: previewLocator, sha256: await hashFile(path.join(productionRoot, previewLocator)), fullDecode: 'passed'},
    checks: {directRuntimeRender: 'passed', fullDecode: 'passed', sixFrameSheets: 'passed', builderViews: 'passed'},
    contractBindings: await Promise.all(contracts.map(async ({contract, contractLocator}) => ({
      shotId: contract.shotId, contractLocator, contractSha256: await hashFile(path.join(productionRoot, contractLocator)),
      mediaSha256: contract.media.sha256, semanticCheckSha256: contract.semanticCheck.sha256,
      sourceIdentity: contract.sourceIdentity,
    }))),
    viewReceiptBindings: [
      ...(leadAssignment ? [{
        assignmentId: 'L001', locator: '05-delivery/canary-receipts/L001.json',
        sha256: await hashFile(path.join(productionRoot, '05-delivery/canary-receipts/L001.json')),
      }] : []),
      {
        assignmentId: 'U001', locator: builderSnapshot,
        sha256: await hashFile(path.join(productionRoot, builderSnapshot)),
      },
    ],
  };
  technical.identity = gateIdentity(technical);
  await writeFile(path.join(productionRoot, technicalLocator), `${JSON.stringify(technical)}\n`);
  if (wallTimeMinutes > 0) {
    const old = new Date(Date.now() - wallTimeMinutes * 60 * 1000);
    await utimes(path.join(assignmentsDirectory, 'U001.json'), old, old);
  }
  const runner = async ({executable, args}) => {
    if (executable === 'ffprobe') {
      const chapter = /chapter-previews/u.test(args.at(-1));
      const preview = chapter || /canary-preview/u.test(args.at(-1));
      const frames = chapter && includeLead ? 120 : preview ? 150 : 30;
      return {code: 0, stderr: '', stdout: JSON.stringify({
        streams: [{codec_type: 'video', codec_name: 'h264', width: 640, height: 360, avg_frame_rate: '30/1', nb_read_frames: String(frames), start_time: '0'}],
        format: {format_name: 'mov,mp4', duration: String(frames / 30), start_time: '0'},
      })};
    }
    if (executable === 'ffmpeg' && args.includes('null')) return {code: 0, stdout: '', stderr: ''};
    return {code: 1, stdout: '', stderr: 'unexpected command'};
  };
  return {productionRoot, plan, planFile, recipesDirectory, technical, runner, assignment, leadAssignment};
}

test('production source rejects proof instrumentation but accepts ordinary authored source', async (t) => {
  const root = await temporaryRoot(t);
  const source = path.join(root, 'source');
  await mkdir(path.join(source, 'src'), {recursive: true});
  await writeFile(path.join(source, 'src', 'index.tsx'), 'export const Scene = () => <main>real scene</main>;\n');
  await assert.doesNotReject(assertProductionSourcePolicy(source));

  const forbidden = [
    ['src/inspection.tsx', 'export const erduoInspectionCompositions = {};\n', /inspection\.tsx/u],
    ['src/scene.tsx', 'export const Scene = () => <div data-erduo-trace-id="hero" />;\n', /data-erduo-trace/u],
    ['src/scene.tsx', 'export const proof = {visualWeight: 1, focusGroup: "hero"};\n', /visualWeight|focusGroup/u],
    ['src/scene.tsx', 'export const proof = {motionWindows: [{startFrame: 1, endFrame: 2}]};\n', /motionWindows|manual motion/u],
  ];
  for (const [locator, body, pattern] of forbidden) {
    const file = path.join(source, locator);
    await writeFile(file, body);
    await assert.rejects(assertProductionSourcePolicy(source), pattern);
    await rm(file);
  }
});

test('Builder handoff requires a compact accepted or revised receipt bound to a real current view artifact', async (t) => {
  const productionRoot = await temporaryRoot(t);
  const workDirectory = '03-build/U001';
  const viewReceiptLocator = `${workDirectory}/view-receipt.json`;
  const handoffLocator = `${workDirectory}/handoff.md`;
  const viewedLocator = '05-delivery/chapter-previews/U001.mp4';
  await Promise.all([
    mkdir(path.join(productionRoot, workDirectory), {recursive: true}),
    mkdir(path.join(productionRoot, '05-delivery', 'chapter-previews'), {recursive: true}),
  ]);
  await writeFile(path.join(productionRoot, viewedLocator), 'current chapter preview');
  await writeFile(path.join(productionRoot, handoffLocator), '# U001 handoff\n- view-receipt: view-receipt.json\n');
  const recipeBindings = [
    {shotId: 'S01', recipeIdentity: '1'.repeat(64), truthIdentity: 'a'.repeat(64)},
    {shotId: 'S02', recipeIdentity: '2'.repeat(64), truthIdentity: 'b'.repeat(64)},
  ];
  const assignment = {
    assignmentId: 'U001', unitId: 'U001', planIdentity: '9'.repeat(64), shotIds: ['S01', 'S02'],
    output: {workDirectory, handoff: handoffLocator, viewReceipt: viewReceiptLocator},
  };
  const receipt = {
    schemaVersion: '1.0.0', planIdentity: assignment.planIdentity,
    assignmentId: 'U001', unitId: 'U001', shotIds: ['S01', 'S02'], recipeBindings,
    decision: 'accepted', viewedArtifact: {kind: 'chapter-preview', locator: viewedLocator},
    viewedSha256: await hashFile(path.join(productionRoot, viewedLocator)), creativeProposalChanges: [],
  };
  await writeFile(path.join(productionRoot, viewReceiptLocator), `${JSON.stringify(receipt)}\n`);
  const accepted = await validateBuilderViewReceipt({assignment, productionRoot, recipeBindings, expectedShotIds: assignment.shotIds});
  assert.equal(accepted.decision, 'accepted');

  await writeFile(path.join(productionRoot, viewReceiptLocator), `${JSON.stringify({...receipt, viewedSha256: '0'.repeat(64)})}\n`);
  await assert.rejects(
    validateBuilderViewReceipt({assignment, productionRoot, recipeBindings, expectedShotIds: assignment.shotIds}),
    /viewed artifact hash/u,
  );
  await writeFile(path.join(productionRoot, viewReceiptLocator), `${JSON.stringify({...receipt, decision: 'revised'})}\n`);
  await assert.rejects(
    validateBuilderViewReceipt({assignment, productionRoot, recipeBindings, expectedShotIds: assignment.shotIds}),
    /creativeProposalChanges|too few items/iu,
  );
  const revised = {...receipt, decision: 'revised', creativeProposalChanges: [{shotId: 'S02', change: 'Replaced the proposed card stack with a literal timeline.'}]};
  await writeFile(path.join(productionRoot, viewReceiptLocator), `${JSON.stringify(revised)}\n`);
  assert.equal((await validateBuilderViewReceipt({assignment, productionRoot, recipeBindings, expectedShotIds: assignment.shotIds})).decision, 'revised');

  const changedTruth = {...revised, recipeBindings: [{...recipeBindings[0], truthIdentity: 'c'.repeat(64)}, recipeBindings[1]]};
  await writeFile(path.join(productionRoot, viewReceiptLocator), `${JSON.stringify(changedTruth)}\n`);
  await assert.rejects(
    validateBuilderViewReceipt({assignment, productionRoot, recipeBindings, expectedShotIds: assignment.shotIds}),
    /truth|Recipe bindings/iu,
  );
});

test('chapter preview concatenates only the authoring unit direct-shot contracts and fully decodes it', async (t) => {
  const productionRoot = await temporaryRoot(t);
  const deliveryRoot = path.join(productionRoot, '05-delivery');
  const shotsDirectory = path.join(deliveryRoot, 'shots');
  await mkdir(shotsDirectory, {recursive: true});
  const contracts = [1, 2].map((order) => ({
    order, shotId: `S0${order}`, unitId: 'U001', renderTarget: {id: `S0${order}`, mode: 'direct-runtime-render'},
    media: {path: `shots/00${order}-S0${order}.mp4`, durationMs: 1000, width: 640, height: 360, fps: 30, codec: 'h264', fullDecode: 'passed'},
  }));
  for (const contract of contracts) await writeFile(path.join(deliveryRoot, contract.media.path), `DIRECT-${contract.shotId}`);
  const calls = [];
  const runner = async ({executable, args}) => {
    calls.push({executable, args: [...args]});
    if (executable === 'ffmpeg' && args.includes('concat')) {
      const concatFile = args[args.indexOf('-i') + 1];
      const concat = await readFile(concatFile, 'utf8');
      assert.match(concat, /001-S01\.mp4/u);
      assert.match(concat, /002-S02\.mp4/u);
      const output = args.at(-1);
      await writeFile(output, 'UNIT-CHAPTER-PREVIEW');
      return {code: 0, stdout: '', stderr: ''};
    }
    if (executable === 'ffprobe') return {
      code: 0, stderr: '', stdout: JSON.stringify({
        streams: [{codec_type: 'video', codec_name: 'h264', width: 640, height: 360, avg_frame_rate: '30/1', nb_read_frames: '60', start_time: '0'}],
        format: {format_name: 'mov,mp4', duration: '2', start_time: '0'},
      }),
    };
    if (executable === 'ffmpeg' && args.includes('null')) return {code: 0, stdout: '', stderr: ''};
    return {code: 1, stdout: '', stderr: 'unexpected command'};
  };
  const result = await assembleChapterPreview({unitId: 'U001', contracts, deliveryRoot, runner, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe'});
  assert.equal(result.status, 'chapter-preview-ready');
  assert.equal(result.shots, 2);
  assert.match(result.preview, /chapter-previews\/U001\.mp4$/u);
  assert.equal(calls.filter(({executable, args}) => executable === 'ffmpeg' && args.includes('null')).length, 1);
});

test('non-contiguous five-shot canary requires both technical evidence and a bound Parent user decision before full production', async (t) => {
  const productionRoot = await temporaryRoot(t);
  const technicalLocator = '05-delivery/canary-technical-gate.json';
  const userDecisionLocator = '05-delivery/canary-user-decision.json';
  const canaryShotIds = ['S01', 'S05', 'S07', 'S09', 'S15'];
  const plan = {
    schemaVersion: '4.0.0', identity: '9'.repeat(64),
    productionProfile: {identity: '8'.repeat(64), raster: {width: 640, height: 360}, fps: {numerator: 30, denominator: 1}},
    shots: Array.from({length: 20}, (_, index) => ({
      shotId: `S${String(index + 1).padStart(2, '0')}`,
      window: {startMs: index * 1000, endMs: (index + 1) * 1000}, runtime: 'hyperframes',
    })),
    canaryGate: {required: true, technicalLocator, userDecisionLocator, shotIds: canaryShotIds, fullProductionBlockedUntil: 'passed'},
  };
  const canaryAssignment = {
    assignmentId: 'U001', shotIds: ['S01', 'S02', 'S03', 'S04', 'S05', 'S06'],
    canaryPhase: {gateLocator: technicalLocator, userDecisionLocator, mode: 'canary-first', shotIds: ['S01', 'S05'], deferredShotIds: ['S02', 'S03', 'S04', 'S06']},
  };
  assert.deepEqual(await resolveCanaryRenderShotIds({
    plan, assignment: canaryAssignment, productionRoot, verifyPlanInputs: fixturePlanVerification,
  }), ['S01', 'S05']);
  const leadAssignment = {
    assignmentId: 'L001', role: 'lead', finalProductionSource: true,
    shotIds: ['S01', 'S07', 'S15'],
    canaryPhase: {
      gateLocator: technicalLocator, userDecisionLocator, mode: 'canary-first',
      shotIds: ['S01'], deferredShotIds: ['S07', 'S15'],
    },
  };
  assert.deepEqual(await resolveCanaryRenderShotIds({
    plan, assignment: leadAssignment, productionRoot, verifyPlanInputs: fixturePlanVerification,
  }), ['S01', 'S07', 'S15'], 'Lead must finish all three representative sources before Chapter canary rendering');
  const fullAssignment = {
    assignmentId: 'U002', shotIds: ['S07', 'S08', 'S09', 'S10'],
    canaryPhase: {gateLocator: technicalLocator, userDecisionLocator, mode: 'full-production-after-gate', shotIds: ['S07', 'S09'], deferredShotIds: ['S08', 'S10']},
  };
  await assert.rejects(resolveCanaryRenderShotIds({
    plan, assignment: fullAssignment, productionRoot, verifyPlanInputs: fixturePlanVerification,
  }), /canary.*not passed/iu);
  await mkdir(path.dirname(path.join(productionRoot, technicalLocator)), {recursive: true});
  const previewLocator = '05-delivery/canary-preview.mp4';
  await writeFile(path.join(productionRoot, previewLocator), 'CANARY PREVIEW');
  const technical = {
    schemaVersion: '1.0.0', status: 'passed', planIdentity: plan.identity,
    shotIds: canaryShotIds,
    canaryPreview: {locator: previewLocator, sha256: await hashFile(path.join(productionRoot, previewLocator)), fullDecode: 'passed'},
    checks: {directRuntimeRender: 'passed', fullDecode: 'passed', sixFrameSheets: 'passed', builderViews: 'passed'},
    contractBindings: canaryShotIds.map((shotId) => ({
      shotId, contractLocator: `05-delivery/shots/${shotId}.shot-media.json`, contractSha256: 'c'.repeat(64),
      mediaSha256: 'a'.repeat(64), semanticCheckSha256: 'b'.repeat(64), sourceIdentity: `sha256:${'d'.repeat(64)}`,
    })),
    viewReceiptBindings: [{assignmentId: 'U001', locator: '03-build/U001/view-receipt.json', sha256: 'e'.repeat(64)}],
  };
  technical.identity = `sha256:${createHash('sha256').update(canonicalJson(technical)).digest('hex')}`;
  await writeFile(path.join(productionRoot, technicalLocator), `${JSON.stringify(technical)}\n`);
  await assert.rejects(
    validateCanaryTechnicalGate({plan, productionRoot, verifyPlanInputs: fixturePlanVerification}),
    /contract|media|semantic|receipt|handoff/iu,
    'a self-consistent gate with invented hashes and missing files must not unlock production',
  );
  await assert.rejects(
    resolveCanaryRenderShotIds({
      plan, assignment: fullAssignment, productionRoot, verifyPlanInputs: fixturePlanVerification,
    }),
    /contract|media|semantic|receipt|handoff/iu,
  );
});

test('canary gate reopens every contract, media, sheet, receipt, and handoff instead of trusting declared hashes', async (t) => {
  const value = await validCanaryClosure(t);
  const validate = () => validateCanaryTechnicalGate({
    plan: value.plan, productionRoot: value.productionRoot,
    recipesDirectory: value.recipesDirectory, runner: value.runner,
    verifyPlanInputs: fixturePlanVerification,
  });
  assert.equal((await validate()).creativeChecks.lowLevelErrors, 0);
  const contractBinding = value.technical.contractBindings[0];
  const targets = [
    [path.join(value.productionRoot, contractBinding.contractLocator), /contract hash/iu],
    [path.join(value.productionRoot, '05-delivery', 'shots', '001-S01.mp4'), /media hash/iu],
    [path.join(value.productionRoot, '05-delivery', 'checks', '001-S01.semantic-check.png'), /semantic check/iu],
    [path.join(value.productionRoot, value.technical.viewReceiptBindings.at(-1).locator), /receipt|valid JSON/iu],
  ];
  for (const [file, pattern] of targets) {
    const original = await readFile(file);
    await writeFile(file, Buffer.concat([original, Buffer.from('tampered')]));
    await assert.rejects(validate(), pattern);
    await writeFile(file, original);
  }
  const handoffFile = path.join(value.productionRoot, value.assignment.output.handoff);
  const handoff = await readFile(handoffFile);
  await rm(handoffFile);
  await assert.rejects(validate(), /handoff|valid JSON/iu);
  await writeFile(handoffFile, handoff);
  assert.equal((await validate()).creativeChecks.compositionFamilies, 3);
  await writeFile(
    path.join(value.productionRoot, value.assignment.output.viewReceipt),
    '{"later":"full-production receipt may replace the live path"}\n',
  );
  assert.equal((await validate()).status, 'passed', 'immutable canary receipt snapshot must survive the full-production view loop');
});

test('canary creative closure enforces composition, material, signature-motion, and 45-minute thresholds', async (t) => {
  const cases = [
    [{compositionCount: 2}, /three distinct composition/iu],
    [{materialCount: 1}, /two real-or-generated material/iu],
    [{signatureMotionCount: 1}, /two visible signature motions/iu],
    [{wallTimeMinutes: 46}, /45 minutes/iu],
  ];
  for (const [options, pattern] of cases) {
    const value = await validCanaryClosure(t, options);
    await assert.rejects(validateCanaryTechnicalGate({
      plan: value.plan, productionRoot: value.productionRoot,
      recipesDirectory: value.recipesDirectory, runner: value.runner,
      verifyPlanInputs: fixturePlanVerification,
    }), pattern);
  }
});

test('a canary representative shot requires the Lead receipt and cannot be impersonated by one Builder receipt', async (t) => {
  const value = await validCanaryClosure(t, {includeLead: true});
  assert.equal((await validateCanaryTechnicalGate({
    plan: value.plan, productionRoot: value.productionRoot,
    recipesDirectory: value.recipesDirectory, runner: value.runner,
    verifyPlanInputs: fixturePlanVerification,
  })).status, 'passed');
  const forged = structuredClone(value.technical);
  forged.viewReceiptBindings = forged.viewReceiptBindings.filter(({assignmentId}) => assignmentId !== 'L001');
  forged.identity = gateIdentity(forged);
  await writeFile(
    path.join(value.productionRoot, value.plan.canaryGate.technicalLocator),
    `${JSON.stringify(forged)}\n`,
  );
  await assert.rejects(validateCanaryTechnicalGate({
    plan: value.plan, productionRoot: value.productionRoot,
    recipesDirectory: value.recipesDirectory, runner: value.runner,
    verifyPlanInputs: fixturePlanVerification,
  }), /Lead\/Builder receipt|Lead.*view owner/iu);
});

test('Parent user-decision command records an explicit 3-of-5 result and never manufactures approval', async (t) => {
  const {productionRoot, plan, planFile, recipesDirectory, technical, runner} = await validCanaryClosure(t);
  const {userDecisionLocator} = plan.canaryGate;
  const canaryShotIds = plan.canaryGate.shotIds;
  await assert.rejects(readFile(path.join(productionRoot, userDecisionLocator)), {code: 'ENOENT'});

  const decisionsFile = path.join(productionRoot, 'explicit-user-decisions.json');
  const decisions = canaryShotIds.map((shotId, index) => ({
    shotId, choice: index < 3 ? 'ours' : 'comparison', accepted: index < 3,
    issue: index < 3 ? null : 'Comparison was clearer for this local relationship.',
  }));
  await writeFile(decisionsFile, `${JSON.stringify({decisions: decisions.map((item, index) => (
    index === 2 ? {...item, choice: 'comparison', accepted: false, issue: 'Comparison was clearer.'} : item
  ))})}\n`);
  await assert.rejects(
    recordCanaryUserDecision({
      planFile, productionRoot, recipesDirectory, decisionsFile, runner,
      verifyPlanInputs: fixturePlanVerification,
    }),
    /fewer than 3 of 5/iu,
  );
  await assert.rejects(readFile(path.join(productionRoot, userDecisionLocator)), {code: 'ENOENT'});

  await writeFile(decisionsFile, `${JSON.stringify({decisions})}\n`);
  const result = await recordCanaryUserDecision({
    planFile, productionRoot, recipesDirectory, decisionsFile, runner,
    verifyPlanInputs: fixturePlanVerification,
  });
  assert.equal(result.oursPreferred, 3);
  const recorded = JSON.parse(await readFile(path.join(productionRoot, userDecisionLocator), 'utf8'));
  assert.equal(recorded.technicalGateIdentity, technical.identity);
  assert.equal(recorded.oursPreferred, 3);
  assert.equal((await validateCanaryReleaseGate(plan, {
    productionRoot, canaryTechnicalGate: technical, canaryUserDecision: recorded,
  })).status, 'passed');
  const continuation = {
    assignmentId: 'U002', shotIds: ['S07'],
    canaryPhase: {
      gateLocator: plan.canaryGate.technicalLocator,
      userDecisionLocator: plan.canaryGate.userDecisionLocator,
      mode: 'canary-first', shotIds: ['S07'], deferredShotIds: ['S08', 'S10'],
    },
  };
  assert.deepEqual(await resolveCanaryRenderShotIds({
    plan, assignment: continuation, productionRoot, recipesDirectory, runner,
    verifyPlanInputs: fixturePlanVerification,
  }), ['S08', 'S10'], 'full production must consume deferredShotIds, not reuse top-level canary shotIds');
});

test('passing backend inspection is compact and does not require inspection source, trace, or diagnostics', async (t) => {
  const productionRoot = await temporaryRoot(t);
  const sourceRoot = path.join(productionRoot, '03-build', 'U001', 'source');
  await mkdir(path.join(sourceRoot, 'src'), {recursive: true});
  await writeFile(path.join(sourceRoot, 'src', 'index.tsx'), 'export const Scene = () => null;\n');
  const assignment = {assignmentId: 'U001', unitId: 'U001', runtime: 'remotion', shotIds: ['S01']};
  assert.equal(shouldRunRuntimeInspection({schemaVersion: '4.0.0'}), false);
  assert.equal(shouldRunRuntimeInspection({schemaVersion: '3.0.0'}), true);
  let inspectionCalls = 0;
  const skipped = await runInspectionForPlan({
    plan: {schemaVersion: '4.0.0'}, inspectionOptions: {},
    inspectRuntime: async () => { inspectionCalls += 1; return {status: 'pass'}; },
  });
  assert.equal(skipped, null);
  assert.equal(inspectionCalls, 0, 'v4 Creative Loop must not invoke legacy inspection at all');
  const receipt = await inspectAssignmentRuntime({
    assignment, plan: {identity: 'plan-identity'}, recipesDirectory: path.join(productionRoot, 'recipes'),
    sourceRoot, sourceIdentity: `sha256:${'a'.repeat(64)}`, productionRoot,
  });
  assert.deepEqual(receipt, {
    status: 'pass', adapter: 'deterministic-media-contract', assignmentId: 'U001',
    sourceIdentity: `sha256:${'a'.repeat(64)}`,
  });
  await assert.rejects(readFile(path.join(productionRoot, '05-delivery', 'checks', 'U001.motion-layout-trace.json')), {code: 'ENOENT'});
  await assert.rejects(readFile(path.join(sourceRoot, 'src', 'inspection.tsx')), {code: 'ENOENT'});

  const checks = path.join(productionRoot, '05-delivery', 'checks');
  await mkdir(path.join(checks, 'U001-diagnostics'), {recursive: true});
  await Promise.all([
    writeFile(path.join(checks, 'U001.motion-layout-trace.json'), '{"dense":true}\n'),
    writeFile(path.join(checks, 'U001.motion-layout-metadata.json'), '{"dense":true}\n'),
    writeFile(path.join(checks, 'U001-diagnostics', 'frame.png'), 'diagnostic'),
  ]);
  const failureFile = await writeMinimalFailureEvidence({
    productionRoot, assignment, sourceIdentity: receipt.sourceIdentity, error: new Error('S01 decode failed\nlong stack omitted'),
  });
  const failure = JSON.parse(await readFile(failureFile, 'utf8'));
  assert.deepEqual(Object.keys(failure), [
    'schemaVersion', 'status', 'assignmentId', 'shotId', 'window', 'problemType', 'message', 'sourceIdentity',
  ]);
  await assert.rejects(readFile(path.join(checks, 'U001.motion-layout-trace.json')), {code: 'ENOENT'});
  await assert.rejects(readFile(path.join(checks, 'U001.motion-layout-metadata.json')), {code: 'ENOENT'});
  await clearMinimalFailureEvidence({productionRoot, assignment});
  await assert.rejects(readFile(failureFile), {code: 'ENOENT'});
});
