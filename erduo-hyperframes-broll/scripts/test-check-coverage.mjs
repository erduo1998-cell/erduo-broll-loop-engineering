import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { parseSrt } from './parse-srt.mjs';
import { validateAndNormalizeShotPlan } from './validate-shot-plan.mjs';
import { validateDirectorBriefs } from './validate-director-brief.mjs';
import { checkCandidateCoverage, parseCoverageArgs, runCoverageCli } from './check-coverage.mjs';
import { fingerprintValue } from './state.mjs';

const srt = parseSrt(`1\n00:00:01,000 --> 00:00:02,000\nOne path is selected.\n\n2\n00:00:03,000 --> 00:00:04,000\nThe result becomes visible.`);
const plan = validateAndNormalizeShotPlan(srt, {
  schema_version: 1,
  srt_sha256: srt.content_sha256,
  shots: [
    { shot_id: 'S001', cue_start: 1, cue_end: 1, narrated_claim: 'One path is selected.', transition_reason: 'opening' },
    { shot_id: 'S002', cue_start: 2, cue_end: 2, narrated_claim: 'The result becomes visible.', transition_reason: 'conclusion' },
  ],
  chapters: [{ chapter_id: 'C001', shot_start: 'S001', shot_end: 'S002', title: 'Path and result', purpose: 'Show selection and outcome.' }],
});

function rawBrief(shotId, primary = 'fullscreen', motif = shotId) {
  return {
    shot_id: shotId,
    comprehension_purpose: 'Understand a selection and its visible outcome.',
    semantic_type: 'process',
    representation: { mode: 'process-system', subjects: ['source', 'path', 'target'], relationship: 'One source selects one path to a target.', grounding: 'The path topology shows selection.' },
    visible_action: { verb: 'route', from_state: 'All paths wait.', to_state: 'One path reaches the target.' },
    result_state: { visible_outcome: 'The selected target remains active.', hold_intent: 'normal' },
    evidence: { mode: 'abstract-relationship', source_ids: [], claim_handling: 'non-literal' },
    silent_test: { expected_guess: 'One path was selected.', visible_clues: ['other paths dim', 'one target remains active'], ambiguity_risk: 'The source must remain visible.', verdict: 'pass', review_note: 'The source and single active target distinguish routing from generic motion.' },
    asset_needs: { preferred_route: 'hyperframes-native', primary_compositing: primary, query_subjects: [], prohibitions: ['subtitle card'] },
    anti_collision: { motif_id: `M-${motif}-PATH`, varied_dimensions: ['layout', 'primary-action'], complete_metaphor_reuse: false },
  };
}

function briefs(primary = ['fullscreen', 'native-base-with-overlay']) {
  return validateDirectorBriefs(plan, {
    schema_version: 1,
    plan_sha256: plan.plan_sha256,
    briefs: [rawBrief('S001', primary[0]), rawBrief('S002', primary[1], 'S002-RESULT')],
  });
}

function clone(value) { return structuredClone(value); }
function capture() {
  let value = '';
  return { stream: new Writable({ write(chunk, encoding, done) { value += chunk.toString(); done(); } }), value: () => value };
}

test('talking-head report proves exact continuous 100 percent coverage', () => {
  const result = checkCandidateCoverage(plan, briefs(), 'talking-head');
  assert.deepEqual(result.coverage, { covered_ms: 3000, total_ms: 3000, uncovered_ms: 0, coverage_basis_points: 10000, complete: true });
  assert.deepEqual(result.windows.map(({ start_ms, end_ms }) => [start_ms, end_ms]), [[1000, 3000], [3000, 4000]]);
  assert.match(result.report_sha256, /^[0-9a-f]{64}$/u);
});

test('faceless accepts standalone fullscreen and native-base coverage', () => {
  const result = checkCandidateCoverage(plan, briefs(), 'faceless');
  assert.equal(result.mode, 'faceless');
  assert.equal(result.windows.length, 2);
});

test('talking-head accepts hard alpha over its source video', () => {
  assert.equal(checkCandidateCoverage(plan, briefs(['hard-alpha-over-source', 'fullscreen']), 'talking-head').coverage.complete, true);
});

test('faceless rejects hard alpha that depends on a missing source layer', () => {
  assert.throws(() => checkCandidateCoverage(plan, briefs(['hard-alpha-over-source', 'fullscreen']), 'faceless'), (error) => error.code === 'mode_conflict' && error.shot_id === 'S001');
});

test('rejects invalid mode and black light pass as primary coverage', () => {
  assert.throws(() => checkCandidateCoverage(plan, briefs(), 'podcast'), (error) => error.code === 'invalid_mode');
  const value = briefs(); value.briefs[0].asset_needs.primary_compositing = 'light-pass';
  const { briefs_sha256, ...core } = value;
  value.briefs_sha256 = fingerprintValue(core);
  assert.throws(() => checkCandidateCoverage(plan, value, 'talking-head'), (error) => error.code === 'invalid_compositing');
});

test('detects plan and brief fingerprint tampering', () => {
  const alteredPlan = clone(plan); alteredPlan.shots[0].end_ms += 1;
  assert.throws(() => checkCandidateCoverage(alteredPlan, briefs(), 'talking-head'), (error) => error.code === 'plan_tampered');
  const alteredBriefs = briefs(); alteredBriefs.briefs[0].duration_ms += 1;
  assert.throws(() => checkCandidateCoverage(plan, alteredBriefs, 'talking-head'), (error) => error.code === 'briefs_tampered');
});

test('rejects missing, duplicated, or reordered briefs before build', () => {
  for (const mutate of [
    (value) => { value.briefs.pop(); value.brief_count -= 1; },
    (value) => { value.briefs[1].shot_id = 'S001'; },
    (value) => { value.briefs.reverse(); },
  ]) {
    const value = briefs(); mutate(value);
    assert.throws(() => checkCandidateCoverage(plan, value, 'talking-head'));
  }
});

test('rejects a duration mismatch even when the brief hash is recomputed', () => {
  const value = briefs(); value.briefs[0].duration_ms += 1;
  const { briefs_sha256, ...core } = value;
  value.briefs_sha256 = fingerprintValue(core);
  assert.throws(() => checkCandidateCoverage(plan, value, 'talking-head'), (error) => error.code === 'duration_mismatch');
});

test('rejects a failed silent verdict even when the brief hash is recomputed', () => {
  const value = briefs(); value.briefs[0].silent_test.verdict = 'fail';
  const { briefs_sha256, ...core } = value;
  value.briefs_sha256 = fingerprintValue(core);
  assert.throws(() => checkCandidateCoverage(plan, value, 'talking-head'), (error) => error.code === 'silent_test_failed');
});

test('detects a plan gap even when the plan hash is recomputed', () => {
  const value = clone(plan); value.shots[1].start_ms += 1; value.shots[1].duration_ms -= 1;
  const { plan_sha256, ...core } = value;
  value.plan_sha256 = fingerprintValue(core);
  assert.throws(() => checkCandidateCoverage(value, briefs(), 'talking-head'), (error) => error.code === 'coverage_gap');
});

test('report is deterministic and does not include claims or source paths', () => {
  const one = checkCandidateCoverage(plan, briefs(), 'talking-head');
  const two = checkCandidateCoverage(plan, briefs(), 'talking-head');
  assert.deepEqual(one, two);
  assert.equal(JSON.stringify(one).includes('One path is selected'), false);
  assert.equal(JSON.stringify(one).includes('/private/'), false);
});

test('CLI parses arguments and emits safe stable exits', async () => {
  assert.deepEqual(parseCoverageArgs(['--help']), { help: true });
  assert.equal(parseCoverageArgs(['talking-head', 'only.json']).error, true);
  const stdout = capture();
  const files = { '/private/plan.json': JSON.stringify(plan), '/private/briefs.json': JSON.stringify(briefs()) };
  assert.equal(await runCoverageCli(['faceless', '/private/plan.json', '/private/briefs.json'], { stdout: stdout.stream, readFile: async (file) => files[file] }), 0);
  assert.equal(stdout.value().includes('/private/'), false);
  const stderr = capture();
  assert.equal(await runCoverageCli(['faceless', '/private/missing', '/private/briefs.json'], { stderr: stderr.stream, readFile: async () => { throw new Error('/private/missing'); } }), 3);
  assert.equal(stderr.value().includes('/private/'), false);
});
