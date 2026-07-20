#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAndRunE2eFixture } from './run-e2e-fixture.mjs';
import { verifyDeliveryMedia } from './delivery-media-gate.mjs';
import { verifyFrameVisibility } from './frame-visibility-gate.mjs';

export class E2eHostReceiptError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'E2eHostReceiptError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new E2eHostReceiptError(code, message); };
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;

function checkDurationMs(check) {
  const duration = check?.layout?.duration ?? check?.duration;
  if (check?.ok !== true || !Number.isFinite(duration) || duration <= 0) fail('invalid_check', 'HyperFrames check receipt is invalid.');
  return Math.round(duration * 1000);
}

export async function createE2eHostReceipt({ host, fixtureId, check, artifactPath }) {
  if (!['codex', 'claude-code'].includes(host) || typeof fixtureId !== 'string' || typeof artifactPath !== 'string' || !artifactPath) fail('invalid_request', 'Host receipt request is invalid.');
  const fixture = await loadAndRunE2eFixture(fixtureId);
  if (fixture.mode !== 'faceless') fail('unsupported_fixture', 'Only the public faceless render receipt is supported.');
  const duration_ms = checkDurationMs(check);
  const expected = { duration_ms: fixture.duration_ms, width: fixture.composition.canvas.width, height: fixture.composition.canvas.height, frame_rate: { numerator: fixture.composition.canvas.fps, denominator: 1 } };
  const delivery = await verifyDeliveryMedia({ schema_version: 1, artifacts: [{ artifact_id: 'FIXTURE_MASTER', kind: 'faceless-master', expected }] }, () => artifactPath);
  const visibility = await verifyFrameVisibility({ schema_version: 1, artifacts: [{ artifact_id: 'FIXTURE_MASTER', kind: 'faceless-master', expected: { duration_ms: fixture.duration_ms, frame_rate: expected.frame_rate } }] }, () => artifactPath);
  const media = delivery.artifacts[0];
  if (!positiveInteger(visibility.artifacts[0]?.sample_count)) fail('invalid_visibility', 'Frame visibility receipt is invalid.');
  return { schema_version: 1, host, fixture_id: fixture.fixture_id, check: { ok: true, duration_ms }, delivery: { kind: media.kind, container: path.extname(artifactPath).toLowerCase() === '.mp4' ? 'mp4' : 'unknown', codec: media.codec, pixel_format: media.pixel_format, duration_ms: media.duration_ms, width: media.width, height: media.height, frame_rate: { numerator: media.frame_rate.numerator, denominator: media.frame_rate.denominator }, audio_count: media.audio_count }, visibility: { sample_count: visibility.artifacts[0].sample_count } };
}

async function main(argv) {
  if (argv.length !== 4) fail('usage', 'Usage: node scripts/create-e2e-host-receipt.mjs <codex|claude-code> <fixture-id> <check.json> <master.mp4>');
  const [host, fixtureId, checkPath, artifactPath] = argv;
  const check = JSON.parse(await readFile(checkPath, 'utf8'));
  process.stdout.write(`${JSON.stringify(await createE2eHostReceipt({ host, fixtureId, check, artifactPath }))}\n`);
}

const mainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (mainModule) {
  try { await main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${JSON.stringify({ ok: false, error: { code: error instanceof E2eHostReceiptError ? error.code : 'verification_failed', message: error instanceof E2eHostReceiptError ? error.message : 'Host receipt could not be created.' } })}\n`); process.exitCode = error instanceof E2eHostReceiptError && error.code === 'usage' ? 64 : 2; }
}
