import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import os from 'node:os';
import {
  STAGES,
  StateError,
  applyInputManifest,
  assertStatePrivacy,
  canonicalize,
  createInputManifest,
  createRunState,
  diffManifests,
  fingerprintFile,
  fingerprintValue,
  loadRunState,
  inspectRunState,
  saveRunState,
  transitionStage,
  validateRunState,
} from './state.mjs';

const H = (char) => char.repeat(64);
const FP = (char, size = 1) => ({ sha256: H(char), size_bytes: size });
const NOW = () => new Date('2026-07-20T12:00:00.000Z');

function manifest(overrides = {}) {
  return createInputManifest({
    mode: overrides.mode ?? 'talking-head',
    inputs: {
      srt: FP(overrides.srt ?? 'a'),
      ...(overrides.mode === 'faceless' ? {} : { control_media: FP(overrides.control_media ?? 'b') }),
      ...(overrides.narration_media ? { narration_media: FP(overrides.narration_media) } : {}),
      ...(overrides.design ? { design: FP(overrides.design) } : {}),
      ...(overrides.user_assets ? { user_assets: FP(overrides.user_assets) } : {}),
    },
    settings: {
      aspect_ratio: overrides.aspect_ratio ?? '16:9',
      frame_rate: overrides.frame_rate ?? { numerator: 30000, denominator: 1001 },
      ...(overrides.template_policy ? { template_policy_sha256: H(overrides.template_policy) } : {}),
      ...(overrides.production_library ? { production_library_sha256: H(overrides.production_library) } : {}),
      ...(overrides.design_selection_options
        ? {
          design_selection_options_sha256:
            H(overrides.design_selection_options),
        }
        : {}),
    },
  });
}

function newState(input = manifest()) {
  return createRunState(input, { now: NOW, makeId: () => 'run-001' });
}

function completeThrough(state, lastStage = 'verify') {
  let current = state;
  for (const stage of STAGES.slice(0, STAGES.indexOf(lastStage) + 1)) {
    current = transitionStage(current, stage, 'start', { input_fingerprint: H('c'), now: NOW });
    current = transitionStage(current, stage, 'complete', { output_fingerprint: H('d'), now: NOW });
  }
  return current;
}

async function makeProject(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'broll-state-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('canonical hashing sorts object keys but preserves array order', () => {
  assert.equal(canonicalize({ b: 2, a: { d: 4, c: 3 } }), '{"a":{"c":3,"d":4},"b":2}');
  assert.equal(fingerprintValue({ a: 1, b: 2 }), fingerprintValue({ b: 2, a: 1 }));
  assert.notEqual(fingerprintValue([1, 2]), fingerprintValue([2, 1]));
});

test('canonical hashing rejects unsupported, cyclic, non-finite, and unsafe values', () => {
  const cycle = {}; cycle.self = cycle;
  for (const value of [undefined, { x: undefined }, { x: Infinity }, { x: Number.MAX_SAFE_INTEGER + 1 }, cycle, new Date()]) {
    assert.throws(() => fingerprintValue(value), (error) => error instanceof StateError && error.code === 'invalid_canonical_value');
  }
});

test('streaming file fingerprint detects real content changes without returning a path', async (t) => {
  const root = await makeProject(t);
  const file = path.join(root, 'private-input.srt');
  await fs.writeFile(file, 'first');
  const first = await fingerprintFile(file);
  await fs.writeFile(file, 'second');
  const second = await fingerprintFile(file);
  assert.notEqual(first.sha256, second.sha256);
  assert.deepEqual(Object.keys(first).sort(), ['sha256', 'size_bytes']);
  assert.equal(JSON.stringify(first).includes(root), false);
});

test('fingerprint rejects missing, symlink, directory, and changed-during-read', async (t) => {
  const root = await makeProject(t);
  const file = path.join(root, 'file');
  const link = path.join(root, 'link');
  await fs.writeFile(file, 'abc');
  await fs.symlink(file, link);
  for (const [value, code] of [[path.join(root, 'missing'), 'input_not_found'], [link, 'input_unsafe'], [root, 'input_unsafe']]) {
    await assert.rejects(fingerprintFile(value), (error) => error.code === code && !error.message.includes(root));
  }
  let calls = 0;
  await assert.rejects(
    fingerprintFile('/private/file', {
      fsImpl: { lstat: async () => ({ isSymbolicLink: () => false, isFile: () => true, size: 3, mtimeMs: calls++ ? 2 : 1 }) },
      streamFactory: () => Readable.from(['abc']),
    }),
    (error) => error.code === 'input_changed' && !error.message.includes('/private'),
  );
});

test('both modes enforce their required fingerprint slots', () => {
  assert.equal(manifest().mode, 'talking-head');
  assert.equal(manifest({ mode: 'faceless' }).mode, 'faceless');
  assert.throws(() => createInputManifest({ mode: 'talking-head', inputs: { srt: FP('a') } }), (error) => error.code === 'invalid_manifest');
  assert.throws(() => createInputManifest({ mode: 'faceless', inputs: {} }), (error) => error.code === 'invalid_manifest');
});

test('manifest is deterministic and rejects unknown slots/settings or tampering', () => {
  assert.deepEqual(manifest(), manifest());
  assert.throws(() => createInputManifest({ mode: 'faceless', inputs: { srt: FP('a'), private_path: FP('b') } }), (error) => error.code === 'invalid_manifest');
  assert.throws(() => createInputManifest({ mode: 'faceless', inputs: { srt: FP('a') }, settings: { output_path: '/private/out' } }), (error) => error.code === 'invalid_manifest');
  const tampered = manifest();
  tampered.settings.aspect_ratio = '9:16';
  assert.throws(() => createRunState(tampered), (error) => error.code === 'manifest_tampered');
});

test('each input and setting invalidates from its contracted earliest stage', () => {
  const base = manifest({
    design: 'c',
    user_assets: 'd',
    template_policy: 'e',
    production_library: 'f',
  });
  const cases = [
    [manifest({ srt: '9', design: 'c', user_assets: 'd', template_policy: 'e', production_library: 'f' }), 'preflight'],
    [manifest({ control_media: '9', design: 'c', user_assets: 'd', template_policy: 'e', production_library: 'f' }), 'preflight'],
    [manifest({ design: '9', user_assets: 'd', template_policy: 'e', production_library: 'f' }), 'directing'],
    [manifest({ design: 'c', user_assets: '9', template_policy: 'e', production_library: 'f' }), 'assets'],
    [manifest({ design: 'c', user_assets: 'd', aspect_ratio: '9:16', template_policy: 'e', production_library: 'f' }), 'authoring'],
    [manifest({ design: 'c', user_assets: 'd', frame_rate: { numerator: 24, denominator: 1 }, template_policy: 'e', production_library: 'f' }), 'authoring'],
    [manifest({ design: 'c', user_assets: 'd', template_policy: '9', production_library: 'f' }), 'directing'],
    [manifest({ design: 'c', user_assets: 'd', template_policy: 'e', production_library: '9' }), 'directing'],
    [manifest({
      design: 'c',
      user_assets: 'd',
      template_policy: 'e',
      production_library: 'f',
      design_selection_options: '9',
    }), 'directing'],
  ];
  for (const [next, stage] of cases) assert.equal(diffManifests(base, next).invalidated_from, stage);
});

test('identical manifest is a no-op and combined changes choose earliest stage', () => {
  const state = completeThrough(newState(manifest({ design: 'c', user_assets: 'd' })));
  const same = applyInputManifest(state, state.manifest, { now: NOW });
  assert.equal(same.invalidated_from, null);
  assert.deepEqual(same.state, state);
  const combined = applyInputManifest(state, manifest({ srt: '9', design: '8', user_assets: '7' }), { now: NOW });
  assert.equal(combined.invalidated_from, 'preflight');
  assert.equal(combined.state.stages.preflight.status, 'pending');
});

test('invalidation preserves upstream completion and resets only downstream', () => {
  const original = completeThrough(newState(manifest({ design: 'c', user_assets: 'd' })));
  const design = applyInputManifest(original, manifest({ design: '9', user_assets: 'd' }), { now: NOW }).state;
  assert.equal(design.stages.preflight.status, 'complete');
  assert.equal(design.stages.directing.status, 'pending');
  assert.equal(design.stages.verify.status, 'pending');
  const assets = applyInputManifest(original, manifest({ design: 'c', user_assets: '9' }), { now: NOW }).state;
  assert.equal(assets.stages.directing.status, 'complete');
  assert.equal(assets.stages.assets.status, 'pending');
  const authoring = applyInputManifest(original, manifest({ design: 'c', user_assets: 'd', aspect_ratio: '9:16' }), { now: NOW }).state;
  assert.equal(authoring.stages.assets.status, 'complete');
  assert.equal(authoring.stages.authoring.status, 'pending');
});

test('stage transitions enforce upstream, state, and fingerprints', () => {
  let state = newState();
  assert.throws(() => transitionStage(state, 'directing', 'start', { input_fingerprint: H('a'), now: NOW }), (error) => error.code === 'upstream_incomplete');
  assert.throws(() => transitionStage(state, 'preflight', 'complete', { output_fingerprint: H('a'), now: NOW }), (error) => error.code === 'invalid_transition');
  assert.throws(() => transitionStage(state, 'preflight', 'start', { input_fingerprint: 'bad', now: NOW }), (error) => error.code === 'invalid_fingerprint');
  state = transitionStage(state, 'preflight', 'start', { input_fingerprint: H('a'), now: NOW });
  assert.equal(state.stages.preflight.attempt, 1);
  assert.throws(() => transitionStage(state, 'preflight', 'start', { input_fingerprint: H('a'), now: NOW }), (error) => error.code === 'invalid_transition');
  assert.throws(() => transitionStage(state, 'preflight', 'complete', { output_fingerprint: 'bad', now: NOW }), (error) => error.code === 'invalid_fingerprint');
  state = transitionStage(state, 'preflight', 'complete', { output_fingerprint: H('b'), now: NOW });
  assert.equal(state.stages.preflight.status, 'complete');
});

test('failed stage stores only fixed catalog messages and can retry', () => {
  let state = transitionStage(newState(), 'preflight', 'start', { input_fingerprint: H('a'), now: NOW });
  state = transitionStage(state, 'preflight', 'fail', { code: 'render_failed', retryable: true, raw: '/private secret', now: NOW });
  assert.deepEqual(state.stages.preflight.failure, { code: 'render_failed', message: 'Media render failed.', retryable: true });
  assert.equal(JSON.stringify(state).includes('/private'), false);
  state = transitionStage(state, 'preflight', 'start', { input_fingerprint: H('a'), now: NOW });
  assert.equal(state.stages.preflight.attempt, 2);
  let unknown = transitionStage(newState(), 'preflight', 'start', { input_fingerprint: H('a'), now: NOW });
  unknown = transitionStage(unknown, 'preflight', 'fail', { code: 'private-user-text', now: NOW });
  assert.equal(unknown.stages.preflight.failure.code, 'stage_failed');
});

test('privacy rejects credential keys and Unix, Windows, UNC, and file URL values', () => {
  for (const value of [
    { api_key: 'x' },
    { value: '/Users/alice/video.mp4' },
    { value: '/home/alice/video.mp4' },
    { value: 'C:\\Users\\Alice\\video.mp4' },
    { value: '\\\\server\\share\\video.mp4' },
    { value: 'file:///private/video.mp4' },
  ]) assert.throws(() => assertStatePrivacy(value), (error) => error.code === 'privacy_violation');
});

test('state validation rejects unknown schema, fields, tampering, and inconsistent stages', () => {
  for (const mutate of [
    (state) => { state.schema_version = 2; },
    (state) => { state.unknown = true; },
    (state) => { state.manifest.inputs.srt.sha256 = H('9'); },
    (state) => { state.stages.preflight.status = 'complete'; },
    (state) => { state.stages.preflight.status = 'running'; state.stages.preflight.attempt = 1; },
  ]) {
    const state = newState();
    mutate(state);
    assert.throws(() => validateRunState(state), StateError);
  }
});

test('real atomic save/load applies POSIX permissions and keeps no temp', async (t) => {
  const root = await makeProject(t);
  const state = newState();
  assert.deepEqual(await saveRunState(root, state, { makeId: () => 'fixed', platform: 'linux' }), { saved: true });
  assert.deepEqual(await loadRunState(root), state);
  const dir = path.join(root, '.erduo-hyperframes-broll');
  const file = path.join(dir, 'run.json');
  assert.equal((await fs.stat(dir)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  assert.deepEqual(await fs.readdir(dir), ['run.json']);
});

test('load rejects corrupt, tampered, symlink, and unknown-version state', async (t) => {
  const root = await makeProject(t);
  const dir = path.join(root, '.erduo-hyperframes-broll');
  const file = path.join(dir, 'run.json');
  await fs.mkdir(dir);
  await fs.writeFile(file, 'not-json');
  await assert.rejects(loadRunState(root), (error) => error.code === 'state_invalid_json');
  await fs.writeFile(file, JSON.stringify({ ...newState(), schema_version: 2 }));
  await assert.rejects(loadRunState(root), (error) => error.code === 'legacy_state_resign_forbidden');
  await fs.unlink(file);
  await fs.symlink(path.join(root, 'elsewhere'), file);
  await assert.rejects(loadRunState(root), (error) => error.code === 'unsafe_state_path');
});

test('legacy state remains inspectable but is never resumable or silently upgraded', () => {
  const legacy = { ...newState(), schema_version: 1 };
  delete legacy.pipeline_contract_version;
  assert.deepEqual(inspectRunState(legacy), {
    resume_eligible: false,
    resign_eligible: false,
    code: 'pipeline_upgrade_required',
    schema_version: 1,
    pipeline_contract_version: null,
    run_id: 'run-001',
    stages: Object.fromEntries(STAGES.map((stage) => [stage, 'pending'])),
  });
  assert.throws(() => validateRunState(legacy), (error) => error.code === 'pipeline_upgrade_required');
});

test('save write/rename cleanup failures are safe and old state is not path-leaked', async () => {
  const state = newState();
  const baseStats = {
    lstat: async (value) => {
      if (value === '/project') return { isSymbolicLink: () => false, isDirectory: () => true };
      const error = Object.assign(new Error('missing'), { code: 'ENOENT' }); throw error;
    },
    mkdir: async () => {},
    chmod: async () => {},
  };
  await assert.rejects(saveRunState('/project', state, {
    fsImpl: { ...baseStats, writeFile: async () => { throw new Error('/project private'); }, rename: async () => {}, unlink: async () => assert.fail('no temp') },
    pathImpl: path.posix,
  }), (error) => error.code === 'state_write_failed' && !error.message.includes('/project'));

  let cleaned;
  await assert.rejects(saveRunState('/project', state, {
    fsImpl: { ...baseStats, writeFile: async () => {}, rename: async () => { throw new Error('rename'); }, unlink: async (value) => { cleaned = value; } },
    pathImpl: path.posix,
    makeId: () => 'rename-failed',
  }), (error) => error.code === 'state_write_failed');
  assert.match(cleaned, /^\/project\/\.erduo-hyperframes-broll\/\.run\.json\..+\.rename-failed\.tmp$/u);

  await assert.rejects(saveRunState('/project', state, {
    fsImpl: { ...baseStats, writeFile: async () => {}, rename: async () => { throw new Error('rename'); }, unlink: async () => { throw new Error('/private temp'); } },
    pathImpl: path.posix,
  }), (error) => error.code === 'state_cleanup_failed' && !error.message.includes('/private'));
});
