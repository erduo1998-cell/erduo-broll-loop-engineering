import {
  AUTHORING_TOPOLOGY_ID,
  PIPELINE_CONTRACT_VERSION,
  VALIDATION_POLICY_ID,
  createGateReceipt,
  fingerprintV3Value,
} from './validate-production-contract.mjs';

export const H = (character) => character.repeat(64);
export const REAL_LIMITATION_CODES = Object.freeze([
  'pexels-key-unverified',
  'windows-unverified',
  'editor-gui-unverified',
  'user-font-license-unverified',
]);
const hash = (value) => fingerprintV3Value(value);
const withHash = (value, field) => ({ ...value, [field]: hash(value) });

const GATE_NAMES = [
  'policy-gate',
  'source-conformance-gate',
  'runtime-seek-gate',
  'pixel-signal-gate',
  'integration-delivery-gate',
];

export function createValidationPolicy() {
  return withHash({
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    validation_policy_id: VALIDATION_POLICY_ID,
    context_budget: {
      block_receipt_max_bytes: 16384,
      stage_envelope_max_bytes: 32768,
      final_summary_max_bytes: 65536,
      inline_source_allowed: false,
      inline_image_allowed: false,
      inline_log_allowed: false,
      contact_sheet_allowed: false,
      subjective_quality_fields_allowed: false,
    },
    profile_policy: {
      project_profile_required: true,
      public_default_profile_id: null,
      forbidden_public_default_profiles: ['deep-current-hud'],
    },
    readable_hold_policy: {
      ordinary_min_frames: 24,
      complex_min_frames: 45,
      complex_classes: ['table', 'chart', 'multi-field', 'data'],
      short_window_action: 'reduce-content-or-motion',
    },
    data_policy: {
      evidence_roles: ['measured', 'reported', 'illustrative'],
      require_unit: true,
      require_denominator: true,
      require_formula: true,
      require_source_ref: true,
    },
    whole_film_budgets: {
      emphasis_max_events: 4,
      density_level_min: 1,
      density_level_max: 5,
      max_same_layout_run: 2,
      max_same_metaphor_run: 2,
      cooldown_min_changed_dimensions: 2,
    },
    runtime_sample_strategy: {
      paths: ['fresh_direct', 'zero_to_t', 'end_to_t', 'repeat_to_t'],
      causal_phases: ['entry', 'action', 'result', 'hold', 'exit'],
      state_hash_required: true,
    },
    pixel_thresholds: {
      near_black_luma_max: 8,
      near_empty_coverage_max_ratio: 0.005,
      text_overflow_tolerance_px: 1,
      primary_roi_min_ratio: 0.01,
    },
    gate_policies: Object.fromEntries(GATE_NAMES.map((gate) => [gate, {
      hard_failure_codes: [`${gate.replaceAll('-', '_')}_contract_failure`],
      warning_codes: [`${gate.replaceAll('-', '_')}_calibration_warning`],
    }])),
    cache_key_fields: [
      'source_sha256',
      'policy_sha256',
      'production_contract_sha256',
      'renderer_version',
      'hyperframes_version',
      'state_or_frame',
    ],
    tool_bindings: {
      renderer_version: 'fixture-renderer-1.0.0',
      hyperframes_version: '0.7.70',
      policy_version: '1.0.0',
    },
    legacy_policy: {
      accepted_pipeline_contract_version: 3,
      legacy_pipeline_contract_versions: [2],
      mode: 'inspection-only',
      resume_allowed: false,
      resign_allowed: false,
      render_authorization_allowed: false,
      forbidden_active_fields: [
        'shot_plan_review',
        'asset_fact_review',
        'html_preview_review',
        'final_frame_review',
        'style_conformance_review',
        'source_code_review',
        'main_review_refs',
        'visual-review',
        'contact_sheet',
        'inspected_visual_page',
        'trusted_capture',
        'style_integration_authorization',
        'stable_window',
      ],
    },
  }, 'validation_policy_sha256');
}

const DIRECTOR_FIELDS = [
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
];

export function createProductionContracts(validationPolicy = createValidationPolicy()) {
  const directorCore = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    contract_phase: 'director',
    parsed_srt_sha256: H('1'),
    shot_plan_sha256: H('2'),
    design_system_sha256: H('3'),
    component_registry_sha256: H('4'),
    validation_policy_sha256: validationPolicy.validation_policy_sha256,
    reference_style_profile_sha256: H('5'),
    font_package_sha256: H('6'),
    projection_sha256: H('7'),
    delivery_profile_sha256: H('8'),
  };
  const director = {
    ...directorCore,
    production_contract_sha256: hash(directorCore),
  };
  const sealedCore = {
    ...directorCore,
    contract_phase: 'sealed',
    prior_contract_sha256: director.production_contract_sha256,
    asset_manifest_sha256: H('9'),
  };
  const sealed = {
    ...sealedCore,
    production_contract_sha256: hash(sealedCore),
  };
  return { director, sealed };
}

function selectBindings(fields, gate, phase, scopeId, contract, overrides) {
  return Object.fromEntries(fields.map((field) => [
    field,
    Object.hasOwn(overrides, field)
      ? overrides[field]
      : Object.hasOwn(contract, field)
        ? contract[field]
        : hash({ field, gate, phase, scopeId }),
  ]));
}

export function receiptBindings(
  gate,
  phase,
  contract,
  scopeId,
  overrides = {},
) {
  const selected = (fields) => selectBindings(
    fields,
    gate,
    phase,
    scopeId,
    contract,
    overrides,
  );
  if (gate === 'policy-gate') {
    return selected(phase === 'director'
      ? DIRECTOR_FIELDS
      : [...DIRECTOR_FIELDS, 'prior_contract_sha256', 'asset_manifest_sha256']);
  }
  if (gate === 'source-conformance-gate') {
    return selected([
      'production_contract_sha256',
      'shot_plan_sha256',
      'design_system_sha256',
      'component_registry_sha256',
      'validation_policy_sha256',
      'reference_style_profile_sha256',
      'font_package_sha256',
      'projection_sha256',
      'asset_manifest_sha256',
      'block_manifest_sha256',
      'source_sha256',
    ]);
  }
  if (gate === 'runtime-seek-gate') {
    return selected([
      'production_contract_sha256',
      'shot_plan_sha256',
      'validation_policy_sha256',
      'font_package_sha256',
      'projection_sha256',
      'asset_manifest_sha256',
      'block_manifest_sha256',
      'source_sha256',
      'source_conformance_receipt_sha256',
    ]);
  }
  if (gate === 'pixel-signal-gate') {
    return selected([
      'production_contract_sha256',
      'shot_plan_sha256',
      'design_system_sha256',
      'validation_policy_sha256',
      'reference_style_profile_sha256',
      'font_package_sha256',
      'projection_sha256',
      'asset_manifest_sha256',
      'block_manifest_sha256',
      'source_sha256',
      'source_conformance_receipt_sha256',
      'runtime_seek_receipt_sha256',
    ]);
  }
  const integrationFields = [
    ...DIRECTOR_FIELDS,
    'prior_contract_sha256',
    'asset_manifest_sha256',
    'ordered_block_receipt_set_sha256',
    'master_wrapper_sha256',
    'integration_manifest_sha256',
    'no_rewrite_proof_sha256',
    'integrated_source_sha256',
    'renderer_version_sha256',
    'hyperframes_version_sha256',
  ];
  return selected(phase === 'delivery'
    ? [
      ...integrationFields,
      'integration_receipt_sha256',
      'render_receipt_sha256',
      'technical_verify_receipt_sha256',
      'master_media_sha256',
    ]
    : integrationFields);
}

export function createReceipt({
  gate,
  phase,
  scopeId = 'production',
  contract,
  validationPolicy,
  bindingOverrides = {},
  status = 'passed',
  hardFailureCodes = [],
  warningCodes = [],
}) {
  return createGateReceipt({
    gate,
    phase,
    scope_id: scopeId,
    productionContract: contract,
    input_bindings: receiptBindings(
      gate,
      phase,
      contract,
      scopeId,
      bindingOverrides,
    ),
    status,
    hard_failure_codes: hardFailureCodes,
    warning_codes: warningCodes,
    metrics: { checked_item_count: 2 },
    cache: {
      status: 'miss',
      cache_key_sha256: hash({ gate, phase, scopeId }),
    },
    validationPolicy,
  });
}

export function createBlockReceipts({
  count = 2,
  contract,
  validationPolicy,
} = {}) {
  return Array.from({ length: count }, (_, index) => {
    const blockId = `B${String(index + 1).padStart(3, '0')}`;
    const commonBindings = {
      block_manifest_sha256: hash({ block_id: blockId, kind: 'block-manifest' }),
      source_sha256: hash({ block_id: blockId, kind: 'block-source' }),
    };
    const source = createReceipt({
      gate: 'source-conformance-gate',
      phase: 'block',
      scopeId: blockId,
      contract,
      validationPolicy,
      bindingOverrides: commonBindings,
    });
    const runtime = createReceipt({
      gate: 'runtime-seek-gate',
      phase: 'block',
      scopeId: blockId,
      contract,
      validationPolicy,
      bindingOverrides: {
        ...commonBindings,
        source_conformance_receipt_sha256: source.receipt_sha256,
      },
    });
    const pixel = createReceipt({
      gate: 'pixel-signal-gate',
      phase: 'block',
      scopeId: blockId,
      contract,
      validationPolicy,
      bindingOverrides: {
        ...commonBindings,
        source_conformance_receipt_sha256: source.receipt_sha256,
        runtime_seek_receipt_sha256: runtime.receipt_sha256,
      },
    });
    return {
      block_id: blockId,
      gate_receipts: [source, runtime, pixel],
    };
  });
}

export function orderedBlockReceiptSet(blockReceipts) {
  return blockReceipts.map((block) => ({
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

export function createRuntimeBundle({ blockCount = 2 } = {}) {
  const validationPolicy = createValidationPolicy();
  const { director, sealed } = createProductionContracts(validationPolicy);
  const policyReceipt = createReceipt({
    gate: 'policy-gate',
    phase: 'sealed',
    contract: sealed,
    validationPolicy,
  });
  const blockReceipts = createBlockReceipts({
    count: blockCount,
    contract: sealed,
    validationPolicy,
  });
  const orderedBlockIds = blockReceipts.map((block) => block.block_id);
  const integratedSourceSha256 = hash({
    ordered_block_ids: orderedBlockIds,
    kind: 'integrated-source',
  });
  const integrationManifestCore = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    ordered_block_ids: orderedBlockIds,
    integrated_source_sha256: integratedSourceSha256,
  };
  const integrationManifest = {
    ...integrationManifestCore,
    integration_manifest_sha256: hash(integrationManifestCore),
  };
  const noRewriteProofCore = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    status: 'passed',
    ordered_block_ids: orderedBlockIds,
    blocks: blockReceipts.map((block) => {
      const sourceSha256 = block.gate_receipts.find(
        (receipt) => receipt.gate === 'source-conformance-gate',
      ).input_bindings.source_sha256;
      return {
        block_id: block.block_id,
        before_source_sha256: sourceSha256,
        after_source_sha256: sourceSha256,
      };
    }),
    integrated_source_sha256: integrationManifest.integrated_source_sha256,
  };
  const noRewriteProof = {
    ...noRewriteProofCore,
    no_rewrite_proof_sha256: hash(noRewriteProofCore),
  };
  const integrationReceipt = createReceipt({
    gate: 'integration-delivery-gate',
    phase: 'integration',
    scopeId: 'integration',
    contract: sealed,
    validationPolicy,
    bindingOverrides: {
      ordered_block_receipt_set_sha256: hash(orderedBlockReceiptSet(blockReceipts)),
      master_wrapper_sha256: H('e'),
      integration_manifest_sha256: integrationManifest.integration_manifest_sha256,
      no_rewrite_proof_sha256: noRewriteProof.no_rewrite_proof_sha256,
      integrated_source_sha256: integrationManifest.integrated_source_sha256,
      renderer_version_sha256: H('f'),
      hyperframes_version_sha256: H('0'),
    },
  });
  return {
    validationPolicy,
    director,
    sealed,
    policyReceipt,
    blockReceipts,
    integrationManifest,
    noRewriteProof,
    integrationReceipt,
  };
}

export function createDeliveryPhaseReceipt({
  bundle,
  render,
  technical,
}) {
  return createReceipt({
    gate: 'integration-delivery-gate',
    phase: 'delivery',
    scopeId: 'delivery',
    contract: bundle.sealed,
    validationPolicy: bundle.validationPolicy,
    bindingOverrides: {
      ordered_block_receipt_set_sha256:
        bundle.integrationReceipt.input_bindings.ordered_block_receipt_set_sha256,
      master_wrapper_sha256:
        bundle.integrationReceipt.input_bindings.master_wrapper_sha256,
      integration_manifest_sha256:
        bundle.integrationManifest.integration_manifest_sha256,
      no_rewrite_proof_sha256:
        bundle.noRewriteProof.no_rewrite_proof_sha256,
      integrated_source_sha256:
        bundle.integrationManifest.integrated_source_sha256,
      renderer_version_sha256:
        bundle.integrationReceipt.input_bindings.renderer_version_sha256,
      hyperframes_version_sha256:
        bundle.integrationReceipt.input_bindings.hyperframes_version_sha256,
      integration_receipt_sha256: bundle.integrationReceipt.receipt_sha256,
      render_receipt_sha256: render.render_receipt_sha256,
      technical_verify_receipt_sha256: technical.receipt_sha256,
      master_media_sha256: render.master_media_sha256,
    },
  });
}

export function createRenderEvidence({
  bundle,
  masterMediaSha256,
}) {
  const core = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    status: 'passed',
    input_bindings: {
      production_contract_sha256: bundle.sealed.production_contract_sha256,
      integration_manifest_sha256:
        bundle.integrationManifest.integration_manifest_sha256,
      no_rewrite_proof_sha256:
        bundle.noRewriteProof.no_rewrite_proof_sha256,
      integrated_source_sha256:
        bundle.integrationManifest.integrated_source_sha256,
    },
    master_media_sha256: masterMediaSha256,
  };
  return {
    ...core,
    render_receipt_sha256: hash(core),
  };
}
