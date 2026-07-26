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
  containsForbiddenLocalPathToken,
  deriveSubstantiveVisualCore,
  extractBlockScopedRecipes,
  validateVisualGrammarBlockRecipePacket,
  validateVisualGrammarProgram,
  VisualGrammarProgramError,
} from './validate-visual-grammar-program.mjs';

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

function nativeCompilerSourceBundleSha256(compiler) {
  return fingerprintRenderValue({
    source_refs: [...compiler.provenance.source_refs].sort((left, right) => (
      left.artifact_id.localeCompare(right.artifact_id)
    )),
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
  const mode = protectedUserLayers.length
    ? 'user-design-native-supplement'
    : 'native-fallback';
  const core = {
    schema_version: 1,
    briefs_sha256: briefsSha256,
    mode,
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

function validationOptions(fixture) {
  return {
    projection: fixture.projection,
    designSelection: fixture.designSelection,
    baseTemplate: fixture.baseTemplate,
    nativeBaseCompiler: fixture.nativeBaseCompiler,
    designLibrary: fixture.designLibrary,
  };
}

function projection(shotCount = 4) {
  return compileFrameProjection({
    pipeline_contract_version: 2,
    artifact_id: 'projection-main',
    parsed_srt_sha256: sha('b'),
    plan_sha256: sha('c'),
    fps: { numerator: 25, denominator: 1 },
    shots: Array.from({ length: shotCount }, (_, index) => ({
      shot_id: `S${String(index + 1).padStart(3, '0')}`,
      start_ms: index * 2000,
      end_ms: (index + 1) * 2000,
    })),
  });
}

function decision(index, prefix, extra) {
  return {
    decision_id: `${prefix}-${index}`,
    ...extra,
  };
}

function recipe(index, projectedShot) {
  const shotId = `S${String(index).padStart(3, '0')}`;
  return {
    shot_id: shotId,
    srt_window_ms: structuredClone(projectedShot.srt_window_ms),
    frame_window: structuredClone(projectedShot.frame_window),
    semantic_claim: `第 ${index} 镜把字幕中的因果结论转成一个可核验的视觉命题。`,
    surface: decision(index, 'surface', {
      intent: `第 ${index} 镜选择一种承接该段内容密度的连续视觉表面。`,
      implementation_obligation: `表面必须让第 ${index} 镜的语义对象保持可见且不能退化成换字卡片。`,
    }),
    attention_geometry: decision(index, 'attention', {
      primary_focus: `第 ${index} 镜的首读焦点是发生因果变化的主体。`,
      reading_order: `先读主体变化，再读结果文字，最后读取材料证据。`,
      negative_space_responsibility: `留白承担第 ${index} 镜标题呼吸与下一动作预告。`,
    }),
    semantic_anchor: {
      decision_id: `anchor-decision-${index}`,
      anchor_id: `semantic-anchor-${index}`,
      claim: `第 ${index} 镜的锚点必须直接对应字幕中的核心判断。`,
      source_ref_ids: ['srt-source', 'author-source'],
    },
    anchor_treatment: decision(index, 'treatment', {
      relationship: `第 ${index} 镜让标题与语义锚点发生明确的空间关系。`,
      protection: `锚点的事实识别区必须完整，不能被装饰或文字遮挡。`,
    }),
    typography: decision(index, 'type', {
      hierarchy: `第 ${index} 镜以展示字建立首读层级，正文只解释锚点。`,
      line_break_policy: `只按该镜语义断句显式换行，不允许运行时自动改写。`,
      display_role: `展示字承担第 ${index} 镜的核心判断而非装饰标签。`,
    }),
    color: decision(index, 'color', {
      palette_relationship: `第 ${index} 镜用材料本色建立基底，再用单一强调色标出结果。`,
      contrast_logic: `事实文字与承载表面保持稳定可读对比。`,
      accent_responsibility: `强调色只指向第 ${index} 镜的因果结果。`,
    }),
    material_texture: decision(index, 'material', {
      primary_material_role: `第 ${index} 镜的普通材料承担主要语义证据。`,
      texture_behavior: `纹理随语义动作显露，但不能沦为全屏壁纸。`,
      route_intent: `按冻结材料路由为第 ${index} 镜选择一个普通主材料。`,
    }),
    motion_causality: {
      decision_id: `motion-${index}`,
      cause: `字幕中的第 ${index} 个原因触发主体状态变化。`,
      action: `主体执行一个与该原因直接相关的可见动作。`,
      result: `动作产生可停留读取的第 ${index} 个视觉结果。`,
      lifecycle: {
        entry: `主体进入并建立第 ${index} 镜的首读焦点。`,
        action: `原因驱动唯一主要动作发生。`,
        result: `动作形成稳定且可辨认的结果态。`,
        hold: `结果保持到足以完整读取核心判断。`,
        exit: `焦点退出并把注意力交给下一镜。`,
      },
    },
    emotional_temperature: decision(index, 'temperature', {
      temperature_label: index % 2 ? '克制而紧张' : '冷静而释然',
      intent: `情绪温度服务第 ${index} 镜的内容转折，不作为滤镜预设。`,
    }),
    hard_avoids: [
      `禁止第 ${index} 镜把材料降级成无语义壁纸`,
      `禁止第 ${index} 镜只替换标题而保留全部关系`,
    ],
    variation_states: BASE_TEMPLATE.adaptation_knobs.map((knob) => ({
      axis_id: knob.id,
      state_id: knob.options[(index - 1) % knob.options.length],
    })),
    adjacent_difference: {
      previous_shot_id: index === 1 ? null : `S${String(index - 1).padStart(3, '0')}`,
      changed_axis_ids: index === 1
        ? []
        : BASE_TEMPLATE.adaptation_knobs.map((knob) => knob.id),
      changed_authoring_fields: index === 1 ? [] : [...AUTHORING_FIELDS],
      content_reason: index === 1
        ? 'first-shot-baseline'
        : `第 ${index} 镜的语义对象和因果动作不同，因此需要重新冻结全部作者决策。`,
    },
    provenance_ref_ids: ['srt-source', 'plan-source', 'author-source'],
    authoring_signature_sha256: '',
    shot_recipe_sha256: '',
  };
}

function resignRecipe(value) {
  value.authoring_signature_sha256 = fingerprintValue(deriveSubstantiveVisualCore(value));
  const { shot_recipe_sha256: ignored, ...core } = value;
  value.shot_recipe_sha256 = fingerprintValue(core);
}

function resignProgram(value) {
  for (const recipeValue of value.pages.flatMap((page) => page.recipes)) resignRecipe(recipeValue);
  return resignContainers(value);
}

function resignContainers(value) {
  let pageShotStart = 1;
  value.pagination.page_index = value.pages.map((page, index) => {
    page.page_number = index + 1;
    page.shot_start = pageShotStart;
    page.shot_end = pageShotStart + page.recipes.length - 1;
    const { page_sha256: ignored, ...core } = page;
    page.page_sha256 = fingerprintValue(core);
    pageShotStart = page.shot_end + 1;
    return {
      page_id: page.page_id,
      page_number: page.page_number,
      shot_start: page.shot_start,
      shot_end: page.shot_end,
      shot_ids: page.recipes.map((item) => item.shot_id),
      recipe_sha256s: page.recipes.map((item) => item.shot_recipe_sha256),
      page_sha256: page.page_sha256,
    };
  });
  value.pagination.page_count = value.pages.length;
  value.shot_count = value.pages.flatMap((page) => page.recipes).length;
  const { pages: ignoredPages, program_sha256: ignoredHash, ...core } = value;
  value.program_sha256 = fingerprintValue(core);
  return value;
}

function bindSelection(fixture) {
  const selection = fixture.designSelection;
  const { selection_sha256: ignoredSelectionHash, ...selectionCore } = selection;
  selection.selection_sha256 = fingerprintValue(selectionCore);
  fixture.document.bindings.design_selection_sha256 = selection.selection_sha256;
  fixture.document.bindings.base_template_id = selection.base_template;
  fixture.document.bindings.base_template_sha256 = selection.base_template_sha256;
  fixture.document.bindings.design_library_snapshot_sha256 =
    selection.design_library_snapshot_sha256;
  const sourceByKind = new Map(
    fixture.document.provenance.source_refs.map((reference) => [
      reference.source_kind,
      reference,
    ]),
  );
  sourceByKind.get('design-selection').sha256 = selection.selection_sha256;
  sourceByKind.get('base-template').sha256 = selection.base_template_sha256;
  sourceByKind.get('design-library-snapshot').sha256 =
    selection.design_library_snapshot_sha256;
  resignContainers(fixture.document);
  return fixture;
}

function bindSelectedTemplateBytes(fixture) {
  const libraryTemplateIndex = fixture.designLibrary.templates.findIndex(
    (template) => template.id === fixture.baseTemplate.id,
  );
  assert.notEqual(libraryTemplateIndex, -1);
  fixture.designLibrary.templates[libraryTemplateIndex] =
    structuredClone(fixture.baseTemplate);
  fixture.designSelection.base_template_sha256 =
    fingerprintRenderValue(fixture.baseTemplate);
  fixture.designSelection.design_library_snapshot_sha256 =
    designLibrarySnapshotSha256(fixture.designLibrary);
  bindSelection(fixture);
  return fixture;
}

function installTemplateVisualGrammarConstraints(fixture, overrides = {}) {
  const constraints = {
    axis_authoring_fields: fixture.baseTemplate.adaptation_knobs.map((knob) => {
      const authoringField = TEMPLATE_AXIS_FIELD.get(knob.id);
      assert.equal(typeof authoringField, 'string');
      return {
        axis_id: knob.id,
        authoring_field: authoringField,
      };
    }),
    adjacent_min_axis_changes: 3,
    adjacent_required_any_axis_ids: ['anchor-form', 'motion-cause'],
    ...overrides,
  };
  fixture.baseTemplate.visual_grammar_constraints =
    structuredClone(constraints);
  return bindSelectedTemplateBytes(fixture);
}

function retainSecondRecipeAxisChanges(fixture, retainedAxisIds, {
  changedMappedFieldAxisIds = retainedAxisIds,
  changedUnmappedFields = ['anchor_treatment', 'emotional_temperature'],
} = {}) {
  const recipes = fixture.document.pages.flatMap((page) => page.recipes);
  const previous = recipes[0];
  const current = recipes[1];
  const retained = new Set(retainedAxisIds);
  const changedMapped = new Set(changedMappedFieldAxisIds);
  current.variation_states = current.variation_states.map((selection, index) => (
    retained.has(selection.axis_id)
      ? selection
      : structuredClone(previous.variation_states[index])
  ));
  const axisAuthoringFields =
    fixture.baseTemplate.visual_grammar_constraints?.axis_authoring_fields
    ?? fixture.baseTemplate.adaptation_knobs.map((knob) => ({
      axis_id: knob.id,
      authoring_field: TEMPLATE_AXIS_FIELD.get(knob.id),
    }));
  for (const mapping of axisAuthoringFields) {
    if (!changedMapped.has(mapping.axis_id)) {
      current[mapping.authoring_field] =
        structuredClone(previous[mapping.authoring_field]);
    }
  }
  const mappedFields = new Set(
    axisAuthoringFields.map((mapping) => mapping.authoring_field),
  );
  for (const field of AUTHORING_FIELDS) {
    if (
      !mappedFields.has(field)
      && !changedUnmappedFields.includes(field)
    ) current[field] = structuredClone(previous[field]);
  }
  current.adjacent_difference.changed_axis_ids =
    current.variation_states
      .filter((selection, index) => (
        selection.state_id !== previous.variation_states[index].state_id
      ))
      .map((selection) => selection.axis_id);
  const currentSubstantive = deriveSubstantiveVisualCore(current);
  const previousSubstantive = deriveSubstantiveVisualCore(previous);
  current.adjacent_difference.changed_authoring_fields =
    AUTHORING_FIELDS.filter((field) => (
      fingerprintValue(currentSubstantive[field])
        !== fingerprintValue(previousSubstantive[field])
    ));
  resignProgram(fixture.document);
  return fixture;
}

function program() {
  const projected = projection();
  const recipes = projected.shots.map((item, index) => recipe(index + 1, item));
  const selectedTemplate = structuredClone(BASE_TEMPLATE);
  const packagedLibrary = structuredClone(DESIGN_LIBRARY);
  const selectedDesign = designSelection(sha('a'), selectedTemplate, packagedLibrary);
  const bindings = {
    confirmed_brief_sha256: sha('a'),
    parsed_srt_sha256: projected.parsed_srt_sha256,
    shot_plan_sha256: projected.plan_sha256,
    projection_sha256: projected.receipt.projection_sha256,
    design_slice_sha256: sha('d'),
    display_selection_sha256: sha('e'),
    font_package_sha256: sha('f'),
    design_selection_sha256: selectedDesign.selection_sha256,
    base_template_id: selectedTemplate.id,
    base_template_sha256: fingerprintRenderValue(selectedTemplate),
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
    ['author-source', 'author-curation', 'author-decisions', sha('9')],
  ];
  const value = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
    artifact_type: 'visual-grammar-program',
    compiler_contract: 'scripts/validate-visual-grammar-program.mjs#schema-v1',
    program_id: 'fixture-visual-grammar',
    bindings,
    identity: {
      identity_id: 'evidence-led-editorial',
      statement: '以普通材料中的因果变化承载证据，让标题与语义锚点形成可辨认的编辑关系。',
      recognizable_traits: ['每镜只有一个明确首读焦点', '动作先产生结果，文字随后锁定判断'],
    },
    anti_identity: {
      statement: '不把影片退化为只替换文字、颜色或图标的重复界面模板。',
      rejected_traits: ['连续中心卡片只换标题', '材料退化为无语义全屏壁纸'],
    },
    stable_invariants: {
      surface: '所有表面必须承接材料、焦点和阅读责任，不能只是背景皮肤。',
      attention_geometry: '每镜建立一条明确首读路径，留白承担焦点、阅读或交棒责任。',
      semantic_anchor: '每个锚点必须直接绑定该镜字幕判断和可追溯来源。',
      anchor_treatment: '标题、主体和锚点必须形成内容驱动的空间关系。',
      typography: '展示字建立首读层级，正文只承担解释并按语义显式断行。',
      color: '颜色建立材料与结果的关系，强调色只承担一个明确责任。',
      material_texture: '普通材料承担主语义，纹理通过动作贡献而不是覆盖画面。',
      motion_causality: '动作必须由语义原因触发，并产生结果、停留和交棒。',
      emotional_temperature: '情绪温度来自内容转折和节奏，不来自套用滤镜。',
      hard_avoids: ['禁止相邻镜头只替换可读文案', '禁止验证脚本生成创意决策'],
    },
    variation_axes: selectedTemplate.adaptation_knobs.map((knob) => ({
      axis_id: knob.id,
      authoring_field: TEMPLATE_AXIS_FIELD.get(knob.id),
      purpose: knob.adaptation_goal,
      states: knob.options.map((option) => ({
        state_id: option,
        description: `${option} 是模板 ${knob.id} 轴声明的可审计状态。`,
      })),
    })),
    exhaustion_cooldown: {
      exact_recipe_window_shots: 4,
      exact_recipe_max_uses: 1,
      minimum_exact_recipe_gap_shots: 1,
      axis_cooldowns: selectedTemplate.adaptation_knobs.map((knob) => ({
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
        role: `冻结 ${sourceKind} 对视觉语法程序的事实约束。`,
      })),
    },
    shot_count: recipes.length,
    pagination: {
      max_recipes_per_page: 8,
      page_count: 2,
      page_index: [],
    },
    pages: [
      {
        schema_version: 1,
        artifact_type: 'visual-grammar-recipe-page',
        program_id: 'fixture-visual-grammar',
        page_id: 'recipe-page-001',
        page_number: 1,
        shot_start: 1,
        shot_end: 2,
        recipes: recipes.slice(0, 2),
        page_sha256: '',
      },
      {
        schema_version: 1,
        artifact_type: 'visual-grammar-recipe-page',
        program_id: 'fixture-visual-grammar',
        page_id: 'recipe-page-002',
        page_number: 2,
        shot_start: 3,
        shot_end: 4,
        recipes: recipes.slice(2),
        page_sha256: '',
      },
    ],
    program_sha256: '',
  };
  return {
    document: resignProgram(value),
    projection: projected,
    designSelection: selectedDesign,
    baseTemplate: selectedTemplate,
    designLibrary: packagedLibrary,
  };
}

function nativeProgram(protectedUserLayers = []) {
  const fixture = program();
  const nativeBaseCompiler = structuredClone(
    fixture.designLibrary.nativeBaseCompiler,
  );
  fixture.baseTemplate = undefined;
  fixture.nativeBaseCompiler = nativeBaseCompiler;
  fixture.designSelection = nativeDesignSelection(
    fixture.document.bindings.confirmed_brief_sha256,
    nativeBaseCompiler,
    fixture.designLibrary,
    protectedUserLayers,
  );
  fixture.document.variation_axes = nativeBaseCompiler.adaptation_knobs.map((knob) => ({
    axis_id: knob.id,
    authoring_field: NATIVE_AXIS_FIELD.get(knob.id),
    purpose: knob.purpose,
    states: knob.options.map((option) => ({
      state_id: option,
      description: `${option} 是原生编译器 ${knob.id} 轴声明的可审计状态。`,
    })),
  }));
  fixture.document.exhaustion_cooldown.axis_cooldowns =
    nativeBaseCompiler.adaptation_knobs.map((knob) => ({
      axis_id: knob.id,
      window_shots: 2,
      max_same_state_uses: 1,
      minimum_same_state_gap_shots: 1,
    }));
  fixture.document.pages.flatMap((page) => page.recipes).forEach((item, index) => {
    item.variation_states = nativeBaseCompiler.adaptation_knobs.map((knob) => ({
      axis_id: knob.id,
      state_id: knob.options[index % knob.options.length],
    }));
    item.adjacent_difference.changed_axis_ids = index === 0
      ? []
      : nativeBaseCompiler.adaptation_knobs.map((knob) => knob.id);
  });
  resignProgram(fixture.document);
  return bindSelection(fixture);
}

test('accepts a hash-bound paginated program and returns deterministic rejection-only facts', () => {
  const fixture = program();
  const first = validateVisualGrammarProgram(fixture.document, validationOptions(fixture));
  const second = validateVisualGrammarProgram(fixture.document, validationOptions(fixture));
  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  assert.equal(first.authority, 'deterministic-structural-rejection-only');
  assert.equal(first.shot_count, 4);
  assert.equal(first.page_count, 2);
  assert.equal(first.program_sha256, fixture.document.program_sha256);
  assert.deepEqual(first.template_axis_ids, [
    'density-tier',
    'anchor-form',
    'anchor-quadrant',
    'type-relation',
    'accent-form',
    'material-process',
    'motion-cause',
  ]);
});

test('CLI help and exact projection validation work', async () => {
  const script = fileURLToPath(new URL('./validate-visual-grammar-program.mjs', import.meta.url));
  const help = await execFileAsync(process.execPath, [script, '--help']);
  assert.match(help.stdout, /^Usage: node validate-visual-grammar-program\.mjs/u);
  assert.match(help.stdout, /--native-base-compiler/u);
  assert.equal(help.stderr, '');

  const directory = await mkdtemp(path.join(tmpdir(), 'visual-grammar-'));
  const fixture = program();
  const programPath = path.join(directory, 'program.json');
  const projectionPath = path.join(directory, 'projection.json');
  const selectionPath = path.join(directory, 'selection.json');
  const templatePath = path.join(directory, 'template.json');
  const libraryPath = path.join(directory, 'library.json');
  try {
    await Promise.all([
      writeFile(programPath, JSON.stringify(fixture.document), 'utf8'),
      writeFile(projectionPath, JSON.stringify(fixture.projection), 'utf8'),
      writeFile(selectionPath, JSON.stringify(fixture.designSelection), 'utf8'),
      writeFile(templatePath, JSON.stringify(fixture.baseTemplate), 'utf8'),
      writeFile(libraryPath, JSON.stringify(fixture.designLibrary), 'utf8'),
    ]);
    const result = await execFileAsync(process.execPath, [
      script,
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
    await assert.rejects(execFileAsync(process.execPath, [script, programPath]), (error) => error.code === 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('CLI validates the actual native compiler branch', async () => {
  const script = fileURLToPath(new URL('./validate-visual-grammar-program.mjs', import.meta.url));
  const directory = await mkdtemp(path.join(tmpdir(), 'visual-grammar-native-'));
  const fixture = nativeProgram();
  const programPath = path.join(directory, 'program.json');
  const projectionPath = path.join(directory, 'projection.json');
  const selectionPath = path.join(directory, 'selection.json');
  const compilerPath = path.join(directory, 'native-compiler.json');
  const libraryPath = path.join(directory, 'library.json');
  try {
    await Promise.all([
      writeFile(programPath, JSON.stringify(fixture.document), 'utf8'),
      writeFile(projectionPath, JSON.stringify(fixture.projection), 'utf8'),
      writeFile(selectionPath, JSON.stringify(fixture.designSelection), 'utf8'),
      writeFile(compilerPath, JSON.stringify(fixture.nativeBaseCompiler), 'utf8'),
      writeFile(libraryPath, JSON.stringify(fixture.designLibrary), 'utf8'),
    ]);
    const result = await execFileAsync(process.execPath, [
      script,
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
    assert.equal(JSON.parse(result.stdout).base_template_id, 'hyperframes-native');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects unknown schema fields and all hash tampering levels', () => {
  const extra = program();
  extra.document.unknown = true;
  assert.throws(
    () => validateVisualGrammarProgram(extra.document, validationOptions(extra)),
    (error) => error instanceof VisualGrammarProgramError && error.code === 'visual_grammar_schema_invalid',
  );

  const recipeTamper = program();
  recipeTamper.document.pages[0].recipes[0].semantic_claim = '这个改动没有重新签名。';
  resignContainers(recipeTamper.document);
  assert.throws(
    () => validateVisualGrammarProgram(recipeTamper.document, validationOptions(recipeTamper)),
    (error) => error.code === 'visual_grammar_hash_mismatch',
  );

  const pageTamper = program();
  pageTamper.document.pages[0].page_sha256 = sha('0');
  assert.throws(
    () => validateVisualGrammarProgram(pageTamper.document, validationOptions(pageTamper)),
    (error) => error.code === 'visual_grammar_page_hash_mismatch',
  );

  const rootTamper = program();
  rootTamper.document.program_sha256 = sha('0');
  assert.throws(
    () => validateVisualGrammarProgram(rootTamper.document, validationOptions(rootTamper)),
    (error) => error.code === 'visual_grammar_hash_mismatch',
  );
});

test('rejects forged adjacent-difference facts even after every enclosing hash is renewed', () => {
  const fixture = program();
  fixture.document.pages[0].recipes[1].adjacent_difference.changed_axis_ids = [];
  resignProgram(fixture.document);
  assert.throws(
    () => validateVisualGrammarProgram(fixture.document, validationOptions(fixture)),
    (error) => error.code === 'visual_grammar_adjacent_difference_invalid' && error.shot === 2,
  );
});

test('rejects ID-only adjacent changes after all recipe, page and root hashes are renewed', () => {
  const fixture = program();
  const first = fixture.document.pages[0].recipes[0];
  const second = fixture.document.pages[0].recipes[1];
  for (const field of AUTHORING_FIELDS) second[field] = structuredClone(first[field]);
  second.surface.decision_id = 'surface-forged-2';
  second.attention_geometry.decision_id = 'attention-forged-2';
  second.semantic_anchor.decision_id = 'anchor-decision-forged-2';
  second.semantic_anchor.anchor_id = 'anchor-forged-2';
  second.semantic_anchor.source_ref_ids = ['author-source', 'srt-source'];
  second.anchor_treatment.decision_id = 'treatment-forged-2';
  second.typography.decision_id = 'type-forged-2';
  second.color.decision_id = 'color-forged-2';
  second.material_texture.decision_id = 'material-forged-2';
  second.motion_causality.decision_id = 'motion-forged-2';
  second.emotional_temperature.decision_id = 'temperature-forged-2';
  second.provenance_ref_ids = ['author-source', 'plan-source', 'srt-source'];
  second.variation_states = structuredClone(first.variation_states);
  second.adjacent_difference.changed_axis_ids = [];
  second.adjacent_difference.changed_authoring_fields = [];
  second.adjacent_difference.content_reason =
    '攻击样本只替换不影响视觉和语义的标识符，不能构成相邻变化。';
  resignProgram(fixture.document);
  assert.throws(
    () => validateVisualGrammarProgram(fixture.document, validationOptions(fixture)),
    (error) => error.code === 'visual_grammar_adjacent_difference_invalid' && error.shot === 2,
  );
});

test('rejects claim-copy-only and hard-avoid-only adjacent changes after complete re-signing', () => {
  const claimOnly = program();
  const claimFirst = claimOnly.document.pages[0].recipes[0];
  const claimSecond = claimOnly.document.pages[0].recipes[1];
  for (const field of AUTHORING_FIELDS) {
    claimSecond[field] = structuredClone(claimFirst[field]);
  }
  claimSecond.hard_avoids = structuredClone(claimFirst.hard_avoids);
  claimSecond.adjacent_difference.changed_authoring_fields = [];
  claimSecond.adjacent_difference.content_reason =
    '攻击样本只改语义锚点文案，不改变任何正向可见设计维度。';
  resignProgram(claimOnly.document);
  assert.throws(
    () => validateVisualGrammarProgram(
      claimOnly.document,
      validationOptions(claimOnly),
    ),
    (error) => (
      error.code === 'visual_grammar_adjacent_difference_invalid'
      && error.shot === 2
    ),
  );

  const hardAvoidOnly = program();
  const avoidFirst = hardAvoidOnly.document.pages[0].recipes[0];
  const avoidSecond = hardAvoidOnly.document.pages[0].recipes[1];
  for (const field of AUTHORING_FIELDS) {
    avoidSecond[field] = structuredClone(avoidFirst[field]);
  }
  avoidSecond.semantic_anchor = structuredClone(avoidFirst.semantic_anchor);
  avoidSecond.adjacent_difference.changed_authoring_fields = [];
  avoidSecond.adjacent_difference.content_reason =
    '攻击样本只改负向禁用文案，不改变任何正向可见设计维度。';
  resignProgram(hardAvoidOnly.document);
  assert.throws(
    () => validateVisualGrammarProgram(
      hardAvoidOnly.document,
      validationOptions(hardAvoidOnly),
    ),
    (error) => (
      error.code === 'visual_grammar_adjacent_difference_invalid'
      && error.shot === 2
    ),
  );
});

test('rejects cooldown exhaustion deterministically without choosing creative replacements', () => {
  const fixture = program();
  fixture.document.exhaustion_cooldown.axis_cooldowns[0].window_shots = 3;
  const previous = fixture.document.pages[0].recipes[1];
  const current = fixture.document.pages[1].recipes[0];
  current.variation_states[0].state_id =
    previous.variation_states[0].state_id;
  current.surface = structuredClone(previous.surface);
  current.adjacent_difference.changed_axis_ids =
    current.adjacent_difference.changed_axis_ids.filter(
      (axisId) => axisId !== 'density-tier',
    );
  const currentSubstantive = deriveSubstantiveVisualCore(current);
  const previousSubstantive = deriveSubstantiveVisualCore(previous);
  current.adjacent_difference.changed_authoring_fields =
    AUTHORING_FIELDS.filter((field) => (
      fingerprintValue(currentSubstantive[field])
        !== fingerprintValue(previousSubstantive[field])
    ));
  resignProgram(fixture.document);
  assert.throws(
    () => validateVisualGrammarProgram(fixture.document, validationOptions(fixture)),
    (error) => error.code === 'visual_grammar_cooldown_violation' && error.shot === 3,
  );
});

test('rejects private location leakage and any projection drift', () => {
  const privateLeak = program();
  privateLeak.document.provenance.source_refs.at(-1).role =
    '作者决策来自 /Users/example/private/notes.md 中的内部材料。';
  resignProgram(privateLeak.document);
  assert.throws(
    () => validateVisualGrammarProgram(privateLeak.document, validationOptions(privateLeak)),
    (error) => error.code === 'visual_grammar_provenance_invalid',
  );

  const privateInstructions = program();
  privateInstructions.document.provenance.source_refs.at(-1).role =
    '这里包含 private prompt 的内部作者指令，不能进入程序。';
  resignProgram(privateInstructions.document);
  assert.throws(
    () => validateVisualGrammarProgram(privateInstructions.document, validationOptions(privateInstructions)),
    (error) => error.code === 'visual_grammar_provenance_invalid',
  );

  const drift = program();
  drift.document.pages[0].recipes[0].srt_window_ms.end_ms -= 1;
  resignProgram(drift.document);
  assert.throws(
    () => validateVisualGrammarProgram(drift.document, validationOptions(drift)),
    (error) => error.code === 'visual_grammar_projection_mismatch',
  );
});

test('rejects duplicate provenance artifact IDs after the program root is re-signed', () => {
  const duplicateArtifact = program();
  duplicateArtifact.document.provenance.source_refs[1].artifact_id =
    duplicateArtifact.document.provenance.source_refs[0].artifact_id;
  resignContainers(duplicateArtifact.document);
  assert.throws(
    () => validateVisualGrammarProgram(
      duplicateArtifact.document,
      validationOptions(duplicateArtifact),
    ),
    (error) => error.code === 'visual_grammar_provenance_invalid',
  );
});

test('binds actual selection, template, canonical library snapshot and every selected-template axis', () => {
  const templateBytes = program();
  templateBytes.baseTemplate.title = 'Tampered title bytes';
  assert.throws(
    () => validateVisualGrammarProgram(templateBytes.document, validationOptions(templateBytes)),
    (error) => error.code === 'visual_grammar_design_binding_mismatch',
  );

  const selectedId = program();
  selectedId.designSelection.base_template = 'greenroom-writing';
  const { selection_sha256: ignoredSelectionHash, ...selectionCore } =
    selectedId.designSelection;
  selectedId.designSelection.selection_sha256 = fingerprintValue(selectionCore);
  selectedId.document.bindings.design_selection_sha256 =
    selectedId.designSelection.selection_sha256;
  selectedId.document.provenance.source_refs.find(
    (reference) => reference.source_kind === 'design-selection',
  ).sha256 = selectedId.designSelection.selection_sha256;
  resignProgram(selectedId.document);
  assert.throws(
    () => validateVisualGrammarProgram(selectedId.document, validationOptions(selectedId)),
    (error) => error.code === 'visual_grammar_design_binding_mismatch',
  );

  const selectionBytes = program();
  selectionBytes.designSelection.score += 1;
  assert.throws(
    () => validateVisualGrammarProgram(selectionBytes.document, validationOptions(selectionBytes)),
    (error) => error.code === 'visual_grammar_design_binding_mismatch',
  );

  const selectionReplay = program();
  selectionReplay.designSelection.briefs_sha256 = sha('8');
  const { selection_sha256: ignoredReplayHash, ...replayCore } =
    selectionReplay.designSelection;
  selectionReplay.designSelection.selection_sha256 = fingerprintValue(replayCore);
  selectionReplay.document.bindings.design_selection_sha256 =
    selectionReplay.designSelection.selection_sha256;
  selectionReplay.document.provenance.source_refs.find(
    (reference) => reference.source_kind === 'design-selection',
  ).sha256 = selectionReplay.designSelection.selection_sha256;
  resignProgram(selectionReplay.document);
  assert.throws(
    () => validateVisualGrammarProgram(selectionReplay.document, validationOptions(selectionReplay)),
    (error) => error.code === 'visual_grammar_design_binding_mismatch',
  );

  const libraryBytes = program();
  libraryBytes.designLibrary.policy.selection.base_template_count = 2;
  assert.throws(
    () => validateVisualGrammarProgram(libraryBytes.document, validationOptions(libraryBytes)),
    (error) => error.code === 'visual_grammar_design_binding_mismatch',
  );

  const missingAxis = program();
  const missingAxisId = missingAxis.document.variation_axes.at(-1).axis_id;
  missingAxis.document.variation_axes.pop();
  missingAxis.document.exhaustion_cooldown.axis_cooldowns.pop();
  for (const recipeValue of missingAxis.document.pages.flatMap((page) => page.recipes)) {
    recipeValue.variation_states.pop();
    recipeValue.adjacent_difference.changed_axis_ids =
      recipeValue.adjacent_difference.changed_axis_ids.filter((axisId) => axisId !== missingAxisId);
  }
  resignProgram(missingAxis.document);
  assert.throws(
    () => validateVisualGrammarProgram(missingAxis.document, validationOptions(missingAxis)),
    (error) => error.code === 'visual_grammar_template_axis_mismatch',
  );

  const substitutedAxis = program();
  substitutedAxis.document.variation_axes[0].axis_id = 'substituted-axis';
  substitutedAxis.document.exhaustion_cooldown.axis_cooldowns[0].axis_id =
    'substituted-axis';
  for (const recipeValue of substitutedAxis.document.pages.flatMap((page) => page.recipes)) {
    recipeValue.variation_states[0].axis_id = 'substituted-axis';
    recipeValue.adjacent_difference.changed_axis_ids =
      recipeValue.adjacent_difference.changed_axis_ids.map(
        (axisId) => axisId === 'density-tier' ? 'substituted-axis' : axisId,
      );
  }
  resignProgram(substitutedAxis.document);
  assert.throws(
    () => validateVisualGrammarProgram(
      substitutedAxis.document,
      validationOptions(substitutedAxis),
    ),
    (error) => error.code === 'visual_grammar_template_axis_mismatch',
  );
});

test('enforces optional selected-template visual grammar mappings and adjacent axis constraints', () => {
  const valid = installTemplateVisualGrammarConstraints(program());
  const validReceipt = validateVisualGrammarProgram(
    valid.document,
    validationOptions(valid),
  );
  assert.equal(validReceipt.ok, true);

  const wrongMapping = installTemplateVisualGrammarConstraints(program());
  [
    wrongMapping.baseTemplate.visual_grammar_constraints
      .axis_authoring_fields[0].authoring_field,
    wrongMapping.baseTemplate.visual_grammar_constraints
      .axis_authoring_fields[1].authoring_field,
  ] = [
    wrongMapping.baseTemplate.visual_grammar_constraints
      .axis_authoring_fields[1].authoring_field,
    wrongMapping.baseTemplate.visual_grammar_constraints
      .axis_authoring_fields[0].authoring_field,
  ];
  installTemplateVisualGrammarConstraints(
    wrongMapping,
    wrongMapping.baseTemplate.visual_grammar_constraints,
  );
  assert.throws(
    () => validateVisualGrammarProgram(
      wrongMapping.document,
      validationOptions(wrongMapping),
    ),
    (error) => error.code === 'visual_grammar_template_axis_mismatch',
  );

  for (const retainedAxisIds of [
    ['density-tier'],
    ['density-tier', 'anchor-form'],
  ]) {
    const insufficient = retainSecondRecipeAxisChanges(
      installTemplateVisualGrammarConstraints(program()),
      retainedAxisIds,
    );
    assert.throws(
      () => validateVisualGrammarProgram(
        insufficient.document,
        validationOptions(insufficient),
      ),
      (error) => error.code === 'visual_grammar_adjacent_difference_invalid',
    );
  }

  const missingRequiredAny = retainSecondRecipeAxisChanges(
    installTemplateVisualGrammarConstraints(program()),
    ['density-tier', 'anchor-quadrant', 'type-relation'],
  );
  assert.throws(
    () => validateVisualGrammarProgram(
      missingRequiredAny.document,
      validationOptions(missingRequiredAny),
    ),
    (error) => error.code === 'visual_grammar_adjacent_difference_invalid',
  );

  const fakeStateFlips = retainSecondRecipeAxisChanges(
    installTemplateVisualGrammarConstraints(program()),
    ['density-tier', 'anchor-form', 'anchor-quadrant'],
    {
      changedMappedFieldAxisIds: [],
      changedUnmappedFields: ['emotional_temperature'],
    },
  );
  assert.deepEqual(
    fakeStateFlips.document.pages[0].recipes[1]
      .adjacent_difference.changed_authoring_fields,
    ['emotional_temperature'],
  );
  assert.throws(
    () => validateVisualGrammarProgram(
      fakeStateFlips.document,
      validationOptions(fakeStateFlips),
    ),
    (error) => error.code === 'visual_grammar_adjacent_difference_invalid',
  );

  for (const requiredAxisId of ['anchor-form', 'motion-cause']) {
    const requiredLabelWithoutMappedField =
      retainSecondRecipeAxisChanges(
        installTemplateVisualGrammarConstraints(program()),
        ['density-tier', 'anchor-quadrant', requiredAxisId],
        {
          changedMappedFieldAxisIds: [
            'density-tier',
            'anchor-quadrant',
          ],
        },
      );
    assert.throws(
      () => validateVisualGrammarProgram(
        requiredLabelWithoutMappedField.document,
        validationOptions(requiredLabelWithoutMappedField),
      ),
      (error) => error.code === 'visual_grammar_adjacent_difference_invalid',
    );
  }

  const mappedFieldWithoutStateFlip = retainSecondRecipeAxisChanges(
    installTemplateVisualGrammarConstraints(program()),
    ['density-tier', 'anchor-form', 'motion-cause'],
    {
      changedMappedFieldAxisIds: [
        'density-tier',
        'anchor-form',
        'accent-form',
        'motion-cause',
      ],
    },
  );
  assert.throws(
    () => validateVisualGrammarProgram(
      mappedFieldWithoutStateFlip.document,
      validationOptions(mappedFieldWithoutStateFlip),
    ),
    (error) => error.code === 'visual_grammar_adjacent_difference_invalid',
  );

  const genericWithoutOptionalConstraints = program();
  delete genericWithoutOptionalConstraints.baseTemplate
    .visual_grammar_constraints;
  bindSelectedTemplateBytes(genericWithoutOptionalConstraints);
  for (const cooldown of genericWithoutOptionalConstraints.document
    .exhaustion_cooldown.axis_cooldowns) {
    cooldown.max_same_state_uses = 2;
  }
  retainSecondRecipeAxisChanges(
    genericWithoutOptionalConstraints,
    ['density-tier'],
  );
  assert.equal(validateVisualGrammarProgram(
    genericWithoutOptionalConstraints.document,
    validationOptions(genericWithoutOptionalConstraints),
  ).ok, true);
});

test('accepts the separately bound native compiler and compiles all native adaptation axes', () => {
  const fallback = nativeProgram();
  const receipt = validateVisualGrammarProgram(
    fallback.document,
    validationOptions(fallback),
  );
  assert.equal(receipt.selection_mode, 'native-fallback');
  assert.equal(receipt.base_template_id, 'hyperframes-native');
  assert.equal(receipt.visual_grammar_guard_code, 'NATIVE_BASE_COMPILER_BOUND');
  assert.equal(
    receipt.native_compiler_source_bundle_sha256,
    fallback.nativeBaseCompiler.native_compiler_source_bundle_sha256,
  );
  assert.deepEqual(receipt.protected_user_layers, []);
  assert.deepEqual(
    receipt.template_axis_ids,
    fallback.nativeBaseCompiler.adaptation_knobs.map((knob) => knob.id),
  );

  const protectedDesign = nativeProgram([
    'visual_system',
    'scene_grammar',
    'motion_grammar',
    'compositing',
  ]);
  const protectedReceipt = validateVisualGrammarProgram(
    protectedDesign.document,
    validationOptions(protectedDesign),
  );
  assert.equal(protectedReceipt.selection_mode, 'user-design-native-supplement');
  assert.equal(
    protectedReceipt.visual_grammar_guard_code,
    'NATIVE_SUPPORT_ONLY_USER_LAYERS_PROTECTED',
  );
  assert.deepEqual(
    protectedReceipt.protected_user_layers,
    protectedDesign.designSelection.protected_user_layers,
  );
});

test('rejects native compiler placeholders, tamper, replay, catalog confusion and axis substitution', () => {
  const ambiguousEffectiveBase = program();
  ambiguousEffectiveBase.nativeBaseCompiler = structuredClone(
    ambiguousEffectiveBase.designLibrary.nativeBaseCompiler,
  );
  assert.throws(
    () => validateVisualGrammarProgram(
      ambiguousEffectiveBase.document,
      validationOptions(ambiguousEffectiveBase),
    ),
    (error) => error.code === 'visual_grammar_design_artifacts_required',
  );

  const missingCompiler = nativeProgram();
  missingCompiler.nativeBaseCompiler = undefined;
  assert.throws(
    () => validateVisualGrammarProgram(
      missingCompiler.document,
      validationOptions(missingCompiler),
    ),
    (error) => error.code === 'visual_grammar_design_artifacts_required',
  );

  const placeholder = nativeProgram();
  placeholder.nativeBaseCompiler = {
    id: 'hyperframes-native',
    sha256: placeholder.document.bindings.base_template_sha256,
  };
  assert.throws(
    () => validateVisualGrammarProgram(
      placeholder.document,
      validationOptions(placeholder),
    ),
    (error) => error.code === 'visual_grammar_design_binding_invalid',
  );

  const legacyStringRefs = nativeProgram();
  legacyStringRefs.nativeBaseCompiler.provenance.source_refs =
    legacyStringRefs.nativeBaseCompiler.provenance.source_refs.map(
      (reference) => reference.relative_path,
    );
  assert.throws(
    () => validateVisualGrammarProgram(
      legacyStringRefs.document,
      validationOptions(legacyStringRefs),
    ),
    (error) => error.code === 'visual_grammar_design_binding_invalid',
  );

  const missingSourceBundle = nativeProgram();
  delete missingSourceBundle.nativeBaseCompiler.native_compiler_source_bundle_sha256;
  assert.throws(
    () => validateVisualGrammarProgram(
      missingSourceBundle.document,
      validationOptions(missingSourceBundle),
    ),
    (error) => error.code === 'visual_grammar_design_binding_invalid',
  );

  const nativeSourceDrift = nativeProgram();
  nativeSourceDrift.nativeBaseCompiler.provenance.source_refs[0].sha256 = sha('a');
  assert.throws(
    () => validateVisualGrammarProgram(
      nativeSourceDrift.document,
      validationOptions(nativeSourceDrift),
    ),
    (error) => error.code === 'visual_grammar_design_binding_mismatch',
  );

  const compilerBytes = nativeProgram();
  compilerBytes.nativeBaseCompiler.summary += ' Tampered.';
  assert.throws(
    () => validateVisualGrammarProgram(
      compilerBytes.document,
      validationOptions(compilerBytes),
    ),
    (error) => error.code === 'visual_grammar_design_binding_mismatch',
  );

  const libraryCompilerBytes = nativeProgram();
  libraryCompilerBytes.designLibrary.nativeBaseCompiler.summary += ' Tampered.';
  assert.throws(
    () => validateVisualGrammarProgram(
      libraryCompilerBytes.document,
      validationOptions(libraryCompilerBytes),
    ),
    (error) => error.code === 'visual_grammar_design_binding_mismatch',
  );

  const missingLibraryCompiler = nativeProgram();
  delete missingLibraryCompiler.designLibrary.nativeBaseCompiler;
  assert.throws(
    () => validateVisualGrammarProgram(
      missingLibraryCompiler.document,
      validationOptions(missingLibraryCompiler),
    ),
    (error) => error.code === 'visual_grammar_design_binding_invalid',
  );

  const replayedSelection = nativeProgram();
  replayedSelection.designSelection = structuredClone(program().designSelection);
  replayedSelection.document.bindings.design_selection_sha256 =
    replayedSelection.designSelection.selection_sha256;
  replayedSelection.document.provenance.source_refs.find(
    (reference) => reference.source_kind === 'design-selection',
  ).sha256 = replayedSelection.designSelection.selection_sha256;
  resignContainers(replayedSelection.document);
  assert.throws(
    () => validateVisualGrammarProgram(
      replayedSelection.document,
      validationOptions(replayedSelection),
    ),
    (error) => error.code === 'visual_grammar_design_binding_mismatch',
  );

  const nullPlaceholder = nativeProgram();
  nullPlaceholder.designSelection.base_template = null;
  nullPlaceholder.designSelection.effective_base_template = 'hyperframes-native';
  const { selection_sha256: ignoredNullHash, ...nullCore } =
    nullPlaceholder.designSelection;
  nullPlaceholder.designSelection.selection_sha256 = fingerprintValue(nullCore);
  nullPlaceholder.document.bindings.design_selection_sha256 =
    nullPlaceholder.designSelection.selection_sha256;
  nullPlaceholder.document.provenance.source_refs.find(
    (reference) => reference.source_kind === 'design-selection',
  ).sha256 = nullPlaceholder.designSelection.selection_sha256;
  resignContainers(nullPlaceholder.document);
  assert.throws(
    () => validateVisualGrammarProgram(
      nullPlaceholder.document,
      validationOptions(nullPlaceholder),
    ),
    (error) => error.code === 'visual_grammar_design_binding_mismatch',
  );

  const catalogInsertion = nativeProgram();
  catalogInsertion.designLibrary.templates.push(
    structuredClone(catalogInsertion.designLibrary.nativeBaseCompiler),
  );
  catalogInsertion.designSelection.design_library_snapshot_sha256 =
    designLibrarySnapshotSha256(catalogInsertion.designLibrary);
  bindSelection(catalogInsertion);
  assert.throws(
    () => validateVisualGrammarProgram(
      catalogInsertion.document,
      validationOptions(catalogInsertion),
    ),
    (error) => error.code === 'visual_grammar_design_binding_invalid',
  );

  const promotionConfusion = nativeProgram();
  promotionConfusion.designLibrary.policy.profiles.push({
    template_id: 'hyperframes-native',
  });
  promotionConfusion.designSelection.design_library_snapshot_sha256 =
    designLibrarySnapshotSha256(promotionConfusion.designLibrary);
  bindSelection(promotionConfusion);
  assert.throws(
    () => validateVisualGrammarProgram(
      promotionConfusion.document,
      validationOptions(promotionConfusion),
    ),
    (error) => error.code === 'visual_grammar_design_binding_invalid',
  );

  const guardDrift = nativeProgram();
  guardDrift.designSelection.visual_grammar_compilation.guard_code =
    'BASE_TEMPLATE_BOUND';
  bindSelection(guardDrift);
  assert.throws(
    () => validateVisualGrammarProgram(
      guardDrift.document,
      validationOptions(guardDrift),
    ),
    (error) => error.code === 'visual_grammar_design_binding_mismatch',
  );

  const resignedSourceBundle = nativeProgram();
  resignedSourceBundle.designSelection.native_compiler_source_bundle_sha256 =
    sha('a');
  bindSelection(resignedSourceBundle);
  assert.throws(
    () => validateVisualGrammarProgram(
      resignedSourceBundle.document,
      validationOptions(resignedSourceBundle),
    ),
    (error) => error.code === 'visual_grammar_design_binding_mismatch',
  );

  const substitutedSnapshot = nativeProgram();
  substitutedSnapshot.designSelection.design_library_snapshot_sha256 =
    fingerprintRenderValue({
      policy: substitutedSnapshot.designLibrary.policy,
      source_registry: substitutedSnapshot.designLibrary.sourceRegistry,
      templates: [...substitutedSnapshot.designLibrary.templates].sort(
        (left, right) => left.id.localeCompare(right.id),
      ),
    });
  bindSelection(substitutedSnapshot);
  assert.throws(
    () => validateVisualGrammarProgram(
      substitutedSnapshot.document,
      validationOptions(substitutedSnapshot),
    ),
    (error) => error.code === 'visual_grammar_design_binding_mismatch',
  );

  const librarySourceDrift = nativeProgram();
  librarySourceDrift.designLibrary.nativeBaseCompiler.provenance
    .source_refs[0].sha256 = sha('a');
  librarySourceDrift.designLibrary.nativeBaseCompiler
    .native_compiler_source_bundle_sha256 =
      nativeCompilerSourceBundleSha256(
        librarySourceDrift.designLibrary.nativeBaseCompiler,
      );
  librarySourceDrift.designSelection.native_compiler_source_bundle_sha256 =
    librarySourceDrift.designLibrary.nativeBaseCompiler
      .native_compiler_source_bundle_sha256;
  librarySourceDrift.designSelection.design_library_snapshot_sha256 =
    designLibrarySnapshotSha256(librarySourceDrift.designLibrary);
  bindSelection(librarySourceDrift);
  assert.throws(
    () => validateVisualGrammarProgram(
      librarySourceDrift.document,
      validationOptions(librarySourceDrift),
    ),
    (error) => error.code === 'visual_grammar_design_binding_mismatch',
  );

  const hashDrift = nativeProgram();
  hashDrift.designSelection.base_template_sha256 = sha('0');
  const { selection_sha256: ignoredHashDrift, ...hashDriftCore } =
    hashDrift.designSelection;
  hashDrift.designSelection.selection_sha256 = fingerprintValue(hashDriftCore);
  hashDrift.document.bindings.design_selection_sha256 =
    hashDrift.designSelection.selection_sha256;
  hashDrift.document.provenance.source_refs.find(
    (reference) => reference.source_kind === 'design-selection',
  ).sha256 = hashDrift.designSelection.selection_sha256;
  resignContainers(hashDrift.document);
  assert.throws(
    () => validateVisualGrammarProgram(
      hashDrift.document,
      validationOptions(hashDrift),
    ),
    (error) => error.code === 'visual_grammar_design_binding_mismatch',
  );

  const substitutedAxes = nativeProgram();
  [
    substitutedAxes.document.variation_axes[0],
    substitutedAxes.document.variation_axes[1],
  ] = [
    substitutedAxes.document.variation_axes[1],
    substitutedAxes.document.variation_axes[0],
  ];
  [
    substitutedAxes.document.exhaustion_cooldown.axis_cooldowns[0],
    substitutedAxes.document.exhaustion_cooldown.axis_cooldowns[1],
  ] = [
    substitutedAxes.document.exhaustion_cooldown.axis_cooldowns[1],
    substitutedAxes.document.exhaustion_cooldown.axis_cooldowns[0],
  ];
  resignContainers(substitutedAxes.document);
  assert.throws(
    () => validateVisualGrammarProgram(
      substitutedAxes.document,
      validationOptions(substitutedAxes),
    ),
    (error) => error.code === 'visual_grammar_template_axis_mismatch',
  );

  const unprotectedSupplement = nativeProgram(['visual_system']);
  unprotectedSupplement.designSelection.protected_user_layers = [];
  bindSelection(unprotectedSupplement);
  assert.throws(
    () => validateVisualGrammarProgram(
      unprotectedSupplement.document,
      validationOptions(unprotectedSupplement),
    ),
    (error) => error.code === 'visual_grammar_design_binding_mismatch',
  );
});

test('path-token sanitizer rejects local path forms but permits ordinary prose and URLs', () => {
  const forbidden = [
    '/tmp/private.json',
    '/Volumes/Project/private.json',
    '/opt/internal/tool',
    'C:\\Users\\person\\private.json',
    '\\\\server\\share\\private.json',
    'file:///tmp/private.json',
  ];
  for (const token of forbidden) {
    assert.equal(containsForbiddenLocalPathToken(`内部位置 ${token} 不可公开。`), true);
    const fixture = program();
    fixture.document.provenance.source_refs.at(-1).role =
      `内部作者材料位于 ${token} 因此必须拒绝该值。`;
    resignProgram(fixture.document);
    assert.throws(
      () => validateVisualGrammarProgram(fixture.document, validationOptions(fixture)),
      (error) => error.code === 'visual_grammar_provenance_invalid',
    );
  }
  const safe = program();
  safe.document.provenance.source_refs.at(-1).role =
    '公开依据位于 https://example.com/research/article，并说明普通的 16/9 比例。';
  resignProgram(safe.document);
  assert.equal(containsForbiddenLocalPathToken(
    '公开依据位于 https://example.com/research/article，并说明普通的 16/9 比例。',
  ), false);
  assert.equal(validateVisualGrammarProgram(safe.document, validationOptions(safe)).ok, true);
});

test('extracts only an exact contiguous block recipe packet', () => {
  const fixture = program();
  const block = {
    block_id: 'B002',
    shot_ids: ['S003', 'S004'],
    start_ms: 4000,
    end_ms: 8000,
    start_frame: 100,
    end_frame: 200,
    namespace: 'b002',
  };
  const packet = extractBlockScopedRecipes(fixture.document, block, validationOptions(fixture));
  assert.equal(packet.artifact_type, 'visual-grammar-block-recipe-packet');
  assert.deepEqual(packet.shot_ids, ['S003', 'S004']);
  assert.deepEqual(packet.recipes.map((item) => item.shot_id), ['S003', 'S004']);
  assert.deepEqual(packet.source_page_sha256s, [fixture.document.pages[1].page_sha256]);
  assert.equal('identity' in packet, false);
  assert.equal('provenance' in packet, false);
  assert.deepEqual(
    packet.shared_visual_authoring_directive.identity,
    fixture.document.identity,
  );
  assert.deepEqual(
    packet.shared_visual_authoring_directive.anti_identity,
    fixture.document.anti_identity,
  );
  assert.deepEqual(
    packet.shared_visual_authoring_directive.stable_invariants,
    fixture.document.stable_invariants,
  );
  assert.equal(
    packet.shared_visual_authoring_directive.directive_sha256,
    fingerprintValue({
      identity: fixture.document.identity,
      anti_identity: fixture.document.anti_identity,
      stable_invariants: fixture.document.stable_invariants,
    }),
  );
  assert.equal(packet.recipes.some((item) => ['S001', 'S002'].includes(item.shot_id)), false);
  assert.equal(JSON.stringify(packet).includes('/Users/'), false);
  assert.equal(JSON.stringify(packet).includes('private prompt'), false);
  assert.equal(packet.packet_sha256, fingerprintValue(Object.fromEntries(
    Object.entries(packet).filter(([key]) => key !== 'packet_sha256'),
  )));
  assert.equal(validateVisualGrammarBlockRecipePacket(
    packet,
    fixture.document,
    block,
    validationOptions(fixture),
  ).ok, true);

  const tampered = structuredClone(packet);
  tampered.shared_visual_authoring_directive.identity.statement =
    '攻击者替换了共享视觉身份，即使重签外层也不能通过冻结程序校验。';
  const {
    directive_sha256: ignoredDirectiveHash,
    ...tamperedDirectiveCore
  } = tampered.shared_visual_authoring_directive;
  tampered.shared_visual_authoring_directive.directive_sha256 =
    fingerprintValue(tamperedDirectiveCore);
  const { packet_sha256: ignoredPacketHash, ...tamperedPacketCore } = tampered;
  tampered.packet_sha256 = fingerprintValue(tamperedPacketCore);
  assert.throws(
    () => validateVisualGrammarBlockRecipePacket(
      tampered,
      fixture.document,
      block,
      validationOptions(fixture),
    ),
    (error) => error.code === 'visual_grammar_block_packet_invalid',
  );

  const omitted = structuredClone(packet);
  delete omitted.shared_visual_authoring_directive;
  assert.throws(
    () => validateVisualGrammarBlockRecipePacket(
      omitted,
      fixture.document,
      block,
      validationOptions(fixture),
    ),
    (error) => error.code === 'visual_grammar_block_packet_invalid',
  );

  assert.throws(
    () => extractBlockScopedRecipes(fixture.document, {
      block_id: 'B002',
      shot_ids: ['S002', 'S004'],
      start_ms: 2000,
      end_ms: 8000,
      start_frame: 50,
      end_frame: 200,
      namespace: 'b002',
    }, validationOptions(fixture)),
    (error) => error.code === 'visual_grammar_block_scope_invalid',
  );
});
