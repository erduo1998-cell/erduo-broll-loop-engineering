import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReviewReceipt, ReviewReceiptError, validateReviewReceipt } from './review-receipt.mjs';
const sha = (letter) => letter.repeat(64);
const base = () => ({ gate: 'plan_review', status: 'approved', subject_manifest_sha256: sha('a'), reviewer_role: 'broll-plan-review', reviewer_isolation_sha256: sha('c'), criteria_version: 'plan_review.v1', inspected_artifact_sha256s: [sha('d'), sha('e')], metrics: { shot_count: 2, native_route_bp: 0 }, findings: [], evidence_bundle_sha256: sha('f') });
test('binds reviewer role, criteria, complete inspected artifacts, metrics and evidence bundle', () => {
  const receipt = createReviewReceipt(base());
  assert.equal(validateReviewReceipt(receipt, { expectedGate: 'plan_review', expectedSubjectManifestSha256: sha('a'), expectedProducerIsolationSha256: sha('b'), expectedReviewerRole: 'broll-plan-review', expectedInspectedArtifactSha256s: [sha('d'), sha('e')] }).status, 'approved');
});
test('rejects producer self-review, incomplete inspection, approved errors, private /tmp path and >8KiB receipts', () => {
  const receipt = createReviewReceipt(base());
  assert.throws(() => validateReviewReceipt(receipt, { expectedProducerIsolationSha256: sha('c') }), (error) => error instanceof ReviewReceiptError && error.code === 'self_attested_review');
  assert.throws(() => validateReviewReceipt(receipt, { expectedInspectedArtifactSha256s: [sha('d'), sha('e'), sha('9')] }), (error) => error.code === 'review_inspection_unbound');
  const failed = base(); failed.findings = [{ code: 'native_overage', severity: 'error', artifact_id: 'plan', shot_id: null, message: 'Native route exceeds the confirmed ceiling.' }];
  assert.throws(() => createReviewReceipt(failed), (error) => error.code === 'review_status_inconsistent');
  const privatePath = base(); privatePath.findings = [{ code: 'unsafe', severity: 'warning', artifact_id: 'plan', shot_id: null, message: 'Read /tmp/private.json' }];
  assert.throws(() => createReviewReceipt(privatePath), (error) => error.code === 'review_privacy_violation');
  const huge = base(); huge.inspected_artifact_sha256s = Array.from({ length: 128 }, (_, i) => createHash('sha256').update(String(i)).digest('hex'));
  assert.throws(() => createReviewReceipt(huge), (error) => error.code === 'review_receipt_too_large');
});
