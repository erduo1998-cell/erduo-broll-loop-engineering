import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OrchestrationError,
  inspectOrchestrationInput,
  orchestrateFixture,
  orchestrateScriptOnlyV3,
} from './orchestrate-stages.mjs';
import {
  H,
  REAL_LIMITATION_CODES,
  createDeliveryPhaseReceipt,
  createReceipt,
  createRuntimeBundle,
} from './test-support-script-only-v3-runtime.mjs';

const copy = (value) => structuredClone(value);

function options(blockCount = 2, overrides = {}) {
  const bundle = createRuntimeBundle({ blockCount });
  let renderCalls = 0;
  let verifyCalls = 0;
  const renderResult = {
    master_media_sha256: H('1'),
    render_receipt_sha256: H('2'),
  };
  const technicalResult = {
    status: 'passed',
    receipt_sha256: H('3'),
    checked_media_sha256: H('1'),
    limitation_codes: [...REAL_LIMITATION_CODES],
  };
  const base = {
    run_id: 'run-v3',
    production_contract: bundle.sealed,
    validation_policy: bundle.validationPolicy,
    policy_receipt: bundle.policyReceipt,
    block_receipts: bundle.blockReceipts,
    integration_manifest: bundle.integrationManifest,
    integration_receipt: bundle.integrationReceipt,
    no_rewrite_proof: bundle.noRewriteProof,
    render_master: async (input) => {
      renderCalls += 1;
      assert.equal(
        input.integrated_source_sha256,
        bundle.integrationManifest.integrated_source_sha256,
      );
      return renderResult;
    },
    technical_verify: async (input) => {
      verifyCalls += 1;
      assert.equal(input.master_media_sha256, H('1'));
      return technicalResult;
    },
    run_delivery_gate: async () => createDeliveryPhaseReceipt({
      bundle,
      render: renderResult,
      technical: technicalResult,
    }),
    ...overrides,
  };
  return {
    bundle,
    value: base,
    counts: () => ({ renderCalls, verifyCalls }),
  };
}

test('orchestrates only v3 five-gate inputs and performs one final render', async () => {
  const fixture = options();
  const result = await orchestrateScriptOnlyV3(fixture.value);
  assert.equal(result.status, 'technical-contract-passed');
  assert.equal(result.pipeline_contract_version, 3);
  assert.equal(result.authoring_topology_id, 'script-only-authoring-cluster-v1');
  assert.equal(result.validation_policy_id, 'script-only-production-v1');
  assert.deepEqual(fixture.counts(), { renderCalls: 1, verifyCalls: 1 });
  assert.deepEqual(Object.keys(result.gate_receipts).sort(), [
    'integration-delivery-gate',
    'pixel-signal-gate',
    'policy-gate',
    'runtime-seek-gate',
    'source-conformance-gate',
  ]);
});

test('orchestrator preserves dynamic N blocks without changing their order', async () => {
  for (const count of [1, 3, 6]) {
    const fixture = options(count);
    const result = await orchestrateFixture(fixture.value);
    assert.equal(result.block_count, count);
    assert.equal(result.preflight.block_count, count);
    assert.equal(result.gate_receipts['source-conformance-gate'].length, count);
    assert.deepEqual(fixture.counts(), { renderCalls: 1, verifyCalls: 1 });
  }
});

test('render and technical callbacks are mandatory and run only after preflight', async () => {
  const missingRender = options(2, { render_master: null });
  await assert.rejects(
    () => orchestrateScriptOnlyV3(missingRender.value),
    (error) => error instanceof OrchestrationError
      && error.code === 'orchestration_callback_invalid',
  );
  assert.deepEqual(missingRender.counts(), { renderCalls: 0, verifyCalls: 0 });
  const badBlocks = options();
  badBlocks.value.block_receipts = [];
  await assert.rejects(
    () => orchestrateScriptOnlyV3(badBlocks.value),
    (error) => error.code === 'render_block_receipts_invalid',
  );
  assert.deepEqual(badBlocks.counts(), { renderCalls: 0, verifyCalls: 0 });
});

test('policy gate must be passed, current and bound to the sealed contract', async () => {
  const failed = options();
  failed.value.policy_receipt = createReceipt({
    gate: 'policy-gate',
    phase: 'sealed',
    contract: failed.bundle.sealed,
    validationPolicy: failed.bundle.validationPolicy,
    status: 'failed',
    hardFailureCodes: ['policy_gate_contract_failure'],
  });
  await assert.rejects(
    () => orchestrateScriptOnlyV3(failed.value),
    (error) => error.code === 'policy_gate_failed',
  );
  const stale = options();
  stale.value.policy_receipt.production_contract_sha256 = H('0');
  await assert.rejects(
    () => orchestrateScriptOnlyV3(stale.value),
    (error) => [
      'gate_receipt_contract_unbound',
      'gate_receipt_hash_mismatch',
    ].includes(error.code),
  );
});

test('invalid render output is rejected before technical verification', async () => {
  for (const renderResult of [
    { master_media_sha256: 'bad', render_receipt_sha256: H('2') },
    { master_media_sha256: H('1') },
    { master_media_sha256: H('1'), render_receipt_sha256: H('2'), extra: true },
  ]) {
    const fixture = options(2, { render_master: async () => renderResult });
    await assert.rejects(
      () => orchestrateScriptOnlyV3(fixture.value),
      (error) => error.code === 'render_result_invalid',
    );
    assert.equal(fixture.counts().verifyCalls, 0);
  }
});

test('technical verification must pass and bind the rendered master bytes', async () => {
  for (const technicalResult of [
    {
      status: 'failed',
      receipt_sha256: H('3'),
      checked_media_sha256: H('1'),
      limitation_codes: [],
    },
    {
      status: 'passed',
      receipt_sha256: H('3'),
      checked_media_sha256: H('0'),
      limitation_codes: [],
    },
    {
      status: 'passed',
      receipt_sha256: H('3'),
      checked_media_sha256: H('1'),
      limitation_codes: ['not valid'],
    },
  ]) {
    const fixture = options(2, { technical_verify: async () => technicalResult });
    await assert.rejects(
      () => orchestrateScriptOnlyV3(fixture.value),
      (error) => error.code === 'technical_verify_failed',
    );
  }
});

test('v2 and re-signed superseded authorization inputs can only be inspected', async () => {
  const fixture = options();
  const legacy = {
    ...fixture.bundle.sealed,
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
  };
  const inspected = inspectOrchestrationInput(legacy);
  assert.equal(inspected.resume_eligible, false);
  assert.equal(inspected.render_authorization_eligible, false);
  assert.equal(inspected.code, 'pipeline_upgrade_required');
  await assert.rejects(
    () => orchestrateScriptOnlyV3({
      ...fixture.value,
      production_contract: legacy,
    }),
    (error) => error.code === 'pipeline_upgrade_required',
  );
  const resigned = copy(fixture.bundle.sealed);
  resigned.main_review_refs = [{ status: 'approved' }];
  await assert.rejects(
    () => orchestrateScriptOnlyV3({
      ...fixture.value,
      production_contract: resigned,
    }),
    (error) => error.code === 'legacy_field_forbidden',
  );
});
