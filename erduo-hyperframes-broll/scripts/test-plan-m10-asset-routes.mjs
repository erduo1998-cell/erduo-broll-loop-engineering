import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSrt } from './parse-srt.mjs';
import { validateAndNormalizeShotPlan } from './validate-shot-plan.mjs';
import { validateDirectorSummary, validateFrameFusionAnalysis, validateM10VisualContract } from './validate-m10-visual-contract.mjs';
import { M10AssetRouteError, planM10AssetRoutes } from './plan-m10-asset-routes.mjs';

const sha = (letter) => letter.repeat(64);

function buildVisualContract(mutator = (value) => value) {
  const srt = parseSrt(`1
00:00:00,000 --> 00:00:02,000
The first choice changes the system.

2
00:00:02,000 --> 00:00:04,000
Then the result becomes visible.

3
00:00:04,000 --> 00:00:06,000
So the viewer knows what to do next.`);
  const plan = validateAndNormalizeShotPlan(srt, {
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
    global_constraints: {
      design_priority: 'user-reference-over-internal-reference-over-still-frame',
      user_reference_policy: 'Internal atoms are vocabulary and conflict checks when no user reference exists.',
      notes: 'Still frame does not force the style.',
    },
  });
  const director = validateDirectorSummary({
    method_id: 'erduo-director-method-v1',
    absorbed_sections: ['intent-card', 'visual-motif', 'scene-table', 'component-material-plan', 'taste-rationale', 'quality-self-check'],
    adapter_boundaries: { time_source: 'srt', asset_policy_owner: 'erduo-hyperframes-broll', final_delivery_owner: 'erduo-hyperframes-broll', director_method_role: 'bundled-directing-authority' },
    optional_enhancer: { used: false },
  });
  const contract = {
    schema_version: 1,
    plan_sha256: plan.plan_sha256,
    frame_fusion_sha256: frameFusion.frame_fusion_sha256,
    director_summary_sha256: director.director_summary_sha256,
    shots: [
      shot('S001', { family: 'process', mode: 'fullscreen-broll', role: 'explanatory-media', route_order: ['image-generation', 'pexels', 'hyperframes-native'] }),
      shot('S002', { family: 'action-close', mode: 'speaker-context-return', role: 'text-quote', route_order: ['user-media', 'image-generation', 'hyperframes-native'] }),
    ],
  };
  return validateM10VisualContract(plan, frameFusion, director, mutator(contract));
}

function shot(id, { family, mode, role, route_order }) {
  return {
    shot_id: id,
    information_intent: { narrated_claim: id === 'S001' ? 'A choice changes the system and makes a result visible.' : 'The viewer receives the next action.', viewer_should_understand: 'The visual explains the claim through structure.', readable_outcome: 'A clear result remains on screen.' },
    visual_grammar: { family, agent_choice_reason: 'The grammar fits the semantic intent rather than a fixed template.', screen_text: id === 'S001' ? '选择改变' : '下一步' },
    compositing: { mode, reason: 'The compositing choice follows the still-frame fusion constraints.' },
    material_roles: [
      { role, route_order, purpose: 'Primary visual material explains the claim.', fallback_limit: 'HyperFrames native may only provide local support, not a whole-film default.' },
      { role: 'native-support', route_order: ['hyperframes-native'], purpose: 'Small relation marks support the selected material.', fallback_limit: 'Native support stays shot-local and auxiliary.' },
    ],
    component_intent: { needed: true, description: 'Use a local component only when it clarifies the relation.', native_scope: 'shot-local-support-only' },
    motion: { key_action: 'Visible state changes and then holds.', transition_intent: 'Return or cut with palette continuity.', result_hold: 'Hold the result for readability.' },
    frame_fusion: { mode: 'cutaway-return', frame_ids: ['FRAME-HOOK-001'], constraints_used: ['right third has clean negative space'], decision_reason: 'The still guides safe return and overlay risk.' },
    reference_use: { user_reference_alignment: 'No user reference in fixture; internal atoms are advisory.', internal_atom_candidates: ['scene-logic/process-shift'], selection_policy: 'Use candidates as inspiration; discard them when content or user reference points elsewhere.' },
    quality_notes: { not_subtitle_burn: true, not_native_default: true, not_media_only_pass: true, judgment_note: 'This requires a semantic visual decision, not media-only proof.' },
  };
}

test('plans per-shot asset routes from validated M10 visual contracts', () => {
  const result = planM10AssetRoutes(buildVisualContract(), { user_media: true, pexels: true, image_generation: false, hyperframes_native: true });
  assert.equal(result.shot_count, 2);
  assert.equal(result.routes[0].primary_route, 'pexels');
  assert.equal(result.routes[1].primary_route, 'user-media');
  assert.match(result.route_plan_sha256, /^[0-9a-f]{64}$/u);
});

test('falls through route order when richer media routes are unavailable but does not call that a release pass', () => {
  const result = planM10AssetRoutes(buildVisualContract(), { user_media: false, pexels: false, image_generation: true, hyperframes_native: true });
  assert.equal(result.routes[0].primary_route, 'image-generation');
  assert.equal(result.routes[1].primary_route, 'image-generation');
});

test('rejects whole-film primary native route', () => {
  const native = structuredClone(buildVisualContract());
  for (const item of native.shots) item.material_roles = [{ role: 'native-support', route_order: ['hyperframes-native'], purpose: 'Generic marks.', fallback_limit: 'Shot-local auxiliary native support only.' }];
  assert.throws(() => planM10AssetRoutes(native, { user_media: false, pexels: false, image_generation: false, hyperframes_native: true }), (error) => error instanceof M10AssetRouteError && error.code === 'native_default');
});

test('rejects missing roles and unavailable routes', () => {
  const missing = structuredClone(buildVisualContract());
  missing.shots[0].material_roles = [];
  assert.throws(() => planM10AssetRoutes(missing, { user_media: true, pexels: true, image_generation: true, hyperframes_native: true }), (error) => error.code === 'missing_material_roles');
  assert.throws(() => planM10AssetRoutes(buildVisualContract(), { user_media: false, pexels: false, image_generation: false, hyperframes_native: false }), (error) => error.code === 'route_capability_gap');
});
