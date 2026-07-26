import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ScriptOnlyV3ContractError,
  createGateReceipt,
  fingerprintV3Value,
  inspectV3Compatibility,
  validateComponentRegistry,
  validateDesignSystem,
  validateGateReceipt,
  validateProductionContract,
  validateV3ShotPlan,
  validateScopedBlockCreativePacket,
  validateValidationPolicy,
} from './validate-production-contract.mjs';
import {
  compileProductionContract,
  compileScopedBlockCreativePacket,
} from './compile-production-contract.mjs';
import {
  ContextBudgetError,
  validateContextBudget,
} from './validate-context-budget.mjs';

const hash = (value) => fingerprintV3Value(value);
const withHash = (value, field) => ({ ...value, [field]: hash(value) });
const expectCode = (action, code) => assert.throws(
  action,
  (error) => error instanceof ScriptOnlyV3ContractError && error.code === code,
);
const expectContextCode = (action, code) => assert.throws(
  action,
  (error) => error instanceof ContextBudgetError && error.code === code,
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

function creativeDirective({ nextShotId = null, modules = [] } = {}) {
  return withHash({
    primary_visual_decision: '让结果对象承担第一阅读焦点，并将安全区留给功能文字和镜头交接。',
    attention_plan: {
      primary_focus_ref: 'semantic-object:qualified-result',
      reading_order_refs: ['semantic-object:qualified-result'],
      negative_space_region_refs: ['safe-region:title-safe'],
      transition_exit_ref: nextShotId
        ? `next-shot:${nextShotId}` : 'semantic-object:qualified-result',
    },
    modules,
  }, 'creative_directive_sha256');
}

function shotPlan(parsedSrt = parsedSrtArtifact()) {
  const shots = [
    {
      shot_id: 'S001',
      chapter_id: 'C01',
      shot_kind: 'process',
      start_ms: 0,
      end_ms: 4000,
      duration_ms: 4000,
      semantic_claim: '输入经过规则节点后得到可辨识结果。',
      creative_directive: creativeDirective({
        nextShotId: 'S002',
        modules: [{
          module_id: 'narrative-attention-v1',
          fact_binding_sha256: hash({ module: 'narrative-attention-v1', shot_id: 'S001' }),
        }],
      }),
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
      causal_lifecycle: {
        entry: {
          start_frame: 0,
          end_frame: 10,
          selectors: ['#s001-input'],
          timeline_calls: ['s001-entry'],
        },
        action: {
          start_frame: 10,
          end_frame: 45,
          selectors: ['#s001-input', '#s001-rule'],
          timeline_calls: ['s001-action'],
        },
        result: {
          start_frame: 45,
          end_frame: 55,
          selectors: ['#s001-result'],
          timeline_calls: ['s001-result'],
        },
        hold: {
          start_frame: 55,
          end_frame: 85,
          selectors: ['#s001-result'],
          timeline_calls: ['s001-hold'],
        },
        exit: {
          start_frame: 85,
          end_frame: 100,
          selectors: ['#s001-input', '#s001-rule', '#s001-result'],
          timeline_calls: ['s001-exit'],
        },
      },
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
      causal_lifecycle: {
        entry: {
          start_frame: 0,
          end_frame: 10,
          selectors: ['#s002-baseline'],
          timeline_calls: ['s002-entry'],
        },
        action: {
          start_frame: 10,
          end_frame: 45,
          selectors: ['#s002-baseline', '#s002-result'],
          timeline_calls: ['s002-action'],
        },
        result: {
          start_frame: 45,
          end_frame: 55,
          selectors: ['#s002-result'],
          timeline_calls: ['s002-result'],
        },
        hold: {
          start_frame: 55,
          end_frame: 110,
          selectors: ['#s002-result', '#s002-source'],
          timeline_calls: ['s002-hold'],
        },
        exit: {
          start_frame: 110,
          end_frame: 125,
          selectors: ['#s002-baseline', '#s002-result'],
          timeline_calls: ['s002-exit'],
        },
      },
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
  ];
  return withHash({
    schema_version: 1,
    pipeline_contract_version: 3,
    parsed_srt_sha256: hash(parsedSrt),
    fps: { numerator: 25, denominator: 1 },
    shots,
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
  return withHash({
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
  return withHash({
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

function validationPolicy() {
  const gateNames = [
    'policy-gate',
    'source-conformance-gate',
    'runtime-seek-gate',
    'pixel-signal-gate',
    'integration-delivery-gate',
  ];
  return withHash({
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
    gate_policies: Object.fromEntries(gateNames.map((gate) => [gate, {
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

const opaqueArtifact = (kind) => ({
  schema_version: 1,
  artifact_kind: kind,
  content: `${kind} actual fixture bytes`,
});

function canonicalInputs() {
  const referenceStyle = referenceStyleProfile();
  const parsedSrt = parsedSrtArtifact();
  const plan = shotPlan(parsedSrt);
  return {
    parsedSrt,
    shotPlan: plan,
    designSystem: designSystem(referenceStyle),
    componentRegistry: componentRegistry(),
    validationPolicy: validationPolicy(),
    referenceStyleProfile: referenceStyle,
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

test('four v3 schemas are parseable and encode strict identities plus phased production contracts', async () => {
  const names = [
    'production-contract.schema.json',
    'design-system.schema.json',
    'component-registry.schema.json',
    'validation-policy.schema.json',
  ];
  const schemas = await Promise.all(names.map(async (name) => JSON.parse(
    await readFile(new URL(`../references/${name}`, import.meta.url), 'utf8'),
  )));
  for (const [index, schema] of schemas.entries()) {
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.match(schema.$id, new RegExp(names[index].replaceAll('.', '\\.')));
    assert.ok(schema.$defs && typeof schema.$defs === 'object');
  }
  assert.equal(schemas[0].oneOf.length, 2);
  assert.deepEqual(
    schemas[0].oneOf.map((entry) => entry.$ref),
    ['#/$defs/directorContract', '#/$defs/sealedContract'],
  );
  assert.equal(schemas[1].properties.reference_style_profile.$ref, '#/$defs/referenceStyleProfile');
  assert.equal(schemas[3].properties.validation_policy_id.const, 'script-only-production-v1');
});

test('v3 umbrella, five gate, context budget and legacy references freeze the P1 boundaries', async () => {
  const names = [
    'script-only-v3-contract.md',
    'policy-gate-contract.md',
    'source-conformance-gate-contract.md',
    'runtime-seek-gate-contract.md',
    'pixel-signal-gate-contract.md',
    'integration-delivery-gate-contract.md',
    'context-budget-contract.md',
    'legacy-v2-inspection.md',
  ];
  const documents = await Promise.all(names.map((name) => readFile(
    new URL(`../references/${name}`, import.meta.url),
    'utf8',
  )));
  const combined = documents.join('\n');
  for (const term of [
    'pipeline_contract_version: 3',
    'script-only-authoring-cluster-v1',
    'script-only-production-v1',
    'contract_phase: director',
    'contract_phase: sealed',
    'policy-gate',
    'source-conformance-gate',
    'runtime-seek-gate',
    'pixel-signal-gate',
    'integration-delivery-gate',
    'block receipt',
    '16 KiB',
    '32 KiB',
    '64 KiB',
    'inspection-only',
    'Deep Current',
    'material_selection_requires_user_input',
  ]) assert.ok(combined.includes(term), `missing contract term: ${term}`);
});

test('validates ReachSurge-derived semantic evidence, causal lifecycle, role-aware type, readable hold, data and ledgers', () => {
  const inputs = canonicalInputs();
  assert.equal(validateV3ShotPlan(inputs.shotPlan, inputs.validationPolicy).shot_count, 2);
  assert.equal(validateDesignSystem(inputs.designSystem, {
    referenceStyleProfile: inputs.referenceStyleProfile,
  }).type_role_count, 6);
  assert.equal(validateComponentRegistry(inputs.componentRegistry).component_count, 10);
  assert.equal(validateValidationPolicy(inputs.validationPolicy).gate_count, 5);

  const missingObjects = structuredClone(inputs.shotPlan);
  missingObjects.shots[0].semantic_objects = [];
  missingObjects.shot_plan_sha256 = hash(Object.fromEntries(
    Object.entries(missingObjects).filter(([key]) => key !== 'shot_plan_sha256'),
  ));
  expectCode(
    () => validateV3ShotPlan(missingObjects, inputs.validationPolicy),
    'semantic_evidence_chain_incomplete',
  );

  const earlyResult = structuredClone(inputs.shotPlan);
  earlyResult.shots[0].causal_lifecycle.result.start_frame = 30;
  earlyResult.shot_plan_sha256 = hash(Object.fromEntries(
    Object.entries(earlyResult).filter(([key]) => key !== 'shot_plan_sha256'),
  ));
  expectCode(
    () => validateV3ShotPlan(earlyResult, inputs.validationPolicy),
    'causal_lifecycle_invalid',
  );

  const shortHold = structuredClone(inputs.shotPlan);
  shortHold.shots[1].causal_lifecycle.hold.end_frame = 80;
  shortHold.shots[1].causal_lifecycle.exit.start_frame = 80;
  shortHold.shot_plan_sha256 = hash(Object.fromEntries(
    Object.entries(shortHold).filter(([key]) => key !== 'shot_plan_sha256'),
  ));
  expectCode(
    () => validateV3ShotPlan(shortHold, inputs.validationPolicy),
    'readable_hold_insufficient',
  );

  const microtextOnly = structuredClone(inputs.shotPlan);
  microtextOnly.shots[0].text_roles = ['microtext-texture'];
  microtextOnly.shot_plan_sha256 = hash(Object.fromEntries(
    Object.entries(microtextOnly).filter(([key]) => key !== 'shot_plan_sha256'),
  ));
  expectCode(
    () => validateV3ShotPlan(microtextOnly, inputs.validationPolicy),
    'microtext_semantic_role_forbidden',
  );

  const missingFormula = structuredClone(inputs.shotPlan);
  missingFormula.shots[1].data_points[0].formula = '';
  missingFormula.shot_plan_sha256 = hash(Object.fromEntries(
    Object.entries(missingFormula).filter(([key]) => key !== 'shot_plan_sha256'),
  ));
  expectCode(
    () => validateV3ShotPlan(missingFormula, inputs.validationPolicy),
    'data_formula_mismatch',
  );

  const openCallback = structuredClone(inputs.shotPlan);
  openCallback.motif_callback_ledger = [];
  openCallback.shot_plan_sha256 = hash(Object.fromEntries(
    Object.entries(openCallback).filter(([key]) => key !== 'shot_plan_sha256'),
  ));
  expectCode(
    () => validateV3ShotPlan(openCallback, inputs.validationPolicy),
    'callback_ledger_open',
  );

  const deepCurrentDefault = structuredClone(inputs.designSystem);
  deepCurrentDefault.reference_style_profile.profile_id = 'deep-current-hud';
  deepCurrentDefault.reference_style_profile.public_default = true;
  deepCurrentDefault.design_system_sha256 = hash(Object.fromEntries(
    Object.entries(deepCurrentDefault).filter(([key]) => key !== 'design_system_sha256'),
  ));
  expectCode(
    () => validateDesignSystem(deepCurrentDefault),
    'reference_style_profile_scope_invalid',
  );
});

test('compiles an immutable director→sealed contract chain without placeholder asset hashes', () => {
  const inputs = canonicalInputs();
  const director = compileProductionContract({
    contract_phase: 'director',
    ...inputs,
  });
  assert.equal(director.contract_phase, 'director');
  assert.equal(Object.hasOwn(director, 'asset_manifest_sha256'), false);
  assert.equal(Object.hasOwn(director, 'prior_contract_sha256'), false);
  assert.equal(validateProductionContract(director, { artifacts: inputs }).contract_phase, 'director');

  expectCode(
    () => compileProductionContract({
      contract_phase: 'director',
      ...inputs,
      assetManifest: opaqueArtifact('asset-manifest'),
    }),
    'director_contract_asset_forbidden',
  );
  expectCode(
    () => compileProductionContract({ contract_phase: 'sealed', ...inputs }),
    'sealed_contract_inputs_required',
  );

  const assetManifest = opaqueArtifact('asset-manifest');
  const sealed = compileProductionContract({
    contract_phase: 'sealed',
    ...inputs,
    priorContract: director,
    assetManifest,
  });
  assert.equal(sealed.contract_phase, 'sealed');
  assert.equal(sealed.prior_contract_sha256, director.production_contract_sha256);
  assert.equal(sealed.asset_manifest_sha256, hash(assetManifest));
  assert.equal(validateProductionContract(sealed, {
    priorContract: director,
    assetManifest,
    artifacts: inputs,
  }).contract_phase, 'sealed');

  const alternateInputs = canonicalInputs();
  alternateInputs.deliveryProfile = {
    ...alternateInputs.deliveryProfile,
    content: 'different actual delivery profile bytes',
  };
  const wrongPrior = compileProductionContract({
    contract_phase: 'director',
    ...alternateInputs,
  });
  expectCode(
    () => validateProductionContract(sealed, {
      priorContract: wrongPrior,
      assetManifest,
      artifacts: inputs,
    }),
    'production_contract_prior_mismatch',
  );
  expectCode(
    () => validateProductionContract(sealed, {
      priorContract: director,
      assetManifest: { ...assetManifest, content: 'changed actual bytes' },
      artifacts: inputs,
    }),
    'production_contract_binding_mismatch',
  );
});

test('compiles a bounded, canonical block creative packet without raw contract re-entry', () => {
  const inputs = canonicalInputs();
  const director = compileProductionContract({ contract_phase: 'director', ...inputs });
  const assetManifest = opaqueArtifact('asset-manifest');
  const sealed = compileProductionContract({
    contract_phase: 'sealed',
    ...inputs,
    priorContract: director,
    assetManifest,
  });
  const block = { block_id: 'B001', shot_ids: ['S001', 'S002'] };
  const packet = compileScopedBlockCreativePacket({
    block,
    productionContract: sealed,
    artifacts: inputs,
    priorContract: director,
    assetManifest,
  });
  assert.equal(packet.artifact_kind, 'scoped-block-creative-packet');
  assert.equal(packet.packet_sha256.length, 64);
  assert.deepEqual(packet.adjacent_seams, {
    previous_shot_id: null,
    next_shot_id: null,
  });
  assert.equal(
    validateScopedBlockCreativePacket(packet, {
      block,
      productionContract: sealed,
      artifacts: inputs,
      priorContract: director,
      assetManifest,
    }).shot_count,
    2,
  );
  assert.equal(packet.scoped_shots[0].creative_directive.modules[0].module_id, 'narrative-attention-v1');

  const commission = {
    block_id: 'B001',
    shot_ids: ['S001', 'S002'],
    packet_sha256: packet.packet_sha256,
    creative_directive: packet.scoped_shots[0].creative_directive,
  };
  assert.deepEqual(
    validateContextBudget(commission, {
      kind: 'block-creative-commission',
      policy: inputs.validationPolicy.context_budget,
    }),
    {
      status: 'passed',
      kind: 'block-creative-commission',
      size_bytes: Buffer.byteLength(JSON.stringify(commission), 'utf8'),
      max_bytes: 6 * 1024,
    },
  );
  assert.equal(
    validateContextBudget(packet, {
      kind: 'scoped-block-creative-packet',
      policy: inputs.validationPolicy.context_budget,
    }).max_bytes,
    24 * 1024,
  );

  expectContextCode(
    () => validateContextBudget({
      ...commission,
      creative_mission: 'x'.repeat((6 * 1024) + 1),
    }, {
      kind: 'block-creative-commission',
      policy: inputs.validationPolicy.context_budget,
    }),
    'context_budget_exceeded',
  );
  expectContextCode(
    () => validateContextBudget({
      ...commission,
      raw_director_contract: { contract: 'forbidden' },
    }, {
      kind: 'block-creative-commission',
      policy: inputs.validationPolicy.context_budget,
    }),
    'child_bootstrap_forbidden_content',
  );
  expectContextCode(
    () => validateContextBudget({
      block_id: 'B001',
      shot_ids: ['S001'],
      scoped_shots: [{ shot_id: 'S002' }],
    }, {
      kind: 'scoped-block-creative-packet',
      policy: inputs.validationPolicy.context_budget,
    }),
    'child_bootstrap_cross_block_fact',
  );

  const missingDirective = structuredClone(inputs.shotPlan);
  delete missingDirective.shots[0].creative_directive;
  missingDirective.shot_plan_sha256 = hash(Object.fromEntries(
    Object.entries(missingDirective).filter(([key]) => key !== 'shot_plan_sha256'),
  ));
  expectCode(
    () => validateV3ShotPlan(missingDirective, inputs.validationPolicy),
    'shot_plan_invalid',
  );

  const forgedFact = structuredClone(packet);
  forgedFact.scoped_shots[0].design_facts.layout_family = 'forged-layout';
  forgedFact.packet_sha256 = hash(Object.fromEntries(
    Object.entries(forgedFact).filter(([key]) => key !== 'packet_sha256'),
  ));
  expectCode(
    () => validateScopedBlockCreativePacket(forgedFact, {
      block,
      productionContract: sealed,
      artifacts: inputs,
      priorContract: director,
      assetManifest,
    }),
    'scoped_block_packet_binding_mismatch',
  );

  const crossBlock = structuredClone(packet);
  crossBlock.scoped_shots.push(structuredClone(packet.scoped_shots[0]));
  crossBlock.packet_sha256 = hash(Object.fromEntries(
    Object.entries(crossBlock).filter(([key]) => key !== 'packet_sha256'),
  ));
  expectCode(
    () => validateScopedBlockCreativePacket(crossBlock, {
      block,
      productionContract: sealed,
      artifacts: inputs,
      priorContract: director,
      assetManifest,
    }),
    'scoped_block_packet_binding_mismatch',
  );

  const rawLeak = structuredClone(packet);
  rawLeak.raw_director_contract = { anything: 'forbidden' };
  rawLeak.packet_sha256 = hash(Object.fromEntries(
    Object.entries(rawLeak).filter(([key]) => key !== 'packet_sha256'),
  ));
  expectCode(
    () => validateScopedBlockCreativePacket(rawLeak, {
      block,
      productionContract: sealed,
      artifacts: inputs,
      priorContract: director,
      assetManifest,
    }),
    'scoped_block_packet_forbidden_content',
  );

  const oversized = structuredClone(packet);
  oversized.scoped_shots[0].semantic_claim = 'x'.repeat(25 * 1024);
  oversized.packet_sha256 = hash(Object.fromEntries(
    Object.entries(oversized).filter(([key]) => key !== 'packet_sha256'),
  ));
  expectCode(
    () => validateScopedBlockCreativePacket(oversized, {
      block,
      productionContract: sealed,
      artifacts: inputs,
      priorContract: director,
      assetManifest,
    }),
    'scoped_block_packet_budget_exceeded',
  );
});

test('five bounded receipt shapes enforce policy reseal and the two Gate5 phases', () => {
  const inputs = canonicalInputs();
  const director = compileProductionContract({ contract_phase: 'director', ...inputs });
  const assetManifest = opaqueArtifact('asset-manifest');
  const sealed = compileProductionContract({
    contract_phase: 'sealed',
    ...inputs,
    priorContract: director,
    assetManifest,
  });

  const directorFields = [
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
  const receiptBindings = (gate, phase, contract, scopeId) => {
    const selected = (fields) => Object.fromEntries(fields.map((field) => [
      field,
      Object.hasOwn(contract, field) ? contract[field] : hash({ field, gate, phase, scopeId }),
    ]));
    if (gate === 'policy-gate') {
      return selected(phase === 'director'
        ? directorFields : [...directorFields, 'prior_contract_sha256', 'asset_manifest_sha256']);
    }
    if (gate === 'source-conformance-gate') {
      return selected([
        'production_contract_sha256', 'shot_plan_sha256', 'design_system_sha256',
        'component_registry_sha256', 'validation_policy_sha256',
        'reference_style_profile_sha256', 'font_package_sha256', 'projection_sha256',
        'asset_manifest_sha256', 'block_manifest_sha256', 'source_sha256',
      ]);
    }
    if (gate === 'runtime-seek-gate') {
      return selected([
        'production_contract_sha256', 'shot_plan_sha256', 'validation_policy_sha256',
        'font_package_sha256', 'projection_sha256', 'asset_manifest_sha256',
        'block_manifest_sha256', 'source_sha256', 'source_conformance_receipt_sha256',
      ]);
    }
    if (gate === 'pixel-signal-gate') {
      return selected([
        'production_contract_sha256', 'shot_plan_sha256', 'design_system_sha256',
        'validation_policy_sha256', 'reference_style_profile_sha256',
        'font_package_sha256', 'projection_sha256', 'asset_manifest_sha256',
        'block_manifest_sha256', 'source_sha256', 'source_conformance_receipt_sha256',
        'runtime_seek_receipt_sha256',
      ]);
    }
    const integrationFields = [
      ...directorFields,
      'prior_contract_sha256',
      'asset_manifest_sha256',
      'ordered_block_receipt_set_sha256',
      'master_wrapper_sha256',
      'integration_manifest_sha256',
      'no_rewrite_proof_sha256',
      'integrated_source_sha256',
      'renderer_version_sha256',
      'hyperframes_version_sha256',
    ];
    return selected(phase === 'delivery'
      ? [
        ...integrationFields,
        'integration_receipt_sha256',
        'render_receipt_sha256',
        'technical_verify_receipt_sha256',
        'master_media_sha256',
      ] : integrationFields);
  };
  const receipt = (gate, phase, productionContract, scopeId = 'production') => createGateReceipt({
    gate,
    phase,
    scope_id: scopeId,
    productionContract,
    input_bindings: receiptBindings(gate, phase, productionContract, scopeId),
    status: 'passed',
    hard_failure_codes: [],
    warning_codes: [],
    metrics: { checked_item_count: 2 },
    cache: { status: 'miss', cache_key_sha256: hash({ gate, phase, scopeId }) },
    validationPolicy: inputs.validationPolicy,
  });

  const directorPolicy = receipt('policy-gate', 'director', director);
  const sealedPolicy = receipt('policy-gate', 'sealed', sealed);
  assert.equal(validateGateReceipt(directorPolicy, {
    productionContract: director,
    validationPolicy: inputs.validationPolicy,
  }).phase, 'director');
  assert.equal(validateGateReceipt(sealedPolicy, {
    productionContract: sealed,
    validationPolicy: inputs.validationPolicy,
  }).phase, 'sealed');
  for (const gate of [
    'source-conformance-gate',
    'runtime-seek-gate',
    'pixel-signal-gate',
  ]) {
    const blockReceipt = receipt(gate, 'block', sealed, 'B001');
    assert.equal(validateGateReceipt(blockReceipt, {
      productionContract: sealed,
      validationPolicy: inputs.validationPolicy,
    }).phase, 'block');
    assert.ok(Buffer.byteLength(JSON.stringify(blockReceipt), 'utf8') <= 16384);
  }
  for (const phase of ['integration', 'delivery']) {
    const gate5 = receipt('integration-delivery-gate', phase, sealed);
    assert.equal(validateGateReceipt(gate5, {
      productionContract: sealed,
      validationPolicy: inputs.validationPolicy,
    }).phase, phase);
  }
  expectCode(
    () => receipt('integration-delivery-gate', 'block', sealed),
    'gate_receipt_phase_invalid',
  );
  expectCode(
    () => receipt('source-conformance-gate', 'integration', sealed, 'B001'),
    'gate_receipt_phase_invalid',
  );
  expectCode(
    () => receipt('policy-gate', 'sealed', director),
    'gate_receipt_contract_phase_mismatch',
  );
});

test('v2/fixed-four/main-review artifacts remain inspectable but can never resume, be re-signed or authorize v3', () => {
  const legacy = {
    schema_version: 3,
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
    main_review_refs: [{ gate: 'source_code_review', status: 'approved' }],
  };
  assert.deepEqual(inspectV3Compatibility(legacy), {
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
    mode: 'inspection-only',
    resume_eligible: false,
    resign_eligible: false,
    render_authorization_eligible: false,
    code: 'pipeline_upgrade_required',
  });
  expectCode(() => validateProductionContract(legacy), 'pipeline_upgrade_required');
  expectCode(
    () => validateProductionContract({
      ...legacy,
      pipeline_contract_version: 3,
      authoring_topology_id: 'script-only-authoring-cluster-v1',
    }),
    'legacy_field_forbidden',
  );
});

test('canonical fingerprints preserve exact finite JSON numbers without six-decimal rounding', () => {
  assert.notEqual(
    hash({ ratio: 0.12345641 }),
    hash({ ratio: 0.12345649 }),
  );
});

test('v3 fails closed on flat semantic chains and unbound actual parsed-SRT bytes', () => {
  const inputs = canonicalInputs();
  const flat = structuredClone(inputs.shotPlan);
  flat.shots[0].cognitive_action = 'route the input';
  flat.shot_plan_sha256 = hash(Object.fromEntries(
    Object.entries(flat).filter(([key]) => key !== 'shot_plan_sha256'),
  ));
  expectCode(
    () => validateV3ShotPlan(flat, inputs.validationPolicy),
    'cognitive_action_cardinality_invalid',
  );

  const changed = canonicalInputs();
  changed.parsedSrt.cues[0].text = 'different actual cue bytes';
  expectCode(
    () => compileProductionContract({ contract_phase: 'director', ...changed }),
    'parsed_srt_binding_mismatch',
  );
});

test('legacy and main-review fields are rejected recursively in every canonical and sealed input', () => {
  const inputs = canonicalInputs();
  inputs.deliveryProfile.nested = { stable_window: { from: 0, to: 10 } };
  expectCode(
    () => compileProductionContract({ contract_phase: 'director', ...inputs }),
    'legacy_field_forbidden',
  );

  const clean = canonicalInputs();
  const director = compileProductionContract({ contract_phase: 'director', ...clean });
  expectCode(
    () => compileProductionContract({
      contract_phase: 'sealed',
      ...clean,
      priorContract: director,
      assetManifest: { schema_version: 1, nested: { main_review_refs: [] } },
    }),
    'legacy_field_forbidden',
  );
});

test('reference profiles close project scope, draft status and Deep Current non-default identity', () => {
  const profile = referenceStyleProfile();
  const design = designSystem(profile);
  const incomplete = structuredClone(profile);
  delete incomplete.status;
  expectCode(
    () => validateDesignSystem(design, { referenceStyleProfile: incomplete }),
    'reference_style_profile_scope_invalid',
  );

  const deepCurrent = referenceStyleProfile();
  deepCurrent.profile_id = 'deep-current-hud';
  deepCurrent.status = 'published';
  const deepDesign = designSystem(deepCurrent);
  expectCode(
    () => validateDesignSystem(deepDesign, { referenceStyleProfile: deepCurrent }),
    'reference_style_profile_scope_invalid',
  );
});

test('structured data formula binds denominator and selected gate owns every emitted code', () => {
  const inputs = canonicalInputs();
  const denominatorConflict = structuredClone(inputs.shotPlan);
  denominatorConflict.shots[1].data_points[0].denominator.value = 99;
  denominatorConflict.shot_plan_sha256 = hash(Object.fromEntries(
    Object.entries(denominatorConflict).filter(([key]) => key !== 'shot_plan_sha256'),
  ));
  expectCode(
    () => validateV3ShotPlan(denominatorConflict, inputs.validationPolicy),
    'data_formula_mismatch',
  );

  const director = compileProductionContract({ contract_phase: 'director', ...inputs });
  expectCode(
    () => createGateReceipt({
      gate: 'policy-gate',
      phase: 'director',
      scope_id: 'production',
      productionContract: director,
      input_bindings: Object.fromEntries([
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
      ].map((field) => [field, director[field]])),
      status: 'failed',
      hard_failure_codes: ['runtime_seek_gate_contract_failure'],
      warning_codes: [],
      metrics: {},
      cache: { status: 'miss', cache_key_sha256: hash({ gate: 'policy-gate' }) },
      validationPolicy: inputs.validationPolicy,
    }),
    'gate_receipt_failure_codes_invalid',
  );
});
