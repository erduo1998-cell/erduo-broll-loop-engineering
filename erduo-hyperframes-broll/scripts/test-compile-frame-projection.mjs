import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  compileFrameProjection,
  FRAME_PROJECTION_CONTRACT,
  FRAME_PROJECTION_RULE,
  FrameProjectionError,
  validateFrameProjection,
} from './compile-frame-projection.mjs';

const execFileAsync = promisify(execFile);
const sha = (letter) => letter.repeat(64);

function input({
  fps = { numerator: 24, denominator: 1 },
  windows = [[0, 1000], [1000, 2000]],
} = {}) {
  return {
    pipeline_contract_version: 2,
    artifact_id: 'projection-main',
    parsed_srt_sha256: sha('a'),
    plan_sha256: sha('b'),
    fps,
    shots: windows.map(([start_ms, end_ms], index) => ({
      shot_id: `S${String(index + 1).padStart(3, '0')}`,
      start_ms,
      end_ms,
    })),
  };
}

function reverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).reverse().map((key) => [key, reverseObjectKeys(value[key])]));
}

test('projects 24 fps with one shared nearest-half-up boundary rule', () => {
  const result = compileFrameProjection(input({ windows: [[0, 21], [21, 63], [63, 1000]] }));
  assert.equal(result.contract, FRAME_PROJECTION_CONTRACT);
  assert.equal(result.rule_version, FRAME_PROJECTION_RULE);
  assert.deepEqual(result.shots.map((shot) => shot.frame_window), [
    { start_frame: 0, end_frame: 1, duration_frames: 1 },
    { start_frame: 1, end_frame: 2, duration_frames: 1 },
    { start_frame: 2, end_frame: 24, duration_frames: 22 },
  ]);
  assert.equal(result.timeline.end_frame, 24);
  assert.equal(result.timeline.duration_frames, 24);
  assert.match(result.receipt.input_sha256, /^[0-9a-f]{64}$/u);
  assert.match(result.receipt.projection_sha256, /^[0-9a-f]{64}$/u);
  assert.equal(Object.keys(result).some((key) => key.includes('path')), false);
  assert.deepEqual(validateFrameProjection(result), result);
});

test('projects 30 fps and preserves every adjacent shared boundary', () => {
  const result = compileFrameProjection(input({
    fps: { numerator: 30, denominator: 1 },
    windows: [[0, 17], [17, 50], [50, 1000]],
  }));
  assert.deepEqual(result.shots.map((shot) => shot.frame_window), [
    { start_frame: 0, end_frame: 1, duration_frames: 1 },
    { start_frame: 1, end_frame: 2, duration_frames: 1 },
    { start_frame: 2, end_frame: 30, duration_frames: 28 },
  ]);
});

test('projects exact 30000/1001 fps without floating-point drift', () => {
  const result = compileFrameProjection(input({
    fps: { numerator: 30000, denominator: 1001 },
    windows: [[1001, 1502], [1502, 2002]],
  }));
  assert.deepEqual(result.timeline, {
    start_ms: 1001,
    end_ms: 2002,
    start_frame: 30,
    end_frame: 60,
    duration_frames: 30,
  });
  assert.equal(result.shots[0].frame_window.end_frame, result.shots[1].frame_window.start_frame);
});

test('receipt and projection are deterministic and path-free', () => {
  const first = compileFrameProjection(input());
  const second = compileFrameProjection(structuredClone(input()));
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first).includes(process.cwd()), false);
  assert.equal(JSON.stringify(first).includes('file://'), false);
});

test('validation ignores recursive object key order but preserves array order', () => {
  const projection = compileFrameProjection(input());
  assert.deepEqual(validateFrameProjection(reverseObjectKeys(projection)), projection);
  const reorderedShots = structuredClone(projection);
  reorderedShots.shots.reverse();
  assert.throws(() => validateFrameProjection(reorderedShots), (error) => error.code === 'invalid_shot_id');
});

test('rejects non-reduced, unsafe or zero rational frame rates', () => {
  for (const fps of [
    { numerator: 48, denominator: 2 },
    { numerator: 0, denominator: 1 },
    { numerator: 24, denominator: 0 },
    { numerator: Number.MAX_SAFE_INTEGER + 1, denominator: 1 },
  ]) {
    assert.throws(
      () => compileFrameProjection(input({ fps })),
      (error) => error instanceof FrameProjectionError && error.code === 'invalid_fps',
    );
  }
});

test('rejects missing or wrong pipeline contract versions in input, output and receipt', () => {
  const missingInput = input();
  delete missingInput.pipeline_contract_version;
  assert.throws(() => compileFrameProjection(missingInput), (error) => error.code === 'pipeline_upgrade_required');
  const wrongInput = input();
  wrongInput.pipeline_contract_version = 1;
  assert.throws(() => compileFrameProjection(wrongInput), (error) => error.code === 'pipeline_upgrade_required');

  const missingOutput = compileFrameProjection(input());
  delete missingOutput.pipeline_contract_version;
  assert.throws(() => validateFrameProjection(missingOutput), (error) => error.code === 'pipeline_upgrade_required');
  const wrongReceipt = compileFrameProjection(input());
  wrongReceipt.receipt.pipeline_contract_version = 1;
  assert.throws(() => validateFrameProjection(wrongReceipt), (error) => error.code === 'pipeline_upgrade_required');
});

test('rejects SRT gaps, overlaps and zero-frame shots', () => {
  assert.throws(
    () => compileFrameProjection(input({ windows: [[0, 1000], [1001, 2000]] })),
    (error) => error.code === 'srt_window_discontinuity',
  );
  assert.throws(
    () => compileFrameProjection(input({ windows: [[0, 1000], [999, 2000]] })),
    (error) => error.code === 'srt_window_discontinuity',
  );
  assert.throws(
    () => compileFrameProjection(input({ windows: [[0, 1], [1, 1000]] })),
    (error) => error.code === 'zero_frame_shot' && error.shot === 1,
  );
});

test('rejects tampered frames, fps, rule, SRT hash and receipt hash', () => {
  for (const mutate of [
    (value) => { value.shots[0].frame_window.end_frame += 1; },
    (value) => { value.fps.numerator = 30; },
    (value) => { value.rule_version = 'other-rule-v1'; },
    (value) => { value.parsed_srt_sha256 = sha('c'); },
    (value) => { value.receipt.projection_sha256 = sha('d'); },
  ]) {
    const value = compileFrameProjection(input());
    mutate(value);
    assert.throws(() => validateFrameProjection(value), (error) => [
      'projection_tampered',
      'invalid_projection',
    ].includes(error.code));
  }
});

test('CLI compiles one JSON input and rejects missing input', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'frame-projection-'));
  const inputPath = path.join(directory, 'input.json');
  const script = fileURLToPath(new URL('./compile-frame-projection.mjs', import.meta.url));
  try {
    await writeFile(inputPath, JSON.stringify(input()), 'utf8');
    const { stdout } = await execFileAsync(process.execPath, [script, inputPath]);
    assert.deepEqual(JSON.parse(stdout), compileFrameProjection(input()));
    await assert.rejects(execFileAsync(process.execPath, [script]), (error) => error.code === 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
