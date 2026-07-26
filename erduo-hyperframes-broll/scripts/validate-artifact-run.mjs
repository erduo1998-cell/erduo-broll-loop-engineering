import { createHash } from 'node:crypto';
import {
  AUTHORING_TOPOLOGY_ID,
  GATE_NAMES,
  PIPELINE_CONTRACT_VERSION,
  VALIDATION_POLICY_ID,
  inspectV3Compatibility,
  validateGateReceipt,
} from './validate-production-contract.mjs';
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

export class ArtifactRunError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ArtifactRunError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new ArtifactRunError(code, message);
};

function canonical(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('artifact_run_value_invalid', 'Artifact run has a non-finite number.');
    return value;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) {
    fail('artifact_run_value_invalid', 'Artifact run contains an unsupported or cyclic value.');
  }
  seen.add(value);
  const result = Array.isArray(value)
    ? value.map((item) => canonical(item, seen))
    : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key], seen)]));
  seen.delete(value);
  return result;
}

export const fingerprintArtifactRunValue = (value) => createHash('sha256')
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

function verifyIdentity(value, code = 'artifact_run_identity_invalid') {
  if (
    value?.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
    || value?.authoring_topology_id !== AUTHORING_TOPOLOGY_ID
    || value?.validation_policy_id !== VALIDATION_POLICY_ID
  ) fail(code, 'Script-only v3 identity is invalid.');
}

function ensureActive(value) {
  const compatibility = inspectV3Compatibility(value);
  if (compatibility.code === 'pipeline_upgrade_required') {
    fail('pipeline_upgrade_required', 'Older artifact runs are inspection-only and cannot resume.');
  }
  if (compatibility.code === 'legacy_field_forbidden') {
    fail('legacy_field_forbidden', 'Superseded authorization data cannot be re-signed into v3.');
  }
}

function validateReceipt(value, {
  gate,
  phases,
  scopeId,
  productionContractSha256,
  productionContract,
  validationPolicy,
}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('artifact_run_gate_receipt_invalid', 'Gate receipt is invalid.');
  }
  ensureActive(value);
  verifyIdentity(value, 'artifact_run_gate_receipt_invalid');
  if (
    value.gate !== gate
    || !GATE_NAMES.includes(value.gate)
    || !phases.includes(value.phase)
    || value.status !== 'passed'
    || scopeId !== undefined && value.scope_id !== scopeId
    || value.production_contract_sha256 !== productionContractSha256
    || !SHA256.test(value.receipt_sha256 ?? '')
  ) fail('artifact_run_gate_receipt_invalid', 'Gate receipt is failed, stale or misbound.');
  const receiptCore = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'receipt_sha256'),
  );
  if (value.receipt_sha256 !== fingerprintArtifactRunValue(receiptCore)) {
    fail('gate_receipt_hash_mismatch', 'Gate receipt hash does not bind its exact content.');
  }
  if (productionContract || validationPolicy) {
    if (!productionContract || !validationPolicy) {
      fail('artifact_run_gate_inputs_required', 'Contract and policy are required together.');
    }
    try {
      validateGateReceipt(value, { productionContract, validationPolicy });
    } catch (error) {
      if (error?.code) fail(error.code, error.message);
      throw error;
    }
  }
}

function validateBlocks(blocks, context) {
  if (!Array.isArray(blocks) || blocks.length < 1 || blocks.length > 256) {
    fail('artifact_run_blocks_invalid', 'Artifact run needs a dynamic non-empty block set.');
  }
  const ids = [];
  for (const [index, block] of blocks.entries()) {
    exact(
      block,
      ['block_id', 'artifact_manifest_sha256', 'gate_receipts'],
      'artifact_run_block_invalid',
      'Block aggregate is invalid.',
    );
    const expectedBlockId = `B${String(index + 1).padStart(3, '0')}`;
    if (block.block_id !== expectedBlockId) {
      fail(
        'artifact_run_block_sequence_invalid',
        `Block sequence must be continuous and canonical; expected ${expectedBlockId}.`,
      );
    }
    if (
      !SHA256.test(block.artifact_manifest_sha256 ?? '')
      || !Array.isArray(block.gate_receipts)
      || block.gate_receipts.length !== BLOCK_GATE_NAMES.length
    ) fail('artifact_run_block_invalid', 'Block aggregate is invalid.');
    ids.push(block.block_id);
    const actualGates = block.gate_receipts.map((value) => value.gate).sort();
    if (JSON.stringify(actualGates) !== JSON.stringify([...BLOCK_GATE_NAMES].sort())) {
      fail('artifact_run_block_gate_set_invalid', 'Block gate set is incomplete or duplicated.');
    }
    for (const receipt of block.gate_receipts) {
      validateReceipt(receipt, {
        ...context,
        gate: receipt.gate,
        phases: ['block'],
        scopeId: block.block_id,
      });
    }
    if (block.gate_receipts.some(
      (receipt) => receipt.input_bindings?.block_manifest_sha256
        !== block.artifact_manifest_sha256,
    )) {
      fail(
        'artifact_run_block_manifest_unbound',
        'Every block receipt must bind the aggregate artifact manifest.',
      );
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
      !SHA256.test(source.input_bindings?.source_sha256 ?? '')
      || runtime.input_bindings?.source_sha256 !== source.input_bindings.source_sha256
      || pixel.input_bindings?.source_sha256 !== source.input_bindings.source_sha256
      || runtime.input_bindings?.source_conformance_receipt_sha256
        !== source.receipt_sha256
      || pixel.input_bindings?.source_conformance_receipt_sha256
        !== source.receipt_sha256
      || pixel.input_bindings?.runtime_seek_receipt_sha256
        !== runtime.receipt_sha256
    ) {
      fail(
        'artifact_run_block_receipt_lineage_invalid',
        'Block gate receipts do not form one canonical source/runtime/pixel lineage.',
      );
    }
  }
  return ids;
}

function validateIntegration(value, blocks, context) {
  const blockIds = blocks.map((block) => block.block_id);
  exact(value, [
    'ordered_block_ids',
    'integration_manifest_sha256',
    'no_rewrite_proof_sha256',
    'integrated_source_sha256',
    'gate_receipt',
  ], 'artifact_run_integration_invalid', 'Integration aggregate is invalid.');
  if (
    JSON.stringify(value.ordered_block_ids) !== JSON.stringify(blockIds)
    || !SHA256.test(value.integration_manifest_sha256 ?? '')
    || !SHA256.test(value.no_rewrite_proof_sha256 ?? '')
    || !SHA256.test(value.integrated_source_sha256 ?? '')
  ) fail('artifact_run_integration_invalid', 'Integration aggregate is invalid.');
  validateReceipt(value.gate_receipt, {
    ...context,
    gate: 'integration-delivery-gate',
    phases: ['integration', 'delivery'],
  });
  const bindings = value.gate_receipt.input_bindings;
  if (
    !bindings
    || bindings.integration_manifest_sha256 !== value.integration_manifest_sha256
    || bindings.no_rewrite_proof_sha256 !== value.no_rewrite_proof_sha256
    || bindings.integrated_source_sha256 !== value.integrated_source_sha256
  ) fail('artifact_run_integration_unbound', 'Integration receipt does not bind current bytes.');
  const orderedBlockReceiptSet = blocks.map((block) => ({
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
  if (
    bindings.ordered_block_receipt_set_sha256
      !== fingerprintArtifactRunValue(orderedBlockReceiptSet)
  ) {
    fail(
      'artifact_run_integration_unbound',
      'Integration receipt does not bind the canonical ordered block receipt set.',
    );
  }
}

function validateRender(value) {
  exact(value, [
    'master_media_sha256',
    'render_receipt_sha256',
    'technical_verify',
  ], 'artifact_run_render_invalid', 'Render aggregate is invalid.');
  if (
    !SHA256.test(value.master_media_sha256 ?? '')
    || !SHA256.test(value.render_receipt_sha256 ?? '')
  ) fail('artifact_run_render_invalid', 'Render aggregate is invalid.');
  exact(value.technical_verify, [
    'status',
    'receipt_sha256',
    'checked_media_sha256',
    'limitation_codes',
  ], 'artifact_run_technical_verify_invalid', 'Technical verify aggregate is invalid.');
  if (
    value.technical_verify.status !== 'passed'
    || !SHA256.test(value.technical_verify.receipt_sha256 ?? '')
    || value.technical_verify.checked_media_sha256 !== value.master_media_sha256
    || JSON.stringify(value.technical_verify.limitation_codes)
      !== JSON.stringify(REAL_LIMITATION_CODES)
  ) fail('artifact_run_technical_verify_invalid', 'Technical verify aggregate is invalid.');
}

export async function validateArtifactRun(run, {
  productionContract,
  validationPolicy,
} = {}) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) {
    fail('artifact_run_invalid', 'Artifact run is invalid.');
  }
  ensureActive(run);
  if (!productionContract || !validationPolicy) {
    fail(
      'artifact_run_gate_inputs_required',
      'Actual production contract and validation policy evidence are required.',
    );
  }
  exact(run, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'validation_policy_id',
    'run_id',
    'production_contract_sha256',
    'policy_gate_receipt',
    'blocks',
    'integration',
    'render',
    'artifact_run_sha256',
  ], 'artifact_run_invalid', 'Artifact run shape is invalid.');
  verifyIdentity(run);
  if (
    run.schema_version !== 1
    || !SAFE_ID.test(run.run_id ?? '')
    || !SHA256.test(run.production_contract_sha256 ?? '')
  ) fail('artifact_run_invalid', 'Artifact run identity is invalid.');
  if (productionContract.production_contract_sha256 !== run.production_contract_sha256) {
    fail('artifact_run_contract_unbound', 'Artifact run does not bind the supplied contract.');
  }
  const context = {
    productionContractSha256: run.production_contract_sha256,
    productionContract,
    validationPolicy,
  };
  validateReceipt(run.policy_gate_receipt, {
    ...context,
    gate: 'policy-gate',
    phases: ['director', 'sealed'],
  });
  const blockIds = validateBlocks(run.blocks, context);
  validateIntegration(run.integration, run.blocks, context);
  validateRender(run.render);
  const core = Object.fromEntries(
    Object.entries(run).filter(([key]) => key !== 'artifact_run_sha256'),
  );
  if (
    !SHA256.test(run.artifact_run_sha256 ?? '')
    || run.artifact_run_sha256 !== fingerprintArtifactRunValue(core)
  ) fail('artifact_run_hash_mismatch', 'Artifact run hash does not bind its exact content.');
  const gate_receipts = {
    'policy-gate': run.policy_gate_receipt.receipt_sha256,
    'source-conformance-gate': run.blocks.map(
      (block) => block.gate_receipts.find(
        (receipt) => receipt.gate === 'source-conformance-gate',
      ).receipt_sha256,
    ),
    'runtime-seek-gate': run.blocks.map(
      (block) => block.gate_receipts.find(
        (receipt) => receipt.gate === 'runtime-seek-gate',
      ).receipt_sha256,
    ),
    'pixel-signal-gate': run.blocks.map(
      (block) => block.gate_receipts.find(
        (receipt) => receipt.gate === 'pixel-signal-gate',
      ).receipt_sha256,
    ),
    'integration-delivery-gate': run.integration.gate_receipt.receipt_sha256,
  };
  const summary = {
    status: 'passed',
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    run_id: run.run_id,
    production_contract_sha256: run.production_contract_sha256,
    block_count: run.blocks.length,
    blocks: blockIds,
    gate_receipts,
    integration: {
      integration_manifest_sha256: run.integration.integration_manifest_sha256,
      no_rewrite_proof_sha256: run.integration.no_rewrite_proof_sha256,
      integrated_source_sha256: run.integration.integrated_source_sha256,
    },
    render: {
      master_media_sha256: run.render.master_media_sha256,
      render_receipt_sha256: run.render.render_receipt_sha256,
    },
    technical_verify: run.render.technical_verify,
    artifact_run_sha256: run.artifact_run_sha256,
  };
  try {
    validateContextBudget(summary, {
      kind: 'final-summary',
      policy: SCRIPT_ONLY_CONTEXT_POLICY,
    });
  } catch (error) {
    if (error?.code) fail(error.code, error.message);
    throw error;
  }
  return summary;
}

export async function inspectArtifactRun(run, evidence = {}) {
  const compatibility = inspectV3Compatibility(run);
  if (compatibility.code !== 'canonical_artifact_validation_required') {
    return {
      resume_eligible: false,
      resign_eligible: false,
      render_eligible: false,
      code: compatibility.code,
      pipeline_contract_version: compatibility.pipeline_contract_version,
      authoring_topology_id: compatibility.authoring_topology_id,
      run_id: typeof run?.run_id === 'string' ? run.run_id : null,
      artifact_run_sha256: SHA256.test(run?.artifact_run_sha256 ?? '')
        ? run.artifact_run_sha256
        : null,
    };
  }
  try {
    const summary = await validateArtifactRun(run, evidence);
    return {
      resume_eligible: true,
      resign_eligible: false,
      render_eligible: true,
      code: null,
      pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
      authoring_topology_id: AUTHORING_TOPOLOGY_ID,
      run_id: summary.run_id,
      artifact_run_sha256: summary.artifact_run_sha256,
    };
  } catch (error) {
    return {
      resume_eligible: false,
      resign_eligible: false,
      render_eligible: false,
      code: error?.code ?? 'artifact_run_invalid',
      pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
      authoring_topology_id: AUTHORING_TOPOLOGY_ID,
      run_id: typeof run?.run_id === 'string' ? run.run_id : null,
      artifact_run_sha256: SHA256.test(run?.artifact_run_sha256 ?? '')
        ? run.artifact_run_sha256
        : null,
    };
  }
}
