import test from 'node:test';
import assert from 'node:assert/strict';
import { assertFinalRenderPreflight, createStageReceipt, StageReceiptError, validateStageReceipt } from './stage-receipt.mjs';
const sha = (letter) => letter.repeat(64);
const isolation = () => ({ host: 'fixture-test', mechanism: 'fixture', dispatch_evidence_sha256: sha('d'), stage_context_sha256: sha('e') });
const envelope = () => ({ schema_version: 1, stage: 'director', package_id: 'run-director', manifest_sha256: sha('a'), upstream_manifest_sha256: sha('b'), artifact_counts: { json: 2 }, metrics: { shot_count: 10, native_primary_count: 3 }, producer_isolation_sha256: sha('e') });
const review = () => ({ gate: 'plan_review', status: 'approved', subject_manifest_sha256: sha('a'), reviewer_role: 'broll-plan-review', reviewer_isolation_sha256: sha('f'), receipt_sha256: sha('9') });
const mainReview = () => ({ gate: 'shot_plan_review', status: 'approved', subject_manifest_sha256: sha('a'), reviewer_role: 'erduo-hyperframes-broll-main-agent', reviewer_isolation_sha256: sha('7'), review_packet_sha256: sha('6'), approval_sha256: sha('5') });
const output = () => ({ manifest_envelope: envelope(), review_refs: [review()], main_review_refs: [mainReview()] });
test('creates <=4KiB schema v2 receipt carrying tamper-bound parent metrics', () => {
  const receipt = createStageReceipt({ stage: 'director', run_id: 'run-test', input_sha256: sha('c'), execution_isolation: isolation(), output: output() });
  assert.ok(Buffer.byteLength(JSON.stringify(receipt)) <= 4096);
  assert.equal(validateStageReceipt(receipt, { expectedManifestSha256: sha('a'), expectedReviewGates: ['plan_review'] }).output.manifest_envelope.metrics.native_primary_count, 3);
});
test('rejects tampering, wrong predecessor, /tmp privacy and oversized envelope', () => {
  const receipt = createStageReceipt({ stage: 'director', run_id: 'run-test', input_sha256: sha('c'), execution_isolation: isolation(), output: output() }); receipt.output.manifest_envelope.metrics.shot_count = 11;
  assert.throws(() => validateStageReceipt(receipt), (error) => error instanceof StageReceiptError && error.code === 'receipt_tampered');
  const clean = createStageReceipt({ stage: 'director', run_id: 'run-test', input_sha256: sha('c'), execution_isolation: isolation(), output: output() });
  assert.throws(() => validateStageReceipt(clean, { expectedUpstream: sha('8') }), (error) => error.code === 'receipt_upstream_mismatch');
  const privateOutput = output(); privateOutput.manifest_envelope.metrics.note = 'read /tmp/private.json';
  assert.throws(() => createStageReceipt({ stage: 'director', run_id: 'run-test', input_sha256: sha('c'), execution_isolation: isolation(), output: privateOutput }), (error) => error.code === 'receipt_privacy_violation');
  const huge = output(); huge.manifest_envelope.package_id = 'x'.repeat(3500);
  assert.throws(() => createStageReceipt({ stage: 'director', run_id: 'run-test', input_sha256: sha('c'), execution_isolation: isolation(), output: huge }), (error) => error.code === 'receipt_envelope_too_large');
});
test('rejects inline Claude execution, producer self-review and review/manifest mismatch', () => {
  const inline = isolation(); inline.host = 'claude-code'; inline.mechanism = 'narrow-packet';
  assert.throws(() => createStageReceipt({ stage: 'director', run_id: 'run-test', input_sha256: sha('c'), execution_isolation: inline, output: output() }), (error) => error.code === 'inline_stage_execution');
  const self = output(); self.review_refs[0].reviewer_isolation_sha256 = sha('e');
  assert.throws(() => createStageReceipt({ stage: 'director', run_id: 'run-test', input_sha256: sha('c'), execution_isolation: isolation(), output: self }), (error) => error.code === 'self_attested_review');
  const mismatch = output(); mismatch.review_refs[0].subject_manifest_sha256 = sha('8');
  assert.throws(() => createStageReceipt({ stage: 'director', run_id: 'run-test', input_sha256: sha('c'), execution_isolation: isolation(), output: mismatch }), (error) => error.code === 'review_subject_mismatch');
});
test('allows render deterministic envelope without authoring a visual review', () => {
  const value = output(); value.review_refs = []; value.main_review_refs = []; value.manifest_envelope.stage = 'render';
  const receipt = createStageReceipt({ stage: 'render', run_id: 'run-test', input_sha256: sha('c'), upstream_receipt_sha256: sha('b'), execution_isolation: isolation(), output: value });
  assert.equal(receipt.output.review_refs.length, 0);
});

test('requires source/pixel hard gates, main preview and official HyperFrames authoring before final render', () => {
  const masterEnvelope = () => ({ ...envelope(), stage: 'master-build', package_id: 'run-master-build', metrics: { shot_count: 10, native_primary_count: 0, source_gate_passed: true, pixel_gate_passed: true, official_hyperframes_skill_used: true, official_hyperframes_creation_sha256: sha('4') } });
  const preview = () => ({ ...mainReview(), gate: 'html_preview_review', reviewer_isolation_sha256: sha('8'), review_packet_sha256: sha('4'), approval_sha256: sha('3') });
  const make = (mainReviewRefs = [preview()], manifestEnvelope = masterEnvelope()) => createStageReceipt({ stage: 'master-build', run_id: 'run-test', input_sha256: sha('c'), execution_isolation: isolation(), output: { manifest_envelope: manifestEnvelope, review_refs: [], main_review_refs: mainReviewRefs } });
  const approved = make();
  assert.equal(assertFinalRenderPreflight(approved).subject_manifest_sha256, sha('a'));
  assert.throws(() => assertFinalRenderPreflight(make([])), (error) => error instanceof StageReceiptError && error.code === 'main_agent_review_missing');
  const noOfficial = masterEnvelope(); delete noOfficial.metrics.official_hyperframes_skill_used;
  assert.throws(() => assertFinalRenderPreflight(make([preview()], noOfficial)), (error) => error instanceof StageReceiptError && error.code === 'official_hyperframes_skill_missing');
  const noPixels = masterEnvelope(); delete noPixels.metrics.pixel_gate_passed;
  assert.throws(() => assertFinalRenderPreflight(make([preview()], noPixels)), (error) => error instanceof StageReceiptError && error.code === 'pre_master_hard_gate_missing');
});
