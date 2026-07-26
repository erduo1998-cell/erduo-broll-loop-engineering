import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { compileFrameProjection } from './compile-frame-projection.mjs';
import { loadPackagedDesignLibrary } from './select-design.mjs';
import { fingerprintRenderValue, fingerprintValue } from './state.mjs';
import {
  deriveSubstantiveVisualCore,
  validateVisualGrammarProgram,
} from './validate-visual-grammar-program.mjs';
import {
  containsForbiddenLocalPathToken,
  extractWholeFilmBlockContext,
  validateWholeFilmBlockContext,
  validateWholeFilmRules,
  WholeFilmRulesError,
} from './validate-whole-film-rules.mjs';

const execFileAsync = promisify(execFile);
const sha = (letter) => letter.repeat(64);
const DESIGN_LIBRARY = await loadPackagedDesignLibrary();
const BASE_TEMPLATE = DESIGN_LIBRARY.templates.find(
  (template) => template.id === 'quiet-editorial-print',
);
const TEMPLATE_AXIS_FIELD = new Map([
  ['density-tier', 'surface'],
  ['anchor-form', 'semantic_anchor'],
  ['anchor-quadrant', 'attention_geometry'],
  ['type-relation', 'typography'],
  ['accent-form', 'color'],
  ['material-process', 'material_texture'],
  ['motion-cause', 'motion_causality'],
]);
const NATIVE_AXIS_FIELD = new Map([
  ['surface-role', 'surface'],
  ['attention-geometry', 'attention_geometry'],
  ['semantic-anchor', 'semantic_anchor'],
  ['typography-role', 'typography'],
  ['color-relation', 'color'],
  ['native-support-role', 'material_texture'],
  ['motion-cause', 'motion_causality'],
]);
const AUTHORING_FIELDS = [
  'surface',
  'attention_geometry',
  'anchor_treatment',
  'typography',
  'color',
  'material_texture',
  'motion_causality',
  'emotional_temperature',
];

function designLibrarySnapshotSha256(library = DESIGN_LIBRARY) {
  return fingerprintRenderValue({
    policy: library.policy,
    source_registry: library.sourceRegistry,
    templates: [...library.templates].sort((left, right) => left.id.localeCompare(right.id)),
    native_base_compiler: library.nativeBaseCompiler,
    native_compiler_source_bundle_sha256:
      library.nativeBaseCompiler.native_compiler_source_bundle_sha256,
  });
}

function designSelection(
  briefsSha256,
  baseTemplate = BASE_TEMPLATE,
  designLibrary = DESIGN_LIBRARY,
) {
  const core = {
    schema_version: 1,
    briefs_sha256: briefsSha256,
    mode: 'base-template',
    base_template: baseTemplate.id,
    base_template_sha256: fingerprintRenderValue(baseTemplate),
    design_library_snapshot_sha256: designLibrarySnapshotSha256(designLibrary),
    native_compiler_source_bundle_sha256:
      designLibrary.nativeBaseCompiler.native_compiler_source_bundle_sha256,
    visual_grammar_compilation: {
      eligible: true,
      guard_code: 'BASE_TEMPLATE_BOUND',
    },
    template_status: baseTemplate.status,
    protected_user_layers: [],
    signals: { fixture: 'quiet-editorial-print-explicit-selection' },
    score: 1000,
    reasons: [{ code: 'USER_TEMPLATE_OVERRIDE', points: 1000 }],
    borrowed_patterns: [],
    borrow_rejections: [],
    alternatives: [],
    candidate_rejections: [],
  };
  return { ...core, selection_sha256: fingerprintValue(core) };
}

function nativeDesignSelection(
  briefsSha256,
  nativeBaseCompiler,
  designLibrary,
  protectedUserLayers = [],
) {
  const core = {
    schema_version: 1,
    briefs_sha256: briefsSha256,
    mode: protectedUserLayers.length
      ? 'user-design-native-supplement'
      : 'native-fallback',
    base_template: 'hyperframes-native',
    base_template_sha256: fingerprintRenderValue(nativeBaseCompiler),
    design_library_snapshot_sha256: designLibrarySnapshotSha256(designLibrary),
    native_compiler_source_bundle_sha256:
      nativeBaseCompiler.native_compiler_source_bundle_sha256,
    visual_grammar_compilation: {
      eligible: true,
      guard_code: protectedUserLayers.length
        ? 'NATIVE_SUPPORT_ONLY_USER_LAYERS_PROTECTED'
        : 'NATIVE_BASE_COMPILER_BOUND',
    },
    template_status: 'built-in',
    fallback: 'hyperframes-native',
    protected_user_layers: [...protectedUserLayers],
    signals: { fixture: 'canonical-native-fallback' },
    borrowed_patterns: [],
    borrow_rejections: [],
    candidate_rejections: [],
  };
  return { ...core, selection_sha256: fingerprintValue(core) };
}

function projection() {
  return compileFrameProjection({
    pipeline_contract_version: 2,
    artifact_id: 'projection-main',
    parsed_srt_sha256: sha('b'),
    plan_sha256: sha('c'),
    fps: { numerator: 25, denominator: 1 },
    shots: Array.from({ length: 4 }, (_, index) => ({
      shot_id: `S${String(index + 1).padStart(3, '0')}`,
      start_ms: index * 2000,
      end_ms: (index + 1) * 2000,
    })),
  });
}

function authoredRecipe(index, projectedShot, effectiveBase = BASE_TEMPLATE) {
  const value = {
    shot_id: `S${String(index).padStart(3, '0')}`,
    srt_window_ms: structuredClone(projectedShot.srt_window_ms),
    frame_window: structuredClone(projectedShot.frame_window),
    semantic_claim: `第 ${index} 镜把字幕判断转成可核验的视觉命题。`,
    surface: {
      decision_id: `surface-${index}`,
      intent: `第 ${index} 镜的表面承接材料证据与阅读路径。`,
      implementation_obligation: `表面必须服务第 ${index} 镜语义，不能成为换字模板。`,
    },
    attention_geometry: {
      decision_id: `attention-${index}`,
      primary_focus: `第 ${index} 镜首先阅读发生变化的语义主体。`,
      reading_order: '先读主体，再读结果，最后读取材料证据。',
      negative_space_responsibility: `留白承担第 ${index} 镜阅读呼吸和交棒责任。`,
    },
    semantic_anchor: {
      decision_id: `anchor-decision-${index}`,
      anchor_id: `anchor-${index}`,
      claim: `第 ${index} 镜锚点直接绑定字幕中的事实判断。`,
      source_ref_ids: ['srt-source', 'author-source'],
    },
    anchor_treatment: {
      decision_id: `treatment-${index}`,
      relationship: `第 ${index} 镜的标题与锚点形成内容驱动关系。`,
      protection: '事实识别区保持完整，不受装饰和文字遮挡。',
    },
    typography: {
      decision_id: `type-${index}`,
      hierarchy: `第 ${index} 镜以展示字建立首读层级。`,
      line_break_policy: '按语义显式断行，不允许运行时随意改写。',
      display_role: `展示字承担第 ${index} 镜的核心判断。`,
    },
    color: {
      decision_id: `color-${index}`,
      palette_relationship: `第 ${index} 镜从材料本色建立颜色关系。`,
      contrast_logic: '事实文字与承载表面保持稳定可读对比。',
      accent_responsibility: `强调色只指向第 ${index} 镜的结果。`,
    },
    material_texture: {
      decision_id: `material-${index}`,
      primary_material_role: `第 ${index} 镜的普通材料承担主要语义证据。`,
      texture_behavior: '纹理通过语义动作显露，不能退化为壁纸。',
      route_intent: `按冻结路由为第 ${index} 镜选择普通主材料。`,
    },
    motion_causality: {
      decision_id: `motion-${index}`,
      cause: `字幕中的第 ${index} 个原因触发主体变化。`,
      action: '主体执行一个与原因直接相关的可见动作。',
      result: `动作产生第 ${index} 个稳定可读结果。`,
      lifecycle: {
        entry: '主体进入并建立一个明确首读焦点。',
        action: '语义原因驱动唯一主要动作发生。',
        result: '动作形成稳定且可辨认的结果态。',
        hold: '结果保持到足以完整读取判断。',
        exit: '焦点退出并把注意力交给下一镜。',
      },
    },
    emotional_temperature: {
      decision_id: `temperature-${index}`,
      temperature_label: index === 1 ? '克制紧张' : '冷静释然',
      intent: `情绪温度服务第 ${index} 镜内容转折而不是滤镜预设。`,
    },
    hard_avoids: [`禁止第 ${index} 镜只替换标题`, `禁止第 ${index} 镜把材料作为壁纸`],
    variation_states: effectiveBase.adaptation_knobs.map((knob) => ({
      axis_id: knob.id,
      state_id: knob.options[(index - 1) % knob.options.length],
    })),
    adjacent_difference: {
      previous_shot_id: index === 1
        ? null
        : `S${String(index - 1).padStart(3, '0')}`,
      changed_axis_ids: index === 1
        ? []
        : effectiveBase.adaptation_knobs.map((knob) => knob.id),
      changed_authoring_fields: index === 1 ? [] : [...AUTHORING_FIELDS],
      content_reason: index === 1
        ? 'first-shot-baseline'
        : `第 ${index} 镜因果对象和动作改变，因此所有作者字段都重新冻结。`,
    },
    provenance_ref_ids: ['srt-source', 'author-source'],
    authoring_signature_sha256: '',
    shot_recipe_sha256: '',
  };
  value.authoring_signature_sha256 = fingerprintValue(deriveSubstantiveVisualCore(value));
  const { shot_recipe_sha256: ignored, ...core } = value;
  value.shot_recipe_sha256 = fingerprintValue(core);
  return value;
}

function visualGrammarFixture({
  native = false,
  protectedUserLayers = [],
} = {}) {
  const frameProjection = projection();
  const packagedLibrary = structuredClone(DESIGN_LIBRARY);
  const selectedTemplate = native ? undefined : structuredClone(BASE_TEMPLATE);
  const nativeBaseCompiler = native
    ? structuredClone(packagedLibrary.nativeBaseCompiler)
    : undefined;
  const effectiveBase = native ? nativeBaseCompiler : selectedTemplate;
  const selectedDesign = native
    ? nativeDesignSelection(
      sha('a'),
      nativeBaseCompiler,
      packagedLibrary,
      protectedUserLayers,
    )
    : designSelection(sha('a'), selectedTemplate, packagedLibrary);
  const bindings = {
    confirmed_brief_sha256: sha('a'),
    parsed_srt_sha256: frameProjection.parsed_srt_sha256,
    shot_plan_sha256: frameProjection.plan_sha256,
    projection_sha256: frameProjection.receipt.projection_sha256,
    design_slice_sha256: sha('d'),
    display_selection_sha256: sha('e'),
    font_package_sha256: sha('f'),
    design_selection_sha256: selectedDesign.selection_sha256,
    base_template_id: effectiveBase.id,
    base_template_sha256: fingerprintRenderValue(effectiveBase),
    design_library_snapshot_sha256: designLibrarySnapshotSha256(packagedLibrary),
  };
  const sourceSpecs = [
    ['brief-source', 'confirmed-brief', 'brief-artifact', bindings.confirmed_brief_sha256],
    ['srt-source', 'parsed-srt', 'srt-artifact', bindings.parsed_srt_sha256],
    ['plan-source', 'shot-plan', 'plan-artifact', bindings.shot_plan_sha256],
    ['projection-source', 'frame-projection', 'projection-artifact', bindings.projection_sha256],
    ['design-source', 'design-slice', 'design-artifact', bindings.design_slice_sha256],
    ['display-source', 'display-selection', 'display-artifact', bindings.display_selection_sha256],
    ['font-source', 'font-package', 'font-artifact', bindings.font_package_sha256],
    ['selection-source', 'design-selection', 'selection-artifact', bindings.design_selection_sha256],
    ['template-source', 'base-template', 'template-artifact', bindings.base_template_sha256],
    ['library-source', 'design-library-snapshot', 'library-artifact', bindings.design_library_snapshot_sha256],
    ['author-source', 'author-curation', 'author-artifact', sha('9')],
  ];
  const recipes = frameProjection.shots.map(
    (shot, index) => authoredRecipe(index + 1, shot, effectiveBase),
  );
  const page = {
    schema_version: 1,
    artifact_type: 'visual-grammar-recipe-page',
    program_id: 'fixture-visual-grammar',
    page_id: 'recipe-page-001',
    page_number: 1,
    shot_start: 1,
    shot_end: recipes.length,
    recipes,
    page_sha256: '',
  };
  const { page_sha256: ignoredPageHash, ...pageCore } = page;
  page.page_sha256 = fingerprintValue(pageCore);
  const document = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
    artifact_type: 'visual-grammar-program',
    compiler_contract: 'scripts/validate-visual-grammar-program.mjs#schema-v1',
    program_id: 'fixture-visual-grammar',
    bindings,
    identity: {
      identity_id: 'evidence-led-editorial',
      statement: '以普通材料中的因果变化承载证据，让标题与锚点形成可识别关系。',
      recognizable_traits: ['每镜一个首读焦点', '动作先产生结果再锁定判断'],
    },
    anti_identity: {
      statement: '不把影片退化为只替换文字、颜色或图标的重复界面模板。',
      rejected_traits: ['连续中心卡片只换标题', '材料退化为无语义壁纸'],
    },
    stable_invariants: {
      surface: '表面必须承接材料、焦点和阅读责任。',
      attention_geometry: '每镜建立明确首读路径和有责任的留白。',
      semantic_anchor: '每个锚点直接绑定字幕判断和来源。',
      anchor_treatment: '标题、主体与锚点形成内容驱动关系。',
      typography: '展示字建立首读层级并按语义显式断行。',
      color: '颜色建立材料与结果的关系。',
      material_texture: '普通材料承担主要语义而非壁纸。',
      motion_causality: '语义原因触发动作并形成结果和交棒。',
      emotional_temperature: '情绪来自内容转折而不是滤镜。',
      hard_avoids: ['禁止只换文字', '禁止验证脚本生成作者决策'],
    },
    variation_axes: effectiveBase.adaptation_knobs.map((knob) => ({
      axis_id: knob.id,
      authoring_field: (native ? NATIVE_AXIS_FIELD : TEMPLATE_AXIS_FIELD).get(knob.id),
      purpose: native ? knob.purpose : knob.adaptation_goal,
      states: knob.options.map((option) => ({
        state_id: option,
        description: `${option} 是模板 ${knob.id} 轴声明的可审计状态。`,
      })),
    })),
    exhaustion_cooldown: {
      exact_recipe_window_shots: 2,
      exact_recipe_max_uses: 1,
      minimum_exact_recipe_gap_shots: 1,
      axis_cooldowns: effectiveBase.adaptation_knobs.map((knob) => ({
        axis_id: knob.id,
        window_shots: 2,
        max_same_state_uses: 1,
        minimum_same_state_gap_shots: 1,
      })),
    },
    provenance: {
      method: 'human-authored-first-principles-deterministic-validation-v1',
      private_inputs_exposed: false,
      source_refs: sourceSpecs.map(([sourceRefId, sourceKind, artifactId, sourceHash]) => ({
        source_ref_id: sourceRefId,
        source_kind: sourceKind,
        artifact_id: artifactId,
        sha256: sourceHash,
        role: `冻结 ${sourceKind} 对作者决策的事实约束。`,
      })),
    },
    shot_count: recipes.length,
    pagination: {
      max_recipes_per_page: 8,
      page_count: 1,
      page_index: [{
        page_id: page.page_id,
        page_number: 1,
        shot_start: 1,
        shot_end: recipes.length,
        shot_ids: recipes.map((item) => item.shot_id),
        recipe_sha256s: recipes.map((item) => item.shot_recipe_sha256),
        page_sha256: page.page_sha256,
      }],
    },
    pages: [page],
    program_sha256: '',
  };
  const { pages: ignoredPages, program_sha256: ignoredProgramHash, ...programCore } = document;
  document.program_sha256 = fingerprintValue(programCore);
  return {
    document,
    projection: frameProjection,
    designSelection: selectedDesign,
    baseTemplate: selectedTemplate,
    nativeBaseCompiler,
    designLibrary: packagedLibrary,
  };
}

function rulesFixture(options = {}) {
  const visual = visualGrammarFixture(options);
  const programResult = validateVisualGrammarProgram(visual.document, {
    projection: visual.projection,
    designSelection: visual.designSelection,
    baseTemplate: visual.baseTemplate,
    nativeBaseCompiler: visual.nativeBaseCompiler,
    designLibrary: visual.designLibrary,
  });
  const assetRoutePolicy = {
    route_order: ['user-media', 'image-generation', 'pexels', 'native-auxiliary'],
    ordinary_primary_required: true,
    native_auxiliary_only: true,
    native_primary_allowed: false,
  };
  const deliveryProfile = {
    profile_id: 'delivery-4k-landscape',
    width: 3840,
    height: 2160,
    fps: { numerator: 25, denominator: 1 },
    codec: 'h264-high',
    audio_policy: 'preserve-if-present',
  };
  const namespacePolicy = {
    scope: 'global-across-all-blocks',
    block_namespace_pattern: '^b[0-9]{3}$',
    dom_id_template: '{block_namespace}--{shot_id}--{local_id}',
    selector_uniqueness: 'global',
    cross_block_duplicate_ids_forbidden: true,
    author_may_write_outside_allocated_namespace: false,
  };
  const seamPolicy = {
    lifecycle_order: ['entry', 'action', 'result', 'hold', 'exit'],
    timeline_gap_ms: 0,
    timeline_overlap_ms: 0,
    entry_accepts_preceding_exit: true,
    exit_hands_off_to_following_entry: true,
    cross_block_obligations_required: true,
    integrator_repair_forbidden: true,
  };
  const antiTemplatePolicy = {
    adjacent_difference_facts_required: true,
    program_cooldown_enforced: true,
    whole_film_signature_gate_contract: 'scripts/validate-anti-template-signatures.mjs#schema-v1',
    whole_film_signature_gate_required: true,
    content_driven_exceptions_only: true,
    deterministic_gate_may_issue_aesthetic_verdict: false,
  };
  const bindings = {
    ...visual.document.bindings,
    visual_grammar_program_sha256: visual.document.program_sha256,
    asset_route_policy_sha256: fingerprintValue(assetRoutePolicy),
    delivery_profile_sha256: fingerprintValue(deliveryProfile),
    namespace_policy_sha256: fingerprintValue(namespacePolicy),
    seam_policy_sha256: fingerprintValue(seamPolicy),
    anti_template_policy_sha256: fingerprintValue(antiTemplatePolicy),
  };
  const document = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
    artifact_type: 'whole-film-rules',
    rules_contract: 'scripts/validate-whole-film-rules.mjs#schema-v1',
    rules_id: 'fixture-whole-film-rules',
    bindings,
    timing_truth: {
      time_unit: 'integer-milliseconds',
      srt_is_only_upstream_time_truth: true,
      shared_projection_is_only_frame_derivation: true,
      projection_contract: 'scripts/compile-frame-projection.mjs#schema-v1',
      projection_rule: 'absolute-ms-nearest-half-up-shared-boundary-v1',
      projection_sha256: bindings.projection_sha256,
      local_retiming_forbidden: true,
    },
    shared_visual_grammar: {
      program_id: visual.document.program_id,
      program_sha256: programResult.program_sha256,
      identity_sha256: programResult.identity_sha256,
      anti_identity_sha256: programResult.anti_identity_sha256,
      stable_invariants_sha256: programResult.stable_invariants_sha256,
      shared_directive_sha256: programResult.shared_directive_sha256,
      variation_axes_sha256: programResult.variation_axes_sha256,
      exhaustion_cooldown_sha256: programResult.exhaustion_cooldown_sha256,
      block_recipe_contract: 'visual-grammar-block-recipe-packet#schema-v1',
      recipe_hash_preservation_required: true,
    },
    asset_route_policy: assetRoutePolicy,
    delivery_profile: deliveryProfile,
    namespace_policy: namespacePolicy,
    seam_policy: seamPolicy,
    anti_template_policy: antiTemplatePolicy,
    distribution_policy: {
      progressive_disclosure_required: true,
      full_program_kept_in_private_artifact_store: true,
      block_recipe_packet_only: true,
      max_block_shots: 8,
      max_block_span_ms: 45000,
      long_shot_singleton_allowed: true,
      private_locations_exposed: false,
      private_author_instructions_exposed: false,
    },
    authoring_authority: {
      creative_author_required: true,
      validator_authority: 'deterministic-structural-rejection-only',
      validator_may_generate_recipe: false,
      validator_may_issue_aesthetic_verdict: false,
    },
    whole_film_rules_sha256: '',
  };
  resignRules(document);
  return {
    document,
    visualGrammarProgram: visual.document,
    projection: visual.projection,
    designSelection: visual.designSelection,
    baseTemplate: visual.baseTemplate,
    nativeBaseCompiler: visual.nativeBaseCompiler,
    designLibrary: visual.designLibrary,
  };
}

function resignRules(document) {
  const { whole_film_rules_sha256: ignored, ...core } = document;
  document.whole_film_rules_sha256 = fingerprintValue(core);
  return document;
}

function wholeValidationOptions(fixture, extra = {}) {
  return {
    visualGrammarProgram: fixture.visualGrammarProgram,
    projection: fixture.projection,
    designSelection: fixture.designSelection,
    baseTemplate: fixture.baseTemplate,
    nativeBaseCompiler: fixture.nativeBaseCompiler,
    designLibrary: fixture.designLibrary,
    ...extra,
  };
}

test('validates one immutable rules object shared by every block', () => {
  const fixture = rulesFixture();
  const first = validateWholeFilmRules(fixture.document, wholeValidationOptions(fixture));
  const second = validateWholeFilmRules(fixture.document, wholeValidationOptions(fixture));
  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  assert.equal(first.authority, 'deterministic-structural-rejection-only');
  assert.equal(first.whole_film_rules_sha256, fixture.document.whole_film_rules_sha256);
});

test('validates and distributes the actual native compiler through whole-film contexts', () => {
  const fixture = rulesFixture({ native: true });
  const options = wholeValidationOptions(fixture);
  const receipt = validateWholeFilmRules(fixture.document, options);
  assert.equal(receipt.ok, true);
  assert.equal(
    receipt.native_compiler_source_bundle_sha256,
    fixture.designLibrary.nativeBaseCompiler.native_compiler_source_bundle_sha256,
  );
  assert.equal(
    fixture.document.bindings.base_template_id,
    'hyperframes-native',
  );
  const block = {
    block_id: 'B001',
    shot_ids: ['S001', 'S002'],
    start_ms: 0,
    end_ms: 4000,
    start_frame: 0,
    end_frame: 100,
    namespace: 'b001',
    preceding_seam: { neighbor_block_id: null, obligation: 'none' },
    following_seam: {
      neighbor_block_id: 'B002',
      obligation: '把第二镜的退出焦点交给第三镜的进入动作。',
    },
  };
  const context = extractWholeFilmBlockContext(
    fixture.document,
    block,
    options,
  );
  assert.equal(validateWholeFilmBlockContext(
    context,
    fixture.document,
    block,
    options,
  ).ok, true);

  const protectedFixture = rulesFixture({
    native: true,
    protectedUserLayers: ['visual_system', 'motion_grammar'],
  });
  assert.equal(validateWholeFilmRules(
    protectedFixture.document,
    wholeValidationOptions(protectedFixture),
  ).ok, true);

  const missingCompiler = rulesFixture({ native: true });
  missingCompiler.nativeBaseCompiler = undefined;
  assert.throws(
    () => validateWholeFilmRules(
      missingCompiler.document,
      wholeValidationOptions(missingCompiler),
    ),
    (error) => error.code === 'whole_film_rules_upstream_required',
  );

  const tamperedCompiler = rulesFixture({ native: true });
  tamperedCompiler.nativeBaseCompiler.summary += ' Tampered.';
  assert.throws(
    () => validateWholeFilmRules(
      tamperedCompiler.document,
      wholeValidationOptions(tamperedCompiler),
    ),
    (error) => error.code === 'whole_film_rules_visual_grammar_invalid',
  );

  const sourceDrift = rulesFixture({ native: true });
  sourceDrift.nativeBaseCompiler.provenance.source_refs[0].size_bytes += 1;
  assert.throws(
    () => validateWholeFilmRules(
      sourceDrift.document,
      wholeValidationOptions(sourceDrift),
    ),
    (error) => error.code === 'whole_film_rules_visual_grammar_invalid',
  );
});

test('CLI help and exact upstream validation work', async () => {
  const script = fileURLToPath(new URL('./validate-whole-film-rules.mjs', import.meta.url));
  const help = await execFileAsync(process.execPath, [script, '--help']);
  assert.match(help.stdout, /^Usage: node validate-whole-film-rules\.mjs/u);
  assert.match(help.stdout, /--native-base-compiler/u);
  assert.equal(help.stderr, '');
  const fixture = rulesFixture();
  const directory = await mkdtemp(path.join(tmpdir(), 'whole-film-rules-'));
  const rulesPath = path.join(directory, 'rules.json');
  const programPath = path.join(directory, 'program.json');
  const projectionPath = path.join(directory, 'projection.json');
  const selectionPath = path.join(directory, 'selection.json');
  const templatePath = path.join(directory, 'template.json');
  const libraryPath = path.join(directory, 'library.json');
  try {
    await Promise.all([
      writeFile(rulesPath, JSON.stringify(fixture.document), 'utf8'),
      writeFile(programPath, JSON.stringify(fixture.visualGrammarProgram), 'utf8'),
      writeFile(projectionPath, JSON.stringify(fixture.projection), 'utf8'),
      writeFile(selectionPath, JSON.stringify(fixture.designSelection), 'utf8'),
      writeFile(templatePath, JSON.stringify(fixture.baseTemplate), 'utf8'),
      writeFile(libraryPath, JSON.stringify(fixture.designLibrary), 'utf8'),
    ]);
    const result = await execFileAsync(process.execPath, [
      script,
      rulesPath,
      '--visual-grammar-program',
      programPath,
      '--projection',
      projectionPath,
      '--design-selection',
      selectionPath,
      '--base-template',
      templatePath,
      '--design-library',
      libraryPath,
    ]);
    assert.equal(JSON.parse(result.stdout).ok, true);
    await assert.rejects(execFileAsync(process.execPath, [script, rulesPath]), (error) => error.code === 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('CLI validates whole-film rules with the actual native compiler', async () => {
  const script = fileURLToPath(new URL('./validate-whole-film-rules.mjs', import.meta.url));
  const directory = await mkdtemp(path.join(tmpdir(), 'whole-film-native-'));
  const fixture = rulesFixture({ native: true });
  const rulesPath = path.join(directory, 'rules.json');
  const programPath = path.join(directory, 'program.json');
  const projectionPath = path.join(directory, 'projection.json');
  const selectionPath = path.join(directory, 'selection.json');
  const compilerPath = path.join(directory, 'native-compiler.json');
  const libraryPath = path.join(directory, 'library.json');
  try {
    await Promise.all([
      writeFile(rulesPath, JSON.stringify(fixture.document), 'utf8'),
      writeFile(programPath, JSON.stringify(fixture.visualGrammarProgram), 'utf8'),
      writeFile(projectionPath, JSON.stringify(fixture.projection), 'utf8'),
      writeFile(selectionPath, JSON.stringify(fixture.designSelection), 'utf8'),
      writeFile(compilerPath, JSON.stringify(fixture.nativeBaseCompiler), 'utf8'),
      writeFile(libraryPath, JSON.stringify(fixture.designLibrary), 'utf8'),
    ]);
    const result = await execFileAsync(process.execPath, [
      script,
      rulesPath,
      '--visual-grammar-program',
      programPath,
      '--projection',
      projectionPath,
      '--design-selection',
      selectionPath,
      '--native-base-compiler',
      compilerPath,
      '--design-library',
      libraryPath,
    ]);
    assert.equal(JSON.parse(result.stdout).ok, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('fails closed on unknown fields, missing upstream artifacts and root hash tampering', () => {
  const unknown = rulesFixture();
  unknown.document.extra = true;
  assert.throws(
    () => validateWholeFilmRules(unknown.document, wholeValidationOptions(unknown)),
    (error) => error instanceof WholeFilmRulesError && error.code === 'whole_film_rules_schema_invalid',
  );

  const missing = rulesFixture();
  assert.throws(
    () => validateWholeFilmRules(missing.document),
    (error) => error.code === 'whole_film_rules_upstream_required',
  );

  const tampered = rulesFixture();
  tampered.document.whole_film_rules_sha256 = sha('0');
  assert.throws(
    () => validateWholeFilmRules(tampered.document, wholeValidationOptions(tampered)),
    (error) => error.code === 'whole_film_rules_hash_mismatch',
  );
});

test('rejects program-binding drift even when the outer rules hash is renewed', () => {
  const fixture = rulesFixture();
  fixture.document.bindings.design_slice_sha256 = sha('7');
  resignRules(fixture.document);
  assert.throws(
    () => validateWholeFilmRules(fixture.document, wholeValidationOptions(fixture)),
    (error) => error.code === 'whole_film_rules_binding_mismatch',
  );

  const directiveDrift = rulesFixture();
  directiveDrift.document.shared_visual_grammar.shared_directive_sha256 = sha('7');
  resignRules(directiveDrift.document);
  assert.throws(
    () => validateWholeFilmRules(
      directiveDrift.document,
      wholeValidationOptions(directiveDrift),
    ),
    (error) => error.code === 'whole_film_rules_visual_grammar_invalid',
  );
});

test('rejects policy-byte drift and forbidden authority escalation', () => {
  const policyDrift = rulesFixture();
  policyDrift.document.delivery_profile.codec = 'prores-422-hq';
  resignRules(policyDrift.document);
  assert.throws(
    () => validateWholeFilmRules(policyDrift.document, wholeValidationOptions(policyDrift)),
    (error) => error.code === 'whole_film_rules_policy_hash_mismatch',
  );

  const escalation = rulesFixture();
  escalation.document.authoring_authority.validator_may_generate_recipe = true;
  resignRules(escalation.document);
  assert.throws(
    () => validateWholeFilmRules(escalation.document, wholeValidationOptions(escalation)),
    (error) => error.code === 'whole_film_rules_policy_invalid',
  );

  const fpsDrift = rulesFixture();
  fpsDrift.document.delivery_profile.fps = { numerator: 30, denominator: 1 };
  fpsDrift.document.bindings.delivery_profile_sha256 =
    fingerprintValue(fpsDrift.document.delivery_profile);
  resignRules(fpsDrift.document);
  assert.throws(
    () => validateWholeFilmRules(fpsDrift.document, wholeValidationOptions(fpsDrift)),
    (error) => error.code === 'whole_film_rules_timing_invalid',
  );
});

test('checks the full expected binding map when a caller supplies one', () => {
  const fixture = rulesFixture();
  const expected = structuredClone(fixture.document.bindings);
  expected.delivery_profile_sha256 = sha('8');
  assert.throws(
    () => validateWholeFilmRules(
      fixture.document,
      wholeValidationOptions(fixture, { expectedBindings: expected }),
    ),
    (error) => error.code === 'whole_film_rules_binding_mismatch',
  );
});

test('extracts a progressive-disclosure block context with only scoped recipes', () => {
  const fixture = rulesFixture();
  const block = {
    block_id: 'B001',
    shot_ids: ['S001', 'S002'],
    start_ms: 0,
    end_ms: 4000,
    start_frame: 0,
    end_frame: 100,
    namespace: 'b001',
    preceding_seam: { neighbor_block_id: null, obligation: 'none' },
    following_seam: {
      neighbor_block_id: 'B002',
      obligation: '把第二镜的退出焦点交给第三镜的进入动作。',
    },
  };
  const options = wholeValidationOptions(fixture);
  const context = extractWholeFilmBlockContext(fixture.document, block, options);
  assert.equal(context.artifact_type, 'whole-film-block-authoring-context');
  assert.deepEqual(context.recipe_packet.shot_ids, ['S001', 'S002']);
  assert.equal('pages' in context, false);
  assert.equal('identity' in context, false);
  assert.equal('provenance' in context, false);
  assert.deepEqual(
    context.recipe_packet.shared_visual_authoring_directive.identity,
    fixture.visualGrammarProgram.identity,
  );
  assert.deepEqual(
    context.recipe_packet.shared_visual_authoring_directive.anti_identity,
    fixture.visualGrammarProgram.anti_identity,
  );
  assert.deepEqual(
    context.recipe_packet.shared_visual_authoring_directive.stable_invariants,
    fixture.visualGrammarProgram.stable_invariants,
  );
  assert.equal(
    context.recipe_packet.shared_visual_authoring_directive.directive_sha256,
    fixture.document.shared_visual_grammar.shared_directive_sha256,
  );
  assert.equal('pagination' in context.recipe_packet, false);
  assert.equal('pages' in context.recipe_packet, false);
  assert.equal('provenance' in context.recipe_packet, false);
  assert.equal(context.context_sha256, fingerprintValue(Object.fromEntries(
    Object.entries(context).filter(([key]) => key !== 'context_sha256'),
  )));
  assert.equal(validateWholeFilmBlockContext(
    context,
    fixture.document,
    block,
    options,
  ).ok, true);

  const tampered = structuredClone(context);
  tampered.recipe_packet.shared_visual_authoring_directive.stable_invariants.color =
    '攻击者替换了共享颜色约束，即使重签所有外层哈希也必须拒绝。';
  const {
    directive_sha256: ignoredDirectiveHash,
    ...directiveCore
  } = tampered.recipe_packet.shared_visual_authoring_directive;
  tampered.recipe_packet.shared_visual_authoring_directive.directive_sha256 =
    fingerprintValue(directiveCore);
  const { packet_sha256: ignoredPacketHash, ...packetCore } = tampered.recipe_packet;
  tampered.recipe_packet.packet_sha256 = fingerprintValue(packetCore);
  const { context_sha256: ignoredContextHash, ...contextCore } = tampered;
  tampered.context_sha256 = fingerprintValue(contextCore);
  assert.throws(
    () => validateWholeFilmBlockContext(
      tampered,
      fixture.document,
      block,
      options,
    ),
    (error) => error.code === 'whole_film_rules_block_context_invalid',
  );

  const omitted = structuredClone(context);
  delete omitted.recipe_packet.shared_visual_authoring_directive;
  const { packet_sha256: ignoredOmittedPacketHash, ...omittedPacketCore } =
    omitted.recipe_packet;
  omitted.recipe_packet.packet_sha256 = fingerprintValue(omittedPacketCore);
  const { context_sha256: ignoredOmittedContextHash, ...omittedContextCore } = omitted;
  omitted.context_sha256 = fingerprintValue(omittedContextCore);
  assert.throws(
    () => validateWholeFilmBlockContext(
      omitted,
      fixture.document,
      block,
      options,
    ),
    (error) => error.code === 'whole_film_rules_block_context_invalid',
  );
});

test('rejects out-of-policy namespace and malformed seam obligations', () => {
  const fixture = rulesFixture();
  const base = {
    block_id: 'B001',
    shot_ids: ['S001', 'S002'],
    start_ms: 0,
    end_ms: 4000,
    start_frame: 0,
    end_frame: 100,
    namespace: 'block-one',
    preceding_seam: { neighbor_block_id: null, obligation: 'none' },
    following_seam: {
      neighbor_block_id: 'B002',
      obligation: '把第二镜的退出焦点交给第三镜的进入动作。',
    },
  };
  assert.throws(
    () => extractWholeFilmBlockContext(
      fixture.document,
      base,
      wholeValidationOptions(fixture),
    ),
    (error) => error.code === 'whole_film_rules_block_scope_invalid',
  );
  base.namespace = 'b001';
  base.following_seam = { neighbor_block_id: null, obligation: 'hand off anyway' };
  assert.throws(
    () => extractWholeFilmBlockContext(
      fixture.document,
      base,
      wholeValidationOptions(fixture),
    ),
    (error) => error.code === 'whole_film_rules_block_scope_invalid',
  );
});

test('binds seam nullability to the actual first and final program shots', () => {
  const fixture = rulesFixture();
  const finalBlock = {
    block_id: 'B002',
    shot_ids: ['S003', 'S004'],
    start_ms: 4000,
    end_ms: 8000,
    start_frame: 100,
    end_frame: 200,
    namespace: 'b002',
    preceding_seam: {
      neighbor_block_id: 'B001',
      obligation: '接收第二镜退出焦点并建立第三镜的进入动作。',
    },
    following_seam: { neighbor_block_id: null, obligation: 'none' },
  };
  assert.equal(extractWholeFilmBlockContext(
    fixture.document,
    finalBlock,
    wholeValidationOptions(fixture),
  ).block_id, 'B002');

  const midFilmFollowingNone = {
    block_id: 'B001',
    shot_ids: ['S001', 'S002'],
    start_ms: 0,
    end_ms: 4000,
    start_frame: 0,
    end_frame: 100,
    namespace: 'b001',
    preceding_seam: { neighbor_block_id: null, obligation: 'none' },
    following_seam: { neighbor_block_id: null, obligation: 'none' },
  };
  assert.throws(
    () => extractWholeFilmBlockContext(
      fixture.document,
      midFilmFollowingNone,
      wholeValidationOptions(fixture),
    ),
    (error) => error.code === 'whole_film_rules_block_scope_invalid',
  );

  const firstBlockStartsLate = {
    block_id: 'B001',
    shot_ids: ['S002'],
    start_ms: 2000,
    end_ms: 4000,
    start_frame: 50,
    end_frame: 100,
    namespace: 'b001',
    preceding_seam: { neighbor_block_id: null, obligation: 'none' },
    following_seam: {
      neighbor_block_id: 'B002',
      obligation: '把第二镜退出焦点交给后续块的进入动作。',
    },
  };
  assert.throws(
    () => extractWholeFilmBlockContext(
      fixture.document,
      firstBlockStartsLate,
      wholeValidationOptions(fixture),
    ),
    (error) => error.code === 'whole_film_rules_block_scope_invalid',
  );

  const finalClaimsNeighbor = structuredClone(finalBlock);
  finalClaimsNeighbor.following_seam = {
    neighbor_block_id: 'B003',
    obligation: '错误地声称最终镜之后仍然存在一个后续块。',
  };
  assert.throws(
    () => extractWholeFilmBlockContext(
      fixture.document,
      finalClaimsNeighbor,
      wholeValidationOptions(fixture),
    ),
    (error) => error.code === 'whole_film_rules_block_scope_invalid',
  );
});

test('whole-film path sanitizer rejects local tokens while allowing prose and HTTPS URLs', () => {
  const forbidden = [
    '/tmp/private.json',
    '/Volumes/Project/private.json',
    '/opt/internal/tool',
    'C:\\Users\\person\\private.json',
    '\\\\server\\share\\private.json',
    'file:///tmp/private.json',
  ];
  for (const token of forbidden) {
    assert.equal(containsForbiddenLocalPathToken(`本地位置 ${token} 不可公开。`), true);
    const fixture = rulesFixture();
    fixture.document.delivery_profile.codec = `内部编解码器位于 ${token}`;
    fixture.document.bindings.delivery_profile_sha256 =
      fingerprintValue(fixture.document.delivery_profile);
    resignRules(fixture.document);
    assert.throws(
      () => validateWholeFilmRules(fixture.document, wholeValidationOptions(fixture)),
      (error) => error.code === 'whole_film_rules_policy_invalid',
    );
  }

  const safe = rulesFixture();
  safe.document.delivery_profile.codec =
    '公开规范见 https://example.com/specs/codec，普通说明保持可读';
  safe.document.bindings.delivery_profile_sha256 =
    fingerprintValue(safe.document.delivery_profile);
  resignRules(safe.document);
  assert.equal(containsForbiddenLocalPathToken(
    '公开规范见 https://example.com/specs/codec，普通说明保持可读',
  ), false);
  assert.equal(validateWholeFilmRules(safe.document, wholeValidationOptions(safe)).ok, true);
});
