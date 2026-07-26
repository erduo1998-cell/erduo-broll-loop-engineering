import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import * as artifactManifestApi from './artifact-manifest.mjs';
import * as artifactRunApi from './validate-artifact-run.mjs';
import * as contextBudgetApi from './validate-context-budget.mjs';
import * as deliveryApi from './delivery-report.mjs';
import * as orchestratorApi from './orchestrate-stages.mjs';
import * as receiptApi from './stage-receipt.mjs';
import * as stateApi from './state.mjs';
import {
  createReceipt,
  createRenderEvidence,
  createRuntimeBundle,
} from './test-support-script-only-v3-runtime.mjs';
import {
  AUTHORING_TOPOLOGY_ID,
  GATE_NAMES,
  PIPELINE_CONTRACT_VERSION,
  VALIDATION_POLICY_ID,
  fingerprintV3Value,
  inspectV3Compatibility,
} from './validate-production-contract.mjs';

const H = (character) => character.repeat(64);
const PRODUCTION_FILES = Object.freeze([
  'orchestrate-stages.mjs',
  'state.mjs',
  'stage-receipt.mjs',
  'artifact-manifest.mjs',
  'validate-artifact-run.mjs',
  'delivery-report.mjs',
]);
const LEGACY_AUTHORIZATION_TERMS = Object.freeze([
  'shot_plan_review',
  'asset_fact_review',
  'html_preview_review',
  'style_conformance_review',
  'source_code_review',
  'final_frame_review',
  'main_review_refs',
]);
const LEGACY_VISUAL_ARTIFACT_TERMS = Object.freeze([
  'contact-sheet',
  'contact_sheet',
  'pre-master',
  'pre_master',
  'final-frame-page',
  'final_frame_page',
  'inspected_visual_page',
]);
const BLOCK_GATES = Object.freeze([
  'source-conformance-gate',
  'runtime-seek-gate',
  'pixel-signal-gate',
]);
const SCRIPT_ONLY_GATES = Object.freeze([
  'policy-gate',
  ...BLOCK_GATES,
  'integration-delivery-gate',
]);
const EXPECTED_STAGE_OUTPUT_FIELDS = Object.freeze([
  'envelopes',
  'gate_receipts',
]);
const EXPECTED_RENDER_PREFLIGHT_INPUTS = Object.freeze([
  'block_receipts',
  'integration_manifest',
  'integration_receipt',
  'no_rewrite_proof',
  'production_contract',
  'validation_policy',
]);

const sources = Object.fromEntries(await Promise.all(
  PRODUCTION_FILES.map(async (name) => [
    name,
    await readFile(new URL(name, import.meta.url), 'utf8'),
  ]),
));

function assertNoTerms(source, terms, label) {
  for (const term of terms) {
    assert.equal(
      source.includes(term),
      false,
      `${label} still contains active legacy term: ${term}`,
    );
  }
}

function artifactRecord(overrides = {}) {
  return {
    artifact_id: 'payload',
    kind: 'json',
    sha256: H('a'),
    size_bytes: 1,
    media_type: 'application/json',
    locator_key: 'payload.json',
    required_by: ['next-stage'],
    ...overrides,
  };
}

function artifactManifest(artifacts, metrics = { checked_item_count: 2 }) {
  return artifactManifestApi.createArtifactManifest({
    run_id: 'run-v3-cutover',
    stage: 'master-build',
    package_id: 'run-v3-cutover-master-build',
    upstream_manifest_sha256: H('b'),
    creative_brief_sha256: H('c'),
    producer_isolation_sha256: H('d'),
    artifacts,
    metrics,
  });
}

test('all active graph modules expose the incompatible script-only v3 identity', () => {
  assert.equal(PIPELINE_CONTRACT_VERSION, 3);
  assert.equal(AUTHORING_TOPOLOGY_ID, 'script-only-authoring-cluster-v1');
  assert.equal(VALIDATION_POLICY_ID, 'script-only-production-v1');
  assert.deepEqual(GATE_NAMES, SCRIPT_ONLY_GATES);

  for (const [label, api] of [
    ['state', stateApi],
    ['stage receipt', receiptApi],
    ['artifact manifest', artifactManifestApi],
    ['artifact run', artifactRunApi],
  ]) {
    assert.equal(api.PIPELINE_CONTRACT_VERSION, 3, `${label} is not active v3`);
    assert.equal(
      api.AUTHORING_TOPOLOGY_ID,
      AUTHORING_TOPOLOGY_ID,
      `${label} does not freeze the active topology`,
    );
    assert.equal(
      api.VALIDATION_POLICY_ID,
      VALIDATION_POLICY_ID,
      `${label} does not freeze the active validation policy`,
    );
  }

  for (const [name, source] of Object.entries(sources)) {
    assert.match(source, /PIPELINE_CONTRACT_VERSION/u, `${name} omits pipeline identity`);
    assert.match(source, /AUTHORING_TOPOLOGY_ID/u, `${name} omits topology identity`);
    assert.match(source, /VALIDATION_POLICY_ID/u, `${name} omits policy identity`);
  }
});

test('active orchestrator contains only the five script gates and emits no review or visual-page products', () => {
  const source = sources['orchestrate-stages.mjs'];
  assertNoTerms(
    source,
    [...LEGACY_AUTHORIZATION_TERMS, ...LEGACY_VISUAL_ARTIFACT_TERMS],
    'orchestrate-stages.mjs',
  );
  for (const gate of SCRIPT_ONLY_GATES) {
    assert.match(source, new RegExp(gate, 'u'), `orchestrator omits ${gate}`);
  }
  for (const forbidden of [
    'validateDirectorV2Chain',
    'validateAssetsV2Chain',
    'validateMasterBuildV2Chain',
    'validateMainReviewPacket',
    'validateVisualEvidence',
    'image/x-portable-pixmap',
    'addMainReviewPacket',
    'fixed-four',
  ]) {
    assert.equal(source.includes(forbidden), false, `orchestrator still activates ${forbidden}`);
  }
});

test('stage receipts have the exact v3 gate_receipts/envelopes output and no reviewer authority surface', () => {
  assert.deepEqual(
    receiptApi.STAGE_OUTPUT_FIELDS,
    EXPECTED_STAGE_OUTPUT_FIELDS,
    'stage receipt output must be exactly envelopes + gate_receipts',
  );
  assertNoTerms(
    sources['stage-receipt.mjs'],
    [...LEGACY_AUTHORIZATION_TERMS, ...LEGACY_VISUAL_ARTIFACT_TERMS],
    'stage-receipt.mjs',
  );
  for (const forbidden of [
    'reviewer_role',
    'reviewer_model_id',
    'reviewer_isolation_sha256',
    'authority_scope',
    'review_refs',
  ]) {
    assert.equal(
      sources['stage-receipt.mjs'].includes(forbidden),
      false,
      `stage receipt still exposes reviewer field: ${forbidden}`,
    );
  }
  assert.match(sources['stage-receipt.mjs'], /gate_receipts/u);
  assert.match(sources['stage-receipt.mjs'], /envelopes/u);
});

test('render preflight accepts only contract, policy, each block three-gate receipts, integration and no-rewrite proof', () => {
  assert.deepEqual(
    receiptApi.RENDER_PREFLIGHT_REQUIRED_INPUTS,
    EXPECTED_RENDER_PREFLIGHT_INPUTS,
  );
  const source = sources['stage-receipt.mjs'];
  for (const value of [
    'production_contract',
    'validation_policy',
    'block_receipts',
    'integration_receipt',
    'integration_manifest',
    'no_rewrite_proof',
  ]) {
    assert.match(source, new RegExp(value, 'u'), `render preflight omits ${value}`);
  }
  for (const gate of BLOCK_GATES) {
    assert.match(source, new RegExp(gate, 'u'), `render preflight omits ${gate}`);
  }
  assert.match(source, /integration-delivery-gate/u);
  assertNoTerms(
    source,
    [...LEGACY_AUTHORIZATION_TERMS, ...LEGACY_VISUAL_ARTIFACT_TERMS],
    'render preflight',
  );
});

test('v3 state is resumable only as v3 while v2 remains inspect-only and cannot be re-signed', () => {
  const legacy = {
    schema_version: 2,
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
    validation_policy_id: 'legacy-v2',
    run_id: 'run-legacy',
    stages: {},
  };
  const inspected = stateApi.inspectRunState(legacy);
  assert.equal(inspected.resume_eligible, false);
  assert.equal(inspected.resign_eligible, false);
  assert.equal(inspected.code, 'pipeline_upgrade_required');
  assert.throws(
    () => stateApi.validateRunState(legacy),
    (error) => error?.code === 'pipeline_upgrade_required',
  );

  const resigned = {
    ...legacy,
    pipeline_contract_version: 3,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
  };
  assert.throws(
    () => stateApi.validateRunState(resigned),
    (error) => ['legacy_state_resign_forbidden', 'legacy_field_forbidden'].includes(error?.code),
  );
});

test('active parent artifact envelopes reject review/contact-sheet/inline image data without banning ordinary media or private pixel temporaries', () => {
  const allowed = artifactManifest([
    artifactRecord({
      artifact_id: 'ordinary-media-001',
      kind: 'ordinary-media',
      sha256: H('1'),
      size_bytes: 1024,
      media_type: 'image/png',
      locator_key: 'assets/ordinary-media-001.png',
      required_by: ['source-conformance-gate'],
    }),
    artifactRecord({
      artifact_id: 'pixel-temp-001',
      kind: 'pixel-signal-temp',
      sha256: H('2'),
      size_bytes: 2048,
      media_type: 'image/png',
      locator_key: 'private-pixel-temp/pixel-temp-001.png',
      required_by: ['pixel-signal-private'],
    }),
  ]);
  assert.equal(allowed.pipeline_contract_version, 3);
  const envelope = artifactManifestApi.createArtifactEnvelope(allowed);
  assert.equal(envelope.pipeline_contract_version, 3);
  assert.equal(Object.hasOwn(envelope, 'artifacts'), false);
  assert.doesNotMatch(JSON.stringify(envelope), /(?:data:image|locator_key|image\/png|\\.png")/u);

  for (const forbiddenArtifact of [
    artifactRecord({
      artifact_id: 'contact-sheet-001',
      kind: 'contact-sheet',
      media_type: 'image/png',
      locator_key: 'contact-sheet-001.png',
      required_by: ['parent'],
    }),
    artifactRecord({
      artifact_id: 'main-review-page-001',
      kind: 'review-page',
      media_type: 'text/html',
      locator_key: 'main-review-page-001.html',
      required_by: ['main-review'],
    }),
  ]) {
    assert.throws(
      () => artifactManifestApi.createArtifactEnvelope(artifactManifest([forbiddenArtifact])),
      (error) => error?.code === 'artifact_parent_payload_forbidden',
    );
  }
  assert.throws(
    () => artifactManifestApi.createArtifactEnvelope(
      artifactManifest(
        [artifactRecord()],
        { frame_data: 'data:image/png;base64,AAAA' },
      ),
    ),
    (error) => error?.code === 'artifact_parent_payload_forbidden',
  );
});

test('artifact-run aggregation is dynamic-N and summarizes exactly the five script gates', () => {
  const source = sources['validate-artifact-run.mjs'];
  assertNoTerms(
    source,
    [...LEGACY_AUTHORIZATION_TERMS, ...LEGACY_VISUAL_ARTIFACT_TERMS],
    'validate-artifact-run.mjs',
  );
  for (const gate of SCRIPT_ONLY_GATES) {
    assert.match(source, new RegExp(gate, 'u'), `artifact run omits ${gate}`);
  }
  assert.match(source, /blocks/u, 'artifact run does not aggregate dynamic blocks');
  assert.match(source, /integration/u, 'artifact run omits integration');
  assert.match(source, /render/u, 'artifact run omits render');
  assert.doesNotMatch(
    source,
    /STAGES\s*=\s*\[\s*['"]director['"]\s*,\s*['"]assets['"]\s*,\s*['"]master-build['"]\s*,\s*['"]render['"]\s*\]/u,
  );
  assert.doesNotMatch(source, /artifact_graph\.length\s*!==\s*STAGES\.length/u);
  for (const superseded of [
    'font_gate_passed',
    'asset_gate_passed',
    'hyperframes_gate_passed',
    'seek_gate_passed',
    'profile_gate_passed',
    'pixel_gate_passed',
    'main_reviews',
  ]) {
    assert.equal(source.includes(superseded), false, `artifact run still aggregates ${superseded}`);
  }
});

test('delivery report contains only script-only receipt facts, real limitations and an enforced 64KiB final budget', () => {
  const source = sources['delivery-report.mjs'];
  assertNoTerms(
    source,
    [...LEGACY_AUTHORIZATION_TERMS, ...LEGACY_VISUAL_ARTIFACT_TERMS],
    'delivery-report.mjs',
  );
  for (const required of [
    'production_contract_sha256',
    'gate_receipts',
    'limitations',
    'technical_verify',
    'validateContextBudget',
    'final-summary',
  ]) {
    assert.match(source, new RegExp(required, 'u'), `delivery report omits ${required}`);
  }
  for (const gate of SCRIPT_ONLY_GATES) {
    assert.match(source, new RegExp(gate, 'u'), `delivery report omits ${gate}`);
  }
  for (const forbidden of [
    'active_topology',
    'reviewer_role',
    'reviewer_model_id',
    'visual_decision',
    'aesthetic',
  ]) {
    assert.equal(source.includes(forbidden), false, `delivery report still exposes ${forbidden}`);
  }
});

test('v2 review packets stay inspection-only and changing only their version/identity never authorizes v3', async () => {
  const legacy = {
    schema_version: 3,
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
    main_review_refs: [{ gate: 'source_code_review', status: 'approved' }],
  };
  assert.deepEqual(inspectV3Compatibility(legacy), {
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
    mode: 'inspection-only',
    resume_eligible: false,
    resign_eligible: false,
    render_authorization_eligible: false,
    code: 'pipeline_upgrade_required',
  });
  const resigned = {
    ...legacy,
    pipeline_contract_version: 3,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
  };
  assert.deepEqual(inspectV3Compatibility(resigned), {
    pipeline_contract_version: 3,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    mode: 'rejected',
    resume_eligible: false,
    resign_eligible: false,
    render_authorization_eligible: false,
    code: 'legacy_field_forbidden',
  });
  assert.throws(
    () => receiptApi.validateStageReceipt(resigned),
    (error) => ['legacy_receipt_resign_forbidden', 'legacy_field_forbidden'].includes(error?.code),
  );
  await assert.rejects(
    () => artifactRunApi.validateArtifactRun(resigned),
    (error) => ['legacy_run_resign_forbidden', 'legacy_field_forbidden'].includes(error?.code),
  );
});

const REQUIRED_REAL_LIMITATIONS = Object.freeze([
  'pexels-key-unverified',
  'windows-unverified',
  'editor-gui-unverified',
  'user-font-license-unverified',
]);
const SHARED_CONTEXT_POLICY = Object.freeze({
  block_receipt_max_bytes: 16 * 1024,
  stage_envelope_max_bytes: 32 * 1024,
  final_summary_max_bytes: 64 * 1024,
  inline_source_allowed: false,
  inline_image_allowed: false,
  inline_log_allowed: false,
  contact_sheet_allowed: false,
  subjective_quality_fields_allowed: false,
});

function stageReceiptInput(bundle, gateReceipts = [bundle.policyReceipt]) {
  return {
    stage: 'master-build',
    run_id: 'run-v3-evidence',
    input_sha256: H('a'),
    upstream_receipt_sha256: H('b'),
    execution_isolation: {
      host: 'fixture-host',
      mechanism: 'isolated-process',
      dispatch_evidence_sha256: H('c'),
      stage_context_sha256: H('d'),
    },
    output: {
      envelopes: [],
      gate_receipts: gateReceipts,
    },
  };
}

function createBoundBlock(blockId, bundle) {
  const artifactManifestSha256 = fingerprintV3Value({
    block_id: blockId,
    kind: 'block-artifact-manifest',
  });
  const sourceSha256 = fingerprintV3Value({
    block_id: blockId,
    kind: 'block-source',
  });
  const sharedBindings = {
    block_manifest_sha256: artifactManifestSha256,
    source_sha256: sourceSha256,
  };
  const source = createReceipt({
    gate: 'source-conformance-gate',
    phase: 'block',
    scopeId: blockId,
    contract: bundle.sealed,
    validationPolicy: bundle.validationPolicy,
    bindingOverrides: sharedBindings,
  });
  const runtime = createReceipt({
    gate: 'runtime-seek-gate',
    phase: 'block',
    scopeId: blockId,
    contract: bundle.sealed,
    validationPolicy: bundle.validationPolicy,
    bindingOverrides: {
      ...sharedBindings,
      source_conformance_receipt_sha256: source.receipt_sha256,
    },
  });
  const pixel = createReceipt({
    gate: 'pixel-signal-gate',
    phase: 'block',
    scopeId: blockId,
    contract: bundle.sealed,
    validationPolicy: bundle.validationPolicy,
    bindingOverrides: {
      ...sharedBindings,
      source_conformance_receipt_sha256: source.receipt_sha256,
      runtime_seek_receipt_sha256: runtime.receipt_sha256,
    },
  });
  return {
    block_id: blockId,
    artifact_manifest_sha256: artifactManifestSha256,
    gate_receipts: [source, runtime, pixel],
  };
}

function renderBlock(block) {
  return {
    block_id: block.block_id,
    gate_receipts: block.gate_receipts,
  };
}

function orderedBlockReceiptSet(blocks) {
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

function createIntegrationEvidence(bundle, blocks, {
  orderedBlockReceiptSetSha256,
} = {}) {
  const orderedBlockIds = blocks.map((block) => block.block_id);
  const integratedSourceSha256 = fingerprintV3Value({
    ordered_block_ids: orderedBlockIds,
    kind: 'integrated-source',
  });
  const manifestCore = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    ordered_block_ids: orderedBlockIds,
    integrated_source_sha256: integratedSourceSha256,
  };
  const integrationManifest = {
    ...manifestCore,
    integration_manifest_sha256: fingerprintV3Value(manifestCore),
  };
  const proofCore = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    status: 'passed',
    ordered_block_ids: orderedBlockIds,
    blocks: blocks.map((block) => {
      const sourceSha256 = block.gate_receipts.find(
        (receipt) => receipt.gate === 'source-conformance-gate',
      ).input_bindings.source_sha256;
      return {
        block_id: block.block_id,
        before_source_sha256: sourceSha256,
        after_source_sha256: sourceSha256,
      };
    }),
    integrated_source_sha256: integratedSourceSha256,
  };
  const noRewriteProof = {
    ...proofCore,
    no_rewrite_proof_sha256: fingerprintV3Value(proofCore),
  };
  const integrationReceipt = createReceipt({
    gate: 'integration-delivery-gate',
    phase: 'integration',
    scopeId: 'integration',
    contract: bundle.sealed,
    validationPolicy: bundle.validationPolicy,
    bindingOverrides: {
      ordered_block_receipt_set_sha256:
        orderedBlockReceiptSetSha256
        ?? fingerprintV3Value(orderedBlockReceiptSet(blocks)),
      master_wrapper_sha256: H('e'),
      integration_manifest_sha256: integrationManifest.integration_manifest_sha256,
      no_rewrite_proof_sha256: noRewriteProof.no_rewrite_proof_sha256,
      integrated_source_sha256: integratedSourceSha256,
      renderer_version_sha256: H('f'),
      hyperframes_version_sha256: H('0'),
    },
  });
  return {
    integrationManifest,
    noRewriteProof,
    integrationReceipt,
  };
}

function renderPreflightInput(bundle, blocks, evidence) {
  return {
    block_receipts: blocks.map(renderBlock),
    integration_manifest: evidence.integrationManifest,
    integration_receipt: evidence.integrationReceipt,
    no_rewrite_proof: evidence.noRewriteProof,
    production_contract: bundle.sealed,
    validation_policy: bundle.validationPolicy,
  };
}

function createDeliveryPhaseReceipt(bundle, evidence, render, technical) {
  return createReceipt({
    gate: 'integration-delivery-gate',
    phase: 'delivery',
    scopeId: 'delivery',
    contract: bundle.sealed,
    validationPolicy: bundle.validationPolicy,
    bindingOverrides: {
      ordered_block_receipt_set_sha256:
        evidence.integrationReceipt.input_bindings.ordered_block_receipt_set_sha256,
      master_wrapper_sha256:
        evidence.integrationReceipt.input_bindings.master_wrapper_sha256,
      integration_manifest_sha256:
        evidence.integrationManifest.integration_manifest_sha256,
      no_rewrite_proof_sha256:
        evidence.noRewriteProof.no_rewrite_proof_sha256,
      integrated_source_sha256:
        evidence.integrationManifest.integrated_source_sha256,
      renderer_version_sha256:
        evidence.integrationReceipt.input_bindings.renderer_version_sha256,
      hyperframes_version_sha256:
        evidence.integrationReceipt.input_bindings.hyperframes_version_sha256,
      integration_receipt_sha256: evidence.integrationReceipt.receipt_sha256,
      render_receipt_sha256: render.render_receipt_sha256,
      technical_verify_receipt_sha256: technical.receipt_sha256,
      master_media_sha256: render.master_media_sha256,
    },
  });
}

function orchestrationFixture({
  technicalExtra = {},
} = {}) {
  const bundle = createRuntimeBundle();
  const blocks = [
    createBoundBlock('B001', bundle),
    createBoundBlock('B002', bundle),
  ];
  const evidence = createIntegrationEvidence(bundle, blocks);
  const renderEvidence = createRenderEvidence({
    bundle: {
      ...bundle,
      blockReceipts: blocks.map(renderBlock),
      integrationManifest: evidence.integrationManifest,
      noRewriteProof: evidence.noRewriteProof,
      integrationReceipt: evidence.integrationReceipt,
    },
    masterMediaSha256: H('1'),
  });
  const render = {
    master_media_sha256: renderEvidence.master_media_sha256,
    render_receipt_sha256: renderEvidence.render_receipt_sha256,
  };
  const technical = {
    status: 'passed',
    receipt_sha256: H('3'),
    checked_media_sha256: render.master_media_sha256,
    limitation_codes: [...REQUIRED_REAL_LIMITATIONS],
    ...technicalExtra,
  };
  let deliveryCalls = 0;
  return {
    bundle,
    blocks,
    evidence,
    render,
    renderEvidence,
    technical,
    deliveryCalls: () => deliveryCalls,
    options: {
      run_id: 'run-v3-orchestrator',
      production_contract: bundle.sealed,
      validation_policy: bundle.validationPolicy,
      policy_receipt: bundle.policyReceipt,
      block_receipts: blocks.map(renderBlock),
      integration_manifest: evidence.integrationManifest,
      integration_receipt: evidence.integrationReceipt,
      no_rewrite_proof: evidence.noRewriteProof,
      render_master: async () => render,
      technical_verify: async () => technical,
      run_delivery_gate: async () => {
        deliveryCalls += 1;
        return createDeliveryPhaseReceipt(bundle, evidence, render, technical);
      },
    },
  };
}

function createArtifactRunFixture({
  blockIds = ['B001', 'B002'],
} = {}) {
  const bundle = createRuntimeBundle();
  const blocks = blockIds.map((blockId) => createBoundBlock(blockId, bundle));
  const evidence = createIntegrationEvidence(bundle, blocks);
  const render = {
    master_media_sha256: H('1'),
    render_receipt_sha256: H('2'),
    technical_verify: {
      status: 'passed',
      receipt_sha256: H('3'),
      checked_media_sha256: H('1'),
      limitation_codes: [...REQUIRED_REAL_LIMITATIONS],
    },
  };
  const core = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    run_id: 'run-v3-artifact',
    production_contract_sha256: bundle.sealed.production_contract_sha256,
    policy_gate_receipt: bundle.policyReceipt,
    blocks,
    integration: {
      ordered_block_ids: blockIds,
      integration_manifest_sha256:
        evidence.integrationManifest.integration_manifest_sha256,
      no_rewrite_proof_sha256:
        evidence.noRewriteProof.no_rewrite_proof_sha256,
      integrated_source_sha256:
        evidence.integrationManifest.integrated_source_sha256,
      gate_receipt: evidence.integrationReceipt,
    },
    render,
  };
  return {
    bundle,
    evidence,
    run: {
      ...core,
      artifact_run_sha256: artifactRunApi.fingerprintArtifactRunValue(core),
    },
  };
}

function resignArtifactRun(run) {
  const core = Object.fromEntries(
    Object.entries(run).filter(([key]) => key !== 'artifact_run_sha256'),
  );
  return {
    ...core,
    artifact_run_sha256: artifactRunApi.fingerprintArtifactRunValue(core),
  };
}

function deliverySummaryFixture() {
  const fixture = orchestrationFixture();
  const deliveryReceipt = createDeliveryPhaseReceipt(
    fixture.bundle,
    fixture.evidence,
    fixture.render,
    fixture.technical,
  );
  const gateReceipts = {
    'policy-gate': fixture.bundle.policyReceipt.receipt_sha256,
    'source-conformance-gate': fixture.blocks.map(
      (block) => block.gate_receipts.find(
        (receipt) => receipt.gate === 'source-conformance-gate',
      ).receipt_sha256,
    ),
    'runtime-seek-gate': fixture.blocks.map(
      (block) => block.gate_receipts.find(
        (receipt) => receipt.gate === 'runtime-seek-gate',
      ).receipt_sha256,
    ),
    'pixel-signal-gate': fixture.blocks.map(
      (block) => block.gate_receipts.find(
        (receipt) => receipt.gate === 'pixel-signal-gate',
      ).receipt_sha256,
    ),
    'integration-delivery-gate': deliveryReceipt.receipt_sha256,
  };
  const input = {
    status: 'technical-contract-passed',
    run_id: 'run-v3-delivery',
    production_contract_sha256:
      fixture.bundle.sealed.production_contract_sha256,
    gate_receipts: gateReceipts,
    technical_verify: fixture.technical,
    limitations: [...REQUIRED_REAL_LIMITATIONS],
    master_media_sha256: fixture.render.master_media_sha256,
  };
  const actualEvidence = {
    productionContract: fixture.bundle.sealed,
    validationPolicy: fixture.bundle.validationPolicy,
    policyReceipt: fixture.bundle.policyReceipt,
    blockReceipts: fixture.blocks.map(renderBlock),
    integrationReceipt: fixture.evidence.integrationReceipt,
    deliveryReceipt,
    technicalVerifyEvidence: fixture.technical,
  };
  return {
    ...fixture,
    deliveryReceipt,
    input,
    actualEvidence,
    actualRenderEvidence: fixture.renderEvidence,
  };
}

function resignDeliverySummary(summary) {
  const core = Object.fromEntries(
    Object.entries(summary).filter(([key]) => key !== 'final_summary_sha256'),
  );
  return {
    ...core,
    final_summary_sha256: deliveryApi.fingerprintDeliveryValue(core),
  };
}

test('stage receipt creation requires the actual production contract and validation policy together', () => {
  const bundle = createRuntimeBundle();
  const input = stageReceiptInput(bundle);
  assert.throws(
    () => receiptApi.createStageReceipt(input),
    (error) => ['gate_receipt_inputs_required', 'canonical_artifact_validation_required']
      .includes(error?.code),
  );
  assert.throws(
    () => receiptApi.createStageReceipt({
      ...input,
      productionContract: bundle.sealed,
    }),
    (error) => error?.code === 'gate_receipt_inputs_required',
  );
  assert.doesNotThrow(() => receiptApi.createStageReceipt({
    ...input,
    productionContract: bundle.sealed,
    validationPolicy: bundle.validationPolicy,
  }));
});

test('stage receipt validation and inspection cannot authorize resume without actual evidence', () => {
  const bundle = createRuntimeBundle();
  const receipt = receiptApi.createStageReceipt({
    ...stageReceiptInput(bundle),
    productionContract: bundle.sealed,
    validationPolicy: bundle.validationPolicy,
  });
  assert.throws(
    () => receiptApi.validateStageReceipt(receipt),
    (error) => ['gate_receipt_inputs_required', 'canonical_artifact_validation_required']
      .includes(error?.code),
  );
  const missingEvidence = receiptApi.inspectStageReceipt(receipt);
  assert.equal(missingEvidence.resume_eligible, false);
  assert.ok(
    ['gate_receipt_inputs_required', 'canonical_artifact_validation_required']
      .includes(missingEvidence.code),
  );
  const withEvidence = receiptApi.inspectStageReceipt(receipt, {
    productionContract: bundle.sealed,
    validationPolicy: bundle.validationPolicy,
  });
  assert.equal(withEvidence.resume_eligible, true);
});

test('stage receipts reject a self-hashed fake compact gate receipt', () => {
  const bundle = createRuntimeBundle();
  const fakeCore = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    gate: 'policy-gate',
    status: 'passed',
    production_contract_sha256: bundle.sealed.production_contract_sha256,
  };
  const fake = {
    ...fakeCore,
    receipt_sha256: receiptApi.fingerprintReceiptValue(fakeCore),
  };
  assert.throws(
    () => receiptApi.createStageReceipt({
      ...stageReceiptInput(bundle, [fake]),
      productionContract: bundle.sealed,
      validationPolicy: bundle.validationPolicy,
    }),
    (error) => [
      'gate_receipt_invalid',
      'gate_receipt_shape_invalid',
      'gate_receipt_binding_invalid',
    ].includes(error?.code),
  );
});

test('render preflight rejects gaps instead of treating arbitrary dynamic block IDs as continuous', async () => {
  const bundle = createRuntimeBundle();
  const blocks = [
    createBoundBlock('B001', bundle),
    createBoundBlock('B003', bundle),
  ];
  const evidence = createIntegrationEvidence(bundle, blocks);
  await assert.rejects(
    () => receiptApi.assertFinalRenderPreflight(
      renderPreflightInput(bundle, blocks, evidence),
    ),
    (error) => error?.code === 'render_block_sequence_invalid',
  );
});

test('render preflight recomputes the canonical ordered block receipt set hash', async () => {
  const bundle = createRuntimeBundle();
  const blocks = [
    createBoundBlock('B001', bundle),
    createBoundBlock('B002', bundle),
  ];
  const evidence = createIntegrationEvidence(bundle, blocks, {
    orderedBlockReceiptSetSha256: H('9'),
  });
  await assert.rejects(
    () => receiptApi.assertFinalRenderPreflight(
      renderPreflightInput(bundle, blocks, evidence),
    ),
    (error) => error?.code === 'render_ordered_block_receipt_set_mismatch',
  );
});

test('render preflight requires an exact, self-hashed integration manifest', async () => {
  const bundle = createRuntimeBundle();
  const blocks = [
    createBoundBlock('B001', bundle),
    createBoundBlock('B002', bundle),
  ];
  const evidence = createIntegrationEvidence(bundle, blocks);
  const withUnexpectedField = {
    ...evidence.integrationManifest,
    caller_claim: 'passed',
  };
  await assert.rejects(
    () => receiptApi.assertFinalRenderPreflight({
      ...renderPreflightInput(bundle, blocks, evidence),
      integration_manifest: withUnexpectedField,
    }),
    (error) => [
      'render_integration_manifest_invalid',
      'render_integration_manifest_hash_mismatch',
    ].includes(error?.code),
  );
  const fakeHash = {
    ...evidence.integrationManifest,
    integration_manifest_sha256: H('9'),
  };
  const rebound = createIntegrationEvidence(bundle, blocks);
  rebound.integrationReceipt = createReceipt({
    gate: 'integration-delivery-gate',
    phase: 'integration',
    scopeId: 'integration',
    contract: bundle.sealed,
    validationPolicy: bundle.validationPolicy,
    bindingOverrides: {
      ...rebound.integrationReceipt.input_bindings,
      integration_manifest_sha256: fakeHash.integration_manifest_sha256,
    },
  });
  await assert.rejects(
    () => receiptApi.assertFinalRenderPreflight({
      ...renderPreflightInput(bundle, blocks, rebound),
      integration_manifest: fakeHash,
    }),
    (error) => error?.code === 'render_integration_manifest_hash_mismatch',
  );
});

test('render preflight requires an exact self-hashed per-block before=after no-rewrite proof', async () => {
  const bundle = createRuntimeBundle();
  const blocks = [
    createBoundBlock('B001', bundle),
    createBoundBlock('B002', bundle),
  ];
  const evidence = createIntegrationEvidence(bundle, blocks);
  const rewritten = structuredClone(evidence.noRewriteProof);
  rewritten.blocks[0].after_source_sha256 = H('9');
  await assert.rejects(
    () => receiptApi.assertFinalRenderPreflight({
      ...renderPreflightInput(bundle, blocks, evidence),
      no_rewrite_proof: rewritten,
    }),
    (error) => [
      'render_no_rewrite_proof_invalid',
      'render_no_rewrite_proof_hash_mismatch',
      'render_no_rewrite_detected',
    ].includes(error?.code),
  );
  const unexpected = {
    ...evidence.noRewriteProof,
    caller_claim: 'passed',
  };
  await assert.rejects(
    () => receiptApi.assertFinalRenderPreflight({
      ...renderPreflightInput(bundle, blocks, evidence),
      no_rewrite_proof: unexpected,
    }),
    (error) => [
      'render_no_rewrite_proof_invalid',
      'render_no_rewrite_proof_hash_mismatch',
    ].includes(error?.code),
  );
});

test('artifact-run validate and inspect require actual contract and policy evidence', async () => {
  const { bundle, run } = createArtifactRunFixture();
  await assert.rejects(
    () => artifactRunApi.validateArtifactRun(run),
    (error) => [
      'artifact_run_gate_inputs_required',
      'canonical_artifact_validation_required',
    ].includes(error?.code),
  );
  const missingEvidence = await artifactRunApi.inspectArtifactRun(run);
  assert.equal(missingEvidence.resume_eligible, false);
  assert.equal(missingEvidence.render_eligible, false);
  const withEvidence = await artifactRunApi.inspectArtifactRun(run, {
    productionContract: bundle.sealed,
    validationPolicy: bundle.validationPolicy,
  });
  assert.equal(withEvidence.resume_eligible, true);
  assert.equal(withEvidence.render_eligible, true);
});

test('artifact-run binds each aggregate manifest hash to all three block gate receipts', async () => {
  const { bundle, run } = createArtifactRunFixture();
  const changed = structuredClone(run);
  changed.blocks[0].artifact_manifest_sha256 = H('9');
  const resigned = resignArtifactRun(changed);
  await assert.rejects(
    () => artifactRunApi.validateArtifactRun(resigned, {
      productionContract: bundle.sealed,
      validationPolicy: bundle.validationPolicy,
    }),
    (error) => error?.code === 'artifact_run_block_manifest_unbound',
  );
});

test('artifact-run rejects a missing middle block even when integration repeats the same gap', async () => {
  const { bundle, run } = createArtifactRunFixture({
    blockIds: ['B001', 'B003'],
  });
  await assert.rejects(
    () => artifactRunApi.validateArtifactRun(run, {
      productionContract: bundle.sealed,
      validationPolicy: bundle.validationPolicy,
    }),
    (error) => error?.code === 'artifact_run_block_sequence_invalid',
  );
});

test('orchestrator executes and returns a delivery-phase Gate 5 receipt', async () => {
  const fixture = orchestrationFixture();
  const result = await orchestratorApi.orchestrateScriptOnlyV3(fixture.options);
  assert.equal(fixture.deliveryCalls(), 1);
  assert.equal(result.delivery_receipt.gate, 'integration-delivery-gate');
  assert.equal(result.delivery_receipt.phase, 'delivery');
  assert.equal(
    result.gate_receipts['integration-delivery-gate'],
    result.delivery_receipt.receipt_sha256,
  );
  assert.notEqual(
    result.gate_receipts['integration-delivery-gate'],
    fixture.evidence.integrationReceipt.receipt_sha256,
  );
});

for (const [label, technicalExtra] of [
  ['unknown shape', { caller_claim: 'passed' }],
  ['inline source', { html_source: '<main>private source</main>' }],
  ['inline image', { image_data: 'data:image/png;base64,AAAA' }],
  ['long log', { stderr_log: 'stderr:\\n    at render (private.js:1:1)' }],
  ['visual verdict', { visual_verdict: 'beautiful premium result' }],
  ['gold verdict', { gold_verdict: 'passed calibration' }],
  ['oversized payload', { bounded_note: 'x'.repeat(70 * 1024) }],
]) {
  test(`orchestrator technical verify rejects ${label} payloads`, async () => {
    const fixture = orchestrationFixture({ technicalExtra });
    await assert.rejects(
      () => orchestratorApi.orchestrateScriptOnlyV3(fixture.options),
      (error) => [
        'technical_verify_invalid',
        'technical_verify_failed',
        'inline_source_forbidden',
        'inline_image_forbidden',
        'inline_log_forbidden',
        'subjective_quality_field_forbidden',
        'context_budget_exceeded',
      ].includes(error?.code),
    );
  });
}

test('delivery summary creation and validation require actual receipts and technical evidence', () => {
  const fixture = deliverySummaryFixture();
  assert.throws(
    () => deliveryApi.createDeliverySummary(fixture.input),
    (error) => [
      'delivery_evidence_required',
      'canonical_artifact_validation_required',
    ].includes(error?.code),
  );
  const summary = deliveryApi.createDeliverySummary(
    fixture.input,
    fixture.actualEvidence,
    fixture.actualRenderEvidence,
  );
  assert.throws(
    () => deliveryApi.validateDeliverySummary(summary),
    (error) => [
      'delivery_evidence_required',
      'canonical_artifact_validation_required',
    ].includes(error?.code),
  );
  assert.doesNotThrow(
    () => deliveryApi.validateDeliverySummary(
      summary,
      fixture.actualEvidence,
      fixture.actualRenderEvidence,
    ),
  );
});

test('delivery summary rejects shape-valid fake hashes, positive claims and private relative locators', () => {
  const fixture = deliverySummaryFixture();
  const fakeInput = structuredClone(fixture.input);
  fakeInput.gate_receipts['policy-gate'] = H('9');
  fakeInput.technical_verify.receipt_sha256 = H('8');
  assert.throws(
    () => deliveryApi.createDeliverySummary(
      fakeInput,
      fixture.actualEvidence,
      fixture.actualRenderEvidence,
    ),
    (error) => [
      'delivery_gate_receipt_evidence_mismatch',
      'delivery_technical_evidence_mismatch',
    ].includes(error?.code),
  );

  const summary = deliveryApi.createDeliverySummary(
    fixture.input,
    fixture.actualEvidence,
    fixture.actualRenderEvidence,
  );
  const positiveClaim = resignDeliverySummary({
    ...summary,
    limitations: ['windows-supported'],
  });
  assert.throws(
    () => deliveryApi.validateDeliverySummary(
      positiveClaim,
      fixture.actualEvidence,
      fixture.actualRenderEvidence,
    ),
    (error) => error?.code === 'delivery_limitations_invalid',
  );
  const relativeLocator = resignDeliverySummary({
    ...summary,
    technical_verify: {
      ...summary.technical_verify,
      evidence_locator: 'private/frame-001.ppm',
    },
  });
  assert.throws(
    () => deliveryApi.validateDeliverySummary(
      relativeLocator,
      fixture.actualEvidence,
      fixture.actualRenderEvidence,
    ),
    (error) => [
      'delivery_technical_verify_invalid',
      'private_path_forbidden',
    ].includes(error?.code),
  );
});

test('delivery exposes exactly the four real unverified limitations', () => {
  assert.deepEqual(
    deliveryApi.REAL_LIMITATION_CODES,
    REQUIRED_REAL_LIMITATIONS,
  );
  const fixture = deliverySummaryFixture();
  const summary = deliveryApi.createDeliverySummary(
    fixture.input,
    fixture.actualEvidence,
    fixture.actualRenderEvidence,
  );
  assert.deepEqual(summary.limitations, REQUIRED_REAL_LIMITATIONS);
});

for (const [label, metrics] of [
  ['relative locator', {
    checked_item_count: 2,
    artifact_locator: 'private/frame-001.ppm',
  }],
  ['string evidence reference', {
    checked_item_count: 2,
    evidence_reference: 'artifacts/source-proof.json',
  }],
]) {
  test(`artifact parent envelopes reject ${label} in bounded metric strings`, () => {
    assert.throws(
      () => artifactManifestApi.createArtifactEnvelope(
        artifactManifest([artifactRecord()], metrics),
      ),
      (error) => error?.code === 'artifact_parent_payload_forbidden',
    );
  });
}

test('core modules import one shared literal negative context policy and cannot hide keys by concatenation', async () => {
  assert.deepEqual(
    contextBudgetApi.SCRIPT_ONLY_CONTEXT_POLICY,
    SHARED_CONTEXT_POLICY,
  );
  const contextBudgetSource = await readFile(
    new URL('validate-context-budget.mjs', import.meta.url),
    'utf8',
  );
  assert.match(contextBudgetSource, /contact_sheet_allowed\s*:\s*false/u);
  for (const name of [
    'stage-receipt.mjs',
    'artifact-manifest.mjs',
    'delivery-report.mjs',
  ]) {
    const source = sources[name];
    assert.match(
      source,
      /SCRIPT_ONLY_CONTEXT_POLICY/u,
      `${name} must import the shared negative policy`,
    );
    assert.doesNotMatch(
      source,
      /\bconst\s+CONTEXT_POLICY\b/u,
      `${name} must not clone a local context policy`,
    );
    assert.doesNotMatch(
      source,
      /\[\s*`contact\$\{|['"]contact['"]\s*\+/u,
      `${name} hides a forbidden policy key with concatenation`,
    );
  }
});

test('artifact-run parent summaries enforce the real limitation closed set and final-summary context guard', async () => {
  assert.match(
    sources['validate-artifact-run.mjs'],
    /REAL_LIMITATION_CODES/u,
    'artifact-run must use the same real limitation closed set as delivery',
  );
  assert.match(
    sources['validate-artifact-run.mjs'],
    /validateContextBudget/u,
    'artifact-run must run the shared context guard before returning a parent summary',
  );
  assert.match(
    sources['validate-artifact-run.mjs'],
    /final-summary/u,
    'artifact-run must validate its returned parent summary at the final-summary boundary',
  );
  for (const limitationCodes of [
    ['reachsurge_gold_passed'],
    ['visual_verdict_passed'],
    ['windows-supported'],
  ]) {
    const { bundle, run } = createArtifactRunFixture();
    const changed = structuredClone(run);
    changed.render.technical_verify.limitation_codes = limitationCodes;
    const resigned = resignArtifactRun(changed);
    await assert.rejects(
      () => artifactRunApi.validateArtifactRun(resigned, {
        productionContract: bundle.sealed,
        validationPolicy: bundle.validationPolicy,
      }),
      (error) => [
        'artifact_run_technical_verify_invalid',
        'subjective_quality_field_forbidden',
      ].includes(error?.code),
    );
  }
});

test('artifact parent metrics reject neutral locator and proof-reference aliases', () => {
  for (const metrics of [
    {
      checked_item_count: 2,
      locator: 'private/frame-001.ppm',
    },
    {
      checked_item_count: 2,
      proof_ref: 'artifacts/source-proof.json',
    },
  ]) {
    assert.throws(
      () => artifactManifestApi.createArtifactEnvelope(
        artifactManifest([artifactRecord()], metrics),
      ),
      (error) => error?.code === 'artifact_parent_payload_forbidden',
    );
  }
});

test('identity-only fake contracts cannot create or resume an empty-gate stage receipt', () => {
  const bundle = createRuntimeBundle();
  const fakeContract = {
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
  };
  const emptyGateInput = stageReceiptInput(bundle, []);
  const legitimate = receiptApi.createStageReceipt({
    ...emptyGateInput,
    productionContract: bundle.sealed,
    validationPolicy: bundle.validationPolicy,
  });
  const inspected = receiptApi.inspectStageReceipt(legitimate, {
    productionContract: fakeContract,
    validationPolicy: bundle.validationPolicy,
  });
  assert.equal(inspected.resume_eligible, false);
  assert.ok([
    'production_contract_invalid',
    'production_contract_shape_invalid',
  ].includes(inspected.code));
  assert.throws(
    () => receiptApi.createStageReceipt({
      ...emptyGateInput,
      productionContract: fakeContract,
      validationPolicy: bundle.validationPolicy,
    }),
    (error) => [
      'production_contract_invalid',
      'production_contract_shape_invalid',
    ].includes(error?.code),
  );
});

test('delivery requires actual render evidence and rejects a self-signed render hash', () => {
  const fixture = deliverySummaryFixture();
  const missingRenderEvidenceFixture = { ...fixture };
  delete missingRenderEvidenceFixture.actualRenderEvidence;
  assert.equal(
    Object.hasOwn(missingRenderEvidenceFixture, 'actualRenderEvidence'),
    false,
  );
  assert.throws(
    () => deliveryApi.createDeliverySummary(
      missingRenderEvidenceFixture.input,
      missingRenderEvidenceFixture.actualEvidence,
    ),
    (error) => error?.code === 'delivery_evidence_required',
  );
  const mismatchedRenderCore = structuredClone(fixture.actualRenderEvidence);
  delete mismatchedRenderCore.render_receipt_sha256;
  mismatchedRenderCore.input_bindings.integration_manifest_sha256 = H('9');
  const mismatchedRenderEvidence = {
    ...mismatchedRenderCore,
    render_receipt_sha256: fingerprintV3Value(mismatchedRenderCore),
  };
  assert.throws(
    () => deliveryApi.createDeliverySummary(
      fixture.input,
      fixture.actualEvidence,
      mismatchedRenderEvidence,
    ),
    (error) => [
      'delivery_gate_receipt_evidence_mismatch',
      'delivery_render_evidence_mismatch',
    ].includes(error?.code),
  );
  assert.doesNotThrow(
    () => deliveryApi.createDeliverySummary(
      fixture.input,
      fixture.actualEvidence,
      fixture.actualRenderEvidence,
    ),
  );
});
