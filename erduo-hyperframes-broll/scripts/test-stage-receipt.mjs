import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createArtifactEnvelope,
  createArtifactManifest,
} from './artifact-manifest.mjs';
import {
  RENDER_PREFLIGHT_REQUIRED_INPUTS,
  STAGE_OUTPUT_FIELDS,
  StageReceiptError,
  assertFinalRenderPreflight,
  createStageReceipt,
  fingerprintReceiptValue,
  inspectStageReceipt,
  validateStageReceipt,
} from './stage-receipt.mjs';
import {
  H,
  createRuntimeBundle,
} from './test-support-script-only-v3-runtime.mjs';

const copy = (value) => structuredClone(value);
const expectCode = (action, codes) => assert.throws(
  action,
  (error) => error instanceof StageReceiptError
    && (Array.isArray(codes) ? codes : [codes]).includes(error.code),
);

function envelope() {
  return createArtifactEnvelope(createArtifactManifest({
    run_id: 'run-v3',
    stage: 'master-build',
    package_id: 'run-v3-master-build',
    upstream_manifest_sha256: H('1'),
    creative_brief_sha256: H('2'),
    producer_isolation_sha256: H('3'),
    artifacts: [{
      artifact_id: 'block-source',
      kind: 'source-bundle',
      sha256: H('4'),
      size_bytes: 128,
      media_type: 'application/octet-stream',
      locator_key: 'block-source.bin',
      required_by: ['source-conformance-gate'],
    }],
    metrics: { checked_item_count: 2 },
  }));
}

function isolation() {
  return {
    host: 'fixture-host',
    mechanism: 'isolated-agent',
    dispatch_evidence_sha256: H('5'),
    stage_context_sha256: H('6'),
  };
}

function stageReceipt(bundle = createRuntimeBundle()) {
  return createStageReceipt({
    stage: 'master-build',
    run_id: 'run-v3',
    input_sha256: H('7'),
    upstream_receipt_sha256: H('8'),
    execution_isolation: isolation(),
    output: {
      envelopes: [envelope()],
      gate_receipts: bundle.blockReceipts[0].gate_receipts,
    },
    productionContract: bundle.sealed,
    validationPolicy: bundle.validationPolicy,
  });
}

function resign(receipt) {
  const core = Object.fromEntries(
    Object.entries(receipt).filter(([key]) => key !== 'receipt_sha256'),
  );
  return { ...core, receipt_sha256: fingerprintReceiptValue(core) };
}

test('creates a bounded v3 stage receipt with exact output fields and identity', () => {
  const bundle = createRuntimeBundle();
  const receipt = stageReceipt(bundle);
  const result = validateStageReceipt(receipt, {
    expectedStage: 'master-build',
    expectedInput: H('7'),
    expectedUpstream: H('8'),
    expectedManifestSha256: receipt.output.envelopes[0].manifest_sha256,
    expectedGateNames: [
      'source-conformance-gate',
      'runtime-seek-gate',
      'pixel-signal-gate',
    ],
    productionContract: bundle.sealed,
    validationPolicy: bundle.validationPolicy,
  });
  assert.equal(result.pipeline_contract_version, 3);
  assert.equal(result.authoring_topology_id, 'script-only-authoring-cluster-v1');
  assert.equal(result.validation_policy_id, 'script-only-production-v1');
  assert.deepEqual(Object.keys(result.output).sort(), [...STAGE_OUTPUT_FIELDS].sort());
  assert.ok(Buffer.byteLength(JSON.stringify(result), 'utf8') < 32768);
});

test('rejects receipt tampering, predecessor mismatch and invalid isolation', () => {
  const bundle = createRuntimeBundle();
  const receipt = stageReceipt(bundle);
  const evidence = {
    productionContract: bundle.sealed,
    validationPolicy: bundle.validationPolicy,
  };
  const tampered = copy(receipt);
  tampered.input_sha256 = H('9');
  expectCode(() => validateStageReceipt(tampered, evidence), 'receipt_hash_mismatch');
  expectCode(
    () => validateStageReceipt(receipt, { ...evidence, expectedUpstream: H('0') }),
    'receipt_upstream_mismatch',
  );
  expectCode(
    () => createStageReceipt({
      ...receipt,
      execution_isolation: { ...isolation(), stage_context_sha256: 'bad' },
      ...evidence,
    }),
    'execution_isolation_invalid',
  );
});

test('v2 receipts are inspection-only and identity-only re-signing is rejected', () => {
  const active = stageReceipt();
  const legacy = {
    ...active,
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
  };
  assert.equal(inspectStageReceipt(legacy).resume_eligible, false);
  assert.equal(inspectStageReceipt(legacy).resign_eligible, false);
  assert.equal(inspectStageReceipt(legacy).code, 'pipeline_upgrade_required');
  expectCode(() => validateStageReceipt(legacy), 'pipeline_upgrade_required');
  const identityOnly = resign({
    ...active,
    main_review_refs: [{ status: 'approved' }],
  });
  expectCode(
    () => validateStageReceipt(identityOnly),
    ['legacy_field_forbidden', 'receipt_invalid'],
  );
});

test('stage output rejects unknown or superseded authorization fields', () => {
  const bundle = createRuntimeBundle();
  for (const output of [
    { envelopes: [], gate_receipts: [], unknown: true },
    { envelopes: [], gate_receipts: [], review_refs: [] },
    { envelopes: [], gate_receipts: [], main_review_refs: [] },
  ]) {
    expectCode(
      () => createStageReceipt({
        stage: 'director',
        run_id: 'run-v3',
        input_sha256: H('1'),
        execution_isolation: isolation(),
        output,
        productionContract: bundle.sealed,
        validationPolicy: bundle.validationPolicy,
      }),
      'invalid_receipt_output',
    );
  }
  assert.equal(bundle.policyReceipt.status, 'passed');
});

test('stage receipts reject inline source, image, logs and oversized gate payloads', () => {
  const bundle = createRuntimeBundle();
  const base = bundle.blockReceipts[0].gate_receipts[0];
  for (const metrics of [
    { image_data: 'data:image/png;base64,AAAA' },
    { html_source: '<main>private</main>' },
    { stderr_log: 'stderr: failed\n    at renderFrame (private.js:1:1)' },
    { bounded_note: 'x'.repeat(17000) },
  ]) {
    const gate = copy(base);
    gate.metrics = metrics;
    expectCode(
      () => createStageReceipt({
        stage: 'master-build',
        run_id: 'run-v3',
        input_sha256: H('1'),
        execution_isolation: isolation(),
        output: { envelopes: [], gate_receipts: [gate] },
        productionContract: bundle.sealed,
        validationPolicy: bundle.validationPolicy,
      }),
      [
        'inline_image_forbidden',
        'inline_source_forbidden',
        'inline_log_forbidden',
        'context_budget_exceeded',
      ],
    );
  }
});

test('render preflight accepts a dynamic N block set and exact six inputs', async () => {
  const bundle = createRuntimeBundle({ blockCount: 3 });
  const result = await assertFinalRenderPreflight({
    block_receipts: bundle.blockReceipts,
    integration_manifest: bundle.integrationManifest,
    integration_receipt: bundle.integrationReceipt,
    no_rewrite_proof: bundle.noRewriteProof,
    production_contract: bundle.sealed,
    validation_policy: bundle.validationPolicy,
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.block_count, 3);
  assert.deepEqual(
    Object.keys({
      block_receipts: true,
      integration_manifest: true,
      integration_receipt: true,
      no_rewrite_proof: true,
      production_contract: true,
      validation_policy: true,
    }).sort(),
    [...RENDER_PREFLIGHT_REQUIRED_INPUTS].sort(),
  );
});

test('render preflight fails closed on every missing or extra input', async () => {
  const bundle = createRuntimeBundle();
  const input = {
    block_receipts: bundle.blockReceipts,
    integration_manifest: bundle.integrationManifest,
    integration_receipt: bundle.integrationReceipt,
    no_rewrite_proof: bundle.noRewriteProof,
    production_contract: bundle.sealed,
    validation_policy: bundle.validationPolicy,
  };
  for (const field of RENDER_PREFLIGHT_REQUIRED_INPUTS) {
    const changed = { ...input };
    delete changed[field];
    await assert.rejects(
      () => assertFinalRenderPreflight(changed),
      (error) => error.code === 'render_preflight_invalid',
    );
  }
  await assert.rejects(
    () => assertFinalRenderPreflight({ ...input, approval: true }),
    (error) => error.code === 'render_preflight_invalid',
  );
});

test('render preflight rejects missing, failed, duplicate and cross-block gate receipts', async () => {
  const bundle = createRuntimeBundle();
  for (const mutate of [
    (blocks) => blocks[0].gate_receipts.pop(),
    (blocks) => { blocks[0].gate_receipts[0].status = 'failed'; },
    (blocks) => { blocks[0].gate_receipts[1] = copy(blocks[0].gate_receipts[0]); },
    (blocks) => { blocks[0].gate_receipts[0].scope_id = 'block-999'; },
  ]) {
    const blocks = copy(bundle.blockReceipts);
    mutate(blocks);
    await assert.rejects(
      () => assertFinalRenderPreflight({
        block_receipts: blocks,
        integration_manifest: bundle.integrationManifest,
        integration_receipt: bundle.integrationReceipt,
        no_rewrite_proof: bundle.noRewriteProof,
        production_contract: bundle.sealed,
        validation_policy: bundle.validationPolicy,
      }),
      (error) => /^(?:render_|gate_)/u.test(error.code),
    );
  }
});

test('render preflight rejects stale integration, rewritten bytes and v2 input', async () => {
  const bundle = createRuntimeBundle();
  const base = {
    block_receipts: bundle.blockReceipts,
    integration_manifest: bundle.integrationManifest,
    integration_receipt: bundle.integrationReceipt,
    no_rewrite_proof: bundle.noRewriteProof,
    production_contract: bundle.sealed,
    validation_policy: bundle.validationPolicy,
  };
  for (const changed of [
    {
      ...base,
      integration_manifest: {
        ...bundle.integrationManifest,
        ordered_block_ids: [...bundle.integrationManifest.ordered_block_ids].reverse(),
      },
    },
    {
      ...base,
      no_rewrite_proof: {
        ...bundle.noRewriteProof,
        integrated_source_sha256: H('0'),
      },
    },
    {
      ...base,
      production_contract: {
        ...bundle.sealed,
        pipeline_contract_version: 2,
        authoring_topology_id: 'bounded-authoring-cluster-v1',
      },
    },
  ]) {
    await assert.rejects(
      () => assertFinalRenderPreflight(changed),
      (error) => [
        'render_integration_manifest_invalid',
        'render_no_rewrite_proof_invalid',
        'pipeline_upgrade_required',
      ].includes(error.code),
    );
  }
});
