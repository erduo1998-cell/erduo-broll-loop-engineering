import {
  AUTHORING_TOPOLOGY_ID,
  PIPELINE_CONTRACT_VERSION,
  VALIDATION_POLICY_ID,
  inspectV3Compatibility,
  validateGateReceipt,
  validateValidationPolicy,
} from './validate-production-contract.mjs';
import {
  BLOCK_GATE_NAMES,
  SCRIPT_ONLY_GATE_NAMES,
  assertFinalRenderPreflight,
} from './stage-receipt.mjs';
import {
  SCRIPT_ONLY_CONTEXT_POLICY,
  validateContextBudget,
} from './validate-context-budget.mjs';
import { REAL_LIMITATION_CODES } from './delivery-report.mjs';

export {
  AUTHORING_TOPOLOGY_ID,
  PIPELINE_CONTRACT_VERSION,
  VALIDATION_POLICY_ID,
};
export {
  BLOCK_GATE_NAMES,
  SCRIPT_ONLY_GATE_NAMES,
};

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;

export class OrchestrationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OrchestrationError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new OrchestrationError(code, message);
};

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
    fail('pipeline_upgrade_required', 'Older orchestration inputs are inspection-only.');
  }
  if (compatibility.code === 'legacy_field_forbidden') {
    fail('legacy_field_forbidden', 'Superseded authorization data cannot enter v3 orchestration.');
  }
  if (
    value?.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
    || value?.authoring_topology_id !== AUTHORING_TOPOLOGY_ID
    || value?.validation_policy_id !== VALIDATION_POLICY_ID
  ) fail('orchestration_identity_invalid', 'Script-only v3 identity is invalid.');
}

function validatePolicyGate(receipt, productionContract, validationPolicy) {
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
    receipt.gate !== 'policy-gate'
    || !['director', 'sealed'].includes(receipt.phase)
    || receipt.status !== 'passed'
  ) fail('policy_gate_failed', 'The policy gate has not passed for the active contract.');
}

function compactGateReceipts(policyReceipt, blockReceipts, deliveryReceipt) {
  return {
    'policy-gate': policyReceipt.receipt_sha256,
    'source-conformance-gate': blockReceipts.map(
      (block) => block.gate_receipts.find(
        (receipt) => receipt.gate === 'source-conformance-gate',
      ).receipt_sha256,
    ),
    'runtime-seek-gate': blockReceipts.map(
      (block) => block.gate_receipts.find(
        (receipt) => receipt.gate === 'runtime-seek-gate',
      ).receipt_sha256,
    ),
    'pixel-signal-gate': blockReceipts.map(
      (block) => block.gate_receipts.find(
        (receipt) => receipt.gate === 'pixel-signal-gate',
      ).receipt_sha256,
    ),
    'integration-delivery-gate': deliveryReceipt.receipt_sha256,
  };
}

function validateRenderResult(value) {
  exact(
    value,
    ['master_media_sha256', 'render_receipt_sha256'],
    'render_result_invalid',
    'Final render result is invalid.',
  );
  if (
    !SHA256.test(value.master_media_sha256 ?? '')
    || !SHA256.test(value.render_receipt_sha256 ?? '')
  ) fail('render_result_invalid', 'Final render result is invalid.');
}

function validateTechnicalResult(value, masterMediaSha256) {
  try {
    validateContextBudget(value, {
      kind: 'final-summary',
      policy: SCRIPT_ONLY_CONTEXT_POLICY,
    });
  } catch (error) {
    if (error?.code) fail(error.code, error.message);
    throw error;
  }
  exact(
    value,
    ['status', 'receipt_sha256', 'checked_media_sha256', 'limitation_codes'],
    'technical_verify_invalid',
    'Technical verification must use the exact script-only v3 shape.',
  );
  if (
    value.status !== 'passed'
    || !SHA256.test(value.receipt_sha256 ?? '')
    || value.checked_media_sha256 !== masterMediaSha256
    || JSON.stringify(value.limitation_codes) !== JSON.stringify(REAL_LIMITATION_CODES)
  ) fail('technical_verify_failed', 'Technical verification did not bind the final media.');
}

function validateDeliveryReceipt(
  receipt,
  {
    productionContract,
    validationPolicy,
    integrationReceipt,
    integrationManifest,
    noRewriteProof,
    render,
    technical,
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
    receipt.gate !== 'integration-delivery-gate'
    || receipt.phase !== 'delivery'
    || receipt.scope_id !== 'delivery'
    || receipt.status !== 'passed'
  ) {
    fail(
      'delivery_gate_receipt_invalid',
      'Final orchestration requires a passed delivery-phase Gate 5 receipt.',
    );
  }
  const bindings = receipt.input_bindings;
  const integrationBindings = integrationReceipt.input_bindings;
  if (
    bindings.ordered_block_receipt_set_sha256
      !== integrationBindings.ordered_block_receipt_set_sha256
    || bindings.master_wrapper_sha256 !== integrationBindings.master_wrapper_sha256
    || bindings.integration_manifest_sha256
      !== integrationManifest.integration_manifest_sha256
    || bindings.no_rewrite_proof_sha256 !== noRewriteProof.no_rewrite_proof_sha256
    || bindings.integrated_source_sha256 !== integrationManifest.integrated_source_sha256
    || bindings.renderer_version_sha256 !== integrationBindings.renderer_version_sha256
    || bindings.hyperframes_version_sha256 !== integrationBindings.hyperframes_version_sha256
    || bindings.integration_receipt_sha256 !== integrationReceipt.receipt_sha256
    || bindings.render_receipt_sha256 !== render.render_receipt_sha256
    || bindings.technical_verify_receipt_sha256 !== technical.receipt_sha256
    || bindings.master_media_sha256 !== render.master_media_sha256
  ) {
    fail(
      'delivery_gate_receipt_unbound',
      'Delivery-phase Gate 5 receipt does not bind the rendered and verified output.',
    );
  }
}

export async function orchestrateScriptOnlyV3({
  run_id,
  production_contract,
  validation_policy,
  policy_receipt,
  block_receipts,
  integration_manifest,
  integration_receipt,
  no_rewrite_proof,
  render_master,
  technical_verify,
  run_delivery_gate,
}) {
  if (!SAFE_ID.test(run_id ?? '')) {
    fail('orchestration_run_id_invalid', 'Run ID is invalid.');
  }
  ensureActive(production_contract);
  try {
    validateValidationPolicy(validation_policy);
  } catch (error) {
    if (error?.code) fail(error.code, error.message);
    throw error;
  }
  validatePolicyGate(policy_receipt, production_contract, validation_policy);
  if (
    typeof render_master !== 'function'
    || typeof technical_verify !== 'function'
    || typeof run_delivery_gate !== 'function'
  ) {
    fail(
      'orchestration_callback_invalid',
      'Render, technical verification and delivery gate callbacks are required.',
    );
  }
  const preflight = await assertFinalRenderPreflight({
    block_receipts,
    integration_manifest,
    integration_receipt,
    no_rewrite_proof,
    production_contract,
    validation_policy,
  });
  const render = await render_master({
    run_id,
    production_contract_sha256: production_contract.production_contract_sha256,
    integration_manifest_sha256: integration_manifest.integration_manifest_sha256,
    integrated_source_sha256: integration_manifest.integrated_source_sha256,
    no_rewrite_proof_sha256: no_rewrite_proof.no_rewrite_proof_sha256,
  });
  validateRenderResult(render);
  const technical = await technical_verify({
    run_id,
    production_contract_sha256: production_contract.production_contract_sha256,
    master_media_sha256: render.master_media_sha256,
    render_receipt_sha256: render.render_receipt_sha256,
  });
  validateTechnicalResult(technical, render.master_media_sha256);
  const delivery_receipt = await run_delivery_gate({
    run_id,
    production_contract,
    validation_policy,
    integration_receipt,
    integration_manifest,
    no_rewrite_proof,
    render,
    technical_verify: technical,
  });
  validateDeliveryReceipt(delivery_receipt, {
    productionContract: production_contract,
    validationPolicy: validation_policy,
    integrationReceipt: integration_receipt,
    integrationManifest: integration_manifest,
    noRewriteProof: no_rewrite_proof,
    render,
    technical,
  });
  const gate_receipts = compactGateReceipts(
    policy_receipt,
    block_receipts,
    delivery_receipt,
  );
  const result = {
    status: 'technical-contract-passed',
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    run_id,
    production_contract_sha256: production_contract.production_contract_sha256,
    block_count: block_receipts.length,
    gate_receipts,
    integration: {
      integration_manifest_sha256: integration_manifest.integration_manifest_sha256,
      integrated_source_sha256: integration_manifest.integrated_source_sha256,
      no_rewrite_proof_sha256: no_rewrite_proof.no_rewrite_proof_sha256,
    },
    render,
    technical_verify: technical,
    delivery_receipt,
    limitations: technical.limitation_codes,
    preflight,
  };
  try {
    validateContextBudget(result, {
      kind: 'final-summary',
      policy: SCRIPT_ONLY_CONTEXT_POLICY,
    });
  } catch (error) {
    if (error?.code) fail(error.code, error.message);
    throw error;
  }
  return result;
}

export async function orchestrateFixture(options) {
  return orchestrateScriptOnlyV3(options);
}

export function inspectOrchestrationInput(value) {
  const compatibility = inspectV3Compatibility(value);
  return {
    ...compatibility,
    gate_names: SCRIPT_ONLY_GATE_NAMES,
    block_gate_names: BLOCK_GATE_NAMES,
  };
}
