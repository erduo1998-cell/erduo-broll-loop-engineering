import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSrt } from './parse-srt.mjs';
import { validateAndNormalizeShotPlan } from './validate-shot-plan.mjs';
import { validateDirectorBriefs } from './validate-director-brief.mjs';
import { fingerprintValue } from './state.mjs';
import { loadPackagedDesignLibrary, selectDirectorDesign } from './select-design.mjs';

const library = await loadPackagedDesignLibrary();
const srt = parseSrt('1\n00:00:00,000 --> 00:00:04,000\nA signal passes through a gate.');
const plan = validateAndNormalizeShotPlan(srt, { schema_version: 1, srt_sha256: srt.content_sha256, shots: [{ shot_id: 'S001', cue_start: 1, cue_end: 1, narrated_claim: 'A signal passes through a gate.', transition_reason: 'opening' }], chapters: [{ chapter_id: 'C001', shot_start: 'S001', shot_end: 'S001', title: 'Gate', purpose: 'Explain the process.' }] });

function document(overrides = {}) {
  return validateDirectorBriefs(plan, { schema_version: 1, plan_sha256: plan.plan_sha256, briefs: [{
    shot_id: 'S001', comprehension_purpose: 'Understand a gated workflow.', semantic_type: overrides.semantic_type ?? 'process',
    representation: { mode: overrides.representation ?? 'process-system', subjects: ['signal', 'gate'], relationship: 'The gate controls passage.', grounding: 'The gate physically represents a workflow condition.' },
    visible_action: { verb: 'filter', from_state: 'The signal waits before the gate.', to_state: 'The accepted signal exits the gate.' },
    result_state: { visible_outcome: 'The accepted signal remains beyond the gate.', hold_intent: 'normal' },
    evidence: overrides.evidence ?? { mode: 'abstract-relationship', source_ids: [], claim_handling: 'non-literal' },
    silent_test: { expected_guess: 'A gate admitted one signal.', visible_clues: ['gate opens', 'signal exits'], ambiguity_risk: 'Rejected signals must remain dim.', verdict: 'pass', review_note: 'The open gate and signal beyond it distinguish acceptance from waiting.' },
    asset_needs: { preferred_route: overrides.route ?? 'hyperframes-native', primary_compositing: overrides.primary ?? 'fullscreen', query_subjects: overrides.queries ?? [], prohibitions: ['subtitle card'] },
    anti_collision: { motif_id: 'M-S001-GATE', varied_dimensions: ['layout', 'primary-action'], complete_metaphor_reuse: false },
  }] });
}

function context(doc, overrides = {}) { return { schema_version: 1, briefs_sha256: doc.briefs_sha256, topic_tags: ['ai-tools', 'workflow'], moods: ['calm', 'technical'], aspect_ratio: '16:9', information_density: 3, user_design_defined_layers: [], recent_base_template_ids: [], used_signature_motif_ids: [], requested_borrows: [], ...overrides }; }

test('public selection honestly falls back while every packaged template is draft', () => {
  const doc = document(); const result = selectDirectorDesign(doc, context(doc), library);
  assert.equal(result.mode, 'native-fallback'); assert.equal(result.base_template, null); assert.equal(result.fallback, 'hyperframes-native');
});

test('development option selects one policy-ranked base template', () => {
  const doc = document(); const result = selectDirectorDesign(doc, context(doc), library, { allowDraft: true });
  assert.equal(result.base_template, 'soft-aurora-workbench'); assert.equal(result.template_status, 'draft'); assert.equal(result.mode, 'base-template');
});

test('allowDraft inside context is rejected instead of becoming a public bypass', () => {
  const doc = document(); assert.throws(() => selectDirectorDesign(doc, { ...context(doc), allowDraft: true }, library), (error) => error.code === 'invalid_context');
});

test('all protected user layers suppress a base template and preserve user design', () => {
  const doc = document(); const result = selectDirectorDesign(doc, context(doc, { user_design_defined_layers: ['visual_system', 'scene_grammar', 'motion_grammar', 'compositing'] }), library, { allowDraft: true });
  assert.equal(result.mode, 'user-design-native-supplement'); assert.equal(result.base_template, null); assert.equal(result.protected_user_layers.length, 4);
});

test('partial user design selects only a supplement and reports protected layers', () => {
  const doc = document(); const result = selectDirectorDesign(doc, context(doc, { user_design_defined_layers: ['visual_system', 'motion_grammar'] }), library, { allowDraft: true });
  assert.equal(result.mode, 'supplement-user-design'); assert.deepEqual(result.protected_user_layers, ['visual_system', 'motion_grammar']);
});

test('literal evidence cannot be routed through native or generated imagery', () => {
  const evidence = { mode: 'verified-source', source_ids: ['SOURCE-001'], claim_handling: 'literal-evidence' };
  const doc = document({ evidence, representation: 'documentary-evidence' });
  assert.throws(() => selectDirectorDesign(doc, context(doc), library), (error) => error.code === 'evidence_conflict');
});

test('literal user media evidence can enter selection', () => {
  const evidence = { mode: 'user-material', source_ids: ['SOURCE-001'], claim_handling: 'literal-evidence' };
  const doc = document({ evidence, representation: 'documentary-evidence', route: 'user-media' });
  assert.equal(selectDirectorDesign(doc, context(doc), library).fallback, 'hyperframes-native');
});

test('required compositing rejects an explicit incompatible template', () => {
  const doc = document({ primary: 'hard-alpha-over-source' });
  const result = selectDirectorDesign(doc, context(doc, { user_template_id: 'restrained-gradient-flow' }), library, { allowDraft: true });
  assert.equal(result.base_template, null);
  assert.ok(result.candidate_rejections.find((item) => item.template_id === 'restrained-gradient-flow').reason_codes.some((reason) => reason.code === 'COMPOSITING_OPT_IN_REQUIRED'));
});

test('motif and recent-base cooldown change the policy winner', () => {
  const doc = document();
  const base = selectDirectorDesign(doc, context(doc), library, { allowDraft: true });
  const template = library.templates.find((item) => item.id === base.base_template);
  const cooled = selectDirectorDesign(doc, context(doc, { recent_base_template_ids: [base.base_template], used_signature_motif_ids: template.reuse_policy.signature_motifs.map((item) => item.motif_id) }), library, { allowDraft: true });
  assert.notEqual(cooled.base_template, base.base_template);
});

test('compatible borrow is accepted and conflicting borrow returns reason codes', () => {
  const doc = document();
  const accepted = selectDirectorDesign(doc, context(doc, { requested_borrows: [{ template_id: 'neon-cyber-overlay', pattern_id: 'status-reveal' }] }), library, { allowDraft: true });
  assert.deepEqual(accepted.borrowed_patterns, [{ template_id: 'neon-cyber-overlay', pattern_id: 'status-reveal' }]);
  const rejected = selectDirectorDesign(doc, context(doc, { requested_borrows: [{ template_id: 'deep-current-hud', pattern_id: 'data-flow-network' }] }), library, { allowDraft: true });
  assert.ok(rejected.borrow_rejections[0].reason_codes.includes('BASE_CONFLICT'));
});

test('borrow limit, malformed tokens, unknown fields, and hash mismatch are rejected', () => {
  const doc = document();
  for (const bad of [
    context(doc, { requested_borrows: [{ template_id: 'a', pattern_id: 'b' }, { template_id: 'c', pattern_id: 'd' }, { template_id: 'e', pattern_id: 'f' }] }),
    context(doc, { topic_tags: ['Not Normalized'] }),
    { ...context(doc), extra: true },
    context(doc, { briefs_sha256: 'a'.repeat(64) }),
  ]) assert.throws(() => selectDirectorDesign(doc, bad, library));
});

test('brief tampering is detected and selection output is deterministic', () => {
  const doc = document(); const ctx = context(doc);
  assert.deepEqual(selectDirectorDesign(doc, ctx, library), selectDirectorDesign(doc, ctx, library));
  const altered = structuredClone(doc); altered.briefs[0].semantic_type = 'emotion';
  assert.throws(() => selectDirectorDesign(altered, ctx, library), (error) => error.code === 'briefs_tampered');
  const { briefs_sha256, ...core } = altered; altered.briefs_sha256 = fingerprintValue(core);
  assert.throws(() => selectDirectorDesign(altered, ctx, library), (error) => error.code === 'invalid_context');
});
