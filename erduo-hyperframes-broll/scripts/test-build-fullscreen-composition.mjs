import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { fingerprintValue } from './state.mjs';
import { buildHyperframesTimeline } from './build-hyperframes-timeline.mjs';
import { buildFullscreenComposition, FullscreenCompositionError, motionContract, parseFullscreenArgs, renderFullscreenHtml, runFullscreenCli, writeFullscreenProject } from './build-fullscreen-composition.mjs';

const coverage = {
  schema_version: 1,
  plan_sha256: 'a'.repeat(64),
  briefs_sha256: 'b'.repeat(64),
  timeline: { start_ms: 1000, end_ms: 7000, duration_ms: 6000 },
  shot_count: 2,
  coverage: { complete: true, coverage_basis_points: 10000 },
  windows: [
    { shot_id: 'S001', start_ms: 1000, end_ms: 4000, duration_ms: 3000, primary_compositing: 'fullscreen' },
    { shot_id: 'S002', start_ms: 4000, end_ms: 7000, duration_ms: 3000, primary_compositing: 'native-base-with-overlay' },
  ],
};
const timeline = buildHyperframesTimeline(coverage);

function scene(shotId, durationMs, primary, action = 'route') {
  const core = {
    schema_version: 1,
    shot_id: shotId,
    duration_ms: durationMs,
    route: 'hyperframes-native',
    primary_compositing: primary,
    scene_grammar: 'process-system',
    semantic_type: 'process',
    nodes: [{ node_id: 'N1', role: 'primary', label: 'private subject' }, { node_id: 'N2', role: 'supporting', label: 'private result' }],
    relationship: 'Private words never leave the visual build.',
    action: { verb: action, from_state: 'start', to_state: 'end' },
    final_state: { visible_outcome: 'resolved', hold_intent: 'normal' },
    prohibitions: ['subtitle card'],
  };
  return { ...core, scene_sha256: fingerprintValue(core) };
}
function scenes(overrides = {}) {
  const core = {
    schema_version: 1,
    briefs_sha256: timeline.briefs_sha256,
    scene_count: 2,
    scenes: [scene('S001', 3000, 'fullscreen', overrides.firstAction ?? 'route'), scene('S002', 3000, 'native-base-with-overlay', overrides.secondAction ?? 'transform')],
  };
  return { ...core, scenes_sha256: fingerprintValue(core) };
}
function capture() { let text = ''; return { stream: new Writable({ write(chunk, encoding, done) { text += chunk.toString(); done(); } }), text: () => text }; }

test('builds a full-screen composition with SRT-global root duration and no semantic text', () => {
  const composition = buildFullscreenComposition(timeline, scenes());
  assert.equal(composition.render_mode, 'fullscreen-mp4');
  assert.equal(composition.master_duration_sec, 7);
  assert.deepEqual(composition.clips.map((clip) => [clip.shot_id, clip.start_sec, clip.duration_sec]), [['S001', 1, 3], ['S002', 4, 3]]);
  const html = renderFullscreenHtml(composition);
  assert.match(html, /data-duration="7"/u);
  assert.match(html, /id="S001" class="clip scene action-route"/u);
  assert.equal(html.includes('private subject'), false);
  assert.equal(html.includes('Private words'), false);
  assert.equal(html.includes('/private/'), false);
  assert.deepEqual(motionContract(composition).assertions.map((item) => item.kind), ['keepsMoving', 'staysInFrame', 'staysInFrame']);
});

test('rejects tampering, duration mismatch, and Alpha-only inputs', () => {
  const alteredTimeline = structuredClone(timeline); alteredTimeline.clips[1].master_duration_sec = 4;
  assert.throws(() => buildFullscreenComposition(alteredTimeline, scenes()), (error) => error instanceof FullscreenCompositionError && error.code === 'timeline_tampered');
  const mismatch = scenes(); mismatch.scenes[0].duration_ms = 2999;
  const { scene_sha256, ...sceneCore } = mismatch.scenes[0]; mismatch.scenes[0].scene_sha256 = fingerprintValue(sceneCore);
  const { scenes_sha256, ...scenesCore } = mismatch; mismatch.scenes_sha256 = fingerprintValue(scenesCore);
  assert.throws(() => buildFullscreenComposition(timeline, mismatch), (error) => error.code === 'scene_mismatch');
  const alphaCoverage = structuredClone(coverage); alphaCoverage.windows[0].primary_compositing = 'hard-alpha-over-source';
  const alphaTimeline = buildHyperframesTimeline(alphaCoverage);
  const alphaScenes = scenes(); alphaScenes.briefs_sha256 = alphaTimeline.briefs_sha256; alphaScenes.scenes[0].primary_compositing = 'hard-alpha-over-source';
  const { scene_sha256: alphaHash, ...alphaCore } = alphaScenes.scenes[0]; alphaScenes.scenes[0].scene_sha256 = fingerprintValue({ ...alphaCore, primary_compositing: alphaScenes.scenes[0].primary_compositing });
  const { scenes_sha256: alphaScenesHash, ...alphaScenesCore } = alphaScenes; alphaScenes.scenes_sha256 = fingerprintValue(alphaScenesCore);
  assert.throws(() => buildFullscreenComposition(alphaTimeline, alphaScenes), (error) => error.code === 'not_fullscreen');
});

test('writes a minimal current HyperFrames project only into an empty target', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'broll-fullscreen-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const output = path.join(root, 'project');
  const composition = buildFullscreenComposition(timeline, scenes());
  await writeFullscreenProject(output, composition);
  const [html, motion, packageJson] = await Promise.all([fs.readFile(path.join(output, 'index.html'), 'utf8'), fs.readFile(path.join(output, 'index.motion.json'), 'utf8'), fs.readFile(path.join(output, 'package.json'), 'utf8')]);
  assert.match(html, /data-composition-id="main"/u);
  assert.equal(JSON.parse(motion).duration, 7);
  assert.equal(JSON.parse(packageJson).scripts.check.includes('hyperframes@0.7.64'), true);
  await assert.rejects(() => writeFullscreenProject(output, composition), (error) => error.code === 'output_not_empty');
});

test('CLI keeps output metadata and errors path-free', async () => {
  assert.deepEqual(parseFullscreenArgs(['--help']), { help: true });
  assert.equal(parseFullscreenArgs(['one']).error, true);
  const stdout = capture(); let written = null;
  assert.equal(await runFullscreenCli(['/private/timeline.json', '/private/scenes.json', '/private/output'], { stdout: stdout.stream, readFile: async (file) => file.includes('timeline') ? JSON.stringify(timeline) : JSON.stringify(scenes()), writeProject: async (dir, value) => { written = { dir, value }; } }), 0);
  assert.equal(stdout.text().includes('/private/'), false);
  assert.equal(written.value.composition_sha256.length, 64);
  const stderr = capture();
  assert.equal(await runFullscreenCli(['/private/timeline.json', '/private/scenes.json', '/private/output'], { stderr: stderr.stream, readFile: async () => '{', writeProject: async () => assert.fail() }), 3);
  assert.equal(stderr.text().includes('/private/'), false);
});
