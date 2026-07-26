#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FRAME_PROJECTION_CONTRACT = 'scripts/compile-frame-projection.mjs#schema-v1';
export const FRAME_PROJECTION_RULE = 'absolute-ms-nearest-half-up-shared-boundary-v1';

const SHA256 = /^[0-9a-f]{64}$/u;
const SHOT_ID = /^S[0-9]{3}$/u;
const ARTIFACT_ID = /^[a-z0-9][a-z0-9-]{1,63}$/u;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

export class FrameProjectionError extends Error {
  constructor(code, message, shot) {
    super(message);
    this.name = 'FrameProjectionError';
    this.code = code;
    if (shot !== undefined) this.shot = shot;
  }
}

function fail(code, message, shot) {
  throw new FrameProjectionError(code, message, shot);
}

function exact(value, fields, code, message, shot) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, message, shot);
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail(code, message, shot);
}

function hashValue(value) {
  if (Array.isArray(value)) return createHash('sha256').update(JSON.stringify(value.map(canonicalize)), 'utf8').digest('hex');
  return createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');
}

function canonicalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function greatestCommonDivisor(left, right) {
  let a = BigInt(left);
  let b = BigInt(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function normalizeFps(value) {
  exact(value, ['numerator', 'denominator'], 'invalid_fps', 'Frame rate must be an exact rational pair.');
  if (
    !Number.isSafeInteger(value.numerator)
    || !Number.isSafeInteger(value.denominator)
    || value.numerator <= 0
    || value.denominator <= 0
    || greatestCommonDivisor(value.numerator, value.denominator) !== 1n
  ) fail('invalid_fps', 'Frame rate numerator and denominator must be positive, safe and reduced.');
  return { numerator: value.numerator, denominator: value.denominator };
}

function projectBoundary(milliseconds, fps) {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) fail('invalid_millisecond_boundary', 'Frame boundaries require non-negative integer milliseconds.');
  const numerator = BigInt(milliseconds) * BigInt(fps.numerator);
  const denominator = 1000n * BigInt(fps.denominator);
  // One absolute boundary function is used for every start and end. Ties round
  // toward the later frame. Shared millisecond boundaries therefore always
  // become the same frame and cannot create independent-rounding gaps.
  const frame = ((2n * numerator) + denominator) / (2n * denominator);
  if (frame > MAX_SAFE_BIGINT) fail('unsafe_frame_boundary', 'Projected frame exceeds the safe integer range.');
  return Number(frame);
}

function projectionCore(input) {
  if (!input || input.pipeline_contract_version !== 2) fail('pipeline_upgrade_required', 'Frame projection requires pipeline contract version 2.');
  exact(
    input,
    ['pipeline_contract_version', 'artifact_id', 'parsed_srt_sha256', 'plan_sha256', 'fps', 'shots'],
    'invalid_projection_input',
    'Frame projection input shape is invalid.',
  );
  if (!ARTIFACT_ID.test(input.artifact_id ?? '')) fail('invalid_artifact_id', 'Projection artifact ID must be path-free.');
  if (!SHA256.test(input.parsed_srt_sha256 ?? '') || !SHA256.test(input.plan_sha256 ?? '')) fail('invalid_projection_hash', 'Parsed-SRT and plan hashes are required.');
  const fps = normalizeFps(input.fps);
  if (!Array.isArray(input.shots) || input.shots.length < 1) fail('invalid_projection_input', 'At least one shot window is required.');

  let previousEndMs;
  let previousEndFrame;
  const sourceWindows = [];
  const shots = input.shots.map((shot, index) => {
    const shotNumber = index + 1;
    exact(shot, ['shot_id', 'start_ms', 'end_ms'], 'invalid_srt_window', 'Shot SRT window shape is invalid.', shotNumber);
    const expectedId = `S${String(shotNumber).padStart(3, '0')}`;
    if (!SHOT_ID.test(shot.shot_id ?? '') || shot.shot_id !== expectedId) fail('invalid_shot_id', 'Projection shots must be ordered S001 onward.', shotNumber);
    if (!Number.isSafeInteger(shot.start_ms) || !Number.isSafeInteger(shot.end_ms) || shot.start_ms < 0 || shot.end_ms <= shot.start_ms) {
      fail('invalid_srt_window', 'Shot SRT windows must be non-empty half-open integer millisecond intervals.', shotNumber);
    }
    if (previousEndMs !== undefined && shot.start_ms !== previousEndMs) fail('srt_window_discontinuity', 'Shot SRT windows must be contiguous.', shotNumber);
    const startFrame = projectBoundary(shot.start_ms, fps);
    const endFrame = projectBoundary(shot.end_ms, fps);
    if (previousEndFrame !== undefined && startFrame !== previousEndFrame) fail('frame_window_discontinuity', 'Shared millisecond boundaries must map to one shared frame.', shotNumber);
    if (endFrame <= startFrame) fail('zero_frame_shot', 'A non-empty SRT shot projected to zero frames.', shotNumber);
    previousEndMs = shot.end_ms;
    previousEndFrame = endFrame;
    sourceWindows.push({ shot_id: expectedId, start_ms: shot.start_ms, end_ms: shot.end_ms });
    return {
      shot_id: expectedId,
      srt_window_ms: { start_ms: shot.start_ms, end_ms: shot.end_ms },
      frame_window: {
        start_frame: startFrame,
        end_frame: endFrame,
        duration_frames: endFrame - startFrame,
      },
    };
  });

  const first = shots[0];
  const last = shots.at(-1);
  return {
    schema_version: 1,
    pipeline_contract_version: 2,
    artifact_id: input.artifact_id,
    contract: FRAME_PROJECTION_CONTRACT,
    rule_version: FRAME_PROJECTION_RULE,
    parsed_srt_sha256: input.parsed_srt_sha256,
    plan_sha256: input.plan_sha256,
    fps,
    source_windows_sha256: hashValue(sourceWindows),
    timeline: {
      start_ms: first.srt_window_ms.start_ms,
      end_ms: last.srt_window_ms.end_ms,
      start_frame: first.frame_window.start_frame,
      end_frame: last.frame_window.end_frame,
      duration_frames: last.frame_window.end_frame - first.frame_window.start_frame,
    },
    shots,
  };
}

export function compileFrameProjection(input) {
  const core = projectionCore(input);
  const inputFingerprint = hashValue({
    pipeline_contract_version: core.pipeline_contract_version,
    parsed_srt_sha256: core.parsed_srt_sha256,
    plan_sha256: core.plan_sha256,
    fps: core.fps,
    rule_version: core.rule_version,
    source_windows_sha256: core.source_windows_sha256,
  });
  const projectionSha256 = hashValue(core);
  return {
    ...core,
    receipt: {
      schema_version: 1,
      pipeline_contract_version: 2,
      kind: 'frame-projection',
      input_sha256: inputFingerprint,
      projection_sha256: projectionSha256,
    },
  };
}

export function validateFrameProjection(document) {
  if (
    !document
    || document.pipeline_contract_version !== 2
    || document.receipt?.pipeline_contract_version !== 2
  ) fail('pipeline_upgrade_required', 'Frame projection and its receipt require pipeline contract version 2.');
  exact(
    document,
    ['schema_version', 'pipeline_contract_version', 'artifact_id', 'contract', 'rule_version', 'parsed_srt_sha256', 'plan_sha256', 'fps', 'source_windows_sha256', 'timeline', 'shots', 'receipt'],
    'invalid_projection',
    'Frame projection shape is invalid.',
  );
  if (
    document.schema_version !== 1
    || document.pipeline_contract_version !== 2
    || document.contract !== FRAME_PROJECTION_CONTRACT
    || document.rule_version !== FRAME_PROJECTION_RULE
    || !SHA256.test(document.source_windows_sha256 ?? '')
  ) fail('invalid_projection', 'Frame projection identity is invalid.');
  if (!Array.isArray(document.shots) || document.shots.length < 1) fail('invalid_projection', 'Frame projection has no shots.');
  const recomputed = compileFrameProjection({
    pipeline_contract_version: document.pipeline_contract_version,
    artifact_id: document.artifact_id,
    parsed_srt_sha256: document.parsed_srt_sha256,
    plan_sha256: document.plan_sha256,
    fps: document.fps,
    shots: document.shots.map((shot, index) => {
      exact(shot, ['shot_id', 'srt_window_ms', 'frame_window'], 'invalid_projection', 'Projected shot shape is invalid.', index + 1);
      exact(shot.srt_window_ms, ['start_ms', 'end_ms'], 'invalid_projection', 'Projected SRT window shape is invalid.', index + 1);
      exact(shot.frame_window, ['start_frame', 'end_frame', 'duration_frames'], 'invalid_projection', 'Projected frame window shape is invalid.', index + 1);
      return {
        shot_id: shot.shot_id,
        start_ms: shot.srt_window_ms.start_ms,
        end_ms: shot.srt_window_ms.end_ms,
      };
    }),
  });
  if (hashValue(document) !== hashValue(recomputed)) fail('projection_tampered', 'Frame projection does not match the shared boundary rule.');
  return recomputed;
}

function parseArgs(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) return { help: true };
  const pretty = argv.filter((item) => item === '--pretty').length;
  const positional = argv.filter((item) => !item.startsWith('-'));
  const unknown = argv.filter((item) => item.startsWith('-') && item !== '--pretty');
  if (pretty > 1 || unknown.length || positional.length !== 1 || argv.length !== positional.length + pretty) return { error: true };
  return { input: positional[0], pretty: pretty === 1 };
}

async function main(argv) {
  const usage = 'Usage: node compile-frame-projection.mjs <projection-input.json> [--pretty]';
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  if (args.error) {
    process.stderr.write(`${usage}\n`);
    process.exitCode = 2;
    return;
  }
  try {
    const input = JSON.parse(await readFile(args.input, 'utf8'));
    process.stdout.write(`${JSON.stringify(compileFrameProjection(input), null, args.pretty ? 2 : 0)}\n`);
  } catch (error) {
    const code = error instanceof FrameProjectionError ? error.code : 'projection_input_unreadable';
    process.stderr.write(`${JSON.stringify({ ok: false, code, message: error.message, ...(error.shot === undefined ? {} : { shot: error.shot }) })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
