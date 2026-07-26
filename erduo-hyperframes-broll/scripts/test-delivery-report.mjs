import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DeliveryReportError,
  REAL_LIMITATION_CODES,
  buildDeliveryReport,
  createDeliverySummary,
  fingerprintDeliveryValue,
  inspectDeliverySummary,
  validateDeliverySummary,
} from './delivery-report.mjs';
import {
  H,
  createDeliveryPhaseReceipt,
  createRenderEvidence,
  createRuntimeBundle,
} from './test-support-script-only-v3-runtime.mjs';

const copy = (value) => structuredClone(value);
const expectCode = (action, codes) => assert.throws(
  action,
  (error) => error instanceof DeliveryReportError
    && (Array.isArray(codes) ? codes : [codes]).includes(error.code),
);

function gateHashes(bundle, deliveryReceipt) {
  return {
    'policy-gate': bundle.policyReceipt.receipt_sha256,
    'source-conformance-gate': bundle.blockReceipts.map(
      (block) => block.gate_receipts[0].receipt_sha256,
    ),
    'runtime-seek-gate': bundle.blockReceipts.map(
      (block) => block.gate_receipts[1].receipt_sha256,
    ),
    'pixel-signal-gate': bundle.blockReceipts.map(
      (block) => block.gate_receipts[2].receipt_sha256,
    ),
    'integration-delivery-gate': deliveryReceipt.receipt_sha256,
  };
}

function createSummary(blockCount = 2, overrides = {}) {
  const bundle = createRuntimeBundle({ blockCount });
  const input = {
    status: 'technical-contract-passed',
    run_id: 'run-v3',
    production_contract_sha256: bundle.sealed.production_contract_sha256,
    technical_verify: {
      status: 'passed',
      receipt_sha256: H('1'),
      checked_media_sha256: H('2'),
      limitation_codes: [...REAL_LIMITATION_CODES],
    },
    limitations: [...REAL_LIMITATION_CODES],
    master_media_sha256: H('2'),
    ...overrides,
  };
  const renderEvidence = createRenderEvidence({
    bundle,
    masterMediaSha256: input.master_media_sha256,
  });
  const render = {
    master_media_sha256: renderEvidence.master_media_sha256,
    render_receipt_sha256: renderEvidence.render_receipt_sha256,
  };
  const deliveryReceipt = createDeliveryPhaseReceipt({
    bundle,
    render,
    technical: input.technical_verify,
  });
  input.gate_receipts = gateHashes(bundle, deliveryReceipt);
  const evidence = {
    productionContract: bundle.sealed,
    validationPolicy: bundle.validationPolicy,
    policyReceipt: bundle.policyReceipt,
    blockReceipts: bundle.blockReceipts,
    integrationReceipt: bundle.integrationReceipt,
    deliveryReceipt,
    technicalVerifyEvidence: input.technical_verify,
  };
  const summary = createDeliverySummary(input, evidence, renderEvidence);
  return {
    bundle,
    summary,
    evidence,
    renderEvidence,
  };
}

function resign(summary) {
  const core = Object.fromEntries(
    Object.entries(summary).filter(([key]) => key !== 'final_summary_sha256'),
  );
  return { ...core, final_summary_sha256: fingerprintDeliveryValue(core) };
}

test('builds a hash-bound script-only delivery report with real limitations', async () => {
  const { summary, evidence, renderEvidence } = createSummary();
  const report = await buildDeliveryReport(summary, evidence, renderEvidence);
  assert.equal(report.status, 'technical-contract-passed');
  assert.equal(report.pipeline_contract_version, 3);
  assert.equal(report.authoring_topology_id, 'script-only-authoring-cluster-v1');
  assert.equal(report.validation_policy_id, 'script-only-production-v1');
  assert.deepEqual(report.limitations, REAL_LIMITATION_CODES);
  assert.equal(Object.hasOwn(report, 'source'), false);
  assert.ok(Buffer.byteLength(JSON.stringify(report), 'utf8') < 65536);
});

test('delivery aggregation preserves dynamic N block receipt cardinality', () => {
  for (const count of [1, 3, 8]) {
    const { summary, evidence, renderEvidence } = createSummary(count);
    validateDeliverySummary(summary, evidence, renderEvidence);
    assert.equal(summary.gate_receipts['source-conformance-gate'].length, count);
    assert.equal(summary.gate_receipts['runtime-seek-gate'].length, count);
    assert.equal(summary.gate_receipts['pixel-signal-gate'].length, count);
  }
});

test('delivery requires exactly the five script gate families', () => {
  for (const mutate of [
    (receipts) => delete receipts['policy-gate'],
    (receipts) => { receipts.unknown = H('0'); },
    (receipts) => { receipts['policy-gate'] = [H('0')]; },
    (receipts) => { receipts['source-conformance-gate'] = H('0'); },
  ]) {
    const { summary, evidence, renderEvidence } = createSummary();
    mutate(summary.gate_receipts);
    expectCode(
      () => validateDeliverySummary(resign(summary), evidence, renderEvidence),
      'delivery_gate_receipts_invalid',
    );
  }
});

test('three block gate arrays must have identical non-zero cardinality and unique hashes', () => {
  for (const mutate of [
    (receipts) => receipts['runtime-seek-gate'].pop(),
    (receipts) => { receipts['pixel-signal-gate'] = []; },
    (receipts) => { receipts['source-conformance-gate'][1] = receipts['source-conformance-gate'][0]; },
  ]) {
    const { summary, evidence, renderEvidence } = createSummary();
    mutate(summary.gate_receipts);
    expectCode(
      () => validateDeliverySummary(resign(summary), evidence, renderEvidence),
      'delivery_gate_receipts_invalid',
    );
  }
});

test('technical verify must pass and bind the exact final media bytes', () => {
  for (const mutate of [
    (verify) => { verify.status = 'failed'; },
    (verify) => { verify.checked_media_sha256 = H('0'); },
    (verify) => { verify.receipt_sha256 = 'bad'; },
  ]) {
    const { summary, evidence, renderEvidence } = createSummary();
    mutate(summary.technical_verify);
    expectCode(
      () => validateDeliverySummary(resign(summary), evidence, renderEvidence),
      'delivery_technical_verify_invalid',
    );
  }
});

test('limitations are bounded unique technical codes and not free-form claims', () => {
  for (const limitations of [
    ['contains spaces'],
    ['windows-unverified', 'windows-unverified'],
    Array.from({ length: 33 }, (_, index) => `limit-${index}`),
  ]) {
    const { summary, evidence, renderEvidence } = createSummary();
    summary.limitations = limitations;
    expectCode(
      () => validateDeliverySummary(resign(summary), evidence, renderEvidence),
      'delivery_limitations_invalid',
    );
  }
});

test('final summary enforces hash integrity, closed shape and the 64KiB context budget', () => {
  const tamperedFixture = createSummary();
  const tampered = tamperedFixture.summary;
  tampered.master_media_sha256 = H('0');
  tampered.technical_verify.checked_media_sha256 = H('0');
  expectCode(
    () => validateDeliverySummary(
      tampered,
      tamperedFixture.evidence,
      tamperedFixture.renderEvidence,
    ),
    'delivery_summary_hash_mismatch',
  );
  const extraFixture = createSummary();
  const extra = resign({ ...extraFixture.summary, approval: true });
  expectCode(
    () => validateDeliverySummary(
      extra,
      extraFixture.evidence,
      extraFixture.renderEvidence,
    ),
    'delivery_summary_invalid',
  );
  expectCode(
    () => createSummary(2, {
      technical_verify: {
        status: 'passed',
        receipt_sha256: H('1'),
        checked_media_sha256: H('2'),
        bounded_note: 'x'.repeat(66000),
      },
    }),
    ['delivery_technical_verify_invalid', 'context_budget_exceeded'],
  );
});

test('v2 delivery data is inspect-only and identity-only re-signing is rejected', () => {
  const { summary, evidence, renderEvidence } = createSummary();
  const legacy = {
    ...summary,
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
  };
  const inspected = inspectDeliverySummary(legacy);
  assert.equal(inspected.delivery_eligible, false);
  assert.equal(inspected.resume_eligible, false);
  assert.equal(inspected.resign_eligible, false);
  assert.equal(inspected.code, 'pipeline_upgrade_required');
  expectCode(
    () => validateDeliverySummary(legacy, evidence, renderEvidence),
    'pipeline_upgrade_required',
  );
  expectCode(
    () => validateDeliverySummary(resign({
      ...summary,
      main_review_refs: [{ status: 'approved' }],
    }), evidence, renderEvidence),
    'legacy_field_forbidden',
  );
});
