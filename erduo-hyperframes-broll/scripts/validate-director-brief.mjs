import { fingerprintValue } from './state.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const SEMANTIC_TYPES = new Set(['concept', 'process', 'quantity', 'relationship', 'evidence', 'emotion', 'environment']);
const REPRESENTATIONS = new Set(['physical-object', 'spatial-relation', 'process-system', 'quantitative-chart', 'documentary-evidence', 'emotional-atmosphere']);
const ACTIONS = new Set(['route', 'filter', 'transform', 'accumulate', 'compare', 'reveal', 'connect', 'sort', 'switch', 'scan', 'grow', 'separate', 'compress', 'assemble', 'observe', 'hold']);
const HOLD_INTENTS = new Set(['brief', 'normal', 'extended']);
const EVIDENCE_MODES = new Set(['user-material', 'verified-source', 'abstract-relationship', 'not-required']);
const ROUTES = new Set(['user-media', 'image-generation', 'pexels', 'hyperframes-native', 'mixed']);
const PRIMARY_COMPOSITING = new Set(['fullscreen', 'hard-alpha-over-source', 'native-base-with-overlay']);
const VARIATION_DIMENSIONS = new Set(['layout', 'entrance', 'primary-action', 'focus']);

export class DirectorBriefError extends Error {
  constructor(code, message, shot) {
    super(message);
    this.name = 'DirectorBriefError';
    this.code = code;
    if (shot !== undefined) this.shot = shot;
  }
}

function briefFail(code, message, shot) {
  throw new DirectorBriefError(code, message, shot);
}

function exact(value, fields, code, message, shot) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) briefFail(code, message, shot);
}

function text(value, code, message, shot, max = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(value)) briefFail(code, message, shot);
  return value.trim();
}

function stringList(value, { code, message, shot, min = 0, max = 8, pattern } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) briefFail(code, message, shot);
  const normalized = value.map((item) => text(item, code, message, shot, 160));
  if (new Set(normalized).size !== normalized.length || (pattern && normalized.some((item) => !pattern.test(item)))) briefFail(code, message, shot);
  return normalized;
}

function validatePlan(plan) {
  if (!plan || plan.schema_version !== 1 || !SHA256.test(plan.plan_sha256) || !Array.isArray(plan.shots) || plan.shot_count !== plan.shots.length || plan.shots.length === 0) briefFail('invalid_shot_plan', 'Normalized shot plan is invalid.');
  for (let index = 0; index < plan.shots.length; index += 1) {
    if (plan.shots[index].shot_id !== `S${String(index + 1).padStart(3, '0')}` || !Number.isSafeInteger(plan.shots[index].duration_ms) || plan.shots[index].duration_ms <= 0) briefFail('invalid_shot_plan', 'Normalized shot plan contains an invalid shot.');
  }
}

export function validateDirectorBriefs(plan, document) {
  validatePlan(plan);
  exact(document, ['schema_version', 'plan_sha256', 'briefs'], 'invalid_brief_document', 'Director brief document shape is invalid.');
  if (document.schema_version !== 1 || document.plan_sha256 !== plan.plan_sha256 || !Array.isArray(document.briefs) || document.briefs.length !== plan.shots.length) briefFail('invalid_brief_document', 'Director briefs do not match the shot plan.');
  const motifIds = new Set();
  const normalized = document.briefs.map((brief, index) => {
    const shot = index + 1;
    const expectedId = plan.shots[index].shot_id;
    exact(brief, ['shot_id', 'comprehension_purpose', 'semantic_type', 'representation', 'visible_action', 'result_state', 'evidence', 'silent_test', 'asset_needs', 'anti_collision'], 'invalid_brief', 'Director brief shape is invalid.', shot);
    if (brief.shot_id !== expectedId) briefFail('invalid_brief_id', 'Director briefs must follow shot order.', shot);
    if (!SEMANTIC_TYPES.has(brief.semantic_type)) briefFail('invalid_semantic_type', 'Director brief semantic type is invalid.', shot);

    exact(brief.representation, ['mode', 'subjects', 'relationship', 'grounding'], 'invalid_representation', 'Representation shape is invalid.', shot);
    if (!REPRESENTATIONS.has(brief.representation.mode)) briefFail('invalid_representation', 'Representation mode is generic or invalid.', shot);
    const representation = {
      mode: brief.representation.mode,
      subjects: stringList(brief.representation.subjects, { code: 'invalid_representation', message: 'Representation subjects are invalid.', shot, min: 1, max: 6 }),
      relationship: text(brief.representation.relationship, 'invalid_representation', 'Representation relationship is invalid.', shot),
      grounding: text(brief.representation.grounding, 'invalid_representation', 'Representation grounding is invalid.', shot),
    };

    exact(brief.visible_action, ['verb', 'from_state', 'to_state'], 'invalid_action', 'Visible action shape is invalid.', shot);
    if (!ACTIONS.has(brief.visible_action.verb)) briefFail('invalid_action', 'Visible action does not explain a supported process.', shot);
    const visibleAction = {
      verb: brief.visible_action.verb,
      from_state: text(brief.visible_action.from_state, 'invalid_action', 'Visible before state is invalid.', shot),
      to_state: text(brief.visible_action.to_state, 'invalid_action', 'Visible after state is invalid.', shot),
    };

    exact(brief.result_state, ['visible_outcome', 'hold_intent'], 'invalid_result', 'Result state shape is invalid.', shot);
    if (!HOLD_INTENTS.has(brief.result_state.hold_intent)) briefFail('invalid_result', 'Result hold intent is invalid.', shot);
    const resultState = {
      visible_outcome: text(brief.result_state.visible_outcome, 'invalid_result', 'Visible result is invalid.', shot),
      hold_intent: brief.result_state.hold_intent,
    };

    exact(brief.evidence, ['mode', 'source_ids', 'claim_handling'], 'invalid_evidence', 'Evidence boundary shape is invalid.', shot);
    if (!EVIDENCE_MODES.has(brief.evidence.mode)) briefFail('invalid_evidence', 'Evidence mode is invalid.', shot);
    const sourceIds = stringList(brief.evidence.source_ids, { code: 'invalid_evidence', message: 'Evidence source IDs are invalid.', shot, max: 8, pattern: /^[A-Z][A-Z0-9-]{2,63}$/u });
    const literal = ['user-material', 'verified-source'].includes(brief.evidence.mode);
    if ((literal && (sourceIds.length === 0 || brief.evidence.claim_handling !== 'literal-evidence')) || (!literal && (sourceIds.length !== 0 || brief.evidence.claim_handling !== (brief.evidence.mode === 'abstract-relationship' ? 'non-literal' : 'not-applicable')))) briefFail('invalid_evidence', 'Evidence mode, sources, and claim handling conflict.', shot);
    if (['quantity', 'evidence'].includes(brief.semantic_type) && !literal && brief.representation.mode === 'documentary-evidence') briefFail('invented_evidence', 'Unverified factual shots cannot imitate documentary evidence.', shot);

    exact(brief.silent_test, ['expected_guess', 'visible_clues', 'ambiguity_risk', 'verdict', 'review_note'], 'invalid_silent_test', 'Silent test shape is invalid.', shot);
    const visibleClues = stringList(brief.silent_test.visible_clues, { code: 'invalid_silent_test', message: 'Silent test needs concrete visible clues.', shot, min: 2, max: 8 });
    if (brief.silent_test.verdict !== 'pass') briefFail('silent_test_failed', 'Director brief failed its independent silent review.', shot);
    const reviewNote = text(brief.silent_test.review_note, 'invalid_silent_test', 'Silent review note is invalid.', shot, 300);
    if (/^(?:looks good|clear|matches narration|ok)[.!]?$/iu.test(reviewNote)) briefFail('invalid_silent_test', 'Silent review note is not concrete.', shot);

    exact(brief.asset_needs, ['preferred_route', 'primary_compositing', 'query_subjects', 'prohibitions'], 'invalid_asset_needs', 'Asset needs shape is invalid.', shot);
    if (!ROUTES.has(brief.asset_needs.preferred_route)) briefFail('invalid_asset_needs', 'Preferred asset route is invalid.', shot);
    if (!PRIMARY_COMPOSITING.has(brief.asset_needs.primary_compositing)) briefFail('invalid_asset_needs', 'Primary coverage composition is invalid.', shot);
    const assetNeeds = {
      preferred_route: brief.asset_needs.preferred_route,
      primary_compositing: brief.asset_needs.primary_compositing,
      query_subjects: stringList(brief.asset_needs.query_subjects, { code: 'invalid_asset_needs', message: 'Asset query subjects are invalid.', shot, max: 8 }),
      prohibitions: stringList(brief.asset_needs.prohibitions, { code: 'invalid_asset_needs', message: 'Asset prohibitions are invalid.', shot, max: 12 }),
    };
    if (['pexels', 'image-generation', 'mixed'].includes(assetNeeds.preferred_route) && assetNeeds.query_subjects.length === 0) briefFail('invalid_asset_needs', 'Media or generation routes require concrete query subjects.', shot);

    exact(brief.anti_collision, ['motif_id', 'varied_dimensions', 'complete_metaphor_reuse'], 'invalid_anti_collision', 'Anti-collision shape is invalid.', shot);
    if (typeof brief.anti_collision.motif_id !== 'string' || !/^M-[A-Z0-9-]{3,63}$/u.test(brief.anti_collision.motif_id) || motifIds.has(brief.anti_collision.motif_id) || brief.anti_collision.complete_metaphor_reuse !== false) briefFail('invalid_anti_collision', 'Hero motif must be unique and not reuse a complete metaphor.', shot);
    motifIds.add(brief.anti_collision.motif_id);
    const varied = stringList(brief.anti_collision.varied_dimensions, { code: 'invalid_anti_collision', message: 'Adjacent-shot variation is invalid.', shot, min: 2, max: 4 });
    if (varied.some((item) => !VARIATION_DIMENSIONS.has(item))) briefFail('invalid_anti_collision', 'Variation dimension is invalid.', shot);

    return {
      shot_id: expectedId,
      duration_ms: plan.shots[index].duration_ms,
      comprehension_purpose: text(brief.comprehension_purpose, 'invalid_purpose', 'Comprehension purpose is invalid.', shot),
      semantic_type: brief.semantic_type,
      representation,
      visible_action: visibleAction,
      result_state: resultState,
      evidence: { mode: brief.evidence.mode, source_ids: sourceIds, claim_handling: brief.evidence.claim_handling },
      silent_test: {
        expected_guess: text(brief.silent_test.expected_guess, 'invalid_silent_test', 'Silent expected guess is invalid.', shot),
        visible_clues: visibleClues,
        ambiguity_risk: text(brief.silent_test.ambiguity_risk, 'invalid_silent_test', 'Silent ambiguity risk is invalid.', shot),
        verdict: 'pass',
        review_note: reviewNote,
      },
      asset_needs: assetNeeds,
      anti_collision: { motif_id: brief.anti_collision.motif_id, varied_dimensions: varied, complete_metaphor_reuse: false },
    };
  });
  const core = { schema_version: 1, plan_sha256: plan.plan_sha256, brief_count: normalized.length, briefs: normalized };
  return { ...core, briefs_sha256: fingerprintValue(core) };
}
