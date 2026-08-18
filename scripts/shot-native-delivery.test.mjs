import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { renderAssignedShots } from '../erduo-broll-loop-engineering/scripts/render-assigned-shots.mjs';
import { validateShotMedia } from '../erduo-broll-loop-engineering/scripts/validate-shot-media.mjs';
import { assembleShotPreview } from '../erduo-broll-loop-engineering/scripts/assemble-shot-preview.mjs';
import { canonicalJson, validateSchemaValue } from '../erduo-broll-loop-engineering/scripts/runtime-schema-validator.mjs';
import { runCommand } from '../erduo-broll-loop-engineering/scripts/shot-media-lib.mjs';
import { writeProductionPlan } from '../erduo-broll-loop-engineering/scripts/plan-runtime.mjs';
import { computeRepresentativeScenesIdentity } from '../erduo-broll-loop-engineering/scripts/validate-runtime-plan.mjs';
import { prepareSharedToolchain } from '../erduo-broll-loop-engineering/scripts/remotion-toolchain.mjs';
import { inspectAssignmentRuntime } from '../erduo-broll-loop-engineering/scripts/backend-inspection.mjs';

const root = path.resolve(import.meta.dirname, '..');
const runtimeSchemas = path.join(root, 'erduo-broll-loop-engineering', 'references', 'runtime');

function sha(value) {
  return createHash('sha256').update(value).digest('hex');
}

function probePayload({ durationMs, frameCount, width = 640, height = 360 }) {
  return JSON.stringify({
    streams: [{
      codec_type: 'video', codec_name: 'h264', width, height,
      avg_frame_rate: '30/1', pix_fmt: 'yuv420p', nb_read_frames: String(frameCount),
      start_time: '0',
    }],
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: String(durationMs / 1000), start_time: '0' },
  });
}

async function fixture(t, { runtime = 'hyperframes' } = {}) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'shot-native-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const productionRoot = path.join(base, 'broll-production');
  const recipesDirectory = path.join(productionRoot, '01-director', 'shot-recipes');
  const sourceRoot = path.join(productionRoot, '04-visual-lock', runtime, 'shared-source');
  const deliveryRoot = path.join(productionRoot, '05-delivery');
  const assetsRoot = path.join(productionRoot, '02-assets');
  await Promise.all([
    mkdir(recipesDirectory, { recursive: true }),
    mkdir(sourceRoot, { recursive: true }),
    mkdir(deliveryRoot, { recursive: true }),
    mkdir(assetsRoot, { recursive: true }),
  ]);
  await writeFile(path.join(assetsRoot, 'fixture-font.woff2'), 'fixture-font');
  const profileIdentity = sha('profile');
  const shots = [
    { shotId: 'S01', window: { startMs: 0, endMs: 1000 }, runtime },
    { shotId: 'S02', window: { startMs: 1000, endMs: 2000 }, runtime },
    { shotId: 'S03', window: { startMs: 2000, endMs: 3000 }, runtime },
  ];
  const narrativeEnvelopeFile = path.join(productionRoot, '01-director', 'narrative-envelope.json');
  const visualSystemFile = path.join(productionRoot, '01-director', 'visual-system.json');
  const representativeScenesFile = path.join(productionRoot, '01-director', 'representative-scenes.json');
  const motionMapFile = path.join(productionRoot, '01-director', 'motion-map.json');
  const selectionFile = path.join(productionRoot, 'runtime-selection.json');
  await writeFile(narrativeEnvelopeFile, `${JSON.stringify({
    schemaVersion: '1.0.0', filmId: 'shot-native-fixture', window: { startMs: 0, endMs: 3000 },
    premise: 'Prove direct shot delivery.', audienceJourney: ['understand'],
    chapters: [{ chapterId: 'C01', window: { startMs: 0, endMs: 3000 }, purpose: 'Prove delivery.' }], terms: [],
  })}\n`);
  await writeFile(visualSystemFile, `${JSON.stringify({
    schemaVersion: '1.0.0', conceptAngle: 'Three direct relationships', visualWorld: 'Fixture world',
    paletteRoles: [{ role: 'field', value: '#fff', use: 'background' }, { role: 'ink', value: '#111', use: 'focus' }],
    typographyRoles: [{ role: 'display', family: 'Fixture Sans', weight: '700', use: 'focus', sourceLocator: '02-assets/font.woff2' }],
    materials: ['paper'], depthPlan: { background: 'field', midground: 'evidence', foreground: 'focus' },
    compositionFamilies: ['full-bleed-material', 'data-diagram-evidence', 'sparse-hold-chapter-outro'],
    motifSemantics: [], rhythmCurve: [{ startMs: 0, endMs: 3000, character: 'develop' }],
    prohibitedLazyDefaults: ['generic cards'], safeAreaPolicy: 'Keep text inside safe area.',
  })}\n`);
  await writeFile(selectionFile, `${JSON.stringify({
    schemaVersion: '2.0.0', status: 'selected', selectedRuntime: runtime, selectionSource: 'explicit',
  })}\n`);
  for (const shot of shots) {
    const index = shots.indexOf(shot);
    const compositionFamily = ['full-bleed-material', 'data-diagram-evidence', 'sparse-hold-chapter-outro'][index];
    const capabilities = ['semantic.integer-ms-window', 'semantic.visual-state-transition', 'semantic.readable-hold'];
    await writeFile(path.join(recipesDirectory, `${shot.shotId}.json`), `${JSON.stringify({
      schemaVersion: '3.0.0', shotId: shot.shotId, window: shot.window, cueIds: [`cue-${index + 1}`],
      audienceUnderstanding: `Understand ${shot.shotId}.`, visualJob: `Show ${shot.shotId}.`, focus: shot.shotId,
      keyStates: { start: 'Absent.', turn: 'Changes.', result: 'Resolved.', hold: 'Readable.' },
      elementLifecycles: [{ elementId: 'hero', enter: 'Enters.', hold: 'Holds.', destination: 'retain', reason: 'Result.' }],
      compositionFamily,
      heroFrame: { relationship: 'Hero resolves.', layers: { background: 'field', midground: 'hero', foreground: 'focus' } },
      microBeats: [{ beatId: 'b1', startMs: shot.window.startMs, endMs: shot.window.endMs, primaryFocus: shot.shotId, visibleState: 'Resolved.', change: 'relationship', development: 'Relationship resolves.' }],
      materialNeeds: [], requiredCapabilities: capabilities,
      capabilityReasons: capabilities.map((capabilityId) => ({ capabilityId, contentReason: `${shot.shotId} needs ${capabilityId}.` })),
      readableHold: { startMs: Math.max(shot.window.startMs, shot.window.endMs - 400), endMs: shot.window.endMs, items: [] },
      neighborHandoff: { incoming: 'cut', outgoing: 'cut' },
    })}\n`);
    if (runtime === 'hyperframes') {
      await mkdir(path.join(sourceRoot, 'compositions'), { recursive: true });
      await writeFile(path.join(sourceRoot, 'compositions', `${shot.shotId}.html`), `<html data-shot="${shot.shotId}"></html>\n`);
    }
  }
  const representativeScenes = {
    schemaVersion: '1.0.0', scenes: [
      { shotId: 'S01', coverage: 'opening', reason: 'Opening.', concerns: ['composition', 'material'] },
      { shotId: 'S02', coverage: 'information-dense', reason: 'Information.', concerns: ['text'] },
      { shotId: 'S03', coverage: 'late', reason: 'Closure.', concerns: ['motion'] },
    ], identity: '',
  };
  representativeScenes.identity = computeRepresentativeScenesIdentity(representativeScenes);
  await writeFile(representativeScenesFile, `${JSON.stringify(representativeScenes)}\n`);
  const motionMap = {
    schemaVersion: '1.0.0', shots: shots.map((shot, index) => ({
      shotId: shot.shotId, contentRelation: ['compare', 'process', 'state-change'][index],
      primaryAction: `Resolve ${shot.shotId}.`, compositionFamily: ['full-bleed-material', 'data-diagram-evidence', 'sparse-hold-chapter-outro'][index],
      entryFamily: `entry-${index + 1}`, rhythm: ['calm', 'progressive', 'impact'][index], settleMs: 200,
    })), identity: '',
  };
  motionMap.identity = sha(canonicalJson({ schemaVersion: motionMap.schemaVersion, shots: motionMap.shots }));
  await writeFile(motionMapFile, `${JSON.stringify(motionMap)}\n`);
  const planned = await writeProductionPlan({
    productionRoot, recipesDirectory, selectionFile, narrativeEnvelopeFile, visualSystemFile,
    representativeScenesFile, motionMapFile,
    productionProfile: {
      schemaVersion: '1.0.0', raster: runtime === 'remotion' ? { width: 320, height: 180 } : { width: 640, height: 360 }, fps: { numerator: 30, denominator: 1 },
      mezzanine: { container: 'mp4', codec: 'h264', encoder: 'libx264', pixelFormat: 'yuv420p', class: 'visually-lossless', preset: 'medium', crf: 12, gopFrames: 60, keyframeScenecut: false, upgradeReason: null, color: { space: 'bt709', transfer: 'bt709', primaries: 'bt709', range: 'tv' }, audio: { policy: 'silent', streams: 0, codec: null, sampleRate: null, channels: null } },
      master: { container: 'mp4', codec: 'h264', encoder: 'libx264', pixelFormat: 'yuv420p', preset: 'medium', crf: 16, fastStart: true, color: { space: 'bt709', transfer: 'bt709', primaries: 'bt709', range: 'tv' }, audio: { policy: 'silent', streams: 0, codec: null, sampleRate: null, channels: null } },
    },
  });
  const planFile = path.join(productionRoot, '01-runtime-plan', 'runtime-plan.json');
  const assignmentLocator = planned.assignments.find((locator) => /\/U001\.json$/u.test(locator))
    ?? planned.assignments.find((locator) => /\/L001\.json$/u.test(locator));
  if (!assignmentLocator) throw new Error(`fixture planning failed: ${JSON.stringify({ status: planned.plan.status, assignments: planned.assignments })}`);
  const assignmentFile = path.join(productionRoot, assignmentLocator);
  if (runtime === 'remotion') {
    const remotionFixture = path.join(root, 'scripts', 'fixtures', 'remotion-dom-trace');
    await Promise.all([
      ...['package.json', 'package-lock.json', 'tsconfig.json'].map((file) => cp(path.join(remotionFixture, file), path.join(sourceRoot, file))),
      cp(path.join(remotionFixture, 'src'), path.join(sourceRoot, 'src'), { recursive: true }),
    ]);
    const rootFile = path.join(sourceRoot, 'src', 'root.tsx');
    const cleanRoot = (await readFile(rootFile, 'utf8')).replace(
      /\sdata-erduo-(?:trace-id|role|focus-group|layer|visual-weight|motions)=(?:"[^"]*"|'[^']*')/gu,
      '',
    );
    await Promise.all([
      writeFile(rootFile, cleanRoot),
      rm(path.join(sourceRoot, 'src', 'inspection.tsx'), { force: true }),
    ]);
  }
  const sourceFiles = runtime === 'hyperframes'
    ? ['compositions/S01.html', 'compositions/S02.html', 'compositions/S03.html']
    : ['package.json', 'package-lock.json', 'tsconfig.json', 'src/index.tsx', 'src/root.tsx'];
  const sourceManifest = {
    schemaVersion: '1.0.0', root: 'shared-source', files: await Promise.all(sourceFiles.map(async (file) => ({
      path: file, sha256: sha(await readFile(path.join(sourceRoot, file))),
    }))),
  };
  const sourceManifestFile = path.join(path.dirname(sourceRoot), 'source-manifest.json');
  await writeFile(sourceManifestFile, `${JSON.stringify(sourceManifest)}\n`);
  return {
    assignmentFile, deliveryRoot, planFile, productionRoot, recipesDirectory,
    sourceManifestFile, sourceRoot, shots,
    inspectRuntime: async () => ({ status: 'pass', adapter: 'controlled-runtime-inspection' }),
  };
}

function controlledRunner({ facts = new Map(), calls = [], failDecodeShot = null } = {}) {
  return async ({ executable, args }) => {
    calls.push({ executable, args: [...args] });
    const output = path.resolve(args.at(-1));
    if (executable === 'hyperframes') {
      assert.equal(args[0], 'render');
      assert.match(args[args.indexOf('--composition') + 1], /compositions\/S0[123]\.html$/u);
      assert.ok(!args.some((value) => /master|unit-media|trim|ss|to=/iu.test(value)));
      const shotId = /S0[123]/u.exec(args.join(' '))[0];
      const durationMs = 1000;
      const frameCount = 30;
      await writeFile(output, Buffer.from(`DIRECT-${shotId}`));
      facts.set(output, { durationMs, frameCount });
      return { code: 0, stdout: '', stderr: '' };
    }
    if (executable === 'ffprobe') {
      const media = facts.get(output);
      return media
        ? { code: 0, stdout: probePayload(media), stderr: '' }
        : { code: 1, stdout: '', stderr: 'unknown media' };
    }
    if (executable === 'ffmpeg' && args.some((value) => /tile=3x2/u.test(value))) {
      const input = path.resolve(args[args.indexOf('-i') + 1]);
      assert.ok(/\/shots\/[0-9]{3}-S0[123]\.mp4$/u.test(input), 'semantic sheet must sample its own shot media');
      await writeFile(output, Buffer.from(`SEMANTIC-SHEET-${path.basename(input)}`));
      return { code: 0, stdout: '', stderr: '' };
    }
    if (executable === 'ffmpeg' && args.includes('null')) {
      const input = path.resolve(args[args.indexOf('-i') + 1]);
      const failing = failDecodeShot && input.includes(failDecodeShot);
      return failing
        ? { code: 1, stdout: '', stderr: 'controlled decode failure' }
        : { code: 0, stdout: '', stderr: '' };
    }
    if (executable === 'ffmpeg' && args.includes('concat')) {
      await writeFile(output, Buffer.from('SHOT-ONLY-PREVIEW'));
      facts.set(output, { durationMs: 3000, frameCount: 90, width: 640, height: 360 });
      return { code: 0, stdout: '', stderr: '' };
    }
    return { code: 1, stdout: '', stderr: `unexpected ${executable} ${args.join(' ')}` };
  };
}

test('shot media and delivery index schemas reject cropped provenance', async () => {
  const shotSchema = JSON.parse(await readFile(path.join(runtimeSchemas, 'shot-media.schema.json'), 'utf8'));
  const indexSchema = JSON.parse(await readFile(path.join(runtimeSchemas, 'delivery-index.schema.json'), 'utf8'));
  const invalidErrors = validateSchemaValue({
    schemaVersion: '1.0.0', order: 1, shotId: 'S01', unitId: 'U001',
    srtWindowMs: { start: 0, end: 1000 }, localTimeline: { startFrame: 0, frameCount: 30 },
    backend: 'hyperframes', renderTarget: { id: 'S01', mode: 'master-crop' },
    sourceIdentity: `sha256:${sha('source')}`, recipeIdentity: `sha256:${sha('recipe')}`,
    profileIdentity: `sha256:${sha('profile')}`,
    media: { path: 'shots/001-S01.mp4', durationMs: 1000, width: 640, height: 360, fps: 30, codec: 'h264', sha256: sha('media'), fullDecode: 'passed' },
  }, shotSchema, shotSchema);
  assert.match(invalidErrors.join('\n'), /renderTarget\/mode|direct-runtime-render|must equal/u);
  assert.deepEqual(validateSchemaValue({
    schemaVersion: '1.0.0', shots: [{ order: 1, shotId: 'S01', file: 'shots/001-S01.mp4', contract: 'shots/001-S01.shot-media.json', srtWindowMs: { start: 0, end: 1000 }, previousShotId: null, nextShotId: null, seamType: 'cut' }],
  }, indexSchema, indexSchema), []);
});

test('renderer invokes one native shot target and verifies one complete media file per Recipe', async (t) => {
  const value = await fixture(t);
  const calls = [];
  const runner = controlledRunner({ calls });
  await rm(value.sourceManifestFile);
  const result = await renderAssignedShots({
    ...value, sourceManifestFile: undefined, runner, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe',
  });
  assert.equal(result.status, 'shots-ready');
  assert.equal(result.shots, 3);
  assert.equal(calls.filter(({ executable }) => executable === 'hyperframes').length, 3);
  assert.equal(calls.filter(({ executable }) => executable === 'ffprobe').length, 3);
  assert.equal(calls.filter(({ executable, args }) => executable === 'ffmpeg' && args.includes('null')).length, 3);
  const semanticCalls = calls.filter(({ executable, args }) => executable === 'ffmpeg' && args.some((value) => /tile=3x2/u.test(value)));
  assert.equal(semanticCalls.length, 3);
  const contracts = await Promise.all(result.contractFiles.map((file) => readFile(file, 'utf8').then(JSON.parse)));
  assert.deepEqual(contracts.map(({ renderTarget, localTimeline }) => ({ renderTarget, localTimeline })), [
    { renderTarget: { id: 'S01', mode: 'direct-runtime-render' }, localTimeline: { startFrame: 0, frameCount: 30 } },
    { renderTarget: { id: 'S02', mode: 'direct-runtime-render' }, localTimeline: { startFrame: 0, frameCount: 30 } },
    { renderTarget: { id: 'S03', mode: 'direct-runtime-render' }, localTimeline: { startFrame: 0, frameCount: 30 } },
  ]);
  for (const contract of contracts) {
    assert.deepEqual(contract.semanticCheck.samples.map(({ role }) => role), [
      'opening', 'preparation', 'action-a', 'action-b', 'result', 'settle-tail',
    ]);
    assert.equal(contract.semanticCheck.samples.length, 6);
    assert.equal(contract.semanticCheck.sourceMedia, contract.media.path);
  }
  assert.equal(result.deliveryIndex, path.join(value.deliveryRoot, 'delivery-index.json'));
  assert.equal(result.sourceManifest, value.sourceManifestFile);
  const validation = await validateShotMedia({ ...value, runner, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' });
  assert.equal(validation.status, 'valid');
  assert.equal(validation.shots, 3);
});

test('Parent generates source identity and refuses a production unit self-built evidence tool', async (t) => {
  const value = await fixture(t);
  await writeFile(path.join(value.sourceRoot, 'capture-proof.mjs'), 'export default true;\n');
  await assert.rejects(
    renderAssignedShots({ ...value, sourceManifestFile: undefined, runner: controlledRunner(), ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' }),
    /forbidden self-built evidence tool.*capture-proof\.mjs/u,
  );
});

test('Parent refreshes its generated source manifest after a concrete pre-render source repair', async (t) => {
  const value = await fixture(t);
  await rm(value.sourceManifestFile);
  const firstRunner = async (call) => {
    if (call.executable === 'hyperframes') return { code: 1, stdout: '', stderr: 'controlled first render failure' };
    return controlledRunner()(call);
  };
  await assert.rejects(
    renderAssignedShots({ ...value, sourceManifestFile: undefined, runner: firstRunner, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' }),
    /controlled first render failure/u,
  );
  const firstManifest = await readFile(value.sourceManifestFile, 'utf8');
  await writeFile(path.join(value.sourceRoot, 'compositions', 'S01.html'), '<main>repaired S01</main>\n');
  const result = await renderAssignedShots({
    ...value, sourceManifestFile: undefined, runner: controlledRunner(), ffmpeg: 'ffmpeg', ffprobe: 'ffprobe',
  });
  assert.equal(result.status, 'shots-ready');
  assert.notEqual(await readFile(value.sourceManifestFile, 'utf8'), firstManifest);
});

test('renderer rejects a hand-edited runtime plan whose validated identity no longer matches', async (t) => {
  const value = await fixture(t);
  const plan = JSON.parse(await readFile(value.planFile, 'utf8'));
  plan.shots[0].selectionReason = 'hand-edited after planning';
  await writeFile(value.planFile, `${JSON.stringify(plan)}\n`);
  await assert.rejects(
    renderAssignedShots({ ...value, runner: controlledRunner(), ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' }),
    /identity.*does not match|aggregate does not match plan contents/iu,
  );
});

test('failed shot resumes in place while completed verified shots are safely skipped', async (t) => {
  const value = await fixture(t);
  const facts = new Map();
  await assert.rejects(
    renderAssignedShots({
      ...value, runner: controlledRunner({ facts, failDecodeShot: 'S02' }), ffmpeg: 'ffmpeg', ffprobe: 'ffprobe',
    }),
    /S02.*full decode/iu,
  );
  const calls = [];
  const resumed = await renderAssignedShots({
    ...value, runner: controlledRunner({ calls, facts }), ffmpeg: 'ffmpeg', ffprobe: 'ffprobe',
  });
  assert.equal(resumed.status, 'shots-ready');
  assert.equal(calls.filter(({ executable }) => executable === 'hyperframes').length, 2);
  assert.ok(calls.filter(({ executable }) => executable === 'hyperframes')
    .every(({ args }) => !args.join(' ').includes('S01')));
});

test('recovery rejects partial artifacts instead of overwriting or trusting them', async (t) => {
  const value = await fixture(t);
  const partial = path.join(value.deliveryRoot, 'shots', '001-S01.mp4');
  await mkdir(path.dirname(partial), { recursive: true });
  await writeFile(partial, 'unbound media');
  await assert.rejects(
    renderAssignedShots({ ...value, runner: controlledRunner(), ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' }),
    /S01 has partial or conflicting recovery artifacts/u,
  );
});

test('a failed full decode prevents both delivery index and preview', async (t) => {
  const value = await fixture(t);
  const runner = controlledRunner({ failDecodeShot: 'S02' });
  await assert.rejects(
    renderAssignedShots({ ...value, runner, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' }),
    /S02.*full decode|full decode.*S02/iu,
  );
  await assert.rejects(readFile(path.join(value.deliveryRoot, 'delivery-index.json')), { code: 'ENOENT' });
});

test('HyperFrames Parent inspection uses the official semantic-boundary check without claiming geometry', async (t) => {
  const value = await fixture(t);
  const [assignment, plan] = await Promise.all([
    readFile(value.assignmentFile, 'utf8').then(JSON.parse),
    readFile(value.planFile, 'utf8').then(JSON.parse),
  ]);
  const calls = [];
  const receipt = await inspectAssignmentRuntime({
    assignment, plan, recipesDirectory: value.recipesDirectory,
    sourceRoot: value.sourceRoot, sourceIdentity: `sha256:${sha('hyperframes-source')}`,
    productionRoot: value.productionRoot, hyperframes: 'project-hyperframes',
    runner: async (command) => {
      calls.push(command);
      return { code: 0, stdout: JSON.stringify({ ok: true, layout: { findings: [] } }), stderr: '' };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].executable, 'project-hyperframes');
  assert.deepEqual(calls[0].args.slice(0, 3), ['check', '--json', '--at']);
  assert.ok(calls[0].args.includes('--at-transitions'));
  assert.equal(calls[0].cwd, value.sourceRoot);
  assert.equal(receipt.adapter, 'hyperframes-check');
  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.sampledAtSeconds.length, 18);
  assert.deepEqual(assignment.runtimeInspection.traceLocator, null);
  assert.deepEqual(assignment.runtimeInspection.metadataLocator, null);
  assert.equal(Object.hasOwn(receipt, 'trace'), false);
});

test('preview validates contracts, then concatenates only indexed shot media', async (t) => {
  const value = await fixture(t);
  const calls = [];
  const facts = new Map();
  const runner = controlledRunner({ calls, facts });
  await renderAssignedShots({ ...value, runner, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' });
  calls.length = 0;
  const outputFile = path.join(value.deliveryRoot, 'preview.mp4');
  const result = await assembleShotPreview({ ...value, outputFile, runner, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' });
  assert.equal(result.status, 'preview-ready');
  const concat = calls.find(({ executable, args }) => executable === 'ffmpeg' && args.includes('concat'));
  assert.ok(concat, 'preview must use concat over validated shots');
  assert.ok(!concat.args.some((value) => /master|unit-media/iu.test(value)));
  assert.equal(await readFile(outputFile, 'utf8'), 'SHOT-ONLY-PREVIEW');
});

test('real FFmpeg fixture decodes every direct shot, creates six-frame sheets, and assembles preview', async (t) => {
  const value = await fixture(t);
  const realRunner = async (command) => {
    if (command.executable !== 'hyperframes') return runCommand(command);
    const output = command.args.at(-1);
    const shotId = /S0[123]/u.exec(command.args.join(' '))[0];
    const frames = 30;
    const color = shotId === 'S01' ? '0x17324d' : shotId === 'S02' ? '0x7a3b2e' : '0x365f3e';
    return runCommand({
      executable: 'ffmpeg', cwd: command.cwd,
      args: [
        '-v', 'error', '-nostdin', '-f', 'lavfi', '-i', `color=${color}:s=640x360:r=30`,
        '-an', '-frames:v', String(frames), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', output,
      ],
    });
  };
  const rendered = await renderAssignedShots({
    ...value, runner: realRunner, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe',
  });
  assert.equal(rendered.shots, 3);
  const preview = await assembleShotPreview({
    ...value, outputFile: path.join(value.deliveryRoot, 'real-preview.mp4'),
    runner: realRunner, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe',
  });
  assert.equal(preview.status, 'preview-ready');
  assert.equal(preview.mediaFacts.frameCount, 90);
});

test('real Remotion canary uses production source and the same shot contract/validate/preview chain', { timeout: 180_000 }, async (t) => {
  const remotionFixture = path.join(root, 'scripts', 'fixtures', 'remotion-dom-trace');
  try {
    await Promise.all([
      access(path.join(remotionFixture, 'node_modules', '.bin', 'remotion')),
      access(path.join(remotionFixture, 'node_modules', '.bin', 'tsc')),
    ]);
  } catch {
    const installed = await runCommand({
      executable: 'npm', cwd: remotionFixture,
      args: ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--registry', 'https://registry.npmjs.org'],
    });
    assert.equal(installed.code, 0, installed.stderr);
  }
  const value = await fixture(t, { runtime: 'remotion' });
  const assignment = JSON.parse(await readFile(value.assignmentFile, 'utf8'));
  assert.equal(assignment.sourceRoot, '04-visual-lock/remotion/shared-source');
  for (const literal of [
    'src/inspection.tsx', 'erduoInspectionCompositions: Record<string, React.ComponentType>',
    'keyed exactly by assigned shotIds', 'data-erduo-trace-id',
    'primary|secondary|text|structural|decorative', 'startFrame,endFrame', 'beatIds',
    'Parent owns offsets, harness, trace, and lint',
  ]) assert.equal(assignment.rolePrompt.includes(literal), false, `assignment must not require proof instrumentation: ${literal}`);
  await rm(value.sourceManifestFile);
  const prepare = (args) => prepareSharedToolchain({
    ...args,
    install: async ({ cwd }) => {
      await symlink(await realpath(path.join(remotionFixture, 'node_modules')), path.join(cwd, 'node_modules'));
    },
  });
  const rendered = await renderAssignedShots({
    ...value, sourceManifestFile: undefined, prepareRemotionToolchain: prepare,
    inspectRuntime: inspectAssignmentRuntime,
    runner: runCommand, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe',
  });
  assert.deepEqual({
    typechecks: rendered.backendReceipt.typecheckRuns,
    bundles: rendered.backendReceipt.bundleRuns,
    renders: rendered.backendReceipt.renderRuns,
  }, { typechecks: 1, bundles: 1, renders: 3 });
  assert.equal(rendered.inspectionReceipt.adapter, 'deterministic-media-contract');
  assert.equal(rendered.inspectionReceipt.status, 'pass');
  assert.equal(Object.hasOwn(rendered.inspectionReceipt, 'trace'), false);
  assert.equal(Object.hasOwn(rendered.inspectionReceipt, 'final'), false);
  const validated = await validateShotMedia({
    ...value, sourceManifestFile: rendered.sourceManifest,
    runner: runCommand, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe',
  });
  assert.equal(validated.shots, 3);
  const preview = await assembleShotPreview({
    ...value, sourceManifestFile: rendered.sourceManifest,
    outputFile: path.join(value.deliveryRoot, 'remotion-preview.mp4'),
    runner: runCommand, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe',
  });
  assert.equal(preview.status, 'preview-ready');
  assert.equal(preview.mediaFacts.frameCount, 90);
});
