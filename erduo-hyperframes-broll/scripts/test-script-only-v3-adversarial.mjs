import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ScriptOnlyV3ContractError,
  createGateReceipt,
  fingerprintV3Value,
  validateDesignSystem,
  validateV3ShotPlan,
  validateValidationPolicy,
} from './validate-production-contract.mjs';
import { compileProductionContract } from './compile-production-contract.mjs';

const hash = (value) => fingerprintV3Value(value);
const seal = (value, field) => {
  delete value[field];
  value[field] = hash(value);
  return value;
};
const expectCode = (action, code) => assert.throws(
  action,
  (error) => error instanceof ScriptOnlyV3ContractError && error.code === code,
);
const expectOneOfCodes = (action, codes) => assert.throws(
  action,
  (error) => error instanceof ScriptOnlyV3ContractError && codes.includes(error.code),
);

const COMPONENT_IDS = [
  'hero-stat',
  'chapter-card',
  'comparison',
  'pipeline',
  'topology',
  'terminal-form-table',
  'device-metaphor',
  'chart',
  'cta',
  'ordinary-media-frame',
];
const GATES = [
  'policy-gate',
  'source-conformance-gate',
  'runtime-seek-gate',
  'pixel-signal-gate',
  'integration-delivery-gate',
];

function lifecycle(prefix, durationFrames, holdEnd) {
  return {
    entry: {
      start_frame: 0,
      end_frame: 10,
      selectors: [`#${prefix}-input`],
      timeline_calls: [`${prefix}-entry`],
    },
    action: {
      start_frame: 10,
      end_frame: 45,
      selectors: [`#${prefix}-input`, `#${prefix}-rule`],
      timeline_calls: [`${prefix}-action`],
    },
    result: {
      start_frame: 45,
      end_frame: 55,
      selectors: [`#${prefix}-result`],
      timeline_calls: [`${prefix}-result`],
    },
    hold: {
      start_frame: 55,
      end_frame: holdEnd,
      selectors: [`#${prefix}-result`],
      timeline_calls: [`${prefix}-hold`],
    },
    exit: {
      start_frame: holdEnd,
      end_frame: durationFrames,
      selectors: [`#${prefix}-input`, `#${prefix}-rule`, `#${prefix}-result`],
      timeline_calls: [`${prefix}-exit`],
    },
  };
}

function parsedSrtArtifact() {
  return {
    schema_version: 1,
    artifact_kind: 'parsed-srt',
    cues: [
      { cue_id: 'Q001', start_ms: 0, end_ms: 4000, text: '输入经过规则节点后得到可辨识结果。' },
      { cue_id: 'Q002', start_ms: 4000, end_ms: 9000, text: '规则执行后合格率达到九成。' },
    ],
  };
}

function creativeDirective({ nextShotId = null } = {}) {
  return seal({
    primary_visual_decision: '让结果对象承担第一阅读焦点，并把安全区留给功能文字与镜头交接。',
    attention_plan: {
      primary_focus_ref: 'semantic-object:qualified-result',
      reading_order_refs: ['semantic-object:qualified-result'],
      negative_space_region_refs: ['safe-region:title-safe'],
      transition_exit_ref: nextShotId
        ? `next-shot:${nextShotId}` : 'semantic-object:qualified-result',
    },
    modules: [],
  }, 'creative_directive_sha256');
}

function shotPlan(parsedSrt = parsedSrtArtifact()) {
  return seal({
    schema_version: 1,
    pipeline_contract_version: 3,
    parsed_srt_sha256: hash(parsedSrt),
    fps: { numerator: 25, denominator: 1 },
    shots: [
      {
        shot_id: 'S001',
        chapter_id: 'C01',
        shot_kind: 'process',
        start_ms: 0,
        end_ms: 4000,
        duration_ms: 4000,
        semantic_claim: '输入经过规则节点后得到可辨识结果。',
        creative_directive: creativeDirective({ nextShotId: 'S002' }),
        cognitive_action: {
          primary_action_id: 'route-input',
          actions: [{
            action_id: 'route-input',
            verb: 'route',
            actor_object_id: 'lead-packet',
            target_object_ids: ['qualified-result'],
          }],
        },
        visual_structure: '横向三节点因果管线。',
        semantic_objects: [
          { object_id: 'lead-packet', continuity_id: 'lead-packet', semantic_role: 'input', initial_state: 'unqualified', result_state: 'qualified' },
          { object_id: 'rule-engine', continuity_id: 'rule-engine', semantic_role: 'operator', initial_state: 'idle', result_state: 'applied' },
          { object_id: 'qualified-result', continuity_id: 'qualified-result', semantic_role: 'result', initial_state: 'unqualified', result_state: 'qualified' },
        ],
        spatial_relation: {
          relation_id: 'route-left-to-right',
          subject_object_id: 'lead-packet',
          predicate: 'passes-through',
          object_id: 'rule-engine',
          direction: 'left-to-right',
        },
        input_state: { object_id: 'lead-packet', property: 'qualification', value: 'unqualified' },
        operation: {
          action_id: 'route-input',
          actor_object_id: 'lead-packet',
          target_object_ids: ['qualified-result'],
          property: 'qualification',
          from: 'unqualified',
          to: 'qualified',
        },
        result_state: {
          object_id: 'qualified-result',
          property: 'qualification',
          value: 'qualified',
          semantic_carrier_element_id: 's001-result-label',
        },
        readability_class: 'ordinary',
        hold_window: { from_ms: 2200, to_ms: 3400 },
        transition_owner: 'shot',
        callback_of: null,
        payoff_shot_id: 'S002',
        text_roles: ['display', 'body', 'status'],
        text_elements: [
          { element_id: 's001-result-label', selector: '#s001-result', type_role: 'display', semantic_responsibility: 'result', carries_primary_meaning: true },
          { element_id: 's001-input-label', selector: '#s001-input-label', type_role: 'body', semantic_responsibility: 'input', carries_primary_meaning: false },
          { element_id: 's001-rule-label', selector: '#s001-rule-label', type_role: 'status', semantic_responsibility: 'operation', carries_primary_meaning: false },
        ],
        cue_ids: ['Q001'],
        focal_role: 'pipeline-core',
        density_level: 2,
        layout_family: 'pipeline',
        metaphor_id: 'four-stage-axis',
        dominant_axis: 'horizontal',
        primary_primitive: 'nodes-and-line',
        component_id: 'pipeline',
        motion_profile_id: 'causal-flow',
        causal_lifecycle: lifecycle('s001', 100, 85),
        data_points: [],
      },
      {
        shot_id: 'S002',
        chapter_id: 'C01',
        shot_kind: 'data',
        start_ms: 4000,
        end_ms: 9000,
        duration_ms: 5000,
        semantic_claim: '规则执行后合格率达到九成。',
        creative_directive: creativeDirective(),
        cognitive_action: {
          primary_action_id: 'compare-rate',
          actions: [{
            action_id: 'compare-rate',
            verb: 'compare',
            actor_object_id: 'lead-packet',
            target_object_ids: ['qualified-result'],
          }],
        },
        visual_structure: '同口径双状态数据对比。',
        semantic_objects: [
          { object_id: 'lead-packet', continuity_id: 'lead-packet', semantic_role: 'input', initial_state: 'unqualified', result_state: 'qualified' },
          { object_id: 'baseline-rate', continuity_id: 'baseline-rate', semantic_role: 'baseline', initial_state: 'unknown', result_state: 'measured' },
          { object_id: 'qualified-result', continuity_id: 'qualified-result', semantic_role: 'result', initial_state: 'unqualified', result_state: 'qualified' },
        ],
        spatial_relation: {
          relation_id: 'compare-left-to-right',
          subject_object_id: 'baseline-rate',
          predicate: 'precedes',
          object_id: 'qualified-result',
          direction: 'left-to-right',
        },
        input_state: { object_id: 'qualified-result', property: 'qualification', value: 'unqualified' },
        operation: {
          action_id: 'compare-rate',
          actor_object_id: 'lead-packet',
          target_object_ids: ['qualified-result'],
          property: 'qualification',
          from: 'unqualified',
          to: 'qualified',
        },
        result_state: {
          object_id: 'qualified-result',
          property: 'qualification',
          value: 'qualified',
          semantic_carrier_element_id: 's002-result-value',
        },
        readability_class: 'complex',
        hold_window: { from_ms: 6200, to_ms: 8400 },
        transition_owner: 'next-shot',
        callback_of: 'S001',
        payoff_shot_id: null,
        text_roles: ['display', 'data', 'body', 'meta'],
        text_elements: [
          { element_id: 's002-heading', selector: '#s002-heading', type_role: 'display', semantic_responsibility: 'claim', carries_primary_meaning: true },
          { element_id: 's002-result-value', selector: '#s002-result', type_role: 'data', semantic_responsibility: 'result', carries_primary_meaning: true },
          { element_id: 's002-body', selector: '#s002-body', type_role: 'body', semantic_responsibility: 'operation', carries_primary_meaning: false },
          { element_id: 's002-source-label', selector: '#s002-source', type_role: 'meta', semantic_responsibility: 'provenance', carries_primary_meaning: false },
        ],
        cue_ids: ['Q002'],
        focal_role: 'primary-result',
        density_level: 3,
        layout_family: 'comparison',
        metaphor_id: 'before-after-result',
        dominant_axis: 'horizontal',
        primary_primitive: 'paired-values',
        component_id: 'comparison',
        motion_profile_id: 'causal-flow',
        causal_lifecycle: lifecycle('s002', 125, 110),
        data_points: [
          {
            data_id: 'qualified-rate',
            label: '合格率',
            value: 90,
            unit: 'percent',
            denominator: { value: 100, unit: 'leads', basis: '100 sampled leads' },
            formula: { operator: 'percentage', operands: [90, 100], result_unit: 'percent' },
            source_ref: 'fixture-measurement:qualified-leads',
            evidence_role: 'measured',
          },
        ],
      },
    ],
    chapters: [
      {
        chapter_id: 'C01',
        shot_ids: ['S001', 'S002'],
        problem_or_goal: '证明规则节点如何把输入变成可验证结果。',
        mechanism: '输入经过规则节点并使用同口径公式计算。',
        result: '结果镜稳定显示九成合格率和来源。',
        next_chapter_handoff: '把已验证结果交给下一章节继续处理。',
      },
    ],
    chapter_promise_payoff_ledger: [
      {
        promise_id: 'promise-lead-packet',
        promise_chapter_id: 'C01',
        promise_shot_id: 'S001',
        payoff_chapter_id: 'C01',
        payoff_shot_id: 'S002',
        object_id: 'lead-packet',
        direction: 'left-to-right',
        required_state_delta: { property: 'qualification', from: 'unqualified', to: 'qualified' },
      },
    ],
    motif_callback_ledger: [
      {
        callback_id: 'callback-lead-packet',
        motif_id: 'pipeline-result',
        setup_shot_id: 'S001',
        payoff_shot_id: 'S002',
        object_id: 'lead-packet',
        setup_direction: 'left-to-right',
        payoff_direction: 'left-to-right',
        state_delta: { property: 'qualification', from: 'unqualified', to: 'qualified' },
      },
    ],
    emphasis_ledger: [
      {
        shot_id: 'S002',
        emphasis_type: 'data-peak',
        semantic_reason: '九成结论是本章唯一的数据高潮。',
      },
    ],
    density_curve: [
      { shot_id: 'S001', density_level: 2 },
      { shot_id: 'S002', density_level: 3 },
    ],
    layout_and_metaphor_cooldown: [
      {
        from_shot_id: 'S001',
        to_shot_id: 'S002',
        changed_dimensions: ['core-geometry', 'focus-position', 'density'],
      },
    ],
  }, 'shot_plan_sha256');
}

function validationPolicy() {
  return seal({
    schema_version: 1,
    pipeline_contract_version: 3,
    validation_policy_id: 'script-only-production-v1',
    context_budget: {
      block_receipt_max_bytes: 16384,
      stage_envelope_max_bytes: 32768,
      final_summary_max_bytes: 65536,
      inline_source_allowed: false,
      inline_image_allowed: false,
      inline_log_allowed: false,
      contact_sheet_allowed: false,
      subjective_quality_fields_allowed: false,
    },
    profile_policy: {
      project_profile_required: true,
      public_default_profile_id: null,
      forbidden_public_default_profiles: ['deep-current-hud'],
    },
    readable_hold_policy: {
      ordinary_min_frames: 24,
      complex_min_frames: 45,
      complex_classes: ['table', 'chart', 'multi-field', 'data'],
      short_window_action: 'reduce-content-or-motion',
    },
    data_policy: {
      evidence_roles: ['measured', 'reported', 'illustrative'],
      require_unit: true,
      require_denominator: true,
      require_formula: true,
      require_source_ref: true,
    },
    whole_film_budgets: {
      emphasis_max_events: 4,
      density_level_min: 1,
      density_level_max: 5,
      max_same_layout_run: 2,
      max_same_metaphor_run: 2,
      cooldown_min_changed_dimensions: 2,
    },
    runtime_sample_strategy: {
      paths: ['fresh_direct', 'zero_to_t', 'end_to_t', 'repeat_to_t'],
      causal_phases: ['entry', 'action', 'result', 'hold', 'exit'],
      state_hash_required: true,
    },
    pixel_thresholds: {
      near_black_luma_max: 8,
      near_empty_coverage_max_ratio: 0.005,
      text_overflow_tolerance_px: 1,
      primary_roi_min_ratio: 0.01,
    },
    gate_policies: Object.fromEntries(GATES.map((gate) => [gate, {
      hard_failure_codes: [`${gate.replaceAll('-', '_')}_contract_failure`],
      warning_codes: [`${gate.replaceAll('-', '_')}_calibration_warning`],
    }])),
    cache_key_fields: [
      'source_sha256',
      'policy_sha256',
      'production_contract_sha256',
      'renderer_version',
      'hyperframes_version',
      'state_or_frame',
    ],
    tool_bindings: {
      renderer_version: 'fixture-renderer-1.0.0',
      hyperframes_version: '0.7.70',
      policy_version: '1.0.0',
    },
    legacy_policy: {
      accepted_pipeline_contract_version: 3,
      legacy_pipeline_contract_versions: [2],
      mode: 'inspection-only',
      resume_allowed: false,
      resign_allowed: false,
      render_authorization_allowed: false,
      forbidden_active_fields: [
        'shot_plan_review',
        'asset_fact_review',
        'html_preview_review',
        'final_frame_review',
        'style_conformance_review',
        'source_code_review',
        'main_review_refs',
        'visual-review',
        'contact_sheet',
        'inspected_visual_page',
        'trusted_capture',
        'style_integration_authorization',
        'stable_window',
      ],
    },
  }, 'validation_policy_sha256');
}

function referenceStyleProfile() {
  return {
    schema_version: 1,
    profile_id: 'fixture-project-profile',
    project_id: 'fixture-project',
    project_only: true,
    public_default: false,
    status: 'draft',
    parameters: {
      palette_direction: 'project-specific cool neutral',
      typography_direction: 'project-local role hierarchy',
    },
  };
}

function designSystem(profile = referenceStyleProfile()) {
  const typeRoles = [
    ['display', 'functional', true],
    ['body', 'functional', true],
    ['status', 'functional', true],
    ['data', 'functional', true],
    ['meta', 'functional', false],
    ['microtext-texture', 'texture', false],
  ].map(([role, semanticClass, mayCarryPrimaryMeaning]) => ({
    role,
    semantic_class: semanticClass,
    may_carry_primary_meaning: mayCarryPrimaryMeaning,
    min_height_ratio: role === 'display' ? 0.04 : role === 'microtext-texture' ? 0.004 : 0.01,
    font_role_id: `${role}-font`,
  }));
  return seal({
    schema_version: 1,
    design_system_id: 'fixture-design-system-v1',
    reference_style_profile: {
      profile_id: profile.profile_id,
      profile_sha256: hash(profile),
      ...(profile.project_id === undefined ? {} : { project_id: profile.project_id }),
      project_only: true,
      public_default: false,
      status: profile.status,
    },
    palette_roles: [
      { role: 'background', token: 'color.background', value: '#101828' },
      { role: 'foreground', token: 'color.foreground', value: '#F8FAFC' },
      { role: 'accent', token: 'color.accent', value: '#38BDF8' },
    ],
    type_roles: typeRoles,
    safe_regions: [
      { region_id: 'title-safe', x: 0.08, y: 0.08, width: 0.84, height: 0.84 },
    ],
    spacing_tokens: [
      { token: 'space-1', value_px: 16 },
      { token: 'space-2', value_px: 32 },
    ],
    radius_tokens: [{ token: 'radius-card', value_px: 24 }],
    material_recipes: [
      {
        recipe_id: 'surface-primary',
        description: 'Use one project-bound surface without implying a universal glass style.',
      },
    ],
    z_bands: [
      { band_id: 'background', min: 0, max: 99 },
      { band_id: 'content', min: 100, max: 499 },
      { band_id: 'annotation', min: 500, max: 799 },
    ],
    component_roles: COMPONENT_IDS.map((componentId) => ({
      component_id: componentId,
      role: `${componentId} semantic role`,
    })),
    motion_profiles: [
      {
        motion_profile_id: 'causal-flow',
        entry_frames: 10,
        action_frames_min: 20,
        finite_repeat_only: true,
        paused_timeline_required: true,
      },
    ],
    identity_invariants: [
      'Keep one first-read focal role per visible beat.',
      'Keep functional typography distinct from texture microtext.',
    ],
    anti_identity_rules: [
      'Do not repeat the same core geometry with copy-only swaps.',
      'Do not use ambient motion as the only semantic action.',
    ],
    prohibited_motifs: ['unregistered-template-skin'],
    whole_film_budget_refs: [
      'emphasis_budget',
      'density_curve',
      'layout_and_metaphor_cooldown',
    ],
  }, 'design_system_sha256');
}

function componentRegistry() {
  return seal({
    schema_version: 1,
    registry_id: 'fixture-component-registry-v1',
    components: COMPONENT_IDS.map((componentId) => ({
      component_id: componentId,
      semantic_roles: [`${componentId} primary semantic role`],
      allowed_type_roles: ['display', 'body', 'status', 'data', 'meta'],
      layout_contract: {
        layout_families: componentId === 'pipeline'
          ? ['pipeline'] : componentId === 'comparison' ? ['comparison'] : ['semantic-layout'],
        focal_roles: componentId === 'pipeline' ? ['pipeline-core'] : ['primary-result'],
        dominant_axes: ['horizontal', 'vertical'],
      },
      motion_profile_ids: ['causal-flow'],
      z_band_ids: ['content', 'annotation'],
      stable_result_assertions: ['primary-result-visible', 'functional-text-readable'],
      status_color_roles: ['foreground', 'accent'],
      allows_overshoot: false,
      allows_stroke_animation: componentId === 'topology',
      allows_overflow: false,
    })),
  }, 'component_registry_sha256');
}

const opaqueArtifact = (kind) => ({
  schema_version: 1,
  artifact_kind: kind,
  content: `${kind} actual fixture bytes`,
});

function canonicalInputs() {
  const profile = referenceStyleProfile();
  const parsedSrt = parsedSrtArtifact();
  const plan = shotPlan(parsedSrt);
  return {
    parsedSrt,
    shotPlan: plan,
    designSystem: designSystem(profile),
    componentRegistry: componentRegistry(),
    validationPolicy: validationPolicy(),
    referenceStyleProfile: profile,
    fontPackage: opaqueArtifact('font-package'),
    projection: {
      schema_version: 1,
      pipeline_contract_version: 3,
      artifact_kind: 'frame-projection',
      parsed_srt_sha256: hash(parsedSrt),
      shot_plan_sha256: plan.shot_plan_sha256,
      fps: { numerator: 25, denominator: 1 },
      shots: [
        {
          shot_id: 'S001',
          cue_ids: ['Q001'],
          srt_window_ms: { start_ms: 0, end_ms: 4000 },
          frame_window: { start_frame: 0, end_frame: 100, duration_frames: 100 },
        },
        {
          shot_id: 'S002',
          cue_ids: ['Q002'],
          srt_window_ms: { start_ms: 4000, end_ms: 9000 },
          frame_window: { start_frame: 100, end_frame: 225, duration_frames: 125 },
        },
      ],
    },
    deliveryProfile: opaqueArtifact('delivery-profile'),
  };
}

function directorAndPolicy() {
  const inputs = canonicalInputs();
  return {
    inputs,
    director: compileProductionContract({ contract_phase: 'director', ...inputs }),
  };
}

function directorReceiptBindings(contract) {
  return Object.fromEntries([
    'production_contract_sha256',
    'parsed_srt_sha256',
    'shot_plan_sha256',
    'design_system_sha256',
    'component_registry_sha256',
    'validation_policy_sha256',
    'reference_style_profile_sha256',
    'font_package_sha256',
    'projection_sha256',
    'delivery_profile_sha256',
  ].map((field) => [field, contract[field]]));
}

function passReceipt(metrics, warningCodes = []) {
  const { inputs, director } = directorAndPolicy();
  return () => createGateReceipt({
    gate: 'policy-gate',
    phase: 'director',
    scope_id: 'production',
    productionContract: director,
    input_bindings: directorReceiptBindings(director),
    status: 'passed',
    hard_failure_codes: [],
    warning_codes: warningCodes,
    metrics,
    cache: {
      status: 'miss',
      cache_key_sha256: hash({ gate: 'policy-gate', phase: 'director' }),
    },
    validationPolicy: inputs.validationPolicy,
  });
}

test('PASS receipt rejects ReachSurge gold verdicts', () => {
  expectCode(
    passReceipt({ reachsurge_gold_passed: true }),
    'calibration_receipt_forbidden',
  );
});

test('PASS receipt rejects positive-calibration verdicts', () => {
  expectOneOfCodes(
    passReceipt({ positive_calibration_verdict: 'passed' }),
    ['calibration_receipt_forbidden', 'subjective_quality_field_forbidden'],
  );
});

test('PASS receipt rejects private calibration paths', () => {
  expectOneOfCodes(
    passReceipt({
      private_calibration_path: '/Users/junwei001q/Downloads/reachsurge-broll-0704',
    }),
    ['private_path_forbidden', 'private_evidence_forbidden'],
  );
});

test('structured semantic-chain API accepts exactly one primary cognitive action', () => {
  const plan = shotPlan();
  const shot = plan.shots[0];
  shot.cognitive_action = {
    primary_action_id: 'route-input',
    actions: [
      {
        action_id: 'route-input',
        verb: 'route',
        actor_object_id: 'lead-packet',
        target_object_ids: ['qualified-result'],
      },
    ],
  };
  shot.semantic_objects = [
    {
      object_id: 'lead-packet',
      continuity_id: 'lead-packet',
      semantic_role: 'input',
      initial_state: 'unqualified',
      result_state: 'qualified',
    },
    {
      object_id: 'rule-engine',
      continuity_id: 'rule-engine',
      semantic_role: 'operator',
      initial_state: 'idle',
      result_state: 'applied',
    },
    {
      object_id: 'qualified-result',
      continuity_id: 'qualified-result',
      semantic_role: 'result',
      initial_state: 'unqualified',
      result_state: 'qualified',
    },
  ];
  shot.operation = {
    action_id: 'route-input',
    actor_object_id: 'lead-packet',
    target_object_ids: ['qualified-result'],
    property: 'qualification',
    from: 'unqualified',
    to: 'qualified',
  };
  shot.input_state = { object_id: 'qualified-result', property: 'qualification', value: 'unqualified' };
  shot.result_state = {
    object_id: 'qualified-result',
    property: 'qualification',
    value: 'qualified',
    semantic_carrier_element_id: 's001-result-label',
  };
  shot.spatial_relation = {
    relation_id: 'input-before-rule',
    subject_object_id: 'lead-packet',
    predicate: 'precedes',
    object_id: 'rule-engine',
    direction: 'left-to-right',
  };
  seal(plan, 'shot_plan_sha256');
  assert.doesNotThrow(() => validateV3ShotPlan(plan, validationPolicy()));
});

test('structured semantic-chain API rejects more than one cognitive action', () => {
  const plan = shotPlan();
  plan.shots[0].cognitive_action = {
    primary_action_id: 'route-input',
    actions: [
      {
        action_id: 'route-input',
        verb: 'route',
        actor_object_id: 'lead-packet',
        target_object_ids: ['rule-engine'],
      },
      {
        action_id: 'summarize-result',
        verb: 'summarize',
        actor_object_id: 'rule-engine',
        target_object_ids: ['qualified-result'],
      },
    ],
  };
  seal(plan, 'shot_plan_sha256');
  expectCode(
    () => validateV3ShotPlan(plan, validationPolicy()),
    'cognitive_action_cardinality_invalid',
  );
});

test('process shots reject title-plus-ambient prose without a semantic state change', () => {
  const plan = shotPlan();
  Object.assign(plan.shots[0], {
    semantic_claim: '标题出现并保持可见。',
    cognitive_action: {
      primary_action_id: 'show-title',
      actions: [{
        action_id: 'show-title',
        verb: 'show',
        actor_object_id: 'title',
        target_object_ids: ['ambient-particles'],
      }],
    },
    visual_structure: '标题位于中央，装饰粒子位于背景。',
    semantic_objects: [
      { object_id: 'title', continuity_id: 'title', semantic_role: 'title', initial_state: 'hidden', result_state: 'visible' },
      { object_id: 'ambient-particles', continuity_id: 'ambient-particles', semantic_role: 'decoration', initial_state: 'hidden', result_state: 'visible' },
    ],
    spatial_relation: {
      relation_id: 'title-over-particles',
      subject_object_id: 'title',
      predicate: 'in-front-of',
      object_id: 'ambient-particles',
      direction: 'front-to-back',
    },
    input_state: { object_id: 'ambient-particles', property: 'opacity', value: 'hidden' },
    operation: {
      action_id: 'show-title',
      actor_object_id: 'title',
      target_object_ids: ['ambient-particles'],
      property: 'opacity',
      from: 'hidden',
      to: 'visible',
    },
    result_state: {
      object_id: 'ambient-particles',
      property: 'opacity',
      value: 'visible',
      semantic_carrier_element_id: 's001-result-label',
    },
  });
  seal(plan, 'shot_plan_sha256');
  expectCode(
    () => validateV3ShotPlan(plan, validationPolicy()),
    'process_semantic_chain_invalid',
  );
});

test('numeric value must agree with denominator and formula', () => {
  const plan = shotPlan();
  Object.assign(plan.shots[1].data_points[0], {
    value: 500,
    denominator: { value: 200, unit: 'accounts', basis: '50 accounts x 4 cohorts' },
    formula: { operator: 'multiply', operands: [50, 4], result_unit: 'percent' },
  });
  seal(plan, 'shot_plan_sha256');
  expectCode(
    () => validateV3ShotPlan(plan, validationPolicy()),
    'data_formula_mismatch',
  );
});

test('data and multi-field shots cannot self-downgrade below the 45-frame hold', () => {
  const plan = shotPlan();
  const shot = plan.shots[1];
  shot.readability_class = 'ordinary';
  shot.data_points.push({
    data_id: 'qualified-count',
    label: '合格数量',
    value: 90,
    unit: 'leads',
    denominator: { value: 100, unit: 'leads', basis: '100 sampled leads' },
    formula: { operator: 'multiply', operands: [100, 0.9], result_unit: 'leads' },
    source_ref: 'fixture-measurement:qualified-count',
    evidence_role: 'measured',
  });
  shot.causal_lifecycle.hold.end_frame = 84;
  shot.causal_lifecycle.exit.start_frame = 84;
  shot.hold_window.to_ms = 7360;
  seal(plan, 'shot_plan_sha256');
  expectCode(
    () => validateV3ShotPlan(plan, validationPolicy()),
    'readable_hold_insufficient',
  );
});

test('same-layout and same-metaphor runs obey their policy maxima', () => {
  const plan = shotPlan();
  const policy = validationPolicy();
  policy.whole_film_budgets.max_same_layout_run = 1;
  policy.whole_film_budgets.max_same_metaphor_run = 1;
  plan.shots[1].layout_family = plan.shots[0].layout_family;
  plan.shots[1].metaphor_id = plan.shots[0].metaphor_id;
  seal(plan, 'shot_plan_sha256');
  seal(policy, 'validation_policy_sha256');
  expectCode(
    () => validateV3ShotPlan(plan, policy),
    'cooldown_budget_invalid',
  );
});

test('changed_dimensions claims must match actual adjacent-shot changes', () => {
  const plan = shotPlan();
  Object.assign(plan.shots[1], {
    layout_family: plan.shots[0].layout_family,
    metaphor_id: plan.shots[0].metaphor_id,
    dominant_axis: plan.shots[0].dominant_axis,
    primary_primitive: plan.shots[0].primary_primitive,
    focal_role: plan.shots[0].focal_role,
    density_level: plan.shots[0].density_level,
    component_id: plan.shots[0].component_id,
    motion_profile_id: plan.shots[0].motion_profile_id,
  });
  plan.density_curve[1].density_level = plan.shots[1].density_level;
  plan.layout_and_metaphor_cooldown[0].changed_dimensions = [
    'core-geometry',
    'focus-position',
  ];
  seal(plan, 'shot_plan_sha256');
  expectCode(
    () => validateV3ShotPlan(plan, validationPolicy()),
    'cooldown_claim_mismatch',
  );
});

test('production contract binds the actual projection fps, SRT hash and shot windows', () => {
  const inputs = canonicalInputs();
  inputs.projection = {
    schema_version: 1,
    pipeline_contract_version: 3,
    artifact_kind: 'frame-projection',
    parsed_srt_sha256: hash({ fixture: 'different-srt' }),
    shot_plan_sha256: inputs.shotPlan.shot_plan_sha256,
    fps: { numerator: 60, denominator: 1 },
    shots: [
      {
        shot_id: 'S001',
        cue_ids: ['Q001'],
        srt_window_ms: { start_ms: 0, end_ms: 3900 },
        frame_window: { start_frame: 0, end_frame: 234, duration_frames: 234 },
      },
      {
        shot_id: 'S002',
        cue_ids: ['Q002'],
        srt_window_ms: { start_ms: 3900, end_ms: 9000 },
        frame_window: { start_frame: 234, end_frame: 540, duration_frames: 306 },
      },
    ],
  };
  expectCode(
    () => compileProductionContract({ contract_phase: 'director', ...inputs }),
    'projection_binding_mismatch',
  );
});

test('per-text semantic carriers reject microtext as the only result carrier', () => {
  const plan = shotPlan();
  plan.shots[1].text_elements = [
    {
      element_id: 'decorative-body-label',
      selector: '#s002-body-label',
      type_role: 'body',
      semantic_responsibility: 'decoration',
      carries_primary_meaning: false,
    },
    {
      element_id: 'result-microtext',
      selector: '#s002-result-microtext',
      type_role: 'microtext-texture',
      semantic_responsibility: 'result',
      carries_primary_meaning: true,
    },
  ];
  plan.shots[1].text_roles = ['body', 'microtext-texture'];
  plan.shots[1].result_state.semantic_carrier_element_id = 'result-microtext';
  seal(plan, 'shot_plan_sha256');
  expectCode(
    () => validateV3ShotPlan(plan, validationPolicy()),
    'microtext_semantic_role_forbidden',
  );
});

test('actual reference profile must carry a project identity', () => {
  const profile = referenceStyleProfile();
  delete profile.project_id;
  const design = designSystem(profile);
  expectCode(
    () => validateDesignSystem(design, { referenceStyleProfile: profile }),
    'reference_style_profile_scope_invalid',
  );
});

function crossChapterPlan() {
  const plan = shotPlan();
  plan.shots[1].chapter_id = 'C02';
  plan.chapters = [
    {
      chapter_id: 'C01',
      shot_ids: ['S001'],
      problem_or_goal: '建立待验证对象和方向承诺。',
      mechanism: '对象沿左至右方向进入规则节点。',
      result: '承诺对象进入下一章继续验证。',
      next_chapter_handoff: '把 lead-packet 交给 C02 完成状态增量。',
    },
    {
      chapter_id: 'C02',
      shot_ids: ['S002'],
      problem_or_goal: '兑现上一章的对象状态承诺。',
      mechanism: '沿同一方向计算并验证对象。',
      result: 'lead-packet 从 unqualified 变为 qualified。',
      next_chapter_handoff: '把已验证对象交给后续章节。',
    },
  ];
  plan.chapter_promise_payoff_ledger = [
    {
      promise_id: 'promise-lead-packet',
      promise_chapter_id: 'C01',
      promise_shot_id: 'S001',
      payoff_chapter_id: 'C02',
      payoff_shot_id: 'S002',
      object_id: 'lead-packet',
      direction: 'left-to-right',
      required_state_delta: { property: 'qualification', from: 'unqualified', to: 'qualified' },
    },
  ];
  plan.motif_callback_ledger = [
    {
      callback_id: 'callback-lead-packet',
      motif_id: 'pipeline-result',
      setup_shot_id: 'S001',
      payoff_shot_id: 'S002',
      object_id: 'lead-packet',
      setup_direction: 'left-to-right',
      payoff_direction: 'left-to-right',
      state_delta: { property: 'qualification', from: 'unqualified', to: 'qualified' },
    },
  ];
  seal(plan, 'shot_plan_sha256');
  return plan;
}

test('cross-chapter promise/payoff API binds object identity, direction and state delta', () => {
  assert.doesNotThrow(
    () => validateV3ShotPlan(crossChapterPlan(), validationPolicy()),
  );
});

test('cross-chapter callbacks reject an identity or direction discontinuity', () => {
  const plan = crossChapterPlan();
  plan.motif_callback_ledger[0].object_id = 'different-object';
  plan.motif_callback_ledger[0].payoff_direction = 'right-to-left';
  seal(plan, 'shot_plan_sha256');
  expectCode(
    () => validateV3ShotPlan(plan, validationPolicy()),
    'callback_continuity_invalid',
  );
});

test('selectors and timeline call IDs must be unique across shots', () => {
  const plan = shotPlan();
  for (const phase of ['entry', 'action', 'result', 'hold', 'exit']) {
    plan.shots[1].causal_lifecycle[phase].selectors = [
      ...plan.shots[0].causal_lifecycle[phase].selectors,
    ];
    plan.shots[1].causal_lifecycle[phase].timeline_calls = [
      ...plan.shots[0].causal_lifecycle[phase].timeline_calls,
    ];
  }
  seal(plan, 'shot_plan_sha256');
  expectCode(
    () => validateV3ShotPlan(plan, validationPolicy()),
    'causal_binding_conflict',
  );
});

test('gate receipt codes must belong to the selected gate policy registry', () => {
  expectCode(
    passReceipt({ checked_item_count: 2 }, ['invented_policy_warning']),
    'gate_receipt_warning_codes_invalid',
  );
});

test('runtime policy validation enforces representative JSON Schema ratio maxima', () => {
  const policy = validationPolicy();
  policy.pixel_thresholds.primary_roi_min_ratio = 2;
  seal(policy, 'validation_policy_sha256');
  expectCode(
    () => validateValidationPolicy(policy),
    'validation_policy_invalid',
  );
});

function receiptWith({
  metrics = { checked_item_count: 2 },
  warningCodes = [],
  extraBindings = {},
  mutatePolicy = () => {},
} = {}) {
  const inputs = canonicalInputs();
  mutatePolicy(inputs.validationPolicy);
  seal(inputs.validationPolicy, 'validation_policy_sha256');
  const director = compileProductionContract({ contract_phase: 'director', ...inputs });
  return () => createGateReceipt({
    gate: 'policy-gate',
    phase: 'director',
    scope_id: 'production',
    productionContract: director,
    input_bindings: { ...directorReceiptBindings(director), ...extraBindings },
    status: 'passed',
    hard_failure_codes: [],
    warning_codes: warningCodes,
    metrics,
    cache: {
      status: 'miss',
      cache_key_sha256: hash({ metrics, warningCodes, extraBindings }),
    },
    validationPolicy: inputs.validationPolicy,
  });
}

function assertAllRejected(cases, expectedCode) {
  const accepted = [];
  const wrongCodes = [];
  for (const [name, action] of cases) {
    try {
      action();
      accepted.push(name);
    } catch (error) {
      if (!(error instanceof ScriptOnlyV3ContractError) || error.code !== expectedCode) {
        wrongCodes.push([name, error?.code ?? error?.name ?? 'unknown']);
      }
    }
  }
  assert.deepEqual(
    { accepted, wrongCodes },
    { accepted: [], wrongCodes: [] },
  );
}

test('PASS receipt rejects ReachSurge gold hidden in an ordinary scalar value', () => {
  expectOneOfCodes(
    receiptWith({ metrics: { benchmark_status: 'ReachSurge gold passed' } }),
    ['calibration_receipt_forbidden', 'subjective_quality_field_forbidden'],
  );
});

test('PASS receipt rejects positive-reference conclusions even when the code is policy-registered', () => {
  const code = 'positive_reference_passed';
  expectCode(
    receiptWith({
      warningCodes: [code],
      mutatePolicy: (policy) => {
        policy.gate_policies['policy-gate'].warning_codes.push(code);
      },
    }),
    'calibration_receipt_forbidden',
  );
});

test('PASS receipt rejects ReachSurge calibration hashes in input bindings', () => {
  expectCode(
    receiptWith({
      extraBindings: {
        reachsurge_calibration_sha256: hash({ source: 'private-positive-calibration' }),
      },
    }),
    'calibration_receipt_forbidden',
  );
});

test('every structured formula operator binds the declared denominator', () => {
  const cases = [
    ['literal', [7], 7],
    ['add', [2, 3], 5],
    ['subtract', [5, 2], 3],
    ['multiply', [3, 4], 12],
    ['divide', [10, 2], 5],
    ['percentage', [90, 100], 90],
  ].map(([operator, operands, result]) => [operator, () => {
    const plan = shotPlan();
    Object.assign(plan.shots[1].data_points[0], {
      value: result,
      denominator: { value: 999, unit: 'leads', basis: 'unrelated denominator' },
      formula: { operator, operands, result_unit: 'percent' },
    });
    seal(plan, 'shot_plan_sha256');
    validateV3ShotPlan(plan, validationPolicy());
  }]);
  assertAllRejected(cases, 'data_formula_mismatch');
});

test('formula denominator unit cannot contradict the declared denominator basis', () => {
  const plan = shotPlan();
  plan.shots[1].data_points[0].denominator = {
    value: 100,
    unit: 'seconds',
    basis: '100 sampled leads',
  };
  seal(plan, 'shot_plan_sha256');
  expectCode(
    () => validateV3ShotPlan(plan, validationPolicy()),
    'data_formula_mismatch',
  );
});

test('explicit complex readability always requires at least 45 hold frames', () => {
  const plan = shotPlan();
  const shot = plan.shots[0];
  shot.readability_class = 'complex';
  shot.causal_lifecycle.hold.end_frame = 79;
  shot.causal_lifecycle.exit.start_frame = 79;
  shot.hold_window.to_ms = 3160;
  seal(plan, 'shot_plan_sha256');
  expectCode(
    () => validateV3ShotPlan(plan, validationPolicy()),
    'readable_hold_insufficient',
  );
});

function fractionalBoundaryInputs() {
  const inputs = canonicalInputs();
  const plan = inputs.shotPlan;
  inputs.parsedSrt.cues[0].end_ms = 2401;
  inputs.parsedSrt.cues[1].start_ms = 2401;
  inputs.parsedSrt.cues[1].end_ms = 4820;
  plan.parsed_srt_sha256 = hash(inputs.parsedSrt);
  Object.assign(plan.shots[0], {
    start_ms: 0,
    end_ms: 2401,
    duration_ms: 2401,
    hold_window: { from_ms: 1000, to_ms: 1960 },
    causal_lifecycle: {
      entry: { start_frame: 0, end_frame: 5, selectors: ['#s001-input'], timeline_calls: ['s001-entry'] },
      action: { start_frame: 5, end_frame: 20, selectors: ['#s001-input', '#s001-rule'], timeline_calls: ['s001-action'] },
      result: { start_frame: 20, end_frame: 25, selectors: ['#s001-result'], timeline_calls: ['s001-result'] },
      hold: { start_frame: 25, end_frame: 49, selectors: ['#s001-result'], timeline_calls: ['s001-hold'] },
      exit: { start_frame: 49, end_frame: 60, selectors: ['#s001-input', '#s001-rule', '#s001-result'], timeline_calls: ['s001-exit'] },
    },
  });
  Object.assign(plan.shots[1], {
    start_ms: 2401,
    end_ms: 4820,
    duration_ms: 2419,
    hold_window: { from_ms: 2801, to_ms: 4601 },
    causal_lifecycle: {
      entry: { start_frame: 0, end_frame: 3, selectors: ['#s002-input'], timeline_calls: ['s002-entry'] },
      action: { start_frame: 3, end_frame: 7, selectors: ['#s002-input', '#s002-rule'], timeline_calls: ['s002-action'] },
      result: { start_frame: 7, end_frame: 10, selectors: ['#s002-result'], timeline_calls: ['s002-result'] },
      hold: { start_frame: 10, end_frame: 55, selectors: ['#s002-result'], timeline_calls: ['s002-hold'] },
      exit: { start_frame: 55, end_frame: 60, selectors: ['#s002-input', '#s002-rule', '#s002-result'], timeline_calls: ['s002-exit'] },
    },
  });
  seal(plan, 'shot_plan_sha256');
  Object.assign(inputs.projection, {
    parsed_srt_sha256: hash(inputs.parsedSrt),
    shot_plan_sha256: plan.shot_plan_sha256,
    shots: [
      {
        shot_id: 'S001',
        cue_ids: ['Q001'],
        srt_window_ms: { start_ms: 0, end_ms: 2401 },
        frame_window: { start_frame: 0, end_frame: 60, duration_frames: 60 },
      },
      {
        shot_id: 'S002',
        cue_ids: ['Q002'],
        srt_window_ms: { start_ms: 2401, end_ms: 4820 },
        frame_window: { start_frame: 60, end_frame: 121, duration_frames: 61 },
      },
    ],
  });
  return inputs;
}

test('shot lifecycle frame count equals its actual global projection frame count', () => {
  expectCode(
    () => compileProductionContract({
      contract_phase: 'director',
      ...fractionalBoundaryInputs(),
    }),
    'projection_binding_mismatch',
  );
});

test('canonical data source_ref rejects private local paths and file URLs', () => {
  const paths = [
    '/Users/example/private/reachsurge/source.json',
    '/home/example/private/source.json',
    '/private/var/folders/zz/source.json',
    'C:\\Users\\example\\private\\source.json',
    'file:///Users/example/private/source.json',
  ];
  assertAllRejected(paths.map((sourceRef) => [sourceRef, () => {
    const plan = shotPlan();
    plan.shots[1].data_points[0].source_ref = sourceRef;
    seal(plan, 'shot_plan_sha256');
    validateV3ShotPlan(plan, validationPolicy());
  }]), 'private_path_forbidden');
});

test('cognitive action actor and target IDs exactly bind the operation actor and targets', () => {
  const actorMismatch = () => {
    const plan = shotPlan();
    plan.shots[0].cognitive_action.actions[0].target_object_ids = ['qualified-result'];
    plan.shots[0].operation.actor_object_id = 'rule-engine';
    seal(plan, 'shot_plan_sha256');
    validateV3ShotPlan(plan, validationPolicy());
  };
  const targetMismatch = () => {
    const plan = shotPlan();
    plan.shots[0].cognitive_action.actions[0].target_object_ids = ['qualified-result'];
    plan.shots[0].operation.target_object_ids = ['rule-engine', 'qualified-result'];
    seal(plan, 'shot_plan_sha256');
    validateV3ShotPlan(plan, validationPolicy());
  };
  assertAllRejected([
    ['actor-mismatch', actorMismatch],
    ['target-mismatch', targetMismatch],
  ], 'semantic_evidence_chain_incomplete');
});

test('process shots reject opacity, alpha, visibility and display aliases or prefixes', () => {
  const properties = [
    'opacity-level',
    'alpha_value',
    'visibility-state',
    'visible-flag',
    'display-mode',
  ];
  assertAllRejected(properties.map((property) => [property, () => {
    const plan = shotPlan();
    const shot = plan.shots[0];
    shot.input_state.property = property;
    shot.operation.property = property;
    shot.result_state.property = property;
    seal(plan, 'shot_plan_sha256');
    validateV3ShotPlan(plan, validationPolicy());
  }]), 'process_semantic_chain_invalid');
});

test('result semantic carrier selector participates in both Result and Hold lifecycle phases', () => {
  const plan = shotPlan();
  const shot = plan.shots[0];
  const carrier = shot.text_elements.find(
    (element) => element.element_id === shot.result_state.semantic_carrier_element_id,
  );
  carrier.selector = '#s001-unbound-result-carrier';
  seal(plan, 'shot_plan_sha256');
  expectCode(
    () => validateV3ShotPlan(plan, validationPolicy()),
    'semantic_carrier_lifecycle_unbound',
  );
});

test('promise and callback state-delta property binds setup and payoff shot operations', () => {
  const plan = shotPlan();
  plan.chapter_promise_payoff_ledger[0].required_state_delta.property = 'unrelated-property';
  plan.motif_callback_ledger[0].state_delta.property = 'unrelated-property';
  seal(plan, 'shot_plan_sha256');
  expectCode(
    () => validateV3ShotPlan(plan, validationPolicy()),
    'callback_continuity_invalid',
  );
});

test('Deep Current parameters reject scope, default and publication-status reserved keys', () => {
  const reserved = [
    ['project_id', 'other-project'],
    ['project_only', false],
    ['public_default', true],
    ['default_profile_id', 'deep-current-hud'],
    ['status', 'published'],
  ];
  assertAllRejected(reserved.map(([key, value]) => [key, () => {
    const profile = referenceStyleProfile();
    profile.profile_id = 'deep-current-hud';
    profile.parameters[key] = value;
    const design = designSystem(profile);
    validateDesignSystem(design, { referenceStyleProfile: profile });
  }]), 'reference_style_profile_scope_invalid');
});

function rebindActualSrt(inputs) {
  inputs.shotPlan.parsed_srt_sha256 = hash(inputs.parsedSrt);
  seal(inputs.shotPlan, 'shot_plan_sha256');
  inputs.projection.parsed_srt_sha256 = hash(inputs.parsedSrt);
  inputs.projection.shot_plan_sha256 = inputs.shotPlan.shot_plan_sha256;
  return inputs;
}

test('actual parsed-SRT first and last boundaries exactly equal the shot-plan timeline', () => {
  assertAllRejected([
    ['first-cue-start', () => {
      const inputs = canonicalInputs();
      inputs.parsedSrt.cues[0].start_ms = 100;
      compileProductionContract({
        contract_phase: 'director',
        ...rebindActualSrt(inputs),
      });
    }],
    ['last-cue-end', () => {
      const inputs = canonicalInputs();
      inputs.parsedSrt.cues.at(-1).end_ms = 8900;
      compileProductionContract({
        contract_phase: 'director',
        ...rebindActualSrt(inputs),
      });
    }],
  ], 'parsed_srt_window_mismatch');
});

function sealedProduction() {
  const inputs = canonicalInputs();
  const director = compileProductionContract({ contract_phase: 'director', ...inputs });
  const assetManifest = opaqueArtifact('asset-manifest');
  const sealed = compileProductionContract({
    contract_phase: 'sealed',
    ...inputs,
    priorContract: director,
    assetManifest,
  });
  return { inputs, sealed };
}

test('integration and delivery receipts require phase-specific hash bindings', () => {
  const cases = ['integration', 'delivery'].map((phase) => [phase, () => {
    const { inputs, sealed } = sealedProduction();
    createGateReceipt({
      gate: 'integration-delivery-gate',
      phase,
      scope_id: 'production',
      productionContract: sealed,
      input_bindings: {
        production_contract_sha256: sealed.production_contract_sha256,
      },
      status: 'passed',
      hard_failure_codes: [],
      warning_codes: [],
      metrics: { checked_item_count: 2 },
      cache: {
        status: 'miss',
        cache_key_sha256: hash({ phase }),
      },
      validationPolicy: inputs.validationPolicy,
    });
  }]);
  assertAllRejected(cases, 'gate_receipt_binding_invalid');
});

test('runtime design validation preserves the numeric-token schema maximum', () => {
  const profile = referenceStyleProfile();
  const design = designSystem(profile);
  design.spacing_tokens[0].value_px = 10001;
  seal(design, 'design_system_sha256');
  expectCode(
    () => validateDesignSystem(design, { referenceStyleProfile: profile }),
    'design_system_invalid',
  );
});

test('runtime policy validation freezes the registered complex readability classes', () => {
  const policy = validationPolicy();
  policy.readable_hold_policy.complex_classes = ['unregistered-complex-class'];
  seal(policy, 'validation_policy_sha256');
  expectCode(
    () => validateValidationPolicy(policy),
    'validation_policy_invalid',
  );
});

test('data_points null returns a stable contract error instead of a native TypeError', () => {
  const plan = shotPlan();
  plan.shots[0].data_points = null;
  seal(plan, 'shot_plan_sha256');
  expectCode(
    () => validateV3ShotPlan(plan, validationPolicy()),
    'data_provenance_invalid',
  );
});

const DIRECTOR_LINEAGE_BINDINGS = [
  'production_contract_sha256',
  'parsed_srt_sha256',
  'shot_plan_sha256',
  'design_system_sha256',
  'component_registry_sha256',
  'validation_policy_sha256',
  'reference_style_profile_sha256',
  'font_package_sha256',
  'projection_sha256',
  'delivery_profile_sha256',
];

function frozenReceiptLineageCases() {
  const inputs = canonicalInputs();
  const director = compileProductionContract({ contract_phase: 'director', ...inputs });
  const assetManifest = opaqueArtifact('asset-manifest');
  const sealed = compileProductionContract({
    contract_phase: 'sealed',
    ...inputs,
    priorContract: director,
    assetManifest,
  });
  const sealedPolicyFields = [
    ...DIRECTOR_LINEAGE_BINDINGS,
    'prior_contract_sha256',
    'asset_manifest_sha256',
  ];
  const integrationFields = [
    ...sealedPolicyFields,
    'ordered_block_receipt_set_sha256',
    'master_wrapper_sha256',
    'integration_manifest_sha256',
    'no_rewrite_proof_sha256',
    'integrated_source_sha256',
    'renderer_version_sha256',
    'hyperframes_version_sha256',
  ];
  return {
    inputs,
    cases: [
      ['policy-director', 'policy-gate', 'director', director, DIRECTOR_LINEAGE_BINDINGS],
      ['policy-sealed', 'policy-gate', 'sealed', sealed, sealedPolicyFields],
      ['source-block', 'source-conformance-gate', 'block', sealed, [
        'production_contract_sha256',
        'shot_plan_sha256',
        'design_system_sha256',
        'component_registry_sha256',
        'validation_policy_sha256',
        'reference_style_profile_sha256',
        'font_package_sha256',
        'projection_sha256',
        'asset_manifest_sha256',
        'block_manifest_sha256',
        'source_sha256',
      ]],
      ['runtime-block', 'runtime-seek-gate', 'block', sealed, [
        'production_contract_sha256',
        'shot_plan_sha256',
        'validation_policy_sha256',
        'font_package_sha256',
        'projection_sha256',
        'asset_manifest_sha256',
        'block_manifest_sha256',
        'source_sha256',
        'source_conformance_receipt_sha256',
      ]],
      ['pixel-block', 'pixel-signal-gate', 'block', sealed, [
        'production_contract_sha256',
        'shot_plan_sha256',
        'design_system_sha256',
        'validation_policy_sha256',
        'reference_style_profile_sha256',
        'font_package_sha256',
        'projection_sha256',
        'asset_manifest_sha256',
        'block_manifest_sha256',
        'source_sha256',
        'source_conformance_receipt_sha256',
        'runtime_seek_receipt_sha256',
      ]],
      ['integration', 'integration-delivery-gate', 'integration', sealed, integrationFields],
      ['delivery', 'integration-delivery-gate', 'delivery', sealed, [
        ...integrationFields,
        'integration_receipt_sha256',
        'render_receipt_sha256',
        'technical_verify_receipt_sha256',
        'master_media_sha256',
      ]],
    ],
  };
}

function frozenLineageBindings(fields, contract, label) {
  return Object.fromEntries(fields.map((field) => [
    field,
    Object.hasOwn(contract, field) ? contract[field] : hash({ field, label }),
  ]));
}

function createFrozenLineageReceipt({
  label,
  gate,
  phase,
  contract,
  fields,
  validationPolicy: policy,
  mutateBindings = (bindings) => bindings,
}) {
  const inputBindings = mutateBindings(frozenLineageBindings(fields, contract, label));
  return createGateReceipt({
    gate,
    phase,
    scope_id: label,
    productionContract: contract,
    input_bindings: inputBindings,
    status: 'passed',
    hard_failure_codes: [],
    warning_codes: [],
    metrics: { checked_item_count: 1 },
    cache: {
      status: 'miss',
      cache_key_sha256: hash({ label, inputBindings }),
    },
    validationPolicy: policy,
  });
}

test('all seven receipt phases accept the frozen lineage binding set', () => {
  const { inputs, cases } = frozenReceiptLineageCases();
  const failures = [];
  for (const [label, gate, phase, contract, fields] of cases) {
    try {
      createFrozenLineageReceipt({
        label,
        gate,
        phase,
        contract,
        fields,
        validationPolicy: inputs.validationPolicy,
      });
    } catch (error) {
      failures.push([label, error?.code ?? error?.name ?? 'unknown']);
    }
  }
  assert.deepEqual(failures, []);
});

test('all seven receipt phase lineages reject every missing binding and any extra binding', () => {
  const { inputs, cases } = frozenReceiptLineageCases();
  const missingCases = [];
  const extraCases = [];
  for (const [label, gate, phase, contract, fields] of cases) {
    for (const missingField of fields) {
      missingCases.push([`${label}:missing:${missingField}`, () => createFrozenLineageReceipt({
        label,
        gate,
        phase,
        contract,
        fields,
        validationPolicy: inputs.validationPolicy,
        mutateBindings: (bindings) => {
          delete bindings[missingField];
          return bindings;
        },
      })]);
    }
    extraCases.push([`${label}:extra`, () => createFrozenLineageReceipt({
      label,
      gate,
      phase,
      contract,
      fields,
      validationPolicy: inputs.validationPolicy,
      mutateBindings: (bindings) => ({
        ...bindings,
        extra_lineage_sha256: hash({ label, extra: true }),
      }),
    })]);
  }
  assertAllRejected(missingCases, 'gate_receipt_binding_invalid');
  assertAllRejected(extraCases, 'gate_receipt_binding_invalid');
});

test('receipt policy registry must be the exact validation policy bound by contract and receipt', () => {
  const inputs = canonicalInputs();
  const director = compileProductionContract({ contract_phase: 'director', ...inputs });
  const alternatePolicy = structuredClone(inputs.validationPolicy);
  alternatePolicy.gate_policies['policy-gate'].warning_codes.push('alternate_policy_only_warning');
  seal(alternatePolicy, 'validation_policy_sha256');

  const receipt = ({
    policy,
    validationPolicyHash,
    warningCodes,
  }) => () => createGateReceipt({
    gate: 'policy-gate',
    phase: 'director',
    scope_id: 'production',
    productionContract: director,
    input_bindings: {
      ...directorReceiptBindings(director),
      validation_policy_sha256: validationPolicyHash,
    },
    status: 'passed',
    hard_failure_codes: [],
    warning_codes: warningCodes,
    metrics: { checked_item_count: 1 },
    cache: {
      status: 'miss',
      cache_key_sha256: hash({ validationPolicyHash, warningCodes }),
    },
    validationPolicy: policy,
  });

  assertAllRejected([
    ['supplied-policy-differs-from-contract', receipt({
      policy: alternatePolicy,
      validationPolicyHash: director.validation_policy_sha256,
      warningCodes: ['alternate_policy_only_warning'],
    })],
    ['receipt-binding-differs-from-contract-and-policy', receipt({
      policy: inputs.validationPolicy,
      validationPolicyHash: alternatePolicy.validation_policy_sha256,
      warningCodes: [],
    })],
  ], 'gate_receipt_policy_binding_mismatch');
});

test('process semantic properties reject camelCase opacity and visibility aliases', () => {
  const properties = [
    'opacityLevel',
    'alphaValue',
    'visibilityState',
    'visibleFlag',
    'displayMode',
  ];
  assertAllRejected(properties.map((property) => [property, () => {
    const plan = shotPlan();
    const shot = plan.shots[0];
    shot.input_state.property = property;
    shot.operation.property = property;
    shot.result_state.property = property;
    seal(plan, 'shot_plan_sha256');
    validateV3ShotPlan(plan, validationPolicy());
  }]), 'process_semantic_chain_invalid');
});
