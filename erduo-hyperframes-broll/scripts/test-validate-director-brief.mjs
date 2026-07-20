import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSrt } from './parse-srt.mjs';
import { validateAndNormalizeShotPlan } from './validate-shot-plan.mjs';
import { DirectorBriefError, validateDirectorBriefs } from './validate-director-brief.mjs';

const srt = parseSrt(`1
00:00:00,000 --> 00:00:02,000
A route selects one path.

2
00:00:02,000 --> 00:00:04,000
The signal reaches its target.

3
00:00:04,000 --> 00:00:06,000
The measured result increases.`);

const plan = validateAndNormalizeShotPlan(srt, {
  schema_version: 1,
  srt_sha256: srt.content_sha256,
  shots: [
    { shot_id: 'S001', cue_start: 1, cue_end: 2, narrated_claim: 'A routing decision sends a signal to one target.', transition_reason: 'opening' },
    { shot_id: 'S002', cue_start: 3, cue_end: 3, narrated_claim: 'The measured result increases.', transition_reason: 'data' },
  ],
  chapters: [{ chapter_id: 'C001', shot_start: 'S001', shot_end: 'S002', title: 'Routing result', purpose: 'Show a process and its outcome.' }],
});

function brief(shotId, overrides = {}) {
  return {
    shot_id: shotId,
    comprehension_purpose: 'Understand which path is selected and what result becomes visible.',
    semantic_type: overrides.semantic_type ?? 'process',
    representation: {
      mode: overrides.mode ?? 'process-system',
      subjects: ['signal node', 'branching paths', 'target node'],
      relationship: 'One signal chooses one branch and reaches one destination.',
      grounding: 'The branching topology directly represents a routing decision.',
      ...overrides.representation,
    },
    visible_action: {
      verb: overrides.verb ?? 'route',
      from_state: 'All paths are inactive and the signal waits at the source.',
      to_state: 'One path lights in sequence and the destination becomes active.',
      ...overrides.visible_action,
    },
    result_state: {
      visible_outcome: 'Only the selected path and destination remain bright.',
      hold_intent: 'normal',
      ...overrides.result_state,
    },
    evidence: {
      mode: overrides.evidence_mode ?? 'abstract-relationship',
      source_ids: [],
      claim_handling: 'non-literal',
      ...overrides.evidence,
    },
    silent_test: {
      expected_guess: 'A signal selected one route and reached the intended target.',
      visible_clues: ['inactive branches dim', 'selected path lights toward one active target'],
      ambiguity_risk: 'Without a clear source marker it could look like ordinary network traffic.',
      verdict: 'pass',
      review_note: 'The source marker and single surviving branch distinguish selection from generic flow.',
      ...overrides.silent_test,
    },
    asset_needs: {
      preferred_route: 'hyperframes-native',
      primary_compositing: 'fullscreen',
      query_subjects: [],
      prohibitions: ['generic checkmark', 'copied subtitle card'],
      ...overrides.asset_needs,
    },
    anti_collision: {
      motif_id: overrides.motif_id ?? `M-${shotId}-ROUTE`,
      varied_dimensions: ['layout', 'primary-action'],
      complete_metaphor_reuse: false,
      ...overrides.anti_collision,
    },
  };
}

function document(overrides = {}) {
  return {
    schema_version: 1,
    plan_sha256: plan.plan_sha256,
    briefs: [brief('S001'), brief('S002', {
      semantic_type: 'quantity',
      mode: 'quantitative-chart',
      verb: 'grow',
      motif_id: 'M-S002-RISING-TRACE',
      representation: { subjects: ['baseline marker', 'result marker'], relationship: 'The result marker rises relative to the baseline.', grounding: 'Relative vertical position shows direction without inventing a number.' },
      visible_action: { from_state: 'Both markers begin at the baseline.', to_state: 'The result marker rises and the comparison line remains.' },
      result_state: { visible_outcome: 'Baseline and higher result remain together for comparison.' },
      silent_test: { expected_guess: 'The result increased from its baseline.', visible_clues: ['fixed baseline marker', 'result marker rises above it'], ambiguity_risk: 'The amount is intentionally unspecified because there is no verified number.', review_note: 'The fixed baseline and higher final marker communicate direction while avoiding a fabricated metric.' },
    })],
    ...overrides,
  };
}

test('validates complete four-step briefs and carries authoritative shot durations', () => {
  const result = validateDirectorBriefs(plan, document());
  assert.equal(result.brief_count, 2);
  assert.equal(result.briefs[0].duration_ms, plan.shots[0].duration_ms);
  assert.equal(result.briefs[1].evidence.claim_handling, 'non-literal');
  assert.match(result.briefs_sha256, /^[0-9a-f]{64}$/u);
});

test('normalization and hash are deterministic', () => {
  assert.deepEqual(validateDirectorBriefs(plan, document()), validateDirectorBriefs(plan, document()));
});

test('rejects mismatched plan hash, count, order, and unknown fields', () => {
  const hash = document({ plan_sha256: 'a'.repeat(64) });
  assert.throws(() => validateDirectorBriefs(plan, hash), (error) => error.code === 'invalid_brief_document');
  const count = document(); count.briefs.pop();
  assert.throws(() => validateDirectorBriefs(plan, count), (error) => error.code === 'invalid_brief_document');
  const order = document(); order.briefs[0].shot_id = 'S002';
  assert.throws(() => validateDirectorBriefs(plan, order), (error) => error.code === 'invalid_brief_id');
  const extra = document(); extra.briefs[0].template = 'draft';
  assert.throws(() => validateDirectorBriefs(plan, extra), (error) => error.code === 'invalid_brief');
});

test('rejects generic or unsupported representation and action', () => {
  for (const [overrides, code] of [
    [{ mode: 'icon-label' }, 'invalid_representation'],
    [{ verb: 'fade-in' }, 'invalid_action'],
    [{ representation: { subjects: [] } }, 'invalid_representation'],
  ]) {
    const value = document(); value.briefs[0] = brief('S001', overrides);
    assert.throws(() => validateDirectorBriefs(plan, value), (error) => error.code === code);
  }
});

test('literal evidence requires registered source IDs and literal handling', () => {
  const valid = document();
  valid.briefs[0] = brief('S001', { evidence_mode: 'verified-source', evidence: { source_ids: ['SOURCE-001'], claim_handling: 'literal-evidence' } });
  assert.equal(validateDirectorBriefs(plan, valid).briefs[0].evidence.mode, 'verified-source');
  const missing = document();
  missing.briefs[0] = brief('S001', { evidence_mode: 'verified-source', evidence: { source_ids: [], claim_handling: 'literal-evidence' } });
  assert.throws(() => validateDirectorBriefs(plan, missing), (error) => error.code === 'invalid_evidence');
});

test('abstract and not-required evidence cannot retain sources or wrong handling', () => {
  const source = document(); source.briefs[0].evidence.source_ids = ['SOURCE-001'];
  assert.throws(() => validateDirectorBriefs(plan, source), (error) => error.code === 'invalid_evidence');
  const mood = document();
  mood.briefs[0] = brief('S001', { semantic_type: 'emotion', mode: 'emotional-atmosphere', evidence_mode: 'not-required', evidence: { source_ids: [], claim_handling: 'not-applicable' } });
  assert.equal(validateDirectorBriefs(plan, mood).briefs[0].evidence.mode, 'not-required');
});

test('unverified quantity/evidence cannot imitate documentary proof', () => {
  const value = document();
  value.briefs[1] = brief('S002', { semantic_type: 'quantity', mode: 'documentary-evidence', motif_id: 'M-S002-DOC' });
  assert.throws(() => validateDirectorBriefs(plan, value), (error) => error.code === 'invented_evidence');
});

test('silent review needs pass, two clues, concrete ambiguity, and concrete note', () => {
  for (const [silent, code] of [
    [{ verdict: 'fail' }, 'silent_test_failed'],
    [{ visible_clues: ['one clue'] }, 'invalid_silent_test'],
    [{ review_note: 'Looks good' }, 'invalid_silent_test'],
    [{ ambiguity_risk: '' }, 'invalid_silent_test'],
  ]) {
    const value = document(); value.briefs[0] = brief('S001', { silent_test: silent });
    assert.throws(() => validateDirectorBriefs(plan, value), (error) => error.code === code);
  }
});

test('asset route, query subjects, and prohibitions are bounded and structured', () => {
  const route = document(); route.briefs[0].asset_needs.preferred_route = 'random-web';
  assert.throws(() => validateDirectorBriefs(plan, route), (error) => error.code === 'invalid_asset_needs');
  const duplicates = document(); duplicates.briefs[0].asset_needs.query_subjects = ['factory', 'factory'];
  assert.throws(() => validateDirectorBriefs(plan, duplicates), (error) => error.code === 'invalid_asset_needs');
  const missingQuery = document(); missingQuery.briefs[0].asset_needs.preferred_route = 'pexels';
  assert.throws(() => validateDirectorBriefs(plan, missingQuery), (error) => error.code === 'invalid_asset_needs');
  const concrete = document(); concrete.briefs[0].asset_needs.preferred_route = 'pexels'; concrete.briefs[0].asset_needs.query_subjects = ['authentic people collaborating'];
  assert.equal(validateDirectorBriefs(plan, concrete).briefs[0].asset_needs.preferred_route, 'pexels');
  const lightPass = document(); lightPass.briefs[0].asset_needs.primary_compositing = 'light-pass';
  assert.throws(() => validateDirectorBriefs(plan, lightPass), (error) => error.code === 'invalid_asset_needs');
});

test('anti-collision requires unique motif, two valid variations, and no complete reuse', () => {
  const duplicate = document(); duplicate.briefs[1].anti_collision.motif_id = duplicate.briefs[0].anti_collision.motif_id;
  assert.throws(() => validateDirectorBriefs(plan, duplicate), (error) => error.code === 'invalid_anti_collision');
  const one = document(); one.briefs[0].anti_collision.varied_dimensions = ['layout'];
  assert.throws(() => validateDirectorBriefs(plan, one), (error) => error.code === 'invalid_anti_collision');
  const reuse = document(); reuse.briefs[0].anti_collision.complete_metaphor_reuse = true;
  assert.throws(() => validateDirectorBriefs(plan, reuse), (error) => error.code === 'invalid_anti_collision');
});

test('purpose, result, and representation text cannot be empty or control-filled', () => {
  for (const mutate of [
    (value) => { value.briefs[0].comprehension_purpose = ''; },
    (value) => { value.briefs[0].result_state.visible_outcome = 'bad\u0000'; },
    (value) => { value.briefs[0].representation.grounding = ''; },
  ]) {
    const value = document(); mutate(value);
    assert.throws(() => validateDirectorBriefs(plan, value), DirectorBriefError);
  }
});

test('brief schema cannot choose final asset, style template, or render command', () => {
  for (const [field, value] of [['asset_path', '/private/video.mp4'], ['template_id', 'draft'], ['render_command', 'ffmpeg']]) {
    const doc = document(); doc.briefs[0][field] = value;
    assert.throws(() => validateDirectorBriefs(plan, doc), (error) => error.code === 'invalid_brief');
  }
});
