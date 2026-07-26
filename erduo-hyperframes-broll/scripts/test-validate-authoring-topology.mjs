import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  assertSourceReviewBeforeRender,
  createAuthoringChunkManifest,
  createAuthoringIntegrationManifest,
  createAuthoringPlan,
  createSourceCodeReview,
  validateAuthoringChunkManifest,
  validateAuthoringIntegrationManifest,
  validateAuthoringPlan,
  validateSourceCodeReview,
} from './validate-authoring-topology.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const sha = (label) => digest(Buffer.from(label));
const GATES = ['source', 'font', 'asset', 'hyperframes', 'seek', 'profile', 'pixel'];
const sevenGates = (status = 'passed') => Object.fromEntries(
  GATES.map((gate) => [gate, { status, receipt_sha256: sha(`gate:${gate}`) }]),
);

function shots(shotCount = 6, durationMs = 1000) {
  return Array.from({ length: shotCount }, (_, index) => ({
    shot_id: `S${String(index + 1).padStart(3, '0')}`,
    srt_window_ms: {
      start_ms: index * durationMs,
      end_ms: (index + 1) * durationMs,
    },
  }));
}

function planFixture(options = {}) {
  const shotValues = options.shotValues ?? shots();
  const maxShots = Object.hasOwn(options, 'maxShots') ? options.maxShots : 2;
  const maxDurationMs = Object.hasOwn(options, 'maxDurationMs') ? options.maxDurationMs : 45_000;
  return createAuthoringPlan({
    global_rules_sha256: sha('global-rules'),
    parsed_srt_sha256: sha('parsed-srt'),
    plan_sha256: sha('shot-plan'),
    projection_sha256: sha('projection'),
    design_slice_sha256: sha('design-slice'),
    kit_set_sha256: sha('kit-set'),
    fps: { numerator: 25, denominator: 1 },
    shots: shotValues,
    ...(maxShots === undefined ? {} : { max_shots_per_chunk: maxShots }),
    ...(maxDurationMs === undefined ? {} : { max_chunk_duration_ms: maxDurationMs }),
    // Runtime capacity is deliberately not part of the deterministic plan.
    available_agent_slots: options.availableAgentSlots,
  });
}

function chunkSourceBytes(chunkId) {
  const html = Buffer.from(`<section data-authoring-chunk="${chunkId}"></section>`);
  const js = Buffer.from(`export const chunkId="${chunkId}";`);
  return new Map([
    ['scene.html', {
      artifact_id: `${chunkId}-html`,
      relative_path: 'scene.html',
      media_type: 'text/html',
      bytes: html,
    }],
    ['scene.js', {
      artifact_id: `${chunkId}-js`,
      relative_path: 'scene.js',
      media_type: 'application/javascript',
      bytes: js,
    }],
  ]);
}

function chunkFixture(plan, index, overrides = {}) {
  const chunkId = plan.chunks[index].chunk_id;
  const sourceBytes = overrides.sourceBytes ?? chunkSourceBytes(chunkId);
  const manifest = createAuthoringChunkManifest({
    plan,
    chunk_id: chunkId,
    attempt: overrides.attempt ?? 1,
    producer_isolation_sha256: overrides.producer_isolation_sha256 ?? sha(`producer:${chunkId}`),
    sourceBytes,
    gates: overrides.gates ?? sevenGates(),
  });
  return { manifest, sourceBytes: manifest.source_bytes };
}

function integrationFixture(plan, chunks, overrides = {}) {
  const chunkSourceBytesById = new Map(
    chunks.map((item) => [item.manifest.chunk_id, item.sourceBytes]),
  );
  const manifest = createAuthoringIntegrationManifest({
    plan,
    chunks: chunks.map((item) => item.manifest),
    chunkSourceBytes: chunkSourceBytesById,
    integrator_isolation_sha256: overrides.integratorIsolation ?? sha('integrator'),
    style_integration_authorization_sha256:
      overrides.styleAuthorization
      ?? sha('style-integration-authorization'),
    style_source_ledger_sha256:
      overrides.styleSourceLedger
      ?? sha('style-source-ledger'),
    style_validator_receipt_sha256:
      overrides.styleValidatorReceipt
      ?? sha('style-validator-receipt'),
    ...(overrides.supplementalEvidence
      ? { source_review_supplemental: overrides.supplementalEvidence } : {}),
    ...(overrides.sourcePageMaxBytes
      ? { source_review_page_max_bytes: overrides.sourcePageMaxBytes } : {}),
    ...(overrides.pageTableMaxEntries
      ? { source_review_page_table_max_entries: overrides.pageTableMaxEntries } : {}),
  });
  return {
    manifest,
    chunkSourceBytes: chunkSourceBytesById,
    integratedSourceBytes: manifest.source_bytes,
  };
}

const sourceChecks = () => ({
  positions: true,
  z_order: true,
  shot_order: true,
  timing: true,
  lifecycle: true,
  selectors: true,
  cross_chunk_seams: true,
  errors: true,
});

function reviewFixture(integration, overrides = {}) {
  return createSourceCodeReview({
    integrationManifest: integration.manifest,
    reviewer_isolation_sha256: overrides.reviewerIsolation ?? sha('source-reviewer'),
    reviewer_model_id: 'qualified-main-source-review-v1',
    checks: overrides.checks ?? sourceChecks(),
    still_evidence: overrides.stillEvidence ?? {
      uses: ['font', 'crop', 'material-visibility'],
      animation_approval: false,
    },
  });
}

const expectCode = (action, code) => assert.throws(action, (error) => error?.code === code);
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonical);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
};
const fingerprint = (value) => digest(Buffer.from(JSON.stringify(canonical(value))));

test('accepts complete two- and three-chunk authoring, seven-gate validation, byte-preserving integration and pre-render source review', () => {
  for (const shotCount of [4, 6]) {
    const plan = planFixture({ shotValues: shots(shotCount) });
    const planReceipt = validateAuthoringPlan(plan);
    assert.equal(planReceipt.chunk_count, shotCount / 2);
    const chunks = plan.chunks.map((_, index) => chunkFixture(plan, index));
    for (const chunk of chunks) {
      const receipt = validateAuthoringChunkManifest(chunk.manifest, {
        plan,
        sourceBytes: chunk.sourceBytes,
      });
      assert.equal(receipt.status, 'passed');
      assert.equal(Object.keys(chunk.manifest.validation_gates).length, 7);
    }
    const integration = integrationFixture(plan, chunks);
    const integrationReceipt = validateAuthoringIntegrationManifest(integration.manifest, {
      plan,
      chunks: chunks.map((item) => item.manifest),
      chunkSourceBytes: integration.chunkSourceBytes,
      sourceBytes: integration.integratedSourceBytes,
    });
    assert.equal(integrationReceipt.status, 'passed');
    assert.equal(integrationReceipt.chunk_count, chunks.length);
    const review = reviewFixture(integration);
    assert.equal(validateSourceCodeReview(review).status, 'approved');
    const preflight = assertSourceReviewBeforeRender(integration.manifest, review);
    assert.equal(preflight.pre_render, true);
    assert.equal(preflight.integration_manifest_sha256, integration.manifest.manifest_sha256);
  }
});

test('rejects block overlap, gap, order changes and projection drift', () => {
  const overlapShots = shots();
  overlapShots[2].srt_window_ms.start_ms -= 1;
  expectCode(() => planFixture({ shotValues: overlapShots }), 'authoring_shot_coverage_invalid');

  const gapShots = shots();
  gapShots[2].srt_window_ms.start_ms += 1;
  expectCode(() => planFixture({ shotValues: gapShots }), 'authoring_shot_coverage_invalid');

  const outOfOrderShots = shots();
  [outOfOrderShots[1], outOfOrderShots[2]] = [outOfOrderShots[2], outOfOrderShots[1]];
  expectCode(() => planFixture({ shotValues: outOfOrderShots }), 'authoring_shot_invalid');

  for (const mutate of [
    (value) => { value.chunks[1].start_ms -= 1; },
    (value) => { value.chunks[1].start_ms += 1; },
    (value) => { [value.chunks[0], value.chunks[1]] = [value.chunks[1], value.chunks[0]]; },
    (value) => { value.projection_sha256 = sha('foreign-projection'); },
  ]) {
    const plan = planFixture();
    mutate(plan);
    expectCode(() => validateAuthoringPlan(plan), 'authoring_plan_tampered');
  }
});

test('rejects a chunk missing any of seven gates, any failed gate, attempt >2, and replaced bytes/hash', () => {
  const plan = planFixture();
  for (const gate of GATES) {
    const gateSet = sevenGates();
    delete gateSet[gate];
    expectCode(() => chunkFixture(plan, 0, { gates: gateSet }), 'authoring_chunk_gate_invalid');
  }
  const failed = sevenGates();
  failed.seek.status = 'failed';
  expectCode(() => chunkFixture(plan, 0, { gates: failed }), 'authoring_chunk_gate_failed');
  expectCode(() => chunkFixture(plan, 0, { attempt: 3 }), 'authoring_chunk_attempt_invalid');

  const valid = chunkFixture(plan, 0);
  const replacedBytes = new Map(valid.sourceBytes);
  replacedBytes.set('C001-js', Buffer.from('export const replaced=true;'));
  expectCode(() => validateAuthoringChunkManifest(valid.manifest, {
    plan,
    sourceBytes: replacedBytes,
  }), 'source_bytes_mismatch');

  const replacedHash = structuredClone(valid.manifest);
  replacedHash.source_files[0].sha256 = sha('replacement');
  expectCode(() => validateAuthoringChunkManifest(replacedHash, {
    plan,
    sourceBytes: valid.sourceBytes,
  }), 'authoring_chunk_source_unbound');
});

test('rejects integrator chunk disorder/omission, rewritten chunk source, nondeterministic extras and reused isolation', () => {
  const plan = planFixture();
  const chunks = plan.chunks.map((_, index) => chunkFixture(plan, index));

  expectCode(() => createAuthoringIntegrationManifest({
    plan,
    chunks: chunks.map((item) => item.manifest),
    chunkSourceBytes: new Map(
      chunks.map((item) => [item.manifest.chunk_id, item.sourceBytes]),
    ),
    integrator_isolation_sha256: sha('integrator'),
  }), 'style_integration_authorization_required');

  expectCode(() => createAuthoringIntegrationManifest({
    plan,
    chunks: chunks.slice(1).map((item) => item.manifest),
    chunkSourceBytes: new Map(chunks.slice(1).map((item) => [item.manifest.chunk_id, item.sourceBytes])),
    integrator_isolation_sha256: sha('integrator'),
    style_integration_authorization_sha256: sha('style-integration-authorization'),
    style_source_ledger_sha256: sha('style-source-ledger'),
    style_validator_receipt_sha256: sha('style-validator-receipt'),
  }), 'authoring_chunk_set_incomplete');

  expectCode(() => createAuthoringIntegrationManifest({
    plan,
    chunks: chunks.map((item) => item.manifest),
    chunkSourceBytes: new Map(chunks.map((item) => [item.manifest.chunk_id, item.sourceBytes])),
    integrator_isolation_sha256: chunks[0].manifest.producer_isolation_sha256,
    style_integration_authorization_sha256: sha('style-integration-authorization'),
    style_source_ledger_sha256: sha('style-source-ledger'),
    style_validator_receipt_sha256: sha('style-validator-receipt'),
  }), 'integrator_not_isolated');

  const duplicateIsolationChunks = [
    chunks[0],
    chunkFixture(plan, 1, { producer_isolation_sha256: chunks[0].manifest.producer_isolation_sha256 }),
    chunks[2],
  ];
  expectCode(() => createAuthoringIntegrationManifest({
    plan,
    chunks: duplicateIsolationChunks.map((item) => item.manifest),
    chunkSourceBytes: new Map(duplicateIsolationChunks.map((item) => [item.manifest.chunk_id, item.sourceBytes])),
    integrator_isolation_sha256: sha('integrator'),
    style_integration_authorization_sha256: sha('style-integration-authorization'),
    style_source_ledger_sha256: sha('style-source-ledger'),
    style_validator_receipt_sha256: sha('style-validator-receipt'),
  }), 'authoring_chunk_isolation_reused');

  const integration = integrationFixture(plan, chunks);
  expectCode(() => validateAuthoringIntegrationManifest(
    integration.manifest,
    {
      plan,
      chunks: chunks.map((item) => item.manifest),
      chunkSourceBytes: integration.chunkSourceBytes,
      sourceBytes: integration.integratedSourceBytes,
      style_integration_authorization_sha256: sha('stale-style'),
    },
  ), 'style_integration_authorization_unbound');
  const disordered = structuredClone(integration.manifest);
  [disordered.chunks[0], disordered.chunks[1]] = [disordered.chunks[1], disordered.chunks[0]];
  expectCode(() => validateAuthoringIntegrationManifest(disordered, {
    plan,
    chunks: chunks.map((item) => item.manifest),
    chunkSourceBytes: integration.chunkSourceBytes,
    sourceBytes: integration.integratedSourceBytes,
  }), 'authoring_chunk_set_invalid');

  const rewritten = new Map(integration.integratedSourceBytes);
  const firstIntegrated = integration.manifest.source_files[0].artifact_id;
  rewritten.set(firstIntegrated, Buffer.from('integrator rewrote chunk source'));
  expectCode(() => validateAuthoringIntegrationManifest(integration.manifest, {
    plan,
    chunks: chunks.map((item) => item.manifest),
    chunkSourceBytes: integration.chunkSourceBytes,
    sourceBytes: rewritten,
  }), 'source_bytes_mismatch');

  const extra = structuredClone(integration.manifest);
  extra.generated_files.push({
    artifact_id: 'nondeterministic-extra',
    relative_path: 'integration/runtime-random.js',
    sha256: sha('random'),
    size_bytes: 1,
    media_type: 'application/javascript',
  });
  expectCode(() => validateAuthoringIntegrationManifest(extra, {
    plan,
    chunks: chunks.map((item) => item.manifest),
    chunkSourceBytes: integration.chunkSourceBytes,
    sourceBytes: integration.integratedSourceBytes,
  }), 'integrator_wrapper_invalid');
});

test('rejects source review after render, incomplete source inspection, missing checks and still-frame animation approval', () => {
  const plan = planFixture({ shotValues: shots(4) });
  const chunks = plan.chunks.map((_, index) => chunkFixture(plan, index));
  const integration = integrationFixture(plan, chunks);

  const late = reviewFixture(integration);
  late.phase = 'post-render';
  expectCode(() => assertSourceReviewBeforeRender(integration.manifest, late), 'source_code_review_invalid');

  const incomplete = reviewFixture(integration);
  incomplete.inspected_source_page_sha256s =
    incomplete.inspected_source_page_sha256s.slice(1);
  expectCode(() => validateSourceCodeReview(incomplete), 'source_code_review_unbound');

  const checks = sourceChecks();
  delete checks.lifecycle;
  expectCode(() => reviewFixture(integration, { checks }), 'source_code_review_checks_invalid');

  expectCode(() => reviewFixture(integration, {
    stillEvidence: {
      uses: ['font', 'crop', 'material-visibility'],
      animation_approval: true,
    },
  }), 'still_evidence_scope_invalid');
});

test('freezes and validates bounded multi-page source/facts/supplemental evidence through a chained page-table root', () => {
  const plan = planFixture({ shotValues: shots(4) });
  const chunks = plan.chunks.map((_, index) => chunkFixture(plan, index, {
    sourceBytes: new Map([
      ['scene.html', {
        artifact_id: `${plan.chunks[index].chunk_id}-html`,
        relative_path: 'scene.html',
        media_type: 'text/html',
        bytes: Buffer.from(Array.from(
          { length: 12 },
          (unused, line) => `<p data-line="${line}">${'x'.repeat(24)}</p>\n`,
        ).join('')),
      }],
      ['scene.js', {
        artifact_id: `${plan.chunks[index].chunk_id}-js`,
        relative_path: 'scene.js',
        media_type: 'application/javascript',
        bytes: Buffer.from(Array.from(
          { length: 12 },
          (unused, line) => `export const value${line}=${line};\n`,
        ).join('')),
      }],
    ]),
  }));
  const integration = integrationFixture(plan, chunks, {
    sourcePageMaxBytes: 96,
    pageTableMaxEntries: 1,
    supplementalEvidence: [{
      bytes: Buffer.from('P6\n1 1\n255\nabc', 'binary'),
      media_type: 'image/x-portable-pixmap',
      uses: ['font', 'crop', 'material-visibility'],
      facts: { font_loaded: true, crop_visible: true, material_visible: true },
    }],
  });
  const review = reviewFixture(integration);
  const packet = integration.manifest.source_review_packet;
  assert.ok(packet.page_tables.length > 2);
  assert.ok(review.inspected_source_page_sha256s.length > 4);
  assert.equal(review.inspected_source_page_sha256s.length,
    review.inspected_facts_page_sha256s.length);
  assert.equal(review.inspected_supplemental_visual_page_sha256s.length, 1);
  assert.equal(review.inspected_supplemental_facts_page_sha256s.length, 1);
  assert.ok(integration.integratedSourceBytes.get(packet.root.artifact_id).length <= 4096);
  for (const ref of packet.page_tables) {
    assert.ok(integration.integratedSourceBytes.get(ref.artifact_id).length <= 1024 * 1024);
  }
  assert.equal(validateSourceCodeReview(review).status, 'approved');
});

test('rejects missing middle page-table, facts/supplemental pages, substituted raw bytes and a re-signed overbroad decision', () => {
  const plan = planFixture({ shotValues: shots(4) });
  const chunks = plan.chunks.map((_, index) => chunkFixture(plan, index));
  const integration = integrationFixture(plan, chunks, {
    pageTableMaxEntries: 1,
    supplementalEvidence: [{
      bytes: Buffer.from('P6\n1 1\n255\nabc', 'binary'),
      media_type: 'image/x-portable-pixmap',
      uses: ['font'],
      facts: { font_loaded: true },
    }],
  });
  const review = reviewFixture(integration);
  const packet = integration.manifest.source_review_packet;

  const missingTable = new Map(integration.integratedSourceBytes);
  missingTable.delete(packet.page_tables[1].artifact_id);
  expectCode(
    () => validateSourceCodeReview(review, { sourceBytes: missingTable }),
    'source_review_packet_unresolved',
  );

  const missingMiddleSource = new Map(integration.integratedSourceBytes);
  const sourceRefs = packet.pages.filter((ref) =>
    ref.artifact_id.startsWith('source-review-source-'));
  missingMiddleSource.delete(sourceRefs[Math.floor(sourceRefs.length / 2)].artifact_id);
  expectCode(
    () => validateSourceCodeReview(review, { sourceBytes: missingMiddleSource }),
    'source_review_packet_unresolved',
  );

  const missingFacts = new Map(integration.integratedSourceBytes);
  const factsRef = packet.pages.find((ref) => ref.artifact_id.startsWith('source-review-facts-'));
  missingFacts.delete(factsRef.artifact_id);
  expectCode(
    () => validateSourceCodeReview(review, { sourceBytes: missingFacts }),
    'source_review_packet_unresolved',
  );

  const missingSupplemental = new Map(integration.integratedSourceBytes);
  const supplementalRef = packet.pages.find((ref) =>
    ref.artifact_id.startsWith('source-review-supplemental-visual-'));
  missingSupplemental.delete(supplementalRef.artifact_id);
  expectCode(
    () => validateSourceCodeReview(review, { sourceBytes: missingSupplemental }),
    'source_review_packet_unresolved',
  );

  const substitutedRaw = new Map(integration.integratedSourceBytes);
  substitutedRaw.set(integration.manifest.source_files[1].artifact_id,
    Buffer.from('export const substituted=true;\n'));
  expectCode(
    () => validateSourceCodeReview(review, { sourceBytes: substitutedRaw }),
    'source_bytes_mismatch',
  );

  const resigned = reviewFixture(integration);
  resigned.source_decision.read_all_source_pages = false;
  const { decision_sha256: ignoredDecision, ...decisionCore } = resigned.source_decision;
  resigned.source_decision.decision_sha256 = fingerprint(decisionCore);
  const { approval_sha256: ignoredApproval, ...reviewCore } = resigned;
  resigned.approval_sha256 = fingerprint(reviewCore);
  expectCode(() => validateSourceCodeReview(resigned), 'source_code_review_invalid');
});

test('Agent capacity changes scheduling only and never changes deterministic chunk boundaries', () => {
  const one = planFixture({ availableAgentSlots: 1 });
  const two = planFixture({ availableAgentSlots: 2 });
  const four = planFixture({ availableAgentSlots: 4 });
  assert.deepEqual(one.chunks, two.chunks);
  assert.deepEqual(two.chunks, four.chunks);
  assert.equal(one.authoring_plan_sha256, four.authoring_plan_sha256);
  assert.equal(Object.hasOwn(one, 'available_agent_slots'), false);
  assert.equal(Object.hasOwn(one, 'max_parallel_agents'), false);
});

test('defaults to at most eight shots and 45 seconds per chunk while allowing an oversize singleton', () => {
  const byCount = planFixture({
    shotValues: shots(10, 5000),
    maxShots: undefined,
    maxDurationMs: undefined,
  });
  assert.deepEqual(byCount.chunks.map((item) => item.shot_count), [8, 2]);
  assert.deepEqual(byCount.chunks.map((item) => item.duration_ms), [40_000, 10_000]);
  assert.equal(byCount.chunk_policy.max_shots, 8);
  assert.equal(byCount.chunk_policy.max_duration_ms, 45_000);

  const byDuration = planFixture({
    shotValues: shots(3, 20_000),
    maxShots: undefined,
    maxDurationMs: undefined,
  });
  assert.deepEqual(byDuration.chunks.map((item) => item.shot_count), [2, 1]);
  assert.deepEqual(byDuration.chunks.map((item) => item.duration_ms), [40_000, 20_000]);

  const oversize = planFixture({
    shotValues: [
      { shot_id: 'S001', srt_window_ms: { start_ms: 0, end_ms: 50_000 } },
      { shot_id: 'S002', srt_window_ms: { start_ms: 50_000, end_ms: 51_000 } },
    ],
    maxShots: undefined,
    maxDurationMs: undefined,
  });
  assert.deepEqual(oversize.chunks.map((item) => item.shot_count), [1, 1]);
  assert.deepEqual(oversize.chunks.map((item) => item.duration_ms), [50_000, 1000]);
  assert.equal(oversize.chunk_policy.oversize_singleton, true);
});
