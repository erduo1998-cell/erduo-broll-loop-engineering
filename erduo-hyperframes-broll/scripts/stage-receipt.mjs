import { createHash } from 'node:crypto';

export const PRODUCT_STAGES = ['preflight', 'director', 'assets', 'render', 'verify'];
const SHA256 = /^[0-9a-f]{64}$/u;
const ABSOLUTE_VALUE = /^(?:\/|[A-Za-z]:[\\/]|\\\\|file:)/u;
const PRIVATE_KEY = /(?:api[_-]?key|token|secret|cookie|password|authorization|credential|path)/iu;

export class StageReceiptError extends Error {
  constructor(code, message) { super(message); this.name = 'StageReceiptError'; this.code = code; }
}

function fail(code, message) { throw new StageReceiptError(code, message); }
function canonicalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { if (!Number.isSafeInteger(value)) fail('invalid_receipt', 'Receipt numbers must be safe integers.'); return value; }
  if (!value || typeof value !== 'object') fail('invalid_receipt', 'Receipt contains an unsupported value.');
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}
export function fingerprintReceiptValue(value) { return createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex'); }

export function assertReceiptPrivacy(value) {
  const visit = (item) => {
    if (typeof item === 'string') { if (ABSOLUTE_VALUE.test(item)) fail('receipt_privacy_violation', 'Stage receipt contains a private path-like value.'); return; }
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item)) { if (PRIVATE_KEY.test(key)) fail('receipt_privacy_violation', 'Stage receipt contains a private field.'); visit(child); }
  };
  visit(value);
  return true;
}

function exact(value, fields, code = 'invalid_receipt') {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail(code, 'Stage receipt has an invalid shape.');
}
function validateOutput(stage, output) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) fail('invalid_receipt_output', 'Stage receipt output is invalid.');
  const required = {
    preflight: ['capabilities', 'mode', 'srt_sha256', 'time_source'],
    director: ['briefs_sha256', 'plan_sha256', 'surge_adapter'],
    assets: ['route', 'scene_count'],
    render: ['composition_sha256', 'project_files'],
    verify: ['coverage_basis_points', 'duration_ms', 'shot_count', 'verification'],
  }[stage];
  exact(output, required, 'invalid_receipt_output');
  if (stage === 'preflight' && (!['talking-head', 'faceless'].includes(output.mode) || output.time_source !== 'srt' || !SHA256.test(output.srt_sha256) || !Array.isArray(output.capabilities) || !output.capabilities.length)) fail('invalid_receipt_output', 'Preflight receipt output is invalid.');
  if (stage === 'director') {
    if (!SHA256.test(output.plan_sha256) || !SHA256.test(output.briefs_sha256)) fail('invalid_receipt_output', 'Director receipt hashes are invalid.');
    exact(output.surge_adapter, ['disallowed_outputs', 'invocation_evidence', 'required_skill', 'time_source']);
    const evidence = output.surge_adapter.invocation_evidence;
    if (output.surge_adapter.required_skill !== 'video-script-builder' || output.surge_adapter.time_source !== 'srt' || !Array.isArray(output.surge_adapter.disallowed_outputs) || !output.surge_adapter.disallowed_outputs.includes('video-spec-hf.md') || !evidence || typeof evidence !== 'object' || !['claude-code', 'codex', 'fixture-test'].includes(evidence.host) || !['skill-tool', 'explicit-skill', 'fixture'].includes(evidence.mechanism) || !SHA256.test(evidence.args_sha256) || !SHA256.test(evidence.transcript_sha256) || evidence.status !== 'verified') fail('invalid_receipt_output', 'SURGE adapter receipt is invalid.');
  }
  if (stage === 'assets' && (!['hyperframes-native', 'user-media', 'pexels', 'image-generation'].includes(output.route) || !Number.isSafeInteger(output.scene_count) || output.scene_count < 1)) fail('invalid_receipt_output', 'Asset receipt output is invalid.');
  if (stage === 'render' && (!SHA256.test(output.composition_sha256) || !Array.isArray(output.project_files) || !output.project_files.includes('index.html'))) fail('invalid_receipt_output', 'Render receipt output is invalid.');
  if (stage === 'verify' && (!Number.isSafeInteger(output.coverage_basis_points) || output.coverage_basis_points !== 10000 || !Number.isSafeInteger(output.duration_ms) || output.duration_ms < 1 || !Number.isSafeInteger(output.shot_count) || output.shot_count < 1 || !Array.isArray(output.verification) || !output.verification.length)) fail('invalid_receipt_output', 'Verify receipt output is invalid.');
}

export function createStageReceipt({ stage, run_id, input_sha256, upstream_receipt_sha256 = null, output }) {
  if (!PRODUCT_STAGES.includes(stage) || typeof run_id !== 'string' || !run_id || !SHA256.test(input_sha256) || (upstream_receipt_sha256 !== null && !SHA256.test(upstream_receipt_sha256))) fail('invalid_receipt', 'Stage receipt identity is invalid.');
  validateOutput(stage, output);
  const core = { schema_version: 1, stage, status: 'complete', run_id, input_sha256, upstream_receipt_sha256, output };
  assertReceiptPrivacy(core);
  return { ...core, receipt_sha256: fingerprintReceiptValue(core) };
}

export function validateStageReceipt(receipt, { expectedStage, expectedInput, expectedUpstream } = {}) {
  exact(receipt, ['input_sha256', 'output', 'receipt_sha256', 'run_id', 'schema_version', 'stage', 'status', 'upstream_receipt_sha256']);
  if (receipt.schema_version !== 1 || !PRODUCT_STAGES.includes(receipt.stage) || receipt.status !== 'complete' || typeof receipt.run_id !== 'string' || !receipt.run_id || !SHA256.test(receipt.input_sha256) || !SHA256.test(receipt.receipt_sha256) || (receipt.upstream_receipt_sha256 !== null && !SHA256.test(receipt.upstream_receipt_sha256))) fail('invalid_receipt', 'Stage receipt identity is invalid.');
  validateOutput(receipt.stage, receipt.output); assertReceiptPrivacy(receipt);
  const core = { schema_version: receipt.schema_version, stage: receipt.stage, status: receipt.status, run_id: receipt.run_id, input_sha256: receipt.input_sha256, upstream_receipt_sha256: receipt.upstream_receipt_sha256, output: receipt.output };
  if (receipt.receipt_sha256 !== fingerprintReceiptValue(core)) fail('receipt_tampered', 'Stage receipt hash does not match its content.');
  if (expectedStage && receipt.stage !== expectedStage) fail('receipt_stage_mismatch', 'Stage receipt belongs to a different stage.');
  if (expectedInput && receipt.input_sha256 !== expectedInput) fail('receipt_input_mismatch', 'Stage receipt input does not match the current run.');
  if (expectedUpstream !== undefined && receipt.upstream_receipt_sha256 !== expectedUpstream) fail('receipt_upstream_mismatch', 'Stage receipt does not link to the current upstream receipt.');
  return receipt;
}
