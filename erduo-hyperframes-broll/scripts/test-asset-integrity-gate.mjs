import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { cropMetrics, runAssetIntegrityCli, verifyFrozenAssets } from './asset-integrity-gate.mjs';

const SHA = 'a'.repeat(64);
const execFile = promisify(execFileCallback);
function request(overrides = {}) { return { schema_version: 1, target_width: 1920, target_height: 1080, assets: [{ shot_id: 'S001', route: 'user-media', asset_ref: { asset_id: 'UA-1111111111111111' }, expected: { media_kind: 'video', width: 1920, height: 1080, duration_ms: 4000, min_duration_ms: 3000 } }], ...overrides }; }
function media(overrides = {}) { return { duration_ms: 4000, video: { primary: { display_width: 1920, display_height: 1080 } }, audio: { count: 0 }, ...overrides }; }
async function fixture(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'broll-asset-gate-')); const file = path.join(root, 'asset.bin'); await fs.writeFile(file, 'verified visual asset'); t.after(() => fs.rm(root, { recursive: true, force: true })); return file; }
function capture() { let value = ''; return { stream: new Writable({ write(chunk, encoding, done) { value += String(chunk); done(); } }), value: () => value }; }

test('creates a path-free, deterministic frozen receipt from a readable selected asset', async (t) => {
  const file = await fixture(t); const args = { probe: async () => media(), fingerprint: async () => ({ sha256: SHA, size_bytes: 21 }) };
  const one = await verifyFrozenAssets(request(), async () => file, args); const two = await verifyFrozenAssets(request(), async () => file, args);
  assert.equal(one.asset_count, 1); assert.equal(one.assets[0].frozen_sha256, SHA); assert.equal(one.assets[0].crop_retention_basis_points, 10000); assert.deepEqual(one, two); assert.equal(JSON.stringify(one).includes(file), false);
});
test('reprobes and fingerprints a real selected MP4 before issuing its receipt', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'broll-asset-gate-real-')); const file = path.join(root, 'selected.mp4');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=1920x1080:d=4:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
  const receipt = await verifyFrozenAssets(request(), async () => file);
  assert.equal(receipt.assets[0].duration_ms, 4000); assert.equal(receipt.assets[0].width, 1920); assert.equal(receipt.assets[0].height, 1080); assert.equal(JSON.stringify(receipt).includes(root), false);
});
test('rejects a URL, symlink, missing file, metadata drift, too-short media, and unsafe crop', async (t) => {
  const file = await fixture(t); const root = path.dirname(file); const link = path.join(root, 'link.bin'); await fs.symlink(file, link);
  const options = { probe: async () => media(), fingerprint: async () => ({ sha256: SHA, size_bytes: 21 }) };
  for (const candidate of ['https://example.test/x.mp4', link, path.join(root, 'missing.bin')]) await assert.rejects(() => verifyFrozenAssets(request(), async () => candidate, options), (error) => ['unverified_location', 'asset_missing'].includes(error.code));
  await assert.rejects(() => verifyFrozenAssets(request(), async () => file, { ...options, probe: async () => media({ duration_ms: 2000 }) }), (error) => error.code === 'asset_metadata_changed');
  await assert.rejects(() => verifyFrozenAssets(request(), async () => file, { ...options, probe: async () => media({ video: { primary: { display_width: 1920, display_height: 300 } } }) }), (error) => error.code === 'asset_metadata_changed');
  const uncroppable = request({ assets: [{ ...request().assets[0], expected: { media_kind: 'video', width: 1920, height: 300, duration_ms: 4000, min_duration_ms: 3000 } }] });
  await assert.rejects(() => verifyFrozenAssets(uncroppable, async () => file, { ...options, probe: async () => media({ video: { primary: { display_width: 1920, display_height: 300 } } }) }), (error) => error.code === 'crop_or_resolution_unsuitable');
});
test('requires strict path-free references and validates Pexels/generated cache-key forms', async (t) => {
  const file = await fixture(t); const options = { probe: async () => media(), fingerprint: async () => ({ sha256: SHA, size_bytes: 21 }) };
  await assert.rejects(() => verifyFrozenAssets(request({ assets: [{ ...request().assets[0], asset_ref: { asset_id: '/private/a.mp4' } }] }), async () => file, options), (error) => error.code === 'invalid_asset_ref');
  for (const [route, field] of [['pexels', 'download_cache_key'], ['image-generation', 'render_cache_key']]) {
    const doc = request({ assets: [{ ...request().assets[0], route, asset_ref: { [field]: SHA } }] });
    const receipt = await verifyFrozenAssets(doc, async () => file, options); assert.equal(receipt.assets[0].route, route);
  }
});
test('crop metrics retain the router threshold and reject insufficient source dimensions', () => {
  assert.equal(cropMetrics(1920, 1080, 1920, 1080).usable, true);
  assert.equal(cropMetrics(1920, 300, 1920, 1080).usable, false);
  assert.equal(cropMetrics(800, 450, 1920, 1080).usable, false);
});
test('CLI consumes private locations without echoing their paths', async (t) => {
  const file = await fixture(t); const stdout = capture(); const privatePath = '/private/assets/hidden.mp4';
  const docs = [JSON.stringify(request()), JSON.stringify({ schema_version: 1, locations: [{ shot_id: 'S001', route: 'user-media', asset_ref: { asset_id: 'UA-1111111111111111' }, local_path: privatePath }] })];
  const code = await runAssetIntegrityCli(['request.json', 'locations.json'], { stdout: stdout.stream, readFile: async (name) => docs[name === 'request.json' ? 0 : 1], options: { probe: async () => media(), fingerprint: async () => ({ sha256: SHA, size_bytes: 21 }), fsImpl: { lstat: async () => ({ isSymbolicLink: () => false, isFile: () => true, size: 21 }) } } });
  assert.equal(code, 0); assert.equal(stdout.value().includes(privatePath), false);
  const stderr = capture(); assert.equal(await runAssetIntegrityCli(['missing.json', 'locations.json'], { stderr: stderr.stream, readFile: async () => { throw new Error(privatePath); } }), 3); assert.equal(stderr.value().includes(privatePath), false);
  assert.equal(file.length > 0, true);
});
