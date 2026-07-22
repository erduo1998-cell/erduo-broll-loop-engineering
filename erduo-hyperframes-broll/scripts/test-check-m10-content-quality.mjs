import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDirectorSummary, validateFrameFusionAnalysis, validateM10VisualContract } from './validate-m10-visual-contract.mjs';
import { parseSrt } from './parse-srt.mjs';
import { validateAndNormalizeShotPlan } from './validate-shot-plan.mjs';
import { planM10AssetRoutes } from './plan-m10-asset-routes.mjs';
import { checkM10ContentQuality, M10ContentQualityError } from './check-m10-content-quality.mjs';

const sha = (letter) => letter.repeat(64);

function fixture(mutator = (value) => value) {
  const srt = parseSrt(`1
00:00:00,000 --> 00:00:02,000
The first choice changes the system.

2
00:00:02,000 --> 00:00:04,000
Then the result becomes visible.

3
00:00:04,000 --> 00:00:06,000
So the viewer knows what to do next.`);
  const framePlan = validateAndNormalizeShotPlan(srt, {
    schema_version: 1,
    srt_sha256: srt.content_sha256,
    shots: [
      { shot_id: 'S001', cue_start: 1, cue_end: 2, narrated_claim: 'A choice changes the system and makes a result visible.', transition_reason: 'opening' },
      { shot_id: 'S002', cue_start: 3, cue_end: 3, narrated_claim: 'The viewer receives the next action.', transition_reason: 'conclusion' },
    ],
    chapters: [{ chapter_id: 'C001', shot_start: 'S001', shot_end: 'S002', title: 'Choice to action', purpose: 'Show a cause, result, and action.' }],
  });
  const frameFusion = validateFrameFusionAnalysis({
    schema_version: 1,
    srt_sha256: srt.content_sha256,
    frames: [{
      frame_id: 'FRAME-HOOK-001',
      image_sha256: sha('a'),
      width: 1920,
      height: 1080,
      speaker_presence: 'single-speaker',
      speaker_box: { x: 0.08, y: 0.12, width: 0.34, height: 0.78 },
      safe_zones: ['right third has clean negative space'],
      lighting: { brightness: 'medium low', contrast: 'soft face contrast', direction: 'warm key from left', risk: 'avoid bright cyan over the skin edge' },
      palette: { dominant_hex: ['#0d1210', '#d8f4e2'], avoid_hex: ['#00ffff'], notes: 'Still constrains fusion, not the whole visual style.' },
      background: { complexity: 'moderate', description: 'desk and wall texture', risk: 'dense labels become noisy' },
      overlay_capability: { rating: 'limited', usable_zones: ['right third'], reason: 'speaker occupies the left side' },
      fullscreen_cutaway: { feasibility: 'yes', return_rule: 'Return with matching warm rim or green-black base.' },
      hard_alpha: { feasibility: 'conditional', edge_risk: 'hair edge needs a simple hard matte' },
    }],
    global_constraints: { design_priority: 'user-reference-over-internal-reference-over-still-frame', user_reference_policy: 'Internal atoms are advisory.', notes: 'Still frame does not force the style.' },
  });
  const directorSummary = validateDirectorSummary({
    method_id: 'erduo-director-method-v1',
    absorbed_sections: ['intent-card', 'visual-motif', 'scene-table', 'component-material-plan', 'taste-rationale', 'quality-self-check'],
    adapter_boundaries: { time_source: 'srt', asset_policy_owner: 'erduo-hyperframes-broll', final_delivery_owner: 'erduo-hyperframes-broll', director_method_role: 'bundled-directing-authority' },
    optional_enhancer: { used: false },
  });
  const rawVisual = {
    schema_version: 1,
    plan_sha256: framePlan.plan_sha256,
    frame_fusion_sha256: frameFusion.frame_fusion_sha256,
    director_summary_sha256: directorSummary.director_summary_sha256,
    shots: [
      shot('S001', 'process', 'fullscreen-broll', ['image-generation', 'pexels', 'hyperframes-native']),
      shot('S002', 'action-close', 'speaker-context-return', ['user-media', 'image-generation', 'hyperframes-native']),
    ],
  };
  const visualContract = validateM10VisualContract(framePlan, frameFusion, directorSummary, mutator(rawVisual));
  const routePlan = planM10AssetRoutes(visualContract, { user_media: true, pexels: true, image_generation: false, hyperframes_native: true });
  return {
    schema_version: 1,
    frame_plan: framePlan,
    visual_contract: visualContract,
    frame_fusion: frameFusion,
    director_summary: directorSummary,
    route_plan: routePlan,
    director_review: {
      status: 'pass',
      reviewer: 'fixture-isolated-reviewer',
      director_density_retained: true,
      shot_count_verdict: 'sufficient for short fixture',
      density_range_gap: 2,
      dense_shot_ratio_bp: 2500,
      all_medium_density: false,
      notes: 'Fixture keeps hook and close density contrast.',
    },
    media_composition_review: {
      status: 'pass',
      pexels_integrated: true,
      checked_shots: ['S001'],
      failures: [],
      notes: 'Pexels shot has crop, focal area, safe overlay, palette, and component relation.',
    },
    taste_review: {
      status: 'pass',
      design_read: 'Short semantic explanation with warm still-frame constraint and restrained density.',
      variance: 6,
      motion: 5,
      density: 5,
      typography_plan: 'Use traced local CJK title role with readable line-height and result hold.',
      ai_tell_sweep: ['no default font stack', 'no generic glass cards', 'no purple-blue glow'],
      notes: 'Taste preflight is explicit before render.',
    },
    passed_gates: ['visual-contract', 'm10-content-quality', 'delivery-media', 'frame-visibility', 'director-density-review', 'pexels-composition-fit', 'taste-preflight'],
    release_statement: { status: 'release_withdrawn_rearchitecture_required' },
  };
}

function shot(id, family, mode, routeOrder) {
  return {
    shot_id: id,
    information_intent: { narrated_claim: id === 'S001' ? 'A choice changes the system and makes a result visible.' : 'The viewer receives the next action.', viewer_should_understand: 'semantic because this visual explains why the claim changes.', readable_outcome: 'A clear result remains on screen.' },
    visual_grammar: { family, agent_choice_reason: 'semantic reason: the grammar follows the claim logic.', screen_text: id === 'S001' ? '选择改变' : '下一步' },
    compositing: { mode, reason: 'The compositing choice follows the still-frame fusion constraints.' },
    material_roles: [{ role: id === 'S001' ? 'explanatory-media' : 'text-quote', route_order: routeOrder, purpose: 'Primary visual material explains the claim.', fallback_limit: 'HyperFrames native may only provide local support, not a whole-film default.' }],
    component_intent: { needed: true, description: 'Use a local component only when it clarifies the relation.', native_scope: 'shot-local-support-only' },
    motion: { key_action: 'Visible state changes and then holds.', transition_intent: 'Return or cut with palette continuity.', result_hold: 'Hold the result for readability.' },
    frame_fusion: { mode: 'cutaway-return', frame_ids: ['FRAME-HOOK-001'], constraints_used: ['right third has clean negative space'], decision_reason: 'The still guides safe return and overlay risk.' },
    reference_use: { user_reference_alignment: 'No user reference in fixture; internal atoms are advisory.', internal_atom_candidates: ['scene-logic/process-shift'], selection_policy: 'Use candidates as inspiration; discard them when content or user reference points elsewhere.' },
    quality_notes: { not_subtitle_burn: true, not_native_default: true, not_media_only_pass: true, judgment_note: 'semantic quality requires a visual decision, not media-only proof.' },
  };
}

test('passes when full M10 visual contract, route plan, release withdrawal, and content gate are present', () => {
  const result = checkM10ContentQuality(fixture());
  assert.match(result.quality_signature, /^[0-9a-f]{64}$/u);
  assert.equal(result.shot_count, 2);
});

test('rejects media-only verification and missing M10 content gates', () => {
  const request = fixture();
  request.passed_gates = ['delivery-media', 'frame-visibility'];
  assert.throws(() => checkM10ContentQuality(request), (error) => error instanceof M10ContentQualityError && error.code === 'missing_quality_gate');
});

test('rejects public release status before M10 regression passes', () => {
  const request = fixture();
  request.release_statement = { status: 'public_release_ready' };
  assert.throws(() => checkM10ContentQuality(request), (error) => error.code === 'release_not_withdrawn');
});

test('rejects adjacent repeated grammar, compositing, and route without semantic reason', () => {
  const request = fixture((doc) => {
    doc.shots[1] = shot('S002', 'process', 'fullscreen-broll', ['image-generation', 'pexels', 'hyperframes-native']);
    doc.shots[0].information_intent.viewer_should_understand = 'Visual result.';
    doc.shots[0].visual_grammar.agent_choice_reason = 'Looks consistent.';
    doc.shots[0].quality_notes.judgment_note = 'Looks consistent.';
    doc.shots[1].information_intent.viewer_should_understand = 'Visual result.';
    doc.shots[1].visual_grammar.agent_choice_reason = 'Looks consistent.';
    doc.shots[1].quality_notes.judgment_note = 'Looks consistent.';
    return doc;
  });
  request.media_composition_review.checked_shots = ['S001', 'S002'];
  assert.throws(() => checkM10ContentQuality(request), (error) => error.code === 'adjacent_repetition');
});

test('rejects route plan mismatch', () => {
  const request = fixture();
  request.route_plan.visual_contract_sha256 = sha('d');
  assert.throws(() => checkM10ContentQuality(request), (error) => error.code === 'invalid_route_plan');
});

test('rejects missing isolated director density review gate', () => {
  const request = fixture();
  request.passed_gates = request.passed_gates.filter((gate) => gate !== 'director-density-review');
  assert.throws(() => checkM10ContentQuality(request), (error) => error.code === 'missing_quality_gate');
});

test('rejects flat director density review', () => {
  const request = fixture();
  request.director_review.density_range_gap = 1;
  assert.throws(() => checkM10ContentQuality(request), (error) => error.code === 'director_density_too_flat');
});

test('rejects selected Pexels route without composition integration', () => {
  const request = fixture();
  request.media_composition_review.pexels_integrated = false;
  assert.throws(() => checkM10ContentQuality(request), (error) => error.code === 'pexels_not_integrated');
});

test('rejects missing taste preflight evidence', () => {
  const request = fixture();
  request.taste_review.typography_plan = '';
  assert.throws(() => checkM10ContentQuality(request), (error) => error.code === 'invalid_taste_review');
});
