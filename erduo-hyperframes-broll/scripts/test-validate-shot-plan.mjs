import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { parseSrt } from './parse-srt.mjs';
import {
  ShotPlanError,
  parseShotPlanArgs,
  runShotPlanCli,
  validateAndNormalizeShotPlan,
} from './validate-shot-plan.mjs';

const srt = parseSrt(`1
00:00:00,000 --> 00:00:01,000
Setup

2
00:00:01,000 --> 00:00:02,000
continues

3
00:00:03,000 --> 00:00:04,000
Question

4
00:00:04,000 --> 00:00:05,000
answer

5
00:00:06,000 --> 00:00:08,000
Example

6
00:00:08,000 --> 00:00:10,000
Conclusion`);

function validPlan() {
  return {
    schema_version: 1,
    srt_sha256: srt.content_sha256,
    shots: [
      { shot_id: 'S001', cue_start: 1, cue_end: 2, narrated_claim: 'The setup establishes one claim.', transition_reason: 'opening' },
      { shot_id: 'S002', cue_start: 3, cue_end: 4, narrated_claim: 'A question turns into its answer.', transition_reason: 'question' },
      { shot_id: 'S003', cue_start: 5, cue_end: 6, narrated_claim: 'An example resolves into the conclusion.', transition_reason: 'example' },
    ],
    chapters: [
      { chapter_id: 'C001', shot_start: 'S001', shot_end: 'S002', title: 'Setup and question', purpose: 'Move from premise to the central answer.' },
      { chapter_id: 'C002', shot_start: 'S003', shot_end: 'S003', title: 'Resolution', purpose: 'Use an example to conclude the argument.' },
    ],
  };
}

function capture() {
  let value = '';
  return {
    stream: new Writable({ write(chunk, encoding, callback) { value += chunk.toString(); callback(); } }),
    value: () => value,
  };
}

test('normalizes semantic cue groups into gapless visual windows derived from SRT', () => {
  const result = validateAndNormalizeShotPlan(srt, validPlan());
  assert.equal(result.shot_count, 3);
  assert.deepEqual(result.timeline, { start_ms: 0, end_ms: 10000, duration_ms: 10000 });
  assert.deepEqual(result.shots.map(({ start_ms, end_ms, duration_ms }) => ({ start_ms, end_ms, duration_ms })), [
    { start_ms: 0, end_ms: 3000, duration_ms: 3000 },
    { start_ms: 3000, end_ms: 6000, duration_ms: 3000 },
    { start_ms: 6000, end_ms: 10000, duration_ms: 4000 },
  ]);
  assert.equal(result.shots[0].end_ms, result.shots[1].start_ms);
  assert.equal(result.shots[1].end_ms, result.shots[2].start_ms);
});

test('normalization and plan hash are deterministic', () => {
  assert.deepEqual(validateAndNormalizeShotPlan(srt, validPlan()), validateAndNormalizeShotPlan(srt, validPlan()));
  assert.match(validateAndNormalizeShotPlan(srt, validPlan()).plan_sha256, /^[0-9a-f]{64}$/u);
});

test('rejects model-supplied timestamps, asset choices, and unknown fields', () => {
  for (const [target, field, value] of [
    ['shot', 'start_ms', 0],
    ['shot', 'asset', 'video.mp4'],
    ['chapter', 'template', 'draft'],
  ]) {
    const plan = validPlan();
    if (target === 'shot') plan.shots[0][field] = value;
    else plan.chapters[0][field] = value;
    assert.throws(() => validateAndNormalizeShotPlan(srt, plan), (error) => ['invalid_shot', 'invalid_chapter'].includes(error.code));
  }
});

test('rejects SRT fingerprint mismatch and malformed parsed SRT', () => {
  const plan = validPlan();
  plan.srt_sha256 = 'a'.repeat(64);
  assert.throws(() => validateAndNormalizeShotPlan(srt, plan), (error) => error.code === 'invalid_plan');
  assert.throws(() => validateAndNormalizeShotPlan({ ...srt, cue_count: 99 }, validPlan()), (error) => error.code === 'invalid_srt_model');
});

test('rejects missing, duplicated, regressing, or out-of-range cue coverage', () => {
  const mutations = [
    (plan) => { plan.shots[1].cue_start = 4; },
    (plan) => { plan.shots[1].cue_start = 2; },
    (plan) => { plan.shots[2].cue_end = 7; },
    (plan) => { plan.shots.pop(); plan.chapters.pop(); plan.chapters[0].shot_end = 'S002'; },
  ];
  for (const mutate of mutations) {
    const plan = validPlan(); mutate(plan);
    assert.throws(() => validateAndNormalizeShotPlan(srt, plan), (error) => error.code === 'invalid_cue_coverage');
  }
});

test('rejects unstable shot IDs and invalid transition reasons', () => {
  const badId = validPlan(); badId.shots[1].shot_id = 'S009';
  assert.throws(() => validateAndNormalizeShotPlan(srt, badId), (error) => error.code === 'invalid_shot_id');
  const secondOpening = validPlan(); secondOpening.shots[1].transition_reason = 'opening';
  assert.throws(() => validateAndNormalizeShotPlan(srt, secondOpening), (error) => error.code === 'invalid_transition_reason');
  const badFirst = validPlan(); badFirst.shots[0].transition_reason = 'claim';
  assert.throws(() => validateAndNormalizeShotPlan(srt, badFirst), (error) => error.code === 'invalid_transition_reason');
});

test('rejects empty/oversized claim and control characters', () => {
  for (const value of ['', 'x'.repeat(501), 'bad\u0000text']) {
    const plan = validPlan(); plan.shots[0].narrated_claim = value;
    assert.throws(() => validateAndNormalizeShotPlan(srt, plan), (error) => error.code === 'invalid_claim');
  }
});

test('chapters must cover sequential shot ranges with stable IDs', () => {
  const gap = validPlan(); gap.chapters[1].shot_start = 'S002';
  assert.throws(() => validateAndNormalizeShotPlan(srt, gap), (error) => error.code === 'invalid_chapter_coverage');
  const id = validPlan(); id.chapters[0].chapter_id = 'C009';
  assert.throws(() => validateAndNormalizeShotPlan(srt, id), (error) => error.code === 'invalid_chapter_id');
  const missing = validPlan(); missing.chapters.pop();
  assert.throws(() => validateAndNormalizeShotPlan(srt, missing), (error) => error.code === 'invalid_chapter_coverage');
});

test('mechanical one-cue splitting warns but remains structurally valid', () => {
  const plan = {
    schema_version: 1,
    srt_sha256: srt.content_sha256,
    shots: srt.cues.map((cue, index) => ({
      shot_id: `S${String(index + 1).padStart(3, '0')}`,
      cue_start: cue.ordinal,
      cue_end: cue.ordinal,
      narrated_claim: `Claim ${cue.ordinal}`,
      transition_reason: index === 0 ? 'opening' : 'continuation',
    })),
    chapters: [{ chapter_id: 'C001', shot_start: 'S001', shot_end: 'S006', title: 'All', purpose: 'Structural warning fixture.' }],
  };
  const result = validateAndNormalizeShotPlan(srt, plan);
  assert.equal(result.warnings.some((warning) => warning.code === 'mechanical_split'), true);
  assert.equal(result.warnings.some((warning) => warning.code === 'short_shot'), true);
});

test('under-segmented and overlong plans warn without automatic regrouping', () => {
  const longSrt = parseSrt(Array.from({ length: 10 }, (_, index) => `${index + 1}\n00:00:${String(index * 2).padStart(2, '0')},000 --> 00:00:${String(index * 2 + 2).padStart(2, '0')},000\nCue ${index + 1}`).join('\n\n'));
  const plan = {
    schema_version: 1,
    srt_sha256: longSrt.content_sha256,
    shots: [{ shot_id: 'S001', cue_start: 1, cue_end: 10, narrated_claim: 'One intentionally overlong combined argument.', transition_reason: 'opening' }],
    chapters: [{ chapter_id: 'C001', shot_start: 'S001', shot_end: 'S001', title: 'Long', purpose: 'Warning fixture.' }],
  };
  const result = validateAndNormalizeShotPlan(longSrt, plan);
  assert.equal(result.warnings.some((warning) => warning.code === 'under_segmented'), true);
  assert.equal(result.warnings.some((warning) => warning.code === 'overlong_shot'), true);
  assert.equal(result.shot_count, 1);
});

test('validator does not inspect keywords to fabricate semantic cuts', () => {
  const plan = validPlan();
  plan.shots[0].narrated_claim = 'First second third conclusion example contrast';
  const result = validateAndNormalizeShotPlan(srt, plan);
  assert.equal(result.shot_count, 3);
  assert.equal(result.shots[0].cue_end, 2);
});

test('CLI parser and safe read/validation exits do not expose files or claims', async () => {
  assert.deepEqual(parseShotPlanArgs(['--help']), { help: true });
  assert.deepEqual(parseShotPlanArgs(['srt.json', 'plan.json', '--pretty']), { srt: 'srt.json', plan: 'plan.json', pretty: true });
  assert.equal(parseShotPlanArgs(['one.json']).error, true);

  const stdout = capture();
  const files = { '/private/srt.json': JSON.stringify(srt), '/private/plan.json': JSON.stringify(validPlan()) };
  assert.equal(await runShotPlanCli(['/private/srt.json', '/private/plan.json'], {
    stdout: stdout.stream,
    readFile: async (file) => files[file],
  }), 0);
  assert.equal(stdout.value().includes('/private'), false);

  const invalidErr = capture();
  const bad = validPlan(); bad.shots[0].narrated_claim = 'private claim'; bad.shots[0].cue_start = 2;
  assert.equal(await runShotPlanCli(['srt.json', 'bad.json'], {
    stderr: invalidErr.stream,
    readFile: async (file) => file === 'srt.json' ? JSON.stringify(srt) : JSON.stringify(bad),
  }), 2);
  assert.equal(invalidErr.value().includes('private claim'), false);

  const readErr = capture();
  assert.equal(await runShotPlanCli(['/private/missing', '/private/plan'], {
    stderr: readErr.stream,
    readFile: async () => { throw new Error('/private/missing'); },
  }), 3);
  assert.equal(readErr.value().includes('/private'), false);
});
