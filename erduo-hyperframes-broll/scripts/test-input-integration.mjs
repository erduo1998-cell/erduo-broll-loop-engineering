import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseSrt } from './parse-srt.mjs';
import {
  applyInputManifest,
  createInputManifest,
  createRunState,
  fingerprintFile,
  fingerprintValue,
  loadRunState,
  saveRunState,
  transitionStage,
} from './state.mjs';
import { cacheKey, withJsonCache } from './cache.mjs';
import { getConfigPath, getPexelsConfigStatus } from './config.mjs';

const H = (char) => char.repeat(64);
const NOW = () => new Date('2026-07-20T12:00:00.000Z');

async function makeProject(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'broll-input-integration-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  return root;
}

function srtFingerprint(text) {
  const parsed = parseSrt(text);
  return { parsed, fingerprint: { sha256: parsed.content_sha256, size_bytes: Buffer.byteLength(text) } };
}

test('talking-head input flows from SRT/file fingerprints to private state and exact invalidation', async (t) => {
  const root = await makeProject(t);
  const media = path.join(root, 'private-talking-head.mp4');
  await fs.writeFile(media, 'fixture-media-bytes');
  const mediaFingerprint = await fingerprintFile(media);
  const firstSrt = srtFingerprint(`1
00:00:00,000 --> 00:00:01,000
First idea`);
  const firstManifest = createInputManifest({
    mode: 'talking-head',
    inputs: { srt: firstSrt.fingerprint, control_media: mediaFingerprint },
    settings: { aspect_ratio: '16:9', frame_rate: { numerator: 30000, denominator: 1001 } },
  });
  let state = createRunState(firstManifest, { now: NOW, makeId: () => 'run-integration-001' });
  state = transitionStage(state, 'preflight', 'start', { input_fingerprint: fingerprintValue(firstManifest), now: NOW });
  state = transitionStage(state, 'preflight', 'complete', { output_fingerprint: H('b'), now: NOW });
  await saveRunState(root, state, { now: NOW, makeId: () => 'save-1', platform: 'linux' });
  const loaded = await loadRunState(root);
  assert.equal(loaded.stages.preflight.status, 'complete');
  assert.equal(JSON.stringify(loaded).includes(root), false);
  assert.equal(JSON.stringify(loaded).includes('private-talking-head'), false);
  assert.equal(JSON.stringify(loaded).includes('First idea'), false);

  const changedSrt = srtFingerprint(`1
00:00:00,000 --> 00:00:01,000
Changed idea`);
  const changedManifest = createInputManifest({
    mode: 'talking-head',
    inputs: { srt: changedSrt.fingerprint, control_media: mediaFingerprint },
    settings: firstManifest.settings,
  });
  const updated = applyInputManifest(loaded, changedManifest, { now: NOW });
  assert.deepEqual(updated.changed, ['srt']);
  assert.equal(updated.invalidated_from, 'preflight');
  assert.equal(updated.state.stages.preflight.status, 'pending');
});

test('faceless manifest and search cache are deterministic and concurrent-safe', async (t) => {
  const root = await makeProject(t);
  const parsed = srtFingerprint(`00:00:00.000 --> 00:00:02.000
Ocean currents explain the change.`);
  const manifest = createInputManifest({
    mode: 'faceless',
    inputs: { srt: parsed.fingerprint },
    settings: { aspect_ratio: '9:16', frame_rate: { numerator: 25, denominator: 1 } },
  });
  const requestA = { srt_sha256: manifest.inputs.srt.sha256, query: 'ocean current', semantic_tokens: ['ocean', 'current'] };
  const requestB = { semantic_tokens: ['ocean', 'current'], query: 'ocean current', srt_sha256: manifest.inputs.srt.sha256 };
  assert.equal(cacheKey('search', requestA), cacheKey('search', requestB));
  let calls = 0;
  const producer = async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 10)); return { results: [{ id: 'pexels-1' }] }; };
  const results = await Promise.all([
    withJsonCache(root, requestA, producer, { limits: { pollMs: 1 } }),
    withJsonCache(root, requestB, producer, { limits: { pollMs: 1 } }),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(results[0].value, results[1].value);
});

test('Windows configuration path is deterministic while safe status exposes no path or key', async () => {
  const privateKey = 'integration-private-key';
  const configPath = getConfigPath({
    platform: 'win32',
    env: { APPDATA: 'C:\\Users\\Alice\\AppData\\Roaming' },
    homeDir: 'C:\\Users\\Alice',
  });
  assert.equal(configPath, 'C:\\Users\\Alice\\AppData\\Roaming\\erduo-hyperframes-broll\\config.json');
  const status = await getPexelsConfigStatus({ env: { PEXELS_API_KEY: privateKey } });
  assert.deepEqual(status, { configured: true, source: 'environment' });
  assert.equal(JSON.stringify(status).includes(privateKey), false);
  assert.equal(JSON.stringify(status).includes('C:\\Users'), false);
});
