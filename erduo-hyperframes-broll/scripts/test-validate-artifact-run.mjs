import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ArtifactRunError,
  fingerprintArtifactRunValue,
  inspectArtifactRun,
  validateArtifactRun,
} from './validate-artifact-run.mjs';
import {
  H,
  REAL_LIMITATION_CODES,
  createRuntimeBundle,
} from './test-support-script-only-v3-runtime.mjs';

const copy = (value) => structuredClone(value);
const expectCode = (value, codes, evidence = {}) => assert.rejects(
  () => validateArtifactRun(value, evidence),
  (error) => error instanceof ArtifactRunError
    && (Array.isArray(codes) ? codes : [codes]).includes(error.code),
);

function createRun(blockCount = 2) {
  const bundle = createRuntimeBundle({ blockCount });
  const core = {
    schema_version: 1,
    pipeline_contract_version: 3,
    authoring_topology_id: 'script-only-authoring-cluster-v1',
    validation_policy_id: 'script-only-production-v1',
    run_id: 'run-v3',
    production_contract_sha256: bundle.sealed.production_contract_sha256,
    policy_gate_receipt: bundle.policyReceipt,
    blocks: bundle.blockReceipts.map((block, index) => ({
      ...block,
      artifact_manifest_sha256:
        block.gate_receipts[0].input_bindings.block_manifest_sha256,
    })),
    integration: {
      ordered_block_ids: bundle.integrationManifest.ordered_block_ids,
      integration_manifest_sha256: bundle.integrationManifest.integration_manifest_sha256,
      no_rewrite_proof_sha256: bundle.noRewriteProof.no_rewrite_proof_sha256,
      integrated_source_sha256: bundle.integrationManifest.integrated_source_sha256,
      gate_receipt: bundle.integrationReceipt,
    },
    render: {
      master_media_sha256: H('7'),
      render_receipt_sha256: H('8'),
      technical_verify: {
        status: 'passed',
        receipt_sha256: H('9'),
        checked_media_sha256: H('7'),
        limitation_codes: [...REAL_LIMITATION_CODES],
      },
    },
  };
  return {
    bundle,
    run: { ...core, artifact_run_sha256: fingerprintArtifactRunValue(core) },
  };
}

const evidenceFor = (bundle) => ({
  productionContract: bundle.sealed,
  validationPolicy: bundle.validationPolicy,
});

function resign(run) {
  const core = Object.fromEntries(
    Object.entries(run).filter(([key]) => key !== 'artifact_run_sha256'),
  );
  return { ...core, artifact_run_sha256: fingerprintArtifactRunValue(core) };
}

test('binds a v3 artifact run to dynamic blocks, five gates, integration and technical verify', async () => {
  const { bundle, run } = createRun();
  const summary = await validateArtifactRun(run, {
    productionContract: bundle.sealed,
    validationPolicy: bundle.validationPolicy,
  });
  assert.equal(summary.status, 'passed');
  assert.equal(summary.block_count, 2);
  assert.deepEqual(summary.blocks, ['B001', 'B002']);
  assert.deepEqual(Object.keys(summary.gate_receipts).sort(), [
    'integration-delivery-gate',
    'pixel-signal-gate',
    'policy-gate',
    'runtime-seek-gate',
    'source-conformance-gate',
  ]);
  assert.equal(summary.technical_verify.checked_media_sha256, H('7'));
});

test('accepts dynamic N rather than a fixed block cardinality', async () => {
  for (const count of [1, 3, 7]) {
    const { bundle, run } = createRun(count);
    const summary = await validateArtifactRun(run, {
      productionContract: bundle.sealed,
      validationPolicy: bundle.validationPolicy,
    });
    assert.equal(summary.block_count, count);
    assert.equal(summary.gate_receipts['source-conformance-gate'].length, count);
    assert.equal(summary.gate_receipts['runtime-seek-gate'].length, count);
    assert.equal(summary.gate_receipts['pixel-signal-gate'].length, count);
  }
});

test('requires the exact five script gate families and valid phase lineages', async () => {
  const { bundle, run } = createRun();
  const wrongPolicy = copy(run);
  wrongPolicy.policy_gate_receipt.gate = 'source-conformance-gate';
  await expectCode(wrongPolicy, 'artifact_run_gate_receipt_invalid', evidenceFor(bundle));
  const wrongPhase = copy(run);
  wrongPhase.blocks[0].gate_receipts[0].phase = 'delivery';
  await expectCode(wrongPhase, 'artifact_run_gate_receipt_invalid', evidenceFor(bundle));
  const wrongIntegration = copy(run);
  wrongIntegration.integration.gate_receipt.gate = 'policy-gate';
  await expectCode(wrongIntegration, 'artifact_run_gate_receipt_invalid', evidenceFor(bundle));
  assert.equal(bundle.policyReceipt.phase, 'sealed');
});

test('rejects every missing, duplicated or failed block gate', async () => {
  for (const mutate of [
    (run) => run.blocks[0].gate_receipts.pop(),
    (run) => { run.blocks[0].gate_receipts[1] = copy(run.blocks[0].gate_receipts[0]); },
    (run) => { run.blocks[0].gate_receipts[2].status = 'failed'; },
  ]) {
    const { bundle, run } = createRun();
    mutate(run);
    await expectCode(run, [
      'artifact_run_block_invalid',
      'artifact_run_block_gate_set_invalid',
      'artifact_run_gate_receipt_invalid',
    ], evidenceFor(bundle));
  }
});

test('rejects duplicate block IDs, cross-block scopes and reordered integration coverage', async () => {
  const duplicateFixture = createRun();
  const duplicate = duplicateFixture.run;
  duplicate.blocks[1].block_id = duplicate.blocks[0].block_id;
  await expectCode(
    duplicate,
    'artifact_run_block_sequence_invalid',
    evidenceFor(duplicateFixture.bundle),
  );
  const crossScopeFixture = createRun();
  const crossScope = crossScopeFixture.run;
  crossScope.blocks[0].gate_receipts[0].scope_id = 'B999';
  await expectCode(
    crossScope,
    'artifact_run_gate_receipt_invalid',
    evidenceFor(crossScopeFixture.bundle),
  );
  const reorderedFixture = createRun();
  const reordered = reorderedFixture.run;
  reordered.integration.ordered_block_ids.reverse();
  await expectCode(
    reordered,
    'artifact_run_integration_invalid',
    evidenceFor(reorderedFixture.bundle),
  );
});

test('integration receipt must bind the current manifest, no-rewrite proof and source bytes', async () => {
  for (const field of [
    'integration_manifest_sha256',
    'no_rewrite_proof_sha256',
    'integrated_source_sha256',
  ]) {
    const { bundle, run } = createRun();
    run.integration[field] = H('f');
    await expectCode(run, 'artifact_run_integration_unbound', evidenceFor(bundle));
  }
});

test('final media requires a passing technical verification bound to the same bytes', async () => {
  for (const mutate of [
    (run) => { run.render.technical_verify.status = 'failed'; },
    (run) => { run.render.technical_verify.checked_media_sha256 = H('0'); },
    (run) => { run.render.technical_verify.receipt_sha256 = 'bad'; },
    (run) => { run.render.technical_verify.limitation_codes = ['bad code']; },
  ]) {
    const { bundle, run } = createRun();
    mutate(run);
    await expectCode(run, 'artifact_run_technical_verify_invalid', evidenceFor(bundle));
  }
});

test('v2 runs are diagnostic-only and identity-only re-signing cannot authorize v3', async () => {
  const { run } = createRun();
  const legacy = {
    ...run,
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
  };
  const inspected = await inspectArtifactRun(legacy);
  assert.equal(inspected.resume_eligible, false);
  assert.equal(inspected.render_eligible, false);
  assert.equal(inspected.resign_eligible, false);
  assert.equal(inspected.code, 'pipeline_upgrade_required');
  await expectCode(legacy, 'pipeline_upgrade_required');
  await expectCode(
    resign({ ...run, main_review_refs: [{ status: 'approved' }] }),
    'legacy_field_forbidden',
  );
});

test('artifact-run hash and closed shape reject tampering or extra authorization data', async () => {
  const tamperedFixture = createRun();
  const tampered = tamperedFixture.run;
  tampered.render.master_media_sha256 = H('0');
  tampered.render.technical_verify.checked_media_sha256 = H('0');
  await expectCode(
    tampered,
    'artifact_run_hash_mismatch',
    evidenceFor(tamperedFixture.bundle),
  );
  const extraFixture = createRun();
  const extra = resign({ ...extraFixture.run, approval: true });
  await expectCode(extra, 'artifact_run_invalid', evidenceFor(extraFixture.bundle));
});
