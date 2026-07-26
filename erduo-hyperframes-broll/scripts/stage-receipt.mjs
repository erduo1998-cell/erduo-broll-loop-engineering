import { createHash } from 'node:crypto';
import {
  SCRIPT_ONLY_CONTEXT_POLICY,
  validateContextBudget,
} from './validate-context-budget.mjs';
import {
  AUTHORING_TOPOLOGY_ID,
  GATE_NAMES,
  PIPELINE_CONTRACT_VERSION,
  VALIDATION_POLICY_ID,
  fingerprintV3Value,
  inspectV3Compatibility,
  validateGateReceipt,
  validateProductionContractShape,
  validateValidationPolicy,
} from './validate-production-contract.mjs';
import { validateClaudeCodeExecutionIsolation } from './claude-code-dispatch.mjs';

export {
  AUTHORING_TOPOLOGY_ID,
  PIPELINE_CONTRACT_VERSION,
  VALIDATION_POLICY_ID,
};

export const PRODUCT_STAGES = Object.freeze([
  'director',
  'assets',
  'master-build',
  'master-integrate',
  'render',
  'verify',
  'shot-export',
]);
export const STAGE_OUTPUT_FIELDS = Object.freeze([
  'envelopes',
  'gate_receipts',
]);
export const RENDER_PREFLIGHT_REQUIRED_INPUTS = Object.freeze([
  'block_receipts',
  'integration_manifest',
  'integration_receipt',
  'no_rewrite_proof',
  'production_contract',
  'validation_policy',
]);
export const BLOCK_GATE_NAMES = Object.freeze([
  'source-conformance-gate',
  'runtime-seek-gate',
  'pixel-signal-gate',
]);
export const SCRIPT_ONLY_GATE_NAMES = Object.freeze([
  'policy-gate',
  ...BLOCK_GATE_NAMES,
  'integration-delivery-gate',
]);

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;

export class StageReceiptError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StageReceiptError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new StageReceiptError(code, message);
};

function canonical(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('receipt_value_invalid', 'Receipt contains a non-finite number.');
    return value;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) {
    fail('receipt_value_invalid', 'Receipt contains an unsupported or cyclic value.');
  }
  seen.add(value);
  const result = Array.isArray(value)
    ? value.map((item) => canonical(item, seen))
    : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key], seen)]));
  seen.delete(value);
  return result;
}

export const fingerprintReceiptValue = (value) => createHash('sha256')
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

function verifyIdentity(value, code = 'receipt_identity_invalid') {
  if (
    value?.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
    || value?.authoring_topology_id !== AUTHORING_TOPOLOGY_ID
    || value?.validation_policy_id !== VALIDATION_POLICY_ID
  ) fail(code, 'Script-only v3 receipt identity is invalid.');
}

function ensureActive(value) {
  const compatibility = inspectV3Compatibility(value);
  if (compatibility.code === 'pipeline_upgrade_required') {
    fail('pipeline_upgrade_required', 'Older receipts are inspection-only and cannot resume.');
  }
  if (compatibility.code === 'legacy_field_forbidden') {
    fail('legacy_field_forbidden', 'Superseded authorization data cannot be re-signed into v3.');
  }
}

function requireGateEvidence(productionContract, validationPolicy) {
  if (!productionContract || !validationPolicy) {
    fail(
      'gate_receipt_inputs_required',
      'Actual production contract and validation policy are required together.',
    );
  }
  ensureActive(productionContract);
  try {
    validateProductionContractShape(productionContract);
  } catch (error) {
    fail(
      'production_contract_invalid',
      error?.message ?? 'Actual production contract shape is invalid.',
    );
  }
  try {
    validateValidationPolicy(validationPolicy);
  } catch (error) {
    if (error?.code) fail(error.code, error.message);
    throw error;
  }
}

export function assertReceiptPrivacy(value, { kind = 'stage-envelope' } = {}) {
  try {
    validateContextBudget(value, { kind, policy: SCRIPT_ONLY_CONTEXT_POLICY });
  } catch (error) {
    if (error?.code) fail(error.code, error.message);
    throw error;
  }
  return true;
}

export function validateExecutionIsolation(value, stage) {
  exact(
    value,
    ['host', 'mechanism', 'dispatch_evidence_sha256', 'stage_context_sha256'],
    'execution_isolation_invalid',
    'Execution isolation is invalid.',
  );
  if (
    !SAFE_ID.test(value.host ?? '')
    || !SAFE_ID.test(value.mechanism ?? '')
    || !SHA256.test(value.dispatch_evidence_sha256 ?? '')
    || !SHA256.test(value.stage_context_sha256 ?? '')
  ) fail('execution_isolation_invalid', 'Execution isolation is invalid.');
  try {
    validateClaudeCodeExecutionIsolation(stage, value);
  } catch (error) {
    if (error?.code) fail(error.code, error.message);
    throw error;
  }
}

function validateArtifactEnvelope(value) {
  exact(value, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'validation_policy_id',
    'stage',
    'package_id',
    'manifest_sha256',
    'upstream_manifest_sha256',
    'artifact_counts',
    'metrics',
    'producer_isolation_sha256',
  ], 'artifact_envelope_invalid', 'Artifact envelope is invalid.');
  verifyIdentity(value, 'artifact_envelope_invalid');
  if (
    value.schema_version !== 1
    || !PRODUCT_STAGES.includes(value.stage)
    || !SAFE_ID.test(value.package_id ?? '')
    || !SHA256.test(value.manifest_sha256 ?? '')
    || !SHA256.test(value.upstream_manifest_sha256 ?? '')
    || !SHA256.test(value.producer_isolation_sha256 ?? '')
    || !value.artifact_counts
    || typeof value.artifact_counts !== 'object'
    || Array.isArray(value.artifact_counts)
    || Object.keys(value.artifact_counts).length > 32
    || Object.entries(value.artifact_counts).some(
      ([key, count]) => !SAFE_ID.test(key) || !Number.isSafeInteger(count) || count < 0,
    )
    || !value.metrics
    || typeof value.metrics !== 'object'
    || Array.isArray(value.metrics)
  ) fail('artifact_envelope_invalid', 'Artifact envelope is invalid.');
  assertReceiptPrivacy(value);
}

function validateCompactGateReceipt(value, {
  productionContract,
  validationPolicy,
} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('gate_receipt_invalid', 'Gate receipt is invalid.');
  }
  ensureActive(value);
  verifyIdentity(value, 'gate_receipt_invalid');
  if (
    !GATE_NAMES.includes(value.gate)
    || !['passed', 'failed'].includes(value.status)
    || !SHA256.test(value.receipt_sha256 ?? '')
    || !SHA256.test(value.production_contract_sha256 ?? '')
  ) fail('gate_receipt_invalid', 'Gate receipt is invalid.');
  assertReceiptPrivacy(value, { kind: 'block-receipt' });
  const receiptCore = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'receipt_sha256'),
  );
  if (value.receipt_sha256 !== fingerprintReceiptValue(receiptCore)) {
    fail('gate_receipt_hash_mismatch', 'Gate receipt hash does not bind its exact content.');
  }
  if (productionContract || validationPolicy) {
    if (!productionContract || !validationPolicy) {
      fail('gate_receipt_inputs_required', 'Gate receipt validation requires contract and policy together.');
    }
    try {
      validateGateReceipt(value, {
        productionContract,
        validationPolicy,
      });
    } catch (error) {
      if (error?.code) fail(error.code, error.message);
      throw error;
    }
  }
}

function validateStageOutput(output, options = {}) {
  exact(
    output,
    STAGE_OUTPUT_FIELDS,
    'invalid_receipt_output',
    'Stage output must contain only envelopes and gate receipts.',
  );
  if (
    !Array.isArray(output.envelopes)
    || output.envelopes.length > 32
    || !Array.isArray(output.gate_receipts)
    || output.gate_receipts.length > 64
  ) fail('invalid_receipt_output', 'Stage output arrays are invalid.');
  output.envelopes.forEach(validateArtifactEnvelope);
  output.gate_receipts.forEach((value) => validateCompactGateReceipt(value, options));
  const receiptHashes = output.gate_receipts.map((value) => value.receipt_sha256);
  if (new Set(receiptHashes).size !== receiptHashes.length) {
    fail('invalid_receipt_output', 'Gate receipt hashes must be unique.');
  }
  assertReceiptPrivacy(output);
  return output;
}

export function createStageReceipt({
  stage,
  run_id,
  input_sha256,
  upstream_receipt_sha256 = null,
  execution_isolation,
  output,
  productionContract,
  validationPolicy,
}) {
  if (
    !PRODUCT_STAGES.includes(stage)
    || !SAFE_ID.test(run_id ?? '')
    || !SHA256.test(input_sha256 ?? '')
    || upstream_receipt_sha256 !== null && !SHA256.test(upstream_receipt_sha256 ?? '')
  ) fail('receipt_identity_invalid', 'Stage receipt identity is invalid.');
  requireGateEvidence(productionContract, validationPolicy);
  validateExecutionIsolation(execution_isolation, stage);
  validateStageOutput(output, { productionContract, validationPolicy });
  const core = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    stage,
    status: 'complete',
    run_id,
    input_sha256,
    upstream_receipt_sha256,
    execution_isolation,
    output,
  };
  const receipt = { ...core, receipt_sha256: fingerprintReceiptValue(core) };
  assertReceiptPrivacy(receipt);
  return receipt;
}

export function validateStageReceipt(receipt, {
  expectedStage,
  expectedInput,
  expectedUpstream,
  expectedManifestSha256,
  expectedGateNames,
  productionContract,
  validationPolicy,
} = {}) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    fail('receipt_invalid', 'Stage receipt is invalid.');
  }
  ensureActive(receipt);
  requireGateEvidence(productionContract, validationPolicy);
  exact(receipt, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'validation_policy_id',
    'stage',
    'status',
    'run_id',
    'input_sha256',
    'upstream_receipt_sha256',
    'execution_isolation',
    'output',
    'receipt_sha256',
  ], 'receipt_invalid', 'Stage receipt shape is invalid.');
  verifyIdentity(receipt);
  if (
    receipt.schema_version !== 1
    || !PRODUCT_STAGES.includes(receipt.stage)
    || receipt.status !== 'complete'
    || !SAFE_ID.test(receipt.run_id ?? '')
    || !SHA256.test(receipt.input_sha256 ?? '')
    || receipt.upstream_receipt_sha256 !== null
      && !SHA256.test(receipt.upstream_receipt_sha256 ?? '')
  ) fail('receipt_invalid', 'Stage receipt identity is invalid.');
  validateExecutionIsolation(receipt.execution_isolation, receipt.stage);
  validateStageOutput(receipt.output, { productionContract, validationPolicy });
  const core = Object.fromEntries(
    Object.entries(receipt).filter(([key]) => key !== 'receipt_sha256'),
  );
  if (
    !SHA256.test(receipt.receipt_sha256 ?? '')
    || receipt.receipt_sha256 !== fingerprintReceiptValue(core)
  ) fail('receipt_hash_mismatch', 'Stage receipt hash does not bind its exact content.');
  if (expectedStage && receipt.stage !== expectedStage) {
    fail('receipt_stage_mismatch', 'Stage receipt belongs to another stage.');
  }
  if (expectedInput && receipt.input_sha256 !== expectedInput) {
    fail('receipt_input_mismatch', 'Stage receipt does not bind the expected input.');
  }
  if (expectedUpstream !== undefined && receipt.upstream_receipt_sha256 !== expectedUpstream) {
    fail('receipt_upstream_mismatch', 'Stage receipt does not bind the expected upstream.');
  }
  if (
    expectedManifestSha256
    && !receipt.output.envelopes.some(
      (envelope) => envelope.manifest_sha256 === expectedManifestSha256,
    )
  ) fail('receipt_manifest_mismatch', 'Stage receipt does not bind the expected manifest.');
  if (expectedGateNames) {
    const actual = receipt.output.gate_receipts.map((value) => value.gate).sort();
    if (JSON.stringify(actual) !== JSON.stringify([...expectedGateNames].sort())) {
      fail('receipt_gate_set_mismatch', 'Stage receipt gate set is invalid.');
    }
  }
  assertReceiptPrivacy(receipt);
  return receipt;
}

function validateBlockReceiptSet(blocks, productionContract, validationPolicy) {
  if (!Array.isArray(blocks) || blocks.length < 1 || blocks.length > 256) {
    fail('render_block_receipts_invalid', 'Render preflight requires a dynamic non-empty block set.');
  }
  const blockIds = [];
  for (const [index, block] of blocks.entries()) {
    exact(
      block,
      ['block_id', 'gate_receipts'],
      'render_block_receipts_invalid',
      'Block receipt set is invalid.',
    );
    if (
      block.block_id !== `B${String(index + 1).padStart(3, '0')}`
      || !Array.isArray(block.gate_receipts)
      || block.gate_receipts.length !== BLOCK_GATE_NAMES.length
    ) fail('render_block_sequence_invalid', 'Block IDs must be the continuous canonical B001…BN sequence.');
    blockIds.push(block.block_id);
    const gates = block.gate_receipts.map((value) => value.gate).sort();
    if (JSON.stringify(gates) !== JSON.stringify([...BLOCK_GATE_NAMES].sort())) {
      fail('render_block_gate_set_invalid', 'Each block must pass the exact three block gates.');
    }
    for (const gateReceipt of block.gate_receipts) {
      validateCompactGateReceipt(gateReceipt, { productionContract, validationPolicy });
      if (
        gateReceipt.status !== 'passed'
        || gateReceipt.phase !== 'block'
        || gateReceipt.scope_id !== block.block_id
      ) fail('render_block_gate_failed', 'A block gate is failed or bound to another block.');
    }
    const source = block.gate_receipts.find(
      (receipt) => receipt.gate === 'source-conformance-gate',
    );
    const runtime = block.gate_receipts.find(
      (receipt) => receipt.gate === 'runtime-seek-gate',
    );
    const pixel = block.gate_receipts.find(
      (receipt) => receipt.gate === 'pixel-signal-gate',
    );
    if (
      !SHA256.test(source.input_bindings?.block_manifest_sha256 ?? '')
      || !SHA256.test(source.input_bindings?.source_sha256 ?? '')
      || runtime.input_bindings.block_manifest_sha256
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
    ) fail('render_block_gate_lineage_invalid', 'Block gate receipt lineage is inconsistent.');
  }
  return blockIds;
}

function canonicalOrderedBlockReceiptSet(blocks) {
  return blocks.map((block) => ({
    block_id: block.block_id,
    source_conformance_receipt_sha256: block.gate_receipts.find(
      (receipt) => receipt.gate === 'source-conformance-gate',
    ).receipt_sha256,
    runtime_seek_receipt_sha256: block.gate_receipts.find(
      (receipt) => receipt.gate === 'runtime-seek-gate',
    ).receipt_sha256,
    pixel_signal_receipt_sha256: block.gate_receipts.find(
      (receipt) => receipt.gate === 'pixel-signal-gate',
    ).receipt_sha256,
  }));
}

export async function assertFinalRenderPreflight(input) {
  exact(
    input,
    RENDER_PREFLIGHT_REQUIRED_INPUTS,
    'render_preflight_invalid',
    'Render preflight input set is invalid.',
  );
  ensureActive(input.production_contract);
  verifyIdentity(input.production_contract, 'render_contract_invalid');
  try {
    validateValidationPolicy(input.validation_policy);
  } catch (error) {
    if (error?.code) fail(error.code, error.message);
    throw error;
  }
  const blockIds = validateBlockReceiptSet(
    input.block_receipts,
    input.production_contract,
    input.validation_policy,
  );
  validateCompactGateReceipt(input.integration_receipt, {
    productionContract: input.production_contract,
    validationPolicy: input.validation_policy,
  });
  if (
    input.integration_receipt.gate !== 'integration-delivery-gate'
    || input.integration_receipt.phase !== 'integration'
    || input.integration_receipt.status !== 'passed'
  ) fail('render_integration_gate_failed', 'Integration gate has not passed.');
  const manifest = input.integration_manifest;
  exact(manifest, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'validation_policy_id',
    'ordered_block_ids',
    'integrated_source_sha256',
    'integration_manifest_sha256',
  ], 'render_integration_manifest_invalid', 'Integration manifest shape is invalid.');
  const manifestCore = Object.fromEntries(
    Object.entries(manifest).filter(([key]) => key !== 'integration_manifest_sha256'),
  );
  if (
    manifest.schema_version !== 1
    || manifest.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
    || manifest.authoring_topology_id !== AUTHORING_TOPOLOGY_ID
    || manifest.validation_policy_id !== VALIDATION_POLICY_ID
    || JSON.stringify(manifest.ordered_block_ids) !== JSON.stringify(blockIds)
    || !SHA256.test(manifest.integrated_source_sha256 ?? '')
  ) fail('render_integration_manifest_invalid', 'Integration manifest does not bind ordered blocks.');
  if (
    !SHA256.test(manifest.integration_manifest_sha256 ?? '')
    || manifest.integration_manifest_sha256 !== fingerprintV3Value(manifestCore)
  ) fail('render_integration_manifest_hash_mismatch', 'Integration manifest self-hash is invalid.');
  const proof = input.no_rewrite_proof;
  exact(proof, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'validation_policy_id',
    'status',
    'ordered_block_ids',
    'blocks',
    'integrated_source_sha256',
    'no_rewrite_proof_sha256',
  ], 'render_no_rewrite_proof_invalid', 'No-rewrite proof shape is invalid.');
  if (
    proof.schema_version !== 1
    || proof.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
    || proof.authoring_topology_id !== AUTHORING_TOPOLOGY_ID
    || proof.validation_policy_id !== VALIDATION_POLICY_ID
    || proof.status !== 'passed'
    || JSON.stringify(proof.ordered_block_ids) !== JSON.stringify(blockIds)
    || !Array.isArray(proof.blocks)
    || proof.blocks.length !== blockIds.length
    || proof.integrated_source_sha256 !== manifest.integrated_source_sha256
  ) fail('render_no_rewrite_proof_invalid', 'No-rewrite proof is invalid or stale.');
  for (const [index, record] of proof.blocks.entries()) {
    exact(record, [
      'block_id',
      'before_source_sha256',
      'after_source_sha256',
    ], 'render_no_rewrite_proof_invalid', 'No-rewrite block proof is invalid.');
    const sourceReceipt = input.block_receipts[index].gate_receipts.find(
      (receipt) => receipt.gate === 'source-conformance-gate',
    );
    if (
      record.block_id !== blockIds[index]
      || !SHA256.test(record.before_source_sha256 ?? '')
      || record.before_source_sha256 !== record.after_source_sha256
      || record.before_source_sha256 !== sourceReceipt.input_bindings.source_sha256
    ) fail('render_no_rewrite_detected', 'Integrated block bytes differ from authored source bytes.');
  }
  const proofCore = Object.fromEntries(
    Object.entries(proof).filter(([key]) => key !== 'no_rewrite_proof_sha256'),
  );
  if (
    !SHA256.test(proof.no_rewrite_proof_sha256 ?? '')
    || proof.no_rewrite_proof_sha256 !== fingerprintV3Value(proofCore)
  ) fail('render_no_rewrite_proof_hash_mismatch', 'No-rewrite proof self-hash is invalid.');
  const bindings = input.integration_receipt.input_bindings;
  const orderedSetSha256 = fingerprintV3Value(
    canonicalOrderedBlockReceiptSet(input.block_receipts),
  );
  if (
    bindings.ordered_block_receipt_set_sha256 !== orderedSetSha256
  ) fail('render_ordered_block_receipt_set_mismatch', 'Integration receipt does not bind the ordered block receipt set.');
  if (
    bindings.integration_manifest_sha256 !== manifest.integration_manifest_sha256
    || bindings.no_rewrite_proof_sha256 !== proof.no_rewrite_proof_sha256
    || bindings.integrated_source_sha256 !== manifest.integrated_source_sha256
  ) fail('render_integration_binding_mismatch', 'Integration receipt is not bound to current bytes.');
  return {
    status: 'passed',
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    production_contract_sha256: input.production_contract.production_contract_sha256,
    block_count: blockIds.length,
    integration_manifest_sha256: manifest.integration_manifest_sha256,
    integration_receipt_sha256: input.integration_receipt.receipt_sha256,
    no_rewrite_proof_sha256: proof.no_rewrite_proof_sha256,
    gate_names: SCRIPT_ONLY_GATE_NAMES,
  };
}

export function inspectStageReceipt(receipt, evidence = {}) {
  const compatibility = inspectV3Compatibility(receipt);
  if (compatibility.code !== 'canonical_artifact_validation_required') {
    return {
      resume_eligible: false,
      resign_eligible: false,
      code: compatibility.code,
      schema_version: Number.isSafeInteger(receipt?.schema_version)
        ? receipt.schema_version
        : null,
      pipeline_contract_version: compatibility.pipeline_contract_version,
      stage: typeof receipt?.stage === 'string' ? receipt.stage : null,
      receipt_sha256: SHA256.test(receipt?.receipt_sha256 ?? '')
        ? receipt.receipt_sha256
        : null,
    };
  }
  try {
    validateStageReceipt(receipt, evidence);
  } catch (error) {
    return {
      resume_eligible: false,
      resign_eligible: false,
      code: error?.code ?? 'receipt_invalid',
      schema_version: Number.isSafeInteger(receipt?.schema_version)
        ? receipt.schema_version
        : null,
      pipeline_contract_version: compatibility.pipeline_contract_version,
      stage: typeof receipt?.stage === 'string' ? receipt.stage : null,
      receipt_sha256: SHA256.test(receipt?.receipt_sha256 ?? '')
        ? receipt.receipt_sha256
        : null,
    };
  }
  return {
    resume_eligible: true,
    resign_eligible: false,
    code: null,
    schema_version: receipt.schema_version,
    pipeline_contract_version: receipt.pipeline_contract_version,
    stage: receipt.stage,
    receipt_sha256: receipt.receipt_sha256,
  };
}
