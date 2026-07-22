import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { parseSrt } from './parse-srt.mjs';
import { validateAndNormalizeShotPlan } from './validate-shot-plan.mjs';
import { validateDirectorBriefs } from './validate-director-brief.mjs';
import { indexUserAssets } from './index-user-assets.mjs';
import { parseRouteArgs, routeUserMedia, runRouteCli } from './route-user-assets.mjs';

const execFile = promisify(execFileCallback);

const srt = parseSrt('1\n00:00:00,000 --> 00:00:03,000\nA red gate filters a signal.\n\n2\n00:00:03,000 --> 00:00:06,000\nA documented result appears.');
const plan = validateAndNormalizeShotPlan(srt, { schema_version: 1, srt_sha256: srt.content_sha256, shots: [{ shot_id: 'S001', cue_start: 1, cue_end: 1, narrated_claim: 'A gate filters a signal.', transition_reason: 'opening' }, { shot_id: 'S002', cue_start: 2, cue_end: 2, narrated_claim: 'A documented result appears.', transition_reason: 'claim' }], chapters: [{ chapter_id: 'C001', shot_start: 'S001', shot_end: 'S002', title: 'Gate', purpose: 'Show a gate and result.' }] });

function brief(shotId, overrides = {}) { return {
  shot_id: shotId, comprehension_purpose: 'Understand a gated signal.', semantic_type: overrides.semantic_type ?? 'process',
  representation: { mode: overrides.mode ?? 'physical-object', subjects: overrides.subjects ?? ['red gate', 'signal'], relationship: 'A red gate filters one signal.', grounding: 'The gate is a visible filter.' },
  visible_action: { verb: 'filter', from_state: 'Signal waits.', to_state: 'Signal exits gate.' }, result_state: { visible_outcome: 'Only accepted signal remains.', hold_intent: 'normal' },
  evidence: overrides.evidence ?? { mode: 'abstract-relationship', source_ids: [], claim_handling: 'non-literal' },
  silent_test: { expected_guess: 'A gate filtered a signal.', visible_clues: ['red gate', 'one signal exits'], ambiguity_risk: 'Color must remain clear.', verdict: 'pass', review_note: 'The gate and exiting signal make filtering visible.' },
  asset_needs: { preferred_route: overrides.route ?? 'user-media', primary_compositing: 'fullscreen', query_subjects: [], prohibitions: ['subtitle card'] },
  anti_collision: { motif_id: `M-${shotId}-GATE`, varied_dimensions: ['layout', 'primary-action'], complete_metaphor_reuse: false },
}; }
function briefs(overrides = {}) { return validateDirectorBriefs(plan, { schema_version: 1, plan_sha256: plan.plan_sha256, briefs: [brief('S001', overrides.first), brief('S002', { semantic_type: 'evidence', mode: 'documentary-evidence', subjects: ['documented result'], evidence: { mode: 'verified-source', source_ids: ['SOURCE-001'], claim_handling: 'literal-evidence' }, route: 'user-media', ...overrides.second })] }); }
function asset(id, tokens, overrides = {}) { return { asset_id: id, relative_path: overrides.relative_path ?? `${id}.mp4`, media_kind: overrides.media_kind ?? 'video', size_bytes: 100, duration_ms: overrides.media_kind === 'image' ? null : (overrides.duration_ms ?? 4000), width: overrides.width ?? 1920, height: overrides.height ?? 1080, orientation: 'landscape', codec: 'h264', semantic_tokens: tokens }; }
function index(assets = [asset('UA-1111111111111111', ['gate', 'red', 'signal']), asset('UA-2222222222222222', ['documented', 'result'])]) { return { schema_version: 1, candidate_count: assets.length, indexed_count: assets.length, rejected_count: 0, assets, rejected: [] }; }
function context(doc, overrides = {}) { return { schema_version: 1, briefs_sha256: doc.briefs_sha256, target_width: 1920, target_height: 1080, evidence_assets: [{ source_id: 'SOURCE-001', asset_id: 'UA-2222222222222222' }], ...overrides }; }
function capture() { let value = ''; return { stream: new Writable({ write(chunk, enc, done) { value += chunk.toString(); done(); } }), value: () => value }; }

test('selects exactly one semantically matching asset per shot without exposing paths', () => {
  const doc = briefs(); const result = routeUserMedia(doc, index(), context(doc));
  assert.deepEqual(result.routes.map((item) => [item.shot_id, item.route, item.asset_id]), [['S001', 'user-media', 'UA-1111111111111111'], ['S002', 'user-media', 'UA-2222222222222222']]);
  assert.equal(JSON.stringify(result).includes('relative_path'), false); assert.equal(JSON.stringify(result).includes('.mp4'), false);
});
test('ties are deterministic by stable asset ID', () => {
  const doc = briefs(); const tied = index([asset('UA-ffffffffffffffff', ['gate', 'red', 'signal']), asset('UA-0000000000000000', ['gate', 'red', 'signal']), asset('UA-2222222222222222', ['documented', 'result'])]);
  assert.equal(routeUserMedia(doc, tied, context(doc)).routes[0].asset_id, 'UA-0000000000000000');
});
test('missing semantic match falls through to image generation instead of forcing media', () => {
  const doc = briefs(); const result = routeUserMedia(doc, index([asset('UA-1111111111111111', ['tree']), asset('UA-2222222222222222', ['documented', 'result'])]), context(doc));
  assert.deepEqual(result.routes[0], { shot_id: 'S001', route: 'fallback', next_route: 'image-generation', reason_codes: ['NO_SEMANTIC_USER_MEDIA_MATCH'] });
});
test('crop, resolution, and video duration reject otherwise semantic candidates', () => {
  const doc = briefs();
  for (const candidate of [asset('UA-1111111111111111', ['gate'], { width: 800, height: 450 }), asset('UA-1111111111111111', ['gate'], { width: 1920, height: 300 }), asset('UA-1111111111111111', ['gate'], { duration_ms: 2000 })]) {
    const result = routeUserMedia(doc, index([candidate, asset('UA-2222222222222222', ['documented', 'result'])]), context(doc)); assert.equal(result.routes[0].next_route, 'image-generation');
  }
});
test('an image may hold for the shot when crop and resolution are sufficient', () => {
  const doc = briefs(); const image = asset('UA-1111111111111111', ['gate', 'red'], { media_kind: 'image', width: 3000, height: 2000 });
  assert.equal(routeUserMedia(doc, index([image, asset('UA-2222222222222222', ['documented', 'result'])]), context(doc)).routes[0].asset_id, image.asset_id);
});
test('literal evidence must have a registered usable asset and never falls through', () => {
  const doc = briefs();
  assert.equal(routeUserMedia(doc, index(), context(doc, { evidence_assets: [] })).routes[1].next_route, 'evidence_unresolved');
  const bad = index([asset('UA-1111111111111111', ['gate']), asset('UA-2222222222222222', ['documented', 'result'], { duration_ms: 1000 })]);
  assert.equal(routeUserMedia(doc, bad, context(doc)).routes[1].next_route, 'evidence_unresolved');
});
test('literal evidence selection ignores filename relevance but preserves registry boundary', () => {
  const doc = briefs(); const evidence = asset('UA-2222222222222222', ['unrelated', 'archive']);
  assert.equal(routeUserMedia(doc, index([asset('UA-1111111111111111', ['gate']), evidence]), context(doc)).routes[1].asset_id, evidence.asset_id);
});
test('detects malformed context, briefs, asset index, and duplicate evidence mapping', () => {
  const doc = briefs();
  for (const [a, b, c] of [[doc, index(), { ...context(doc), briefs_sha256: 'a'.repeat(64) }], [doc, { ...index(), assets: [asset('UA-1111111111111111', ['gate']), asset('UA-1111111111111111', ['result'])], indexed_count: 2 }, context(doc)], [{ ...doc, briefs_sha256: 'a'.repeat(64) }, index(), context(doc)], [doc, index(), { ...context(doc), evidence_assets: [{ source_id: 'SOURCE-001', asset_id: 'UA-2222222222222222' }, { source_id: 'SOURCE-001', asset_id: 'UA-1111111111111111' }] }]]) assert.throws(() => routeUserMedia(a, b, c));
});
test('hash and output are deterministic', () => { const doc = briefs(); assert.deepEqual(routeUserMedia(doc, index(), context(doc)), routeUserMedia(doc, index(), context(doc))); });
test('a real generated MP4 is indexed then routed by its filename semantics', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'broll-route-real-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  await execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=1920x1080:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(root, 'red-gate-signal.mp4')]);
  const realIndex = await indexUserAssets(root);
  const doc = briefs();
  const result = routeUserMedia(doc, realIndex, context(doc, { evidence_assets: [] }));
  assert.equal(realIndex.indexed_count, 1);
  assert.equal(result.routes[0].route, 'user-media');
  assert.equal(result.routes[1].next_route, 'evidence_unresolved');
  assert.equal(JSON.stringify(result).includes(root), false);
});
test('CLI has stable parsing and never echoes private paths', async () => {
  const doc = briefs(); const files = { '/private/briefs.json': JSON.stringify(doc), '/private/index.json': JSON.stringify(index()), '/private/context.json': JSON.stringify(context(doc)) }; const stdout = capture();
  assert.deepEqual(parseRouteArgs(['--help']), { help: true }); assert.equal(parseRouteArgs(['a', 'b']).error, true);
  assert.equal(await runRouteCli(['/private/briefs.json', '/private/index.json', '/private/context.json'], { stdout: stdout.stream, readFile: async (name) => files[name] }), 0); assert.equal(stdout.value().includes('/private/'), false);
  const stderr = capture(); assert.equal(await runRouteCli(['/private/a', '/private/b', '/private/c'], { stderr: stderr.stream, readFile: async () => { throw new Error('/private/a'); } }), 3); assert.equal(stderr.value().includes('/private/'), false);
});
