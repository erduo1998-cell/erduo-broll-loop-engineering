import { createHash } from 'node:crypto';
import { validateBoundedMetrics } from './artifact-manifest.mjs';

export const PRODUCT_STAGES = ['director', 'assets', 'master-build', 'render', 'shot-export'];
const SHA256 = /^[0-9a-f]{64}$/u;
const PRIVATE_PATH = /(?:^|\s)(?:\/(?!\/)[^\s]*|[A-Za-z]:[\\/][^\s]*|\\\\[^\s]*|file:[^\s]*)/u;
const PRIVATE_KEY = /(?:api[_-]?key|token|secret|cookie|password|authorization|credential|locator|path)/iu;
const MAIN_REVIEW_GATES = new Set(['shot_plan_review', 'asset_fact_review', 'html_preview_review', 'final_frame_review']);
const MAIN_REVIEW_ROLE = 'erduo-hyperframes-broll-main-agent';

export class StageReceiptError extends Error {
  constructor(code, message) { super(message); this.name = 'StageReceiptError'; this.code = code; }
}
const fail = (code, message) => { throw new StageReceiptError(code, message); };
const exact = (value, fields, code = 'invalid_receipt') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail(code, 'Stage receipt has an invalid shape.');
};
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { if (!Number.isSafeInteger(value)) fail('invalid_receipt', 'Receipt numbers must be safe integers.'); return value; }
  if (!value || typeof value !== 'object') fail('invalid_receipt', 'Receipt value is unsupported.');
  if (Array.isArray(value)) return value.map(canonical);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}
export const fingerprintReceiptValue = (value) => createHash('sha256').update(JSON.stringify(canonical(value)), 'utf8').digest('hex');
const byteLength = (value) => Buffer.byteLength(JSON.stringify(canonical(value)), 'utf8');

export function assertReceiptPrivacy(value) {
  const visit = (item) => {
    if (typeof item === 'string') { if (PRIVATE_PATH.test(item)) fail('receipt_privacy_violation', 'Stage receipt contains a private absolute path.'); return; }
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item)) { if (PRIVATE_KEY.test(key)) fail('receipt_privacy_violation', 'Stage receipt contains a private field.'); visit(child); }
  };
  visit(value); return true;
}

function validateIsolation(value) {
  exact(value, ['dispatch_evidence_sha256', 'host', 'mechanism', 'stage_context_sha256'], 'invalid_execution_isolation');
  if (!['claude-code', 'codex', 'fixture-test', 'other'].includes(value.host) || !['claude-agent', 'codex-subagent', 'narrow-packet', 'fixture'].includes(value.mechanism)
    || !SHA256.test(value.dispatch_evidence_sha256) || !SHA256.test(value.stage_context_sha256)) fail('invalid_execution_isolation', 'Execution isolation is invalid.');
  if (value.host === 'claude-code' && value.mechanism !== 'claude-agent') fail('inline_stage_execution', 'Claude stages require Agent isolation.');
  if (value.host === 'fixture-test' && value.mechanism !== 'fixture') fail('invalid_execution_isolation', 'Fixture stages require fixture isolation.');
}
function validateEnvelope(value, producerIsolationSha256) {
  exact(value, ['schema_version', 'stage', 'package_id', 'manifest_sha256', 'upstream_manifest_sha256', 'artifact_counts', 'metrics', 'producer_isolation_sha256'], 'invalid_receipt_output');
  if (value.schema_version !== 1 || !PRODUCT_STAGES.includes(value.stage) || typeof value.package_id !== 'string' || !value.package_id
    || !SHA256.test(value.manifest_sha256) || !SHA256.test(value.upstream_manifest_sha256) || value.producer_isolation_sha256 !== producerIsolationSha256
    || !value.artifact_counts || typeof value.artifact_counts !== 'object' || Array.isArray(value.artifact_counts) || Object.keys(value.artifact_counts).length > 32
    || Object.values(value.artifact_counts).some((count) => !Number.isSafeInteger(count) || count < 0)) fail('invalid_receipt_output', 'Artifact envelope is invalid or not producer-bound.');
  validateBoundedMetrics(value.metrics);
}
function validateMainReviewRef(value, subjectManifestSha256, producerIsolationSha256) {
  exact(value, ['approval_sha256', 'gate', 'review_packet_sha256', 'reviewer_isolation_sha256', 'reviewer_role', 'status', 'subject_manifest_sha256'], 'invalid_main_review');
  if (!MAIN_REVIEW_GATES.has(value.gate) || value.status !== 'approved' || value.subject_manifest_sha256 !== subjectManifestSha256
    || value.reviewer_role !== MAIN_REVIEW_ROLE || !SHA256.test(value.reviewer_isolation_sha256) || value.reviewer_isolation_sha256 === producerIsolationSha256
    || !SHA256.test(value.review_packet_sha256) || !SHA256.test(value.approval_sha256)) {
    fail(value.reviewer_isolation_sha256 === producerIsolationSha256 ? 'self_attested_review' : 'main_agent_review_missing', 'Main-agent review reference is missing or unbound.');
  }
}
function normalizeOutput(output) {
  if (output && typeof output === 'object' && !Array.isArray(output) && !('main_review_refs' in output)) return { ...output, main_review_refs: [] };
  return output;
}
function validateOutput(stage, output, producerIsolationSha256) {
  exact(output, ['main_review_refs', 'manifest_envelope', 'review_refs'], 'invalid_receipt_output');
  validateEnvelope(output.manifest_envelope, producerIsolationSha256);
  if (output.manifest_envelope.stage !== stage || !Array.isArray(output.review_refs) || output.review_refs.length > 4
    || !Array.isArray(output.main_review_refs) || output.main_review_refs.length > 4) fail('invalid_receipt_output', 'Stage output is invalid.');
  const gates = new Set();
  for (const review of output.review_refs) {
    exact(review, ['gate', 'status', 'subject_manifest_sha256', 'reviewer_role', 'reviewer_isolation_sha256', 'receipt_sha256'], 'invalid_receipt_output');
    if (typeof review.gate !== 'string' || !review.gate || gates.has(review.gate) || review.status !== 'approved'
      || review.subject_manifest_sha256 !== output.manifest_envelope.manifest_sha256 || typeof review.reviewer_role !== 'string' || !review.reviewer_role
      || !SHA256.test(review.reviewer_isolation_sha256) || review.reviewer_isolation_sha256 === producerIsolationSha256 || !SHA256.test(review.receipt_sha256)) {
      fail(review.reviewer_isolation_sha256 === producerIsolationSha256 ? 'self_attested_review' : 'review_subject_mismatch', 'Review reference is unbound or not isolated.');
    }
    gates.add(review.gate);
  }
  const mainGates = new Set();
  for (const review of output.main_review_refs) {
    if (mainGates.has(review?.gate)) fail('invalid_main_review', 'Duplicate main-agent review gate.');
    validateMainReviewRef(review, output.manifest_envelope.manifest_sha256, producerIsolationSha256);
    mainGates.add(review.gate);
  }
}

/** Final rendering requires deterministic source/pixel gates, official authoring
 * evidence and the main-agent preview decision for the exact source manifest. */
export function assertFinalRenderPreflight(receipt) {
  validateStageReceipt(receipt, { expectedStage: 'master-build', expectedReviewGates: [], expectedMainReviewGates: ['html_preview_review'] });
  const manifestSha256 = receipt.output.manifest_envelope.manifest_sha256;
  const metrics = receipt.output.manifest_envelope.metrics;
  if (metrics.source_gate_passed !== true || metrics.pixel_gate_passed !== true) {
    fail('pre_master_hard_gate_missing', 'Final render requires passing source and pre-master pixel gates for the exact source manifest.');
  }
  if (metrics.official_hyperframes_skill_used !== true || !SHA256.test(metrics.official_hyperframes_creation_sha256 ?? '')) {
    fail('official_hyperframes_skill_missing', 'Final render requires evidence that the official HyperFrames skill authored the HTML composition.');
  }
  return { subject_manifest_sha256: manifestSha256, source_gate_passed: true, pixel_gate_passed: true };
}

export function createStageReceipt({ stage, run_id, input_sha256, upstream_receipt_sha256 = null, execution_isolation, output }) {
  output = normalizeOutput(output);
  if (!PRODUCT_STAGES.includes(stage) || typeof run_id !== 'string' || !run_id || !SHA256.test(input_sha256)
    || (upstream_receipt_sha256 !== null && !SHA256.test(upstream_receipt_sha256))) fail('invalid_receipt', 'Stage receipt identity is invalid.');
  validateIsolation(execution_isolation); validateOutput(stage, output, execution_isolation.stage_context_sha256);
  const core = { schema_version: 2, stage, status: 'complete', run_id, input_sha256, upstream_receipt_sha256, execution_isolation, output };
  assertReceiptPrivacy(core);
  const receipt = { ...core, receipt_sha256: fingerprintReceiptValue(core) };
  if (byteLength(receipt) > 4096) fail('receipt_envelope_too_large', 'Compact stage receipt exceeds 4096 bytes.');
  return receipt;
}

export function validateStageReceipt(receipt, { expectedStage, expectedInput, expectedUpstream, expectedManifestSha256, expectedReviewGates, expectedMainReviewGates } = {}) {
  exact(receipt, ['execution_isolation', 'input_sha256', 'output', 'receipt_sha256', 'run_id', 'schema_version', 'stage', 'status', 'upstream_receipt_sha256']);
  if (receipt.schema_version !== 2 || !PRODUCT_STAGES.includes(receipt.stage) || receipt.status !== 'complete' || typeof receipt.run_id !== 'string' || !receipt.run_id
    || !SHA256.test(receipt.input_sha256) || !SHA256.test(receipt.receipt_sha256) || (receipt.upstream_receipt_sha256 !== null && !SHA256.test(receipt.upstream_receipt_sha256))) fail('invalid_receipt', 'Stage receipt identity is invalid.');
  validateIsolation(receipt.execution_isolation); validateOutput(receipt.stage, receipt.output, receipt.execution_isolation.stage_context_sha256); assertReceiptPrivacy(receipt);
  const core = { schema_version: 2, stage: receipt.stage, status: receipt.status, run_id: receipt.run_id, input_sha256: receipt.input_sha256, upstream_receipt_sha256: receipt.upstream_receipt_sha256, execution_isolation: receipt.execution_isolation, output: receipt.output };
  if (receipt.receipt_sha256 !== fingerprintReceiptValue(core)) fail('receipt_tampered', 'Stage receipt hash does not match content.');
  if (expectedStage && receipt.stage !== expectedStage) fail('receipt_stage_mismatch', 'Stage receipt belongs to another stage.');
  if (expectedInput && receipt.input_sha256 !== expectedInput) fail('receipt_input_mismatch', 'Stage receipt input mismatch.');
  if (expectedUpstream !== undefined && receipt.upstream_receipt_sha256 !== expectedUpstream) fail('receipt_upstream_mismatch', 'Stage receipt predecessor mismatch.');
  if (expectedManifestSha256 && receipt.output.manifest_envelope.manifest_sha256 !== expectedManifestSha256) fail('artifact_set_unbound', 'Stage receipt manifest mismatch.');
  if (expectedReviewGates) {
    const actual = receipt.output.review_refs.map((item) => item.gate).sort();
    if (JSON.stringify(actual) !== JSON.stringify([...expectedReviewGates].sort())) fail('review_subject_mismatch', 'Stage review gates mismatch.');
  }
  if (expectedMainReviewGates) {
    const actual = receipt.output.main_review_refs.map((item) => item.gate).sort();
    if (JSON.stringify(actual) !== JSON.stringify([...expectedMainReviewGates].sort())) fail('main_agent_review_missing', 'Stage main-agent review gates mismatch.');
  }
  return receipt;
}
