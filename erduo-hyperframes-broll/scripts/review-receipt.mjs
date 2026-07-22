import { createHash } from 'node:crypto';
import { validateBoundedMetrics } from './artifact-manifest.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const PRIVATE_PATH = /(?:^|\s)(?:\/(?!\/)[^\s]*|[A-Za-z]:[\\/][^\s]*|\\\\[^\s]*|file:[^\s]*)/u;
const MAX_BYTES = 8 * 1024;

export class ReviewReceiptError extends Error {
  constructor(code, message) { super(message); this.name = 'ReviewReceiptError'; this.code = code; }
}
const fail = (code, message) => { throw new ReviewReceiptError(code, message); };
const exact = (value, fields, code = 'review_receipt_invalid') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail(code, 'Review receipt has an invalid shape.');
};
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { if (!Number.isSafeInteger(value)) fail('review_receipt_invalid', 'Review numbers must be safe integers.'); return value; }
  if (!value || typeof value !== 'object') fail('review_receipt_invalid', 'Review value is unsupported.');
  if (Array.isArray(value)) return value.map(canonical);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}
export const fingerprintReviewValue = (value) => createHash('sha256').update(JSON.stringify(canonical(value)), 'utf8').digest('hex');
const byteLength = (value) => Buffer.byteLength(JSON.stringify(canonical(value)), 'utf8');

function assertPrivacy(value) {
  const visit = (item) => {
    if (typeof item === 'string') { if (PRIVATE_PATH.test(item)) fail('review_privacy_violation', 'Review receipt contains a private absolute path.'); return; }
    if (!item || typeof item !== 'object') return;
    Object.values(item).forEach(visit);
  };
  visit(value);
}

function validateFindings(findings, status) {
  if (!Array.isArray(findings) || findings.length > 12) fail('review_receipt_invalid', 'Review findings exceed the bounded limit.');
  let errors = 0;
  for (const finding of findings) {
    exact(finding, ['code', 'severity', 'artifact_id', 'shot_id', 'message']);
    if (!SAFE_ID.test(finding.code ?? '') || !['error', 'warning', 'info'].includes(finding.severity) || !SAFE_ID.test(finding.artifact_id ?? '')
      || !(finding.shot_id === null || /^S\d{3}$/u.test(finding.shot_id)) || typeof finding.message !== 'string' || !finding.message.trim() || Buffer.byteLength(finding.message, 'utf8') > 240) fail('review_receipt_invalid', 'Review finding is invalid.');
    if (finding.severity === 'error') errors += 1;
  }
  if (status === 'approved' && errors) fail('review_status_inconsistent', 'Approved review cannot contain error findings.');
  if (status === 'revision_required' && !errors) fail('review_status_inconsistent', 'Revision review needs an error finding.');
}

export function createReviewReceipt({ gate, status, subject_manifest_sha256, reviewer_role, reviewer_isolation_sha256, criteria_version, inspected_artifact_sha256s, metrics, findings, evidence_bundle_sha256 }) {
  if (!SAFE_ID.test(gate ?? '') || !['approved', 'revision_required'].includes(status) || !SHA256.test(subject_manifest_sha256 ?? '')
    || !SAFE_ID.test(reviewer_role ?? '') || !SHA256.test(reviewer_isolation_sha256 ?? '') || !SAFE_ID.test(criteria_version ?? '')
    || !Array.isArray(inspected_artifact_sha256s) || !inspected_artifact_sha256s.length || inspected_artifact_sha256s.length > 256
    || inspected_artifact_sha256s.some((value) => !SHA256.test(value)) || new Set(inspected_artifact_sha256s).size !== inspected_artifact_sha256s.length
    || !SHA256.test(evidence_bundle_sha256 ?? '')) fail('review_receipt_invalid', 'Review identity or evidence binding is invalid.');
  validateBoundedMetrics(metrics);
  validateFindings(findings, status);
  const core = { schema_version: 2, gate, status, subject_manifest_sha256, reviewer_role, reviewer_isolation_sha256, criteria_version, inspected_artifact_sha256s, metrics, findings, evidence_bundle_sha256 };
  assertPrivacy(core);
  const receipt = { ...core, receipt_sha256: fingerprintReviewValue(core) };
  if (byteLength(receipt) > MAX_BYTES) fail('review_receipt_too_large', 'Review receipt exceeds 8192 bytes.');
  return receipt;
}

export function validateReviewReceipt(receipt, { expectedGate, expectedSubjectManifestSha256, expectedProducerIsolationSha256, expectedReviewerRole, expectedInspectedArtifactSha256s } = {}) {
  exact(receipt, ['schema_version', 'gate', 'status', 'subject_manifest_sha256', 'reviewer_role', 'reviewer_isolation_sha256', 'criteria_version', 'inspected_artifact_sha256s', 'metrics', 'findings', 'evidence_bundle_sha256', 'receipt_sha256']);
  const rebuilt = createReviewReceipt(receipt);
  if (receipt.schema_version !== 2 || receipt.receipt_sha256 !== rebuilt.receipt_sha256) fail('review_receipt_tampered', 'Review receipt hash does not match its content.');
  if (expectedProducerIsolationSha256 && receipt.reviewer_isolation_sha256 === expectedProducerIsolationSha256) fail('self_attested_review', 'Artifact producer cannot review its own output.');
  if (expectedGate && receipt.gate !== expectedGate) fail('review_subject_mismatch', 'Review gate does not match.');
  if (expectedSubjectManifestSha256 && receipt.subject_manifest_sha256 !== expectedSubjectManifestSha256) fail('review_subject_mismatch', 'Review does not bind expected manifest.');
  if (expectedReviewerRole && receipt.reviewer_role !== expectedReviewerRole) fail('review_subject_mismatch', 'Reviewer role does not match the gate.');
  if (expectedInspectedArtifactSha256s) {
    const expected = [...expectedInspectedArtifactSha256s].sort();
    const actual = [...receipt.inspected_artifact_sha256s].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('review_inspection_unbound', 'Review did not inspect the complete expected artifact set.');
  }
  return receipt;
}
