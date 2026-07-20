import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { runDeliveryMediaCli, verifyDeliveryMedia } from './delivery-media-gate.mjs';

const execFile = promisify(execFileCallback);
function expected(duration = 2000) { return { duration_ms: duration, width: 1920, height: 1080, frame_rate: { numerator: 30, denominator: 1 } }; }
function request(artifacts = [{ artifact_id: 'FULL', kind: 'fullscreen', expected: expected() }]) { return { schema_version: 1, artifacts }; }
function probeFor(kind, overrides = {}) { const alpha = kind === 'hard-alpha'; const audio = kind === 'talking-head-master' ? { count: 1, primary: { stream_index: 1 } } : { count: 0, primary: null }; return { decode: { ok: true }, duration_ms: 2000, format_names: ['mov', 'mp4'], video: { primary: { display_width: 1920, display_height: 1080, frame_rate: { numerator: 30, denominator: 1 }, codec: alpha ? 'prores' : 'h264', pixel_format: alpha ? 'yuva444p12le' : 'yuv420p' } }, audio, ...overrides }; }
async function fixture(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'broll-delivery-gate-')); const file = path.join(root, 'artifact.mp4'); await fs.writeFile(file, 'not-media-but-regular'); t.after(() => fs.rm(root, { recursive: true, force: true })); return file; }
function capture() { let value = ''; return { stream: new Writable({ write(chunk, encoding, done) { value += String(chunk); done(); } }), value: () => value }; }

test('validates all five delivery policies and returns only a path-free receipt', async (t) => {
  const file = await fixture(t); const artifacts = ['fullscreen', 'hard-alpha', 'light-pass', 'talking-head-master', 'faceless-master'].map((kind, index) => ({ artifact_id: `A${index + 1}`, kind, expected: expected() }));
  const files = new Map(); for (const item of artifacts) { const local = path.join(path.dirname(file), `${item.kind}.mp4`); await fs.writeFile(local, 'regular artifact'); files.set(item.kind, local); }
  let decodes = 0; const receipt = await verifyDeliveryMedia(request(artifacts), async (item) => files.get(item.kind), { probe: async (localPath) => probeFor(path.basename(localPath).replace(/\.mp4$/u, '')), decode: async () => { decodes += 1; }, analyze: async (localPath, mode) => mode === 'alpha' ? { min: 0, max: 4095 } : { min: 16, max: 100 } });
  assert.equal(receipt.artifact_count, 5); assert.equal(decodes, 5); assert.equal(receipt.artifacts.some((item) => item.pixel_semantics === 'transparent-and-opaque'), true); assert.equal(JSON.stringify(receipt).includes(file), false);
});
test('rejects malformed media semantics, audio leakage, failed full decode, and invalid pixel evidence', async (t) => {
  const file = await fixture(t); const base = { probe: async () => probeFor('fullscreen'), decode: async () => {}, analyze: async () => ({ min: 16, max: 100 }) };
  await assert.rejects(() => verifyDeliveryMedia(request(), async () => file, { ...base, probe: async () => probeFor('fullscreen', { audio: { count: 1, primary: { stream_index: 1 } } }) }), (error) => error.code === 'audio_policy_mismatch');
  await assert.rejects(() => verifyDeliveryMedia(request(), async () => file, { ...base, decode: async () => { throw new Error('bad'); } }), (error) => error.code === 'full_decode_failed');
  const alpha = request([{ artifact_id: 'ALPHA', kind: 'hard-alpha', expected: expected() }]);
  await assert.rejects(() => verifyDeliveryMedia(alpha, async () => file, { ...base, probe: async () => probeFor('hard-alpha'), analyze: async () => ({ min: 100, max: 100 }) }), (error) => error.code === 'alpha_semantics_invalid');
  const light = request([{ artifact_id: 'LIGHT', kind: 'light-pass', expected: expected() }]);
  await assert.rejects(() => verifyDeliveryMedia(light, async () => file, { ...base, analyze: async () => ({ min: 50, max: 100 }) }), (error) => error.code === 'light_pass_semantics_invalid');
});
test('runs a real probe and full decode on an actual rendered MP4', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'broll-delivery-real-')); const file = path.join(root, 'full.mp4'); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=1920x1080:d=2:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
  const receipt = await verifyDeliveryMedia(request(), async () => file); assert.equal(receipt.artifacts[0].codec, 'h264'); assert.equal(receipt.artifacts[0].duration_ms, 2000); assert.equal(JSON.stringify(receipt).includes(root), false);
});
test('verifies actual ProRes Alpha and near-black light-pass pixel semantics', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'broll-delivery-pixels-')); const alpha = path.join(root, 'alpha.mov'); const light = path.join(root, 'light.mp4'); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:d=2:r=30', '-vf', "format=yuva444p10le,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='if(lt(X,960),0,1023)'", '-c:v', 'prores_ks', '-profile:v', '4', '-pix_fmt', 'yuva444p10le', alpha]);
  await execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:d=2:r=30', '-vf', 'drawbox=x=100:y=100:w=300:h=300:color=white@0.7:t=fill', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', light]);
  const receipt = await verifyDeliveryMedia(request([{ artifact_id: 'ALPHA', kind: 'hard-alpha', expected: expected() }, { artifact_id: 'LIGHT', kind: 'light-pass', expected: expected() }]), async (item) => item.kind === 'hard-alpha' ? alpha : light);
  assert.deepEqual(receipt.artifacts.map((item) => item.pixel_semantics), ['transparent-and-opaque', 'visible-near-black']);
});
test('CLI does not echo private locations or raw read errors', async (t) => {
  const file = await fixture(t); const privatePath = '/private/output/final.mp4'; const stdout = capture();
  const docs = [JSON.stringify(request()), JSON.stringify({ schema_version: 1, locations: [{ artifact_id: 'FULL', kind: 'fullscreen', local_path: privatePath }] })];
  const code = await runDeliveryMediaCli(['request.json', 'locations.json'], { stdout: stdout.stream, readFile: async (name) => docs[name === 'request.json' ? 0 : 1], options: { fsImpl: { lstat: async () => ({ isSymbolicLink: () => false, isFile: () => true, size: 20 }) }, probe: async () => probeFor('fullscreen'), decode: async () => {} } });
  assert.equal(code, 0); assert.equal(stdout.value().includes(privatePath), false);
  const stderr = capture(); assert.equal(await runDeliveryMediaCli(['missing', 'locations'], { stderr: stderr.stream, readFile: async () => { throw new Error(privatePath); } }), 3); assert.equal(stderr.value().includes(privatePath), false); assert.equal(file.length > 0, true);
});
