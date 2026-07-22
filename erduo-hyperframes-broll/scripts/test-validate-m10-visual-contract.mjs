import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSrt } from './parse-srt.mjs';
import { validateAndNormalizeShotPlan } from './validate-shot-plan.mjs';
import { M10VisualContractError, validateDirectorSummary, validateFrameFusionAnalysis, validateM10VisualContract } from './validate-m10-visual-contract.mjs';

const sha = (letter) => letter.repeat(64);

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

function frameFusion(overrides = {}) {
  return {
    schema_version: 1,
    srt_sha256: srt.content_sha256,
    frames: [{
      frame_id: 'FRAME-HOOK-001',
      image_sha256: sha('a'),
      width: 1920,
      height: 1080,
      speaker_presence: 'single-speaker',
      speaker_box: { x: 0.08, y: 0.12, width: 0.34, height: 0.78 },
      safe_zones: ['right third has clean negative space', 'top band can carry small labels'],
      lighting: { brightness: 'medium low', contrast: 'soft contrast on face', direction: 'warm key from camera left', risk: 'avoid bright cyan over the skin edge' },
      palette: { dominant_hex: ['#0d1210', '#d8f4e2'], avoid_hex: ['#00ffff'], notes: 'Keep internal references below the user-provided still and references.' },
      background: { complexity: 'moderate', description: 'desk and wall texture create a working-room context', risk: 'dense labels over the wall become noisy' },
      overlay_capability: { rating: 'limited', usable_zones: ['right third', 'upper right'], reason: 'speaker occupies the left side and leaves right-side air' },
      fullscreen_cutaway: { feasibility: 'yes', return_rule: 'Return with a matching warm rim or green-black base so the cutaway does not feel detached.' },
      hard_alpha: { feasibility: 'conditional', edge_risk: 'hair and chair edge need a simple hard matte, not fine-keyed transparency' },
      ...overrides.frame,
    }],
    global_constraints: {
      design_priority: 'user-reference-over-internal-reference-over-still-frame',
      user_reference_policy: 'If the user provides a visual reference, use internal atoms only as vocabulary and conflict checks.',
      notes: 'The still constrains fusion and palette conflicts, not the whole visual style.',
      ...overrides.global_constraints,
    },
  };
}

function directorSummary(overrides = {}) {
  return {
    method_id: 'erduo-director-method-v1',
    absorbed_sections: ['intent-card', 'visual-motif', 'scene-table', 'component-material-plan', 'taste-rationale', 'quality-self-check'],
    adapter_boundaries: {
      time_source: 'srt',
      asset_policy_owner: 'erduo-hyperframes-broll',
      final_delivery_owner: 'erduo-hyperframes-broll',
      director_method_role: 'bundled-directing-authority',
    },
    optional_enhancer: { used: false },
    ...overrides,
  };
}

function shot(id, overrides = {}) {
  const first = id === 'S001';
  return {
    shot_id: id,
    information_intent: {
      narrated_claim: first ? 'A choice changes the system and makes a result visible.' : 'The viewer receives the next action.',
      viewer_should_understand: first ? 'One choice causes a visible before-after shift.' : 'The result resolves into one clear next action.',
      readable_outcome: first ? 'The changed system remains visible for comparison.' : 'The action card holds long enough to read.',
      ...overrides.information_intent,
    },
    visual_grammar: {
      family: first ? 'process' : 'action-close',
      agent_choice_reason: first ? 'A process grammar makes the cause and visible result legible without copying the subtitle.' : 'An action-close grammar turns the resolved idea into a held next step.',
      screen_text: first ? '选择改变' : '下一步',
      ...overrides.visual_grammar,
    },
    compositing: {
      mode: first ? 'fullscreen-broll' : 'speaker-context-return',
      reason: first ? 'The process needs full-screen room, then returns to the speaker context.' : 'The closing step benefits from reconnecting to the speaker still.',
      ...overrides.compositing,
    },
    material_roles: overrides.material_roles ?? [
      {
        role: first ? 'explanatory-media' : 'text-quote',
        route_order: first ? ['image-generation', 'pexels', 'hyperframes-native'] : ['user-media', 'image-generation', 'hyperframes-native'],
        purpose: first ? 'Find or generate a concrete system-change image before native support is considered.' : 'Hold a short extracted action line over the speaker context.',
        fallback_limit: first ? 'Native may only draw arrows and relation marks, not become the entire scene.' : 'Native may support the line but not replace the speaker return decision.',
      },
      {
        role: 'native-support',
        route_order: ['hyperframes-native'],
        purpose: 'Use small relation marks or emphasis lines after the material role is selected.',
        fallback_limit: 'Never stretch native marks into a whole-film default.',
      },
    ],
    component_intent: {
      needed: true,
      description: first ? 'A relation component links the before and after states.' : 'A held card component anchors the action close.',
      native_scope: 'shot-local-support-only',
      ...overrides.component_intent,
    },
    motion: {
      key_action: first ? 'The selected path activates and the result stays brighter than the origin.' : 'The action card settles while the speaker frame remains stable.',
      transition_intent: first ? 'Cut away from the still, then return with a matching palette.' : 'Hold and fade without adding a new abstract background.',
      result_hold: first ? 'Hold the final comparison for the last quarter of the shot.' : 'Hold the next-step line until the shot boundary.',
      ...overrides.motion,
    },
    frame_fusion: {
      mode: first ? 'cutaway-return' : 'context-match',
      frame_ids: ['FRAME-HOOK-001'],
      constraints_used: ['right third has clean negative space', 'avoid bright cyan over the skin edge'],
      decision_reason: first ? 'The cutaway can leave the speaker but must return through the still palette.' : 'The speaker frame supports trust for the final action.',
      ...overrides.frame_fusion,
    },
    reference_use: {
      user_reference_alignment: 'No user reference in this fixture; internal atoms are only vocabulary and conflict checks.',
      internal_atom_candidates: first ? ['scene-logic/process-shift', 'compositing/cutaway-return'] : ['scene-logic/action-close', 'components/held-card'],
      selection_policy: 'Use candidates as inspiration; the agent may discard them when the user reference or content points elsewhere.',
      ...overrides.reference_use,
    },
    quality_notes: {
      not_subtitle_burn: true,
      not_native_default: true,
      not_media_only_pass: true,
      judgment_note: first ? 'The shot explains cause and result through a visual process, not a copied subtitle.' : 'The shot reconnects the conclusion to the speaker still and cannot pass on media decode alone.',
      ...overrides.quality_notes,
    },
  };
}

function contract(overrides = {}) {
  const fusion = validateFrameFusionAnalysis(frameFusion());
  const director = validateDirectorSummary(directorSummary());
  return {
    schema_version: 1,
    plan_sha256: plan.plan_sha256,
    frame_fusion_sha256: fusion.frame_fusion_sha256,
    director_summary_sha256: director.director_summary_sha256,
    shots: [shot('S001'), shot('S002')],
    ...overrides,
  };
}

test('validates frame fusion analysis and visual contracts without forcing a template', () => {
  const fusion = validateFrameFusionAnalysis(frameFusion());
  const director = validateDirectorSummary(directorSummary());
  const result = validateM10VisualContract(plan, fusion, director, contract({ frame_fusion_sha256: fusion.frame_fusion_sha256, director_summary_sha256: director.director_summary_sha256 }));
  assert.equal(result.shot_count, 2);
  assert.equal(result.shots[0].reference_use.selection_policy.includes('inspiration'), true);
  assert.match(result.visual_contract_sha256, /^[0-9a-f]{64}$/u);
});

test('normalization and hashes are deterministic', () => {
  const fusion = validateFrameFusionAnalysis(frameFusion());
  const director = validateDirectorSummary(directorSummary());
  assert.deepEqual(
    validateM10VisualContract(plan, fusion, director, contract({ frame_fusion_sha256: fusion.frame_fusion_sha256, director_summary_sha256: director.director_summary_sha256 })),
    validateM10VisualContract(plan, fusion, director, contract({ frame_fusion_sha256: fusion.frame_fusion_sha256, director_summary_sha256: director.director_summary_sha256 })),
  );
});

test('rejects missing or weak still-frame fusion decisions', () => {
  const fusion = validateFrameFusionAnalysis(frameFusion());
  const director = validateDirectorSummary(directorSummary());
  const missing = contract({ frame_fusion_sha256: fusion.frame_fusion_sha256, director_summary_sha256: director.director_summary_sha256 });
  missing.shots[0].frame_fusion.frame_ids = [];
  assert.throws(() => validateM10VisualContract(plan, fusion, director, missing), (error) => error.code === 'missing_frame_fusion_decision');
  const unknown = contract({ frame_fusion_sha256: fusion.frame_fusion_sha256, director_summary_sha256: director.director_summary_sha256 });
  unknown.shots[0].frame_fusion.frame_ids = ['FRAME-NOPE-001'];
  assert.throws(() => validateM10VisualContract(plan, fusion, director, unknown), (error) => error.code === 'invalid_frame_fusion_decision');
});

test('rejects missing material roles and whole-film native defaults', () => {
  const fusion = validateFrameFusionAnalysis(frameFusion());
  const director = validateDirectorSummary(directorSummary());
  const noRoles = contract({ frame_fusion_sha256: fusion.frame_fusion_sha256, director_summary_sha256: director.director_summary_sha256 });
  noRoles.shots[0].material_roles = [];
  assert.throws(() => validateM10VisualContract(plan, fusion, director, noRoles), (error) => error.code === 'missing_material_roles');
  const native = contract({ frame_fusion_sha256: fusion.frame_fusion_sha256, director_summary_sha256: director.director_summary_sha256 });
  for (const item of native.shots) {
    item.material_roles = [{ role: 'native-support', route_order: ['hyperframes-native'], purpose: 'Generic geometry fills the scene.', fallback_limit: 'No limit.' }];
  }
  assert.throws(() => validateM10VisualContract(plan, fusion, director, native), (error) => error.code === 'native_default');
});

test('rejects copied subtitle cards and forced internal references', () => {
  const fusion = validateFrameFusionAnalysis(frameFusion());
  const director = validateDirectorSummary(directorSummary());
  const copied = contract({ frame_fusion_sha256: fusion.frame_fusion_sha256, director_summary_sha256: director.director_summary_sha256 });
  copied.shots[0].visual_grammar.screen_text = 'A choice changes the system and makes a result visible.';
  assert.throws(() => validateM10VisualContract(plan, fusion, director, copied), (error) => error.code === 'copied_subtitle_card');
  const forced = contract({ frame_fusion_sha256: fusion.frame_fusion_sha256, director_summary_sha256: director.director_summary_sha256 });
  forced.shots[0].reference_use.selection_policy = 'This shot must use the internal atom as a mandatory template.';
  assert.throws(() => validateM10VisualContract(plan, fusion, director, forced), (error) => error.code === 'forced_reference');
});

test('accepts no enhancer and validates enhancer metadata only when used', () => {
  assert.equal(validateDirectorSummary(directorSummary()).optional_enhancer.used, false);
  const withoutEnhancer = directorSummary();
  delete withoutEnhancer.optional_enhancer;
  assert.equal(validateDirectorSummary(withoutEnhancer).optional_enhancer.used, false);
  const used = validateDirectorSummary(directorSummary({ optional_enhancer: { used: true, name: 'licensed-director', version: '1.2.3', license_id: 'MIT', output_sha256: sha('d'), absorbed_sections: ['intent-card'] } }));
  assert.equal(used.optional_enhancer.used, true);
  assert.throws(() => validateDirectorSummary(directorSummary({ optional_enhancer: { used: true, name: 'licensed-director' } })), (error) => error.code === 'invalid_director_summary');
});

test('rejects incomplete director sections and conflicting adapter boundaries', () => {
  assert.throws(() => validateDirectorSummary({ ...directorSummary(), absorbed_sections: ['scene-table'] }), (error) => error.code === 'invalid_director_summary');
  assert.throws(() => validateDirectorSummary({
    ...directorSummary(),
    adapter_boundaries: { ...directorSummary().adapter_boundaries, time_source: 'word-count-estimate' },
  }), (error) => error.code === 'invalid_director_summary');
});

test('rejects media-only quality claims while leaving repetition judgment to content quality gate', () => {
  const fusion = validateFrameFusionAnalysis(frameFusion());
  const director = validateDirectorSummary(directorSummary());
  const mediaOnly = contract({ frame_fusion_sha256: fusion.frame_fusion_sha256, director_summary_sha256: director.director_summary_sha256 });
  mediaOnly.shots[0].quality_notes.not_media_only_pass = false;
  assert.throws(() => validateM10VisualContract(plan, fusion, director, mediaOnly), (error) => error.code === 'invalid_quality_notes');
  const repetitive = contract({ frame_fusion_sha256: fusion.frame_fusion_sha256, director_summary_sha256: director.director_summary_sha256 });
  repetitive.shots[1].visual_grammar.family = 'process';
  assert.equal(validateM10VisualContract(plan, fusion, director, repetitive).shot_count, 2);
});

test('rejects invalid frame analysis shape and wrong design priority', () => {
  assert.throws(() => validateFrameFusionAnalysis(frameFusion({ frame: { speaker_box: { x: 0.9, y: 0.2, width: 0.3, height: 0.4 } } })), (error) => error instanceof M10VisualContractError && error.code === 'invalid_frame_fusion');
  assert.throws(() => validateFrameFusionAnalysis(frameFusion({ global_constraints: { design_priority: 'internal-template-first' } })), (error) => error.code === 'invalid_frame_fusion');
});
