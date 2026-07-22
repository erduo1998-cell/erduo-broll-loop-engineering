import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVisualEvidence, VisualEvidenceError } from './validate-visual-evidence.mjs';
const sha = (letter) => letter.repeat(64);
const fixture = () => ({ schema_version: 2, master_sha256: sha('a'), shots: [{ shot_id: 'S001', master_sha256: sha('a'), window_sha256: sha('e'), entry: { timestamp_ms: 100, frame_sha256: sha('b') }, result: { timestamp_ms: 500, frame_sha256: sha('c') }, exit: { timestamp_ms: 900, frame_sha256: sha('d') } }] });
test('requires master-bound, strictly ordered entry/result/exit states', () => {
  assert.equal(validateVisualEvidence(fixture()).shot_count, 1);
  const missing = fixture(); missing.shots[0].result.frame_sha256 = null;
  assert.throws(() => validateVisualEvidence(missing), (error) => error instanceof VisualEvidenceError && error.code === 'visual_evidence_three_state_missing');
  const order = fixture(); order.shots[0].exit.timestamp_ms = 400; assert.throws(() => validateVisualEvidence(order), (error) => error.code === 'visual_evidence_three_state_missing');
  const stale = fixture(); stale.shots[0].master_sha256 = sha('f'); assert.throws(() => validateVisualEvidence(stale), (error) => error.code === 'visual_evidence_master_mismatch');
});
