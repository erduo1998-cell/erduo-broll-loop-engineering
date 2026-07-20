import test from 'node:test';
import assert from 'node:assert/strict';
import { createStageReceipt, StageReceiptError, validateStageReceipt } from './stage-receipt.mjs';

const sha = (letter) => letter.repeat(64);
const output = { mode: 'faceless', srt_sha256: sha('a'), time_source: 'srt', capabilities: ['local-files'] };
test('creates a private-path-free receipt with a deterministic integrity hash', () => {
  const receipt = createStageReceipt({ stage: 'preflight', run_id: 'run-test', input_sha256: sha('b'), output });
  assert.equal(validateStageReceipt(receipt).receipt_sha256, receipt.receipt_sha256);
  assert.equal(JSON.stringify(receipt).includes('/Users/'), false);
});
test('rejects receipt tampering, wrong predecessor, and private values', () => {
  const receipt = createStageReceipt({ stage: 'preflight', run_id: 'run-test', input_sha256: sha('b'), output });
  receipt.output.mode = 'talking-head';
  assert.throws(() => validateStageReceipt(receipt), (error) => error instanceof StageReceiptError && error.code === 'receipt_tampered');
  assert.throws(() => createStageReceipt({ stage: 'preflight', run_id: 'run-test', input_sha256: sha('b'), output: { ...output, capabilities: ['/private/path'] } }), (error) => error.code === 'receipt_privacy_violation');
  const clean = createStageReceipt({ stage: 'preflight', run_id: 'run-test', input_sha256: sha('b'), output });
  assert.throws(() => validateStageReceipt(clean, { expectedUpstream: sha('c') }), (error) => error.code === 'receipt_upstream_mismatch');
});
test('locks the SURGE adapter to project time, delivery, and host-call evidence', () => {
  const receipt = createStageReceipt({ stage: 'director', run_id: 'run-test', input_sha256: sha('b'), upstream_receipt_sha256: sha('c'), output: { plan_sha256: sha('d'), briefs_sha256: sha('e'), surge_adapter: { required_skill: 'video-script-builder', time_source: 'srt', disallowed_outputs: ['video-spec-hf.md', 'word-estimated-timing', 'asset-route-override'], invocation_evidence: { host: 'fixture-test', mechanism: 'fixture', args_sha256: sha('f'), transcript_sha256: sha('a'), status: 'verified' } } } });
  assert.equal(validateStageReceipt(receipt).output.surge_adapter.time_source, 'srt');
});
