import { parseSrt } from './parse-srt.mjs';
import { compileProductionContract } from './compile-production-contract.mjs';
import {
  AUTHORING_TOPOLOGY_ID,
  PIPELINE_CONTRACT_VERSION,
  ScriptOnlyV3ContractError,
  VALIDATION_POLICY_ID,
  assertNoLegacyActiveFields,
  createGateReceipt,
  fingerprintV3Value,
  validateGateReceipt,
  validateProductionContract,
} from './validate-production-contract.mjs';
import { validateContextBudget } from './validate-context-budget.mjs';
import {
  validateCanonicalFrameProjection,
} from './compile-canonical-frame-projection.mjs';

const INPUT_FIELDS = Object.freeze([
  'srt_bytes',
  'parsedSrt',
  'shotPlan',
  'designSystem',
  'componentRegistry',
  'validationPolicy',
  'referenceStyleProfile',
  'fontPackage',
  'projection',
  'deliveryProfile',
]);
const RESULT_FIELDS = Object.freeze([
  'parent_envelope',
  'policy_receipt',
  'production_contract',
]);
const CONTRACT_BINDINGS = Object.freeze([
  'production_contract_sha256',
  'parsed_srt_sha256',
  'shot_plan_sha256',
  'design_system_sha256',
  'component_registry_sha256',
  'validation_policy_sha256',
  'reference_style_profile_sha256',
  'font_package_sha256',
  'projection_sha256',
  'delivery_profile_sha256',
]);
const fail = (code, message) => {
  throw new ScriptOnlyV3ContractError(code, message);
};

function exact(value, fields, code, message) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...fields].sort())
  ) fail(code, message);
}

function canonicalParsedSrtFromBytes(bytes) {
  if (
    !Buffer.isBuffer(bytes)
    && !(bytes instanceof Uint8Array)
    && typeof bytes !== 'string'
  ) {
    fail(
      'parsed_srt_binding_mismatch',
      'Actual SRT bytes are required.',
    );
  }
  let parsed;
  try {
    parsed = parseSrt(bytes);
  } catch {
    fail(
      'parsed_srt_binding_mismatch',
      'Actual SRT bytes cannot be parsed into the bound canonical artifact.',
    );
  }
  return {
    schema_version: 1,
    artifact_kind: 'parsed-srt',
    cues: parsed.cues.map((cue, index) => ({
      cue_id: `Q${String(index + 1).padStart(3, '0')}`,
      start_ms: cue.start_ms,
      end_ms: cue.end_ms,
      text: cue.text,
    })),
  };
}

function canonicalArtifacts(input) {
  return {
    parsedSrt: input.parsedSrt,
    shotPlan: input.shotPlan,
    designSystem: input.designSystem,
    componentRegistry: input.componentRegistry,
    validationPolicy: input.validationPolicy,
    referenceStyleProfile: input.referenceStyleProfile,
    fontPackage: input.fontPackage,
    projection: input.projection,
    deliveryProfile: input.deliveryProfile,
  };
}

function validateInput(input) {
  if (
    input
    && Object.hasOwn(input, 'pipeline_contract_version')
    && input.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
  ) {
    fail(
      'pipeline_upgrade_required',
      'Legacy pipeline identity cannot enter the active director chain.',
    );
  }
  assertNoLegacyActiveFields(input);
  exact(
    input,
    INPUT_FIELDS,
    'director_chain_input_invalid',
    'Director chain requires actual SRT bytes and all canonical artifacts.',
  );
  const parsedFromBytes = canonicalParsedSrtFromBytes(input.srt_bytes);
  if (
    fingerprintV3Value(parsedFromBytes)
      !== fingerprintV3Value(input.parsedSrt)
  ) {
    fail(
      'parsed_srt_binding_mismatch',
      'Canonical parsed-SRT artifact does not bind the actual SRT bytes.',
    );
  }
  validateCanonicalFrameProjection(input.projection, {
    parsed_srt: input.parsedSrt,
    shot_plan: input.shotPlan,
    fps: input.shotPlan?.fps,
  });
  return canonicalArtifacts(input);
}

function contractBindings(contract) {
  return Object.fromEntries(
    CONTRACT_BINDINGS.map((field) => [field, contract[field]]),
  );
}

function parentEnvelope(contract, receipt) {
  return {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    stage: 'director',
    status: 'passed',
    production_contract_sha256: contract.production_contract_sha256,
    gate_receipts: [receipt],
  };
}

function compileDirectorChainSync(input) {
  const artifacts = validateInput(input);
  const productionContract = compileProductionContract({
    contract_phase: 'director',
    ...artifacts,
  });
  const inputBindings = contractBindings(productionContract);
  const policyReceipt = createGateReceipt({
    gate: 'policy-gate',
    phase: 'director',
    scope_id: 'director',
    productionContract,
    input_bindings: inputBindings,
    status: 'passed',
    hard_failure_codes: [],
    warning_codes: [],
    metrics: {
      shot_count: artifacts.shotPlan.shots.length,
      cue_count: artifacts.parsedSrt.cues.length,
    },
    cache: {
      status: 'miss',
      cache_key_sha256: fingerprintV3Value({
        scope_id: 'director',
        input_bindings: inputBindings,
      }),
    },
    validationPolicy: artifacts.validationPolicy,
  });
  const envelope = parentEnvelope(productionContract, policyReceipt);
  validateContextBudget(envelope, {
    kind: 'stage-envelope',
    policy: artifacts.validationPolicy.context_budget,
  });
  return {
    parent_envelope: envelope,
    policy_receipt: policyReceipt,
    production_contract: productionContract,
  };
}

export async function compileDirectorChain(input) {
  return compileDirectorChainSync(input);
}

export function validateDirectorChain(result, input) {
  assertNoLegacyActiveFields(result);
  exact(
    result,
    RESULT_FIELDS,
    'director_chain_result_invalid',
    'Director result must contain one contract, receipt and envelope.',
  );
  const artifacts = validateInput(input);
  validateProductionContract(result.production_contract, { artifacts });
  validateGateReceipt(result.policy_receipt, {
    productionContract: result.production_contract,
    validationPolicy: artifacts.validationPolicy,
  });
  const expectedEnvelope = parentEnvelope(
    result.production_contract,
    result.policy_receipt,
  );
  if (
    fingerprintV3Value(result.parent_envelope)
      !== fingerprintV3Value(expectedEnvelope)
  ) {
    fail(
      'director_chain_result_invalid',
      'Director parent envelope does not bind the current receipt.',
    );
  }
  validateContextBudget(result.parent_envelope, {
    kind: 'stage-envelope',
    policy: artifacts.validationPolicy.context_budget,
  });
  const expected = compileDirectorChainSync(input);
  if (
    fingerprintV3Value(result)
      !== fingerprintV3Value(expected)
  ) {
    fail(
      'director_chain_result_invalid',
      'Director result is not the deterministic canonical chain output.',
    );
  }
  return {
    status: 'passed',
    shot_count: artifacts.shotPlan.shots.length,
    production_contract_sha256:
      result.production_contract.production_contract_sha256,
    receipt_sha256: result.policy_receipt.receipt_sha256,
  };
}
