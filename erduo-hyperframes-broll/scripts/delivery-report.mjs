import { createHash } from 'node:crypto';
import {
  SCRIPT_ONLY_CONTEXT_POLICY,
  validateContextBudget,
} from './validate-context-budget.mjs';
import {
  AUTHORING_TOPOLOGY_ID,
  PIPELINE_CONTRACT_VERSION,
  VALIDATION_POLICY_ID,
  inspectV3Compatibility,
  validateGateReceipt,
} from './validate-production-contract.mjs';

export {
  AUTHORING_TOPOLOGY_ID,
  PIPELINE_CONTRACT_VERSION,
  VALIDATION_POLICY_ID,
};

export const SCRIPT_ONLY_GATE_NAMES = Object.freeze([
  'policy-gate',
  'source-conformance-gate',
  'runtime-seek-gate',
  'pixel-signal-gate',
  'integration-delivery-gate',
]);
export const REAL_LIMITATION_CODES = Object.freeze([
  'pexels-key-unverified',
  'windows-unverified',
  'editor-gui-unverified',
  'user-font-license-unverified',
]);

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;

export class DeliveryReportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DeliveryReportError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new DeliveryReportError(code, message);
};

function canonical(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('delivery_value_invalid', 'Delivery value is non-finite.');
    return value;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) {
    fail('delivery_value_invalid', 'Delivery value is unsupported or cyclic.');
  }
  seen.add(value);
  const result = Array.isArray(value)
    ? value.map((item) => canonical(item, seen))
    : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key], seen)]));
  seen.delete(value);
  return result;
}

export const fingerprintDeliveryValue = (value) => createHash('sha256')
  .update(JSON.stringify(canonical(value)), 'utf8')
  .digest('hex');

function exact(value, fields, code, message) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())
  ) fail(code, message);
}

function ensureActive(value) {
  const compatibility = inspectV3Compatibility(value);
  if (compatibility.code === 'pipeline_upgrade_required') {
    fail('pipeline_upgrade_required', 'Older delivery records are inspection-only.');
  }
  if (compatibility.code === 'legacy_field_forbidden') {
    fail('legacy_field_forbidden', 'Superseded authorization data cannot enter delivery.');
  }
  if (
    value?.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
    || value?.authoring_topology_id !== AUTHORING_TOPOLOGY_ID
    || value?.validation_policy_id !== VALIDATION_POLICY_ID
  ) fail('delivery_identity_invalid', 'Delivery identity is invalid.');
}

function validateReceiptHashes(value) {
  exact(
    value,
    SCRIPT_ONLY_GATE_NAMES,
    'delivery_gate_receipts_invalid',
    'Delivery gate receipt summary must contain exactly the five script gates.',
  );
  for (const gate of SCRIPT_ONLY_GATE_NAMES) {
    const arrayValue = Array.isArray(value[gate]);
    const hashes = arrayValue ? value[gate] : [value[gate]];
    const isBlockGate = [
      'source-conformance-gate',
      'runtime-seek-gate',
      'pixel-signal-gate',
    ].includes(gate);
    if (
      (isBlockGate && !arrayValue)
      || (!isBlockGate && arrayValue)
      || (isBlockGate && hashes.length < 1)
      || (!isBlockGate && hashes.length !== 1)
      || hashes.length > 256
      || hashes.some((hash) => !SHA256.test(hash ?? ''))
      || new Set(hashes).size !== hashes.length
    ) fail('delivery_gate_receipts_invalid', 'Delivery gate receipt hashes are invalid.');
  }
  const blockCounts = [
    value['source-conformance-gate'].length,
    value['runtime-seek-gate'].length,
    value['pixel-signal-gate'].length,
  ];
  if (new Set(blockCounts).size !== 1) {
    fail('delivery_gate_receipts_invalid', 'Block gate receipt cardinalities do not match.');
  }
}

function validateTechnicalVerify(value, masterMediaSha256) {
  exact(
    value,
    ['status', 'receipt_sha256', 'checked_media_sha256', 'limitation_codes'],
    'delivery_technical_verify_invalid',
    'Technical verify must use the exact script-only v3 shape.',
  );
  if (
    value.status !== 'passed'
    || !SHA256.test(value.receipt_sha256 ?? '')
    || value.checked_media_sha256 !== masterMediaSha256
    || JSON.stringify(value.limitation_codes) !== JSON.stringify(REAL_LIMITATION_CODES)
  ) fail('delivery_technical_verify_invalid', 'Technical verify does not bind the final media.');
}

function validateLimitations(value) {
  if (JSON.stringify(value) !== JSON.stringify(REAL_LIMITATION_CODES)) {
    fail(
      'delivery_limitations_invalid',
      'Delivery must expose exactly the four real unverified limitations.',
    );
  }
}

function summaryCore(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'final_summary_sha256'),
  );
}

function requireEvidence(evidence) {
  exact(evidence, [
    'productionContract',
    'validationPolicy',
    'policyReceipt',
    'blockReceipts',
    'integrationReceipt',
    'deliveryReceipt',
    'technicalVerifyEvidence',
  ], 'delivery_evidence_required', 'Actual receipt and technical evidence is required.');
}

function validateActualRenderEvidence(summary, evidence, actualRenderEvidence) {
  if (!actualRenderEvidence) {
    fail(
      'delivery_evidence_required',
      'Actual canonical render evidence is required.',
    );
  }
  exact(actualRenderEvidence, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'validation_policy_id',
    'status',
    'input_bindings',
    'master_media_sha256',
    'render_receipt_sha256',
  ], 'delivery_render_evidence_mismatch', 'Actual render evidence shape is invalid.');
  exact(actualRenderEvidence.input_bindings, [
    'production_contract_sha256',
    'integration_manifest_sha256',
    'no_rewrite_proof_sha256',
    'integrated_source_sha256',
  ], 'delivery_render_evidence_mismatch', 'Actual render evidence bindings are invalid.');
  ensureActive(actualRenderEvidence);
  const renderCore = Object.fromEntries(
    Object.entries(actualRenderEvidence).filter(
      ([key]) => key !== 'render_receipt_sha256',
    ),
  );
  if (
    actualRenderEvidence.schema_version !== 1
    || actualRenderEvidence.status !== 'passed'
    || !SHA256.test(actualRenderEvidence.master_media_sha256 ?? '')
    || !SHA256.test(actualRenderEvidence.render_receipt_sha256 ?? '')
    || actualRenderEvidence.render_receipt_sha256
      !== fingerprintDeliveryValue(renderCore)
    || actualRenderEvidence.master_media_sha256 !== summary.master_media_sha256
    || actualRenderEvidence.input_bindings.production_contract_sha256
      !== summary.production_contract_sha256
    || actualRenderEvidence.input_bindings.production_contract_sha256
      !== evidence.productionContract?.production_contract_sha256
    || actualRenderEvidence.input_bindings.integration_manifest_sha256
      !== evidence.integrationReceipt?.input_bindings?.integration_manifest_sha256
    || actualRenderEvidence.input_bindings.no_rewrite_proof_sha256
      !== evidence.integrationReceipt?.input_bindings?.no_rewrite_proof_sha256
    || actualRenderEvidence.input_bindings.integrated_source_sha256
      !== evidence.integrationReceipt?.input_bindings?.integrated_source_sha256
  ) {
    fail(
      'delivery_render_evidence_mismatch',
      'Actual render evidence does not bind the current contract, integration and media.',
    );
  }
  return actualRenderEvidence;
}

function validateActualReceipt(
  receipt,
  {
    productionContract,
    validationPolicy,
    gate,
    phase,
    scopeId,
  },
) {
  try {
    validateGateReceipt(receipt, {
      productionContract,
      validationPolicy,
    });
  } catch (error) {
    if (error?.code) fail(error.code, error.message);
    throw error;
  }
  if (
    receipt.gate !== gate
    || receipt.phase !== phase
    || receipt.scope_id !== scopeId
    || receipt.status !== 'passed'
  ) {
    fail(
      'delivery_gate_receipt_evidence_mismatch',
      'Actual gate receipt evidence does not match its delivery role.',
    );
  }
}

function validateActualEvidence(summary, evidence, actualRenderEvidence) {
  requireEvidence(evidence);
  const renderEvidence = validateActualRenderEvidence(
    summary,
    evidence,
    actualRenderEvidence,
  );
  const {
    productionContract,
    validationPolicy,
    policyReceipt,
    blockReceipts,
    integrationReceipt,
    deliveryReceipt,
    technicalVerifyEvidence,
  } = evidence;
  if (
    productionContract?.production_contract_sha256
      !== summary.production_contract_sha256
  ) {
    fail(
      'delivery_gate_receipt_evidence_mismatch',
      'Delivery summary does not bind the actual production contract.',
    );
  }
  validateActualReceipt(policyReceipt, {
    productionContract,
    validationPolicy,
    gate: 'policy-gate',
    phase: policyReceipt?.phase,
    scopeId: policyReceipt?.scope_id,
  });
  if (
    !['director', 'sealed'].includes(policyReceipt.phase)
    || summary.gate_receipts['policy-gate'] !== policyReceipt.receipt_sha256
  ) {
    fail(
      'delivery_gate_receipt_evidence_mismatch',
      'Policy gate summary does not match the actual policy receipt.',
    );
  }
  if (!Array.isArray(blockReceipts) || blockReceipts.length < 1 || blockReceipts.length > 256) {
    fail('delivery_gate_receipt_evidence_mismatch', 'Actual block receipt evidence is invalid.');
  }
  const actualBlockHashes = Object.fromEntries([
    'source-conformance-gate',
    'runtime-seek-gate',
    'pixel-signal-gate',
  ].map((gate) => [gate, []]));
  const orderedBlockReceiptSet = [];
  for (const [index, block] of blockReceipts.entries()) {
    exact(
      block,
      ['block_id', 'gate_receipts'],
      'delivery_gate_receipt_evidence_mismatch',
      'Actual block receipt aggregate is invalid.',
    );
    const expectedBlockId = `B${String(index + 1).padStart(3, '0')}`;
    if (
      block.block_id !== expectedBlockId
      || !Array.isArray(block.gate_receipts)
      || block.gate_receipts.length !== 3
    ) {
      fail(
        'delivery_gate_receipt_evidence_mismatch',
        'Actual block receipts must use a continuous canonical block sequence.',
      );
    }
    const byGate = Object.fromEntries(
      block.gate_receipts.map((receipt) => [receipt.gate, receipt]),
    );
    if (
      Object.keys(byGate).length !== 3
      || ![
        'source-conformance-gate',
        'runtime-seek-gate',
        'pixel-signal-gate',
      ].every((gate) => byGate[gate])
    ) {
      fail(
        'delivery_gate_receipt_evidence_mismatch',
        'Each actual block must contain exactly the three block gates.',
      );
    }
    for (const gate of [
      'source-conformance-gate',
      'runtime-seek-gate',
      'pixel-signal-gate',
    ]) {
      validateActualReceipt(byGate[gate], {
        productionContract,
        validationPolicy,
        gate,
        phase: 'block',
        scopeId: block.block_id,
      });
      actualBlockHashes[gate].push(byGate[gate].receipt_sha256);
    }
    const source = byGate['source-conformance-gate'];
    const runtime = byGate['runtime-seek-gate'];
    const pixel = byGate['pixel-signal-gate'];
    if (
      runtime.input_bindings.block_manifest_sha256
        !== source.input_bindings.block_manifest_sha256
      || pixel.input_bindings.block_manifest_sha256
        !== source.input_bindings.block_manifest_sha256
      || runtime.input_bindings.source_sha256 !== source.input_bindings.source_sha256
      || pixel.input_bindings.source_sha256 !== source.input_bindings.source_sha256
      || runtime.input_bindings.source_conformance_receipt_sha256
        !== source.receipt_sha256
      || pixel.input_bindings.source_conformance_receipt_sha256
        !== source.receipt_sha256
      || pixel.input_bindings.runtime_seek_receipt_sha256
        !== runtime.receipt_sha256
    ) {
      fail(
        'delivery_gate_receipt_evidence_mismatch',
        'Actual block receipt evidence has an invalid lineage.',
      );
    }
    orderedBlockReceiptSet.push({
      block_id: block.block_id,
      source_conformance_receipt_sha256: source.receipt_sha256,
      runtime_seek_receipt_sha256: runtime.receipt_sha256,
      pixel_signal_receipt_sha256: pixel.receipt_sha256,
    });
  }
  for (const gate of Object.keys(actualBlockHashes)) {
    if (
      JSON.stringify(summary.gate_receipts[gate])
        !== JSON.stringify(actualBlockHashes[gate])
    ) {
      fail(
        'delivery_gate_receipt_evidence_mismatch',
        `Delivery ${gate} hashes do not match actual receipts.`,
      );
    }
  }
  validateActualReceipt(integrationReceipt, {
    productionContract,
    validationPolicy,
    gate: 'integration-delivery-gate',
    phase: 'integration',
    scopeId: 'integration',
  });
  if (
    integrationReceipt.input_bindings.ordered_block_receipt_set_sha256
      !== fingerprintDeliveryValue(orderedBlockReceiptSet)
  ) {
    fail(
      'delivery_gate_receipt_evidence_mismatch',
      'Integration receipt does not bind the actual ordered block receipt set.',
    );
  }
  validateActualReceipt(deliveryReceipt, {
    productionContract,
    validationPolicy,
    gate: 'integration-delivery-gate',
    phase: 'delivery',
    scopeId: 'delivery',
  });
  if (
    summary.gate_receipts['integration-delivery-gate']
      !== deliveryReceipt.receipt_sha256
    || deliveryReceipt.input_bindings.integration_receipt_sha256
      !== integrationReceipt.receipt_sha256
    || deliveryReceipt.input_bindings.ordered_block_receipt_set_sha256
      !== integrationReceipt.input_bindings.ordered_block_receipt_set_sha256
    || deliveryReceipt.input_bindings.master_wrapper_sha256
      !== integrationReceipt.input_bindings.master_wrapper_sha256
    || deliveryReceipt.input_bindings.integration_manifest_sha256
      !== integrationReceipt.input_bindings.integration_manifest_sha256
    || deliveryReceipt.input_bindings.no_rewrite_proof_sha256
      !== integrationReceipt.input_bindings.no_rewrite_proof_sha256
    || deliveryReceipt.input_bindings.integrated_source_sha256
      !== integrationReceipt.input_bindings.integrated_source_sha256
    || deliveryReceipt.input_bindings.renderer_version_sha256
      !== integrationReceipt.input_bindings.renderer_version_sha256
    || deliveryReceipt.input_bindings.hyperframes_version_sha256
      !== integrationReceipt.input_bindings.hyperframes_version_sha256
    || deliveryReceipt.input_bindings.technical_verify_receipt_sha256
      !== technicalVerifyEvidence?.receipt_sha256
    || deliveryReceipt.input_bindings.render_receipt_sha256
      !== renderEvidence.render_receipt_sha256
    || deliveryReceipt.input_bindings.master_media_sha256 !== summary.master_media_sha256
  ) {
    fail(
      'delivery_gate_receipt_evidence_mismatch',
      'Delivery receipt does not bind the actual integration, render and technical evidence.',
    );
  }
  validateTechnicalVerify(technicalVerifyEvidence, summary.master_media_sha256);
  if (
    JSON.stringify(summary.technical_verify)
      !== JSON.stringify(technicalVerifyEvidence)
  ) {
    fail(
      'delivery_technical_evidence_mismatch',
      'Delivery technical summary does not equal the actual technical evidence.',
    );
  }
}

export function createDeliverySummary({
  status,
  run_id,
  production_contract_sha256,
  gate_receipts,
  technical_verify,
  limitations,
  master_media_sha256,
}, evidence, actualRenderEvidence) {
  const core = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    status,
    run_id,
    production_contract_sha256,
    gate_receipts,
    technical_verify,
    limitations,
    master_media_sha256,
  };
  const summary = {
    ...core,
    final_summary_sha256: fingerprintDeliveryValue(core),
  };
  return validateDeliverySummary(summary, evidence, actualRenderEvidence);
}

export function validateDeliverySummary(value, evidence, actualRenderEvidence) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('delivery_summary_invalid', 'Delivery summary is invalid.');
  }
  ensureActive(value);
  exact(value, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'validation_policy_id',
    'status',
    'run_id',
    'production_contract_sha256',
    'gate_receipts',
    'technical_verify',
    'limitations',
    'master_media_sha256',
    'final_summary_sha256',
  ], 'delivery_summary_invalid', 'Delivery summary shape is invalid.');
  if (
    value.schema_version !== 1
    || value.status !== 'technical-contract-passed'
    || !SAFE_ID.test(value.run_id ?? '')
    || !SHA256.test(value.production_contract_sha256 ?? '')
    || !SHA256.test(value.master_media_sha256 ?? '')
  ) fail('delivery_summary_invalid', 'Delivery summary identity is invalid.');
  validateReceiptHashes(value.gate_receipts);
  validateTechnicalVerify(value.technical_verify, value.master_media_sha256);
  validateLimitations(value.limitations);
  if (JSON.stringify(value.technical_verify.limitation_codes)
    !== JSON.stringify(value.limitations)) {
    fail(
      'delivery_technical_evidence_mismatch',
      'Technical limitations and delivery limitations must be identical.',
    );
  }
  if (
    !SHA256.test(value.final_summary_sha256 ?? '')
    || value.final_summary_sha256 !== fingerprintDeliveryValue(summaryCore(value))
  ) fail('delivery_summary_hash_mismatch', 'Final summary hash does not bind exact content.');
  validateActualEvidence(value, evidence, actualRenderEvidence);
  try {
    validateContextBudget(value, {
      kind: 'final-summary',
      policy: SCRIPT_ONLY_CONTEXT_POLICY,
    });
  } catch (error) {
    if (error?.code) fail(error.code, error.message);
    throw error;
  }
  return value;
}

export async function buildDeliveryReport(summary, evidence, actualRenderEvidence) {
  const value = validateDeliverySummary(summary, evidence, actualRenderEvidence);
  return {
    status: value.status,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    run_id: value.run_id,
    production_contract_sha256: value.production_contract_sha256,
    gate_receipts: value.gate_receipts,
    master_media_sha256: value.master_media_sha256,
    technical_verify: value.technical_verify,
    limitations: value.limitations,
    final_summary_sha256: value.final_summary_sha256,
  };
}

export function inspectDeliverySummary(
  value,
  evidence = {},
  actualRenderEvidence,
) {
  const compatibility = inspectV3Compatibility(value);
  if (compatibility.code !== 'canonical_artifact_validation_required') {
    return {
      resume_eligible: false,
      resign_eligible: false,
      delivery_eligible: false,
      code: compatibility.code,
      pipeline_contract_version: compatibility.pipeline_contract_version,
      authoring_topology_id: compatibility.authoring_topology_id,
      run_id: typeof value?.run_id === 'string' ? value.run_id : null,
      final_summary_sha256: SHA256.test(value?.final_summary_sha256 ?? '')
        ? value.final_summary_sha256
        : null,
    };
  }
  try {
    validateDeliverySummary(value, evidence, actualRenderEvidence);
  } catch (error) {
    return {
      resume_eligible: false,
      resign_eligible: false,
      delivery_eligible: false,
      code: error?.code ?? 'delivery_summary_invalid',
      pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
      authoring_topology_id: AUTHORING_TOPOLOGY_ID,
      run_id: typeof value?.run_id === 'string' ? value.run_id : null,
      final_summary_sha256: SHA256.test(value?.final_summary_sha256 ?? '')
        ? value.final_summary_sha256
        : null,
    };
  }
  return {
    resume_eligible: true,
    resign_eligible: false,
    delivery_eligible: true,
    code: null,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    run_id: value.run_id,
    final_summary_sha256: value.final_summary_sha256,
  };
}
