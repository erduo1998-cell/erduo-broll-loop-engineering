import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { runFrameVisibilityCli, sampleTimes, verifyFrameVisibility } from './frame-visibility-gate.mjs';

const execFile = promisify(execFileCallback);
function expected() { return { duration_ms: 2000, frame_rate: { numerator: 30, denominator: 1 } }; }
function request(artifacts = [{ artifact_id: 'FULL', kind: 'fullscreen', expected: expected() }]) { return { schema_version: 1, artifacts }; }
function probe() { return { decode: { ok: true }, duration_ms: 2000, video: { primary: { frame_rate: { numerator: 30, denominator: 1 } } } }; }
async function fixture(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'broll-frame-gate-')); const file = path.join(root, 'frame.mp4'); await fs.writeFile(file, 'regular media placeholder'); t.after(() => fs.rm(root, { recursive: true, force: true })); return file; }
function capture() { let value = ''; return { stream: new Writable({ write(chunk, encoding, done) { value += String(chunk); done(); } }), value: () => value }; }

test('samples boundary/midpoint frames for all semantic modes without returning paths', async (t) => {
  const file = await fixture(t); const modes = ['fullscreen', 'hard-alpha', 'light-pass', 'talking-head-master', 'faceless-master']; const artifacts = modes.map((kind, index) => ({ artifact_id: `A${index + 1}`, kind, expected: expected() }));
  const receipt = await verifyFrameVisibility(request(artifacts), async () => file, { probe: async () => probe(), analyze: async (localPath, timeMs, kind) => kind === 'hard-alpha' ? { min: 0, max: 255, average: 30 } : kind === 'light-pass' ? { min: 16, max: 80, average: 20 } : { min: 16, max: 180, average: 60 } });
  assert.equal(receipt.artifact_count, 5); assert.equal(receipt.artifacts.every((item) => item.sample_count === 3), true); assert.deepEqual(receipt.artifacts[0].samples.map((item) => item.time_ms), [34, 1000, 1966]); assert.equal(JSON.stringify(receipt).includes(file), false);
});
test('rejects blank opaque frames, uniform Alpha, invalid light semantics and metadata drift', async (t) => {
  const file = await fixture(t); const base = { probe: async () => probe(), analyze: async () => ({ min: 16, max: 180, average: 60 }) };
  await assert.rejects(() => verifyFrameVisibility(request(), async () => file, { ...base, analyze: async () => ({ min: 16, max: 16, average: 16 }) }), (error) => error.code === 'frame_not_visible');
  await assert.rejects(() => verifyFrameVisibility(request([{ artifact_id: 'ALPHA', kind: 'hard-alpha', expected: expected() }]), async () => file, { ...base, analyze: async () => ({ min: 255, max: 255, average: 255 }) }), (error) => error.code === 'frame_not_visible');
  await assert.rejects(() => verifyFrameVisibility(request([{ artifact_id: 'LIGHT', kind: 'light-pass', expected: expected() }]), async () => file, { ...base, analyze: async () => ({ min: 50, max: 70, average: 55 }) }), (error) => error.code === 'frame_not_visible');
  await assert.rejects(() => verifyFrameVisibility(request(), async () => file, { ...base, probe: async () => ({ ...probe(), duration_ms: 1900 }) }), (error) => error.code === 'media_metadata_mismatch');
});
test('extracts and analyzes actual fullscreen, Alpha and black-light frames', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'broll-frame-real-')); const full = path.join(root, 'full.mp4'); const alpha = path.join(root, 'alpha.mov'); const light = path.join(root, 'light.mp4'); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=1920x1080:d=2:r=30', '-vf', 'drawbox=x=100:y=100:w=300:h=300:color=white@0.8:t=fill', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', full]);
  await execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:d=2:r=30', '-vf', "format=yuva444p10le,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='if(lt(X,960),0,1023)'", '-c:v', 'prores_ks', '-profile:v', '4', '-pix_fmt', 'yuva444p10le', alpha]);
  await execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:d=2:r=30', '-vf', 'drawbox=x=100:y=100:w=300:h=300:color=white@0.7:t=fill', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', light]);
  const receipt = await verifyFrameVisibility(request([{ artifact_id: 'FULL', kind: 'fullscreen', expected: expected() }, { artifact_id: 'ALPHA', kind: 'hard-alpha', expected: expected() }, { artifact_id: 'LIGHT', kind: 'light-pass', expected: expected() }]), async (item) => ({ fullscreen: full, 'hard-alpha': alpha, 'light-pass': light })[item.kind]);
  assert.equal(receipt.artifacts.every((item) => item.sample_count === 3), true); assert.equal(JSON.stringify(receipt).includes(root), false);
});
test('CLI keeps private resolver paths out of success and error output', async (t) => {
  const file = await fixture(t); const privatePath = '/private/render/full.mp4'; const stdout = capture(); const docs = [JSON.stringify(request()), JSON.stringify({ schema_version: 1, locations: [{ artifact_id: 'FULL', kind: 'fullscreen', local_path: privatePath }] })];
  const code = await runFrameVisibilityCli(['request.json', 'locations.json'], { stdout: stdout.stream, readFile: async (name) => docs[name === 'request.json' ? 0 : 1], options: { fsImpl: { lstat: async () => ({ isSymbolicLink: () => false, isFile: () => true, size: 10 }) }, probe: async () => probe(), analyze: async () => ({ min: 16, max: 180, average: 60 }) } });
  assert.equal(code, 0); assert.equal(stdout.value().includes(privatePath), false); const stderr = capture(); assert.equal(await runFrameVisibilityCli(['none', 'locations'], { stderr: stderr.stream, readFile: async () => { throw new Error(privatePath); } }), 3); assert.equal(stderr.value().includes(privatePath), false); assert.equal(file.length > 0, true);
});
test('derives sample times from the rational frame interval', () => { assert.deepEqual(sampleTimes(2000, { numerator: 30000, denominator: 1001 }), [34, 1000, 1966]); assert.throws(() => sampleTimes(20, { numerator: 30, denominator: 1 })); });
