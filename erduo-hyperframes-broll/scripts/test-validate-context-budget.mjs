import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ContextBudgetError,
  validateContextBudget,
} from './validate-context-budget.mjs';

const POLICY = {
  block_receipt_max_bytes: 16384,
  stage_envelope_max_bytes: 32768,
  final_summary_max_bytes: 65536,
  inline_source_allowed: false,
  inline_image_allowed: false,
  inline_log_allowed: false,
  contact_sheet_allowed: false,
  subjective_quality_fields_allowed: false,
};

const expectCode = (value, kind, code) => assert.throws(
  () => validateContextBudget(value, { kind, policy: POLICY }),
  (error) => error instanceof ContextBudgetError && error.code === code,
);

test('accepts bounded hash-only receipts, stage envelopes and final summaries', () => {
  const values = [
    ['block-receipt', {
      gate: 'source-conformance-gate',
      source_sha256: 'a'.repeat(64),
      failure_codes: [],
      metrics: { checked_file_count: 3 },
    }],
    ['stage-envelope', {
      stage: 'assets',
      production_contract_sha256: 'b'.repeat(64),
      receipt_sha256s: ['c'.repeat(64)],
    }],
    ['final-summary', {
      status: 'technical-contract-passed',
      master_sha256: 'd'.repeat(64),
      limitation_codes: ['windows-unverified', 'editor-gui-unverified'],
    }],
  ];
  for (const [kind, value] of values) {
    const result = validateContextBudget(value, { kind, policy: POLICY });
    assert.equal(result.kind, kind);
    assert.ok(result.size_bytes > 0);
  }
});

test('rejects each inline evidence class and subjective quality fields', () => {
  expectCode({ html_source: '<main>private source</main>' }, 'block-receipt', 'inline_source_forbidden');
  expectCode({ frame_image_data: 'data:image/png;base64,AAAA' }, 'block-receipt', 'inline_image_forbidden');
  expectCode({ contact_sheet: ['frame-1.png'] }, 'stage-envelope', 'contact_sheet_forbidden');
  expectCode({ stderr_log: 'long private log' }, 'stage-envelope', 'inline_log_forbidden');
  expectCode({ aesthetic_score: 97 }, 'final-summary', 'subjective_quality_field_forbidden');
  expectCode({ visual_verdict: '高级且漂亮' }, 'final-summary', 'subjective_quality_field_forbidden');
});

test('enforces the three exact byte ceilings', () => {
  expectCode(
    { failure_codes: [], metrics: { bounded_note: 'x'.repeat(17000) } },
    'block-receipt',
    'context_budget_exceeded',
  );
  expectCode(
    { stage: 'assets', bounded_note: 'x'.repeat(33000) },
    'stage-envelope',
    'context_budget_exceeded',
  );
  expectCode(
    { status: 'failed', bounded_note: 'x'.repeat(66000) },
    'final-summary',
    'context_budget_exceeded',
  );
});

test('rejects unknown budget kinds and policies that loosen frozen v3 limits', () => {
  expectCode({}, 'image-packet', 'context_budget_kind_invalid');
  assert.throws(
    () => validateContextBudget({}, {
      kind: 'block-receipt',
      policy: { ...POLICY, block_receipt_max_bytes: 20000 },
    }),
    (error) => error instanceof ContextBudgetError && error.code === 'context_budget_policy_invalid',
  );
  assert.throws(
    () => validateContextBudget({}, {
      kind: 'block-receipt',
      policy: { ...POLICY, inline_image_allowed: true },
    }),
    (error) => error instanceof ContextBudgetError && error.code === 'context_budget_policy_invalid',
  );
});

test('recursively rejects private absolute paths and local file URLs', () => {
  for (const value of [
    { metrics: { artifact_ref: '/Users/alice/private/frame.png' } },
    { nested: [{ repair_ref: '/home/alice/private/source.html' }] },
    { metrics: { artifact_ref: '/private/var/folders/ab/private-frame.png' } },
    { metrics: { artifact_ref: '/var/folders/ab/cd/T/private-frame.png' } },
    { nested: [{ repair_ref: '/tmp/private-source.html' }] },
    { metrics: { artifact_ref: 'C:\\Users\\Alice\\private\\frame.png' } },
    { metrics: { artifact_ref: 'C:/Users/Alice/private/frame.png' } },
    { metrics: { artifact_ref: '\\\\private-server\\share\\frame.png' } },
    { metrics: { artifact_ref: 'file:///Users/alice/private/frame.png' } },
  ]) {
    expectCode(value, 'block-receipt', 'private_path_forbidden');
  }
});

test('rejects remote image and media URLs even under neutral metric keys', () => {
  for (const value of [
    { metrics: { frame_ref: 'https://example.invalid/private-frame.png' } },
    { metrics: { artifact_ref: 'https://example.invalid/private-video.mp4?token=secret' } },
    { metrics: { evidence_ref: 'http://example.invalid/private-audio.wav#sample' } },
  ]) {
    expectCode(value, 'block-receipt', 'inline_media_forbidden');
  }
});

test('rejects gold, calibration, visual-verdict and reference-path conclusion fields', () => {
  for (const value of [
    { metrics: { gold_verdict: 'passed' } },
    { metrics: { calibration_result: 'approved' } },
    { metrics: { visual_conclusion: '高级且漂亮' } },
    { metrics: { reference_path: 'gold fixture selected' } },
    { metrics: { reference_path_decision: 'use private golden sample' } },
  ]) {
    expectCode(value, 'block-receipt', 'subjective_quality_field_forbidden');
  }
});

test('rejects source, image and log evidence disguised as metrics or messages', () => {
  expectCode(
    { metrics: { message: '<script>window.privateState = true;</script>' } },
    'block-receipt',
    'inline_source_forbidden',
  );
  expectCode(
    { message: 'data:image/png;base64,AAAA' },
    'stage-envelope',
    'inline_image_forbidden',
  );
  expectCode(
    { metrics: { message: 'stderr: render failed\n    at renderFrame (private.js:42:7)' } },
    'block-receipt',
    'inline_log_forbidden',
  );
});

test('rejects prompt and private evidence, artifact, reference and calibration payload keys', () => {
  for (const value of [
    { prompt: 'Summarize the technical receipt.' },
    { privateEvidencePayload: 'opaque-looking-value' },
    { 'private artifact payload': 'artifact-001' },
    { metrics: { private_evidence_payload: 'opaque-looking-value' } },
    { nested: [{ private_artifact: 'artifact-001' }] },
    { metrics: { private_reference_payload: 'reference-001' } },
    { metrics: { private_calibration_payload: 'calibration-001' } },
    { metrics: { calibration_payload: 'bounded-value' } },
    { private_evidence_payload_sha256: 'a'.repeat(64) },
  ]) {
    expectCode(value, 'block-receipt', 'private_evidence_forbidden');
  }
});

test('rejects private payload and subjective calibration verdicts hidden in neutral string values', () => {
  for (const value of [
    { metrics: { note: 'Use the private evidence payload from the worker.' } },
    { metrics: { note: 'private_evidence_payload' } },
    { metrics: { note: 'The private artifact contains the frame set.' } },
    { message: 'Prompt: include the worker evidence.' },
  ]) {
    expectCode(value, 'stage-envelope', 'private_evidence_forbidden');
  }
  for (const value of [
    { metrics: { note: 'ReachSurge gold passed.' } },
    { warning_codes: ['reachsurge_gold_passed'] },
    { message: 'The golden reference was approved.' },
    { message: 'Calibration verdict: passed.' },
    { message: '校准结论：已通过金样基线。' },
    { metrics: { note: 'The visual quality verdict is premium and beautiful.' } },
    { nested: [{ note: '主观结论：画面高级且漂亮，已经通过。' }] },
  ]) {
    expectCode(value, 'stage-envelope', 'subjective_quality_field_forbidden');
  }
});

test('allows ordinary opaque IDs, hashes, failure codes and technical counters', () => {
  const value = {
    artifact_id: 'gold-calibration-visual-reference-001',
    master_ref: 'final-master-001',
    source_sha256: 'a'.repeat(64),
    failure_codes: [
      'visual_runtime_failed',
      'reference_path_unavailable',
      'private_evidence_forbidden',
      'prompt_unavailable',
    ],
    warning_codes: ['gold_calibration_fixture_unavailable'],
    metrics: {
      calibration_warning_count: 1,
      visual_failure_count: 2,
      checked_reference_count: 3,
    },
    message: 'Policy gate failed with a bounded technical code.',
  };
  assert.equal(
    validateContextBudget(value, { kind: 'block-receipt', policy: POLICY }).status,
    'passed',
  );
});

test('uses canonical UTF-8 bytes at each exact 16/32/64 KiB boundary', () => {
  const exactPacket = (targetBytes) => {
    const emptyBytes = Buffer.byteLength(JSON.stringify({ bounded_note: '' }), 'utf8');
    const payloadBytes = targetBytes - emptyBytes;
    const value = {
      bounded_note: `${'界'.repeat(Math.floor(payloadBytes / 3))}${'x'.repeat(payloadBytes % 3)}`,
    };
    assert.equal(Buffer.byteLength(JSON.stringify(value), 'utf8'), targetBytes);
    return value;
  };
  for (const [kind, limit] of [
    ['block-receipt', 16384],
    ['stage-envelope', 32768],
    ['final-summary', 65536],
  ]) {
    const exact = exactPacket(limit);
    assert.equal(
      validateContextBudget(exact, { kind, policy: POLICY }).size_bytes,
      limit,
    );
    expectCode(
      { bounded_note: `${exact.bounded_note}x` },
      kind,
      'context_budget_exceeded',
    );
  }
});
