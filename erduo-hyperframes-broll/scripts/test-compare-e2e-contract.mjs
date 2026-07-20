import assert from 'node:assert/strict';
import test from 'node:test';
import { compareE2eContracts, E2eComparisonError } from './compare-e2e-contract.mjs';
import { createE2eHostReceipt, E2eHostReceiptError } from './create-e2e-host-receipt.mjs';

const receipt = (host, overrides = {}) => ({
  schema_version: 1,
  host,
  fixture_id: 'faceless-basic',
  check: { ok: true, duration_ms: 4000 },
  delivery: { kind: 'faceless-master', container: 'mp4', codec: 'h264', pixel_format: 'yuv420p', duration_ms: 4000, width: 1920, height: 1080, frame_rate: { numerator: 30, denominator: 1 }, audio_count: 0 },
  visibility: { sample_count: 3 },
  ...overrides
});

test('compares the public faceless contract rather than host-specific files', async () => {
  const result = await compareE2eContracts('faceless-basic', [receipt('codex'), receipt('claude-code')]);
  assert.deepEqual(result.master, { kind: 'faceless-master', container: 'mp4', codec: 'h264', pixel_format: 'yuv420p', width: 1920, height: 1080, frame_rate: { numerator: 30, denominator: 1 }, audio_count: 0 });
  assert.deepEqual(result.hosts, [{ host: 'claude-code', check_duration_ms: 4000, visible_samples: 3 }, { host: 'codex', check_duration_ms: 4000, visible_samples: 3 }]);
});

test('rejects a host receipt whose rendered duration drifts from the fixture', async () => {
  await assert.rejects(() => compareE2eContracts('faceless-basic', [receipt('codex'), receipt('claude-code', { delivery: { ...receipt('claude-code').delivery, duration_ms: 3900 } })]), (error) => error instanceof E2eComparisonError && error.code === 'contract_mismatch');
});

test('rejects an accidental duplicate host receipt', async () => {
  await assert.rejects(() => compareE2eContracts('faceless-basic', [receipt('codex'), receipt('codex')]), (error) => error instanceof E2eComparisonError && error.code === 'fixture_mismatch');
});

test('requires a successful current check before making a host receipt', async () => {
  await assert.rejects(() => createE2eHostReceipt({ host: 'codex', fixtureId: 'faceless-basic', check: { ok: false }, artifactPath: '/not-used.mp4' }), (error) => error instanceof E2eHostReceiptError && error.code === 'invalid_check');
});
