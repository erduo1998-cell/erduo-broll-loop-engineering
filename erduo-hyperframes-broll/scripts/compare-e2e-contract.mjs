#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAndRunE2eFixture } from './run-e2e-fixture.mjs';

export class E2eComparisonError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'E2eComparisonError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new E2eComparisonError(code, message); };
const exactKeys = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...fields].sort());
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;

function validateReceipt(receipt) {
  if (!exactKeys(receipt, ['schema_version', 'host', 'fixture_id', 'check', 'delivery', 'visibility']) || receipt.schema_version !== 1 || !['codex', 'claude-code'].includes(receipt.host) || typeof receipt.fixture_id !== 'string') fail('invalid_receipt', 'Host receipt is invalid.');
  if (!exactKeys(receipt.check, ['ok', 'duration_ms']) || receipt.check.ok !== true || !positiveInteger(receipt.check.duration_ms)) fail('invalid_receipt', 'Host receipt is invalid.');
  if (!exactKeys(receipt.delivery, ['kind', 'container', 'codec', 'pixel_format', 'duration_ms', 'width', 'height', 'frame_rate', 'audio_count']) || receipt.delivery.kind !== 'faceless-master' || receipt.delivery.container !== 'mp4' || receipt.delivery.codec !== 'h264' || receipt.delivery.pixel_format !== 'yuv420p' || !positiveInteger(receipt.delivery.duration_ms) || !positiveInteger(receipt.delivery.width) || !positiveInteger(receipt.delivery.height) || !exactKeys(receipt.delivery.frame_rate, ['numerator', 'denominator']) || !positiveInteger(receipt.delivery.frame_rate.numerator) || !positiveInteger(receipt.delivery.frame_rate.denominator) || receipt.delivery.audio_count !== 0) fail('invalid_receipt', 'Host receipt is invalid.');
  if (!exactKeys(receipt.visibility, ['sample_count']) || !positiveInteger(receipt.visibility.sample_count)) fail('invalid_receipt', 'Host receipt is invalid.');
  return receipt;
}

export async function compareE2eContracts(fixtureId, receipts) {
  if (!Array.isArray(receipts) || receipts.length !== 2) fail('invalid_receipts', 'Exactly one Codex and one Claude Code receipt are required.');
  const fixture = await loadAndRunE2eFixture(fixtureId);
  const normalized = receipts.map(validateReceipt).sort((a, b) => a.host.localeCompare(b.host));
  if (normalized[0].host !== 'claude-code' || normalized[1].host !== 'codex' || new Set(normalized.map((receipt) => receipt.fixture_id)).size !== 1 || normalized[0].fixture_id !== fixture.fixture_id) fail('fixture_mismatch', 'Host receipts do not describe the same fixture.');
  for (const receipt of normalized) {
    const delivery = receipt.delivery;
    if (receipt.check.duration_ms !== fixture.duration_ms || delivery.duration_ms !== fixture.duration_ms || delivery.width !== fixture.composition.canvas.width || delivery.height !== fixture.composition.canvas.height || delivery.frame_rate.numerator !== fixture.composition.canvas.fps || delivery.frame_rate.denominator !== 1) fail('contract_mismatch', 'Host output does not satisfy the fixture contract.');
  }
  return {
    schema_version: 1,
    fixture_id: fixture.fixture_id,
    duration_ms: fixture.duration_ms,
    shot_count: fixture.shot_count,
    coverage_basis_points: fixture.coverage_basis_points,
    route: fixture.route,
    master: { kind: 'faceless-master', container: 'mp4', codec: 'h264', pixel_format: 'yuv420p', width: fixture.composition.canvas.width, height: fixture.composition.canvas.height, frame_rate: { numerator: fixture.composition.canvas.fps, denominator: 1 }, audio_count: 0 },
    hosts: normalized.map(({ host, check, visibility }) => ({ host, check_duration_ms: check.duration_ms, visible_samples: visibility.sample_count }))
  };
}

async function main(argv) {
  if (argv.length !== 3) fail('usage', 'Usage: node scripts/compare-e2e-contract.mjs <fixture-id> <codex-receipt.json> <claude-receipt.json>');
  const [fixtureId, firstPath, secondPath] = argv;
  const receipts = await Promise.all([firstPath, secondPath].map(async (entry) => JSON.parse(await readFile(entry, 'utf8'))));
  process.stdout.write(`${JSON.stringify(await compareE2eContracts(fixtureId, receipts))}\n`);
}

const mainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (mainModule) {
  try { await main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${JSON.stringify({ ok: false, error: { code: error instanceof E2eComparisonError ? error.code : 'read_failed', message: error instanceof E2eComparisonError ? error.message : 'E2E comparison could not be read.' } })}\n`); process.exitCode = error instanceof E2eComparisonError && error.code === 'usage' ? 64 : 2; }
}
