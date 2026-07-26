import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { fingerprintArtifactValue } from './artifact-manifest.mjs';
import {
  createAuthoringChunkManifest,
  createAuthoringPlan,
  createSourceCodeReview,
} from './validate-authoring-topology.mjs';
import {
  assertFinalRenderPreflight,
  createStageReceipt,
} from './stage-receipt.mjs';
import { compileFrameProjection } from './compile-frame-projection.mjs';
import { measureStyleFrameBytes } from './measure-style-pixel-facts.mjs';
import {
  designLibrarySnapshotSha256,
  loadPackagedDesignLibrary,
} from './select-design.mjs';
import { fingerprintRenderValue, fingerprintValue } from './state.mjs';
import {
  deriveSubstantiveVisualCore,
  validateVisualGrammarProgram,
} from './validate-visual-grammar-program.mjs';
import {
  bindVisualAuthoringChunkPlan,
  createAssetVisualGrammarBindings,
  createStyleAuthorizedIntegration,
  createStyleIntegrationAuthorization,
  extractVisualBlockAuthoringPacket,
  revalidateStyleAuthorizedIntegrationForRender,
  validateAssetVisualGrammarBindings,
  validateStyleIntegrationAuthorization,
  validateStyleAuthorizedIntegration,
  validateVisualAuthoringChunkPlan,
  validateVisualBlockAuthoringPacket,
  validateSoleAuthoringPlanIdentity,
} from './validate-visual-authoring-chain.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const repeatedSha = (letter) => letter.repeat(64);
const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value) => Buffer.from(JSON.stringify(value), 'utf8');
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
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAAAAAAAAQCEeRdzAAAAEklEQVR4nGP4z8DAAMIM/4EAAB/uBfsL2WiLAAAAAElFTkSuQmCC',
  'base64',
);

function designSelection(briefsSha256, baseTemplate = BASE_TEMPLATE) {
  const core = {
    schema_version: 1,
    briefs_sha256: briefsSha256,
    mode: 'base-template',
    base_template: baseTemplate.id,
    base_template_sha256: fingerprintRenderValue(baseTemplate),
    design_library_snapshot_sha256:
      designLibrarySnapshotSha256(DESIGN_LIBRARY),
    native_compiler_source_bundle_sha256:
      DESIGN_LIBRARY.nativeBaseCompiler.native_compiler_source_bundle_sha256,
    template_status: baseTemplate.status,
    protected_user_layers: [],
    signals: { fixture: 'quiet-editorial-print-explicit-selection' },
    score: 1000,
    reasons: [{ code: 'USER_TEMPLATE_OVERRIDE', points: 1000 }],
    borrowed_patterns: [],
    borrow_rejections: [],
    alternatives: [],
    candidate_rejections: [],
    visual_grammar_compilation: {
      eligible: true,
      guard_code: 'BASE_TEMPLATE_BOUND',
    },
  };
  return { ...core, selection_sha256: fingerprintValue(core) };
}

function designSelectionReplayReceipt(selectedDesign, designLibrary) {
  const core = {
    schema_version: 1,
    pipeline_contract_version: 2,
    artifact_type: 'director-design-selection-replay-receipt',
    status: 'passed',
    director_briefs_artifact_sha256: sha('director-briefs-artifact'),
    selection_context_artifact_sha256: sha('selection-context-artifact'),
    design_selection_artifact_sha256: sha('design-selection-artifact'),
    design_library_artifact_sha256: sha('design-library-artifact'),
    briefs_sha256: selectedDesign.briefs_sha256,
    design_selection_sha256: selectedDesign.selection_sha256,
    design_library_snapshot_sha256:
      selectedDesign.design_library_snapshot_sha256,
    design_library_runtime_sha256:
      fingerprintRenderValue(designLibrary),
    native_compiler_source_bundle_sha256:
      designLibrary.nativeBaseCompiler.native_compiler_source_bundle_sha256,
    selection_options_sha256:
      fingerprintArtifactValue({ allow_draft: true }),
    allow_draft: true,
    base_template_id: selectedDesign.base_template,
    base_template_sha256: selectedDesign.base_template_sha256,
    visual_grammar_guard_code:
      selectedDesign.visual_grammar_compilation.guard_code,
  };
  return {
    ...core,
    replay_receipt_sha256: fingerprintArtifactValue(core),
  };
}

function grammarFixture() {
  const projection = compileFrameProjection({
    pipeline_contract_version: 2,
    artifact_id: 'projection-main',
    parsed_srt_sha256: repeatedSha('b'),
    plan_sha256: repeatedSha('c'),
    fps: { numerator: 25, denominator: 1 },
    shots: [{ shot_id: 'S001', start_ms: 0, end_ms: 2000 }],
  });
  const confirmedBriefSha256 = repeatedSha('a');
  const designSlice = {
    schema_version: 1,
    pipeline_contract_version: 2,
    artifact_type: 'validated-design-slice-fixture',
    shots: [{
      shot_id: 'S001',
      srt_window_ms:
        structuredClone(projection.shots[0].srt_window_ms),
      frame_window:
        structuredClone(projection.shots[0].frame_window),
      semantic_claim:
        '第一镜以设计记录冻结构图、标题关系与因果动作。',
      composition: {
        family_id: 'F01',
        negative_space_responsibility: 'reading',
      },
      typography: {
        display_role: 'chapter-focus',
        line_break_policy: 'semantic-explicit',
      },
      motion: {
        grammar_id: 'G01',
        cause: '字幕事实触发材料状态变化。',
      },
    }],
  };
  const selectedTemplate = structuredClone(BASE_TEMPLATE);
  const packagedLibrary = structuredClone(DESIGN_LIBRARY);
  const selectedDesign = designSelection(
    confirmedBriefSha256,
    selectedTemplate,
  );
  const bindings = {
    confirmed_brief_sha256: confirmedBriefSha256,
    parsed_srt_sha256: projection.parsed_srt_sha256,
    shot_plan_sha256: projection.plan_sha256,
    projection_sha256: projection.receipt.projection_sha256,
    design_slice_sha256:
      fingerprintArtifactValue(designSlice),
    display_selection_sha256: repeatedSha('e'),
    font_package_sha256: repeatedSha('f'),
    design_selection_sha256: selectedDesign.selection_sha256,
    base_template_id: selectedTemplate.id,
    base_template_sha256: fingerprintRenderValue(selectedTemplate),
    design_library_snapshot_sha256:
      designLibrarySnapshotSha256(packagedLibrary),
  };
  const recipe = {
    shot_id: 'S001',
    srt_window_ms: structuredClone(projection.shots[0].srt_window_ms),
    frame_window: structuredClone(projection.shots[0].frame_window),
    semantic_claim: '第一镜把字幕判断转成可核验的视觉命题。',
    surface: {
      decision_id: 'surface-1',
      intent: '第一镜的表面承接材料证据与阅读路径。',
      implementation_obligation: '表面必须服务第一镜语义，不能成为换字模板。',
    },
    attention_geometry: {
      decision_id: 'attention-1',
      primary_focus: '第一镜首先阅读发生变化的语义主体。',
      reading_order: '先读主体，再读结果，最后读取材料证据。',
      negative_space_responsibility: '留白承担第一镜阅读呼吸和交棒责任。',
    },
    semantic_anchor: {
      decision_id: 'anchor-decision-1',
      anchor_id: 'anchor-1',
      claim: '第一镜锚点直接绑定字幕中的事实判断。',
      source_ref_ids: ['srt-source', 'author-source'],
    },
    anchor_treatment: {
      decision_id: 'treatment-1',
      relationship: '第一镜的标题与锚点形成内容驱动关系。',
      protection: '事实识别区保持完整，不受装饰和文字遮挡。',
    },
    typography: {
      decision_id: 'type-1',
      hierarchy: '第一镜以展示字建立首读层级。',
      line_break_policy: '按语义显式断行，不允许运行时随意改写。',
      display_role: '展示字承担第一镜的核心判断。',
    },
    color: {
      decision_id: 'color-1',
      palette_relationship: '第一镜从材料本色建立颜色关系。',
      contrast_logic: '事实文字与承载表面保持稳定可读对比。',
      accent_responsibility: '强调色只指向第一镜的结果。',
    },
    material_texture: {
      decision_id: 'material-1',
      primary_material_role: '第一镜的普通材料承担主要语义证据。',
      texture_behavior: '纹理通过语义动作显露，不能退化为壁纸。',
      route_intent: '按冻结路由为第一镜选择普通主材料。',
    },
    motion_causality: {
      decision_id: 'motion-1',
      cause: '字幕中的第一个原因触发主体变化。',
      action: '主体执行一个与原因直接相关的可见动作。',
      result: '动作产生第一个稳定可读结果。',
      lifecycle: {
        entry: '主体进入并建立一个明确首读焦点。',
        action: '语义原因驱动唯一主要动作发生。',
        result: '动作形成稳定且可辨认的结果态。',
        hold: '结果保持到足以完整读取判断。',
        exit: '焦点退出并把注意力交给下一镜。',
      },
    },
    emotional_temperature: {
      decision_id: 'temperature-1',
      temperature_label: '克制紧张',
      intent: '情绪温度服务第一镜内容转折而不是滤镜预设。',
    },
    hard_avoids: ['禁止第一镜只替换标题', '禁止第一镜把材料作为壁纸'],
    variation_states: selectedTemplate.adaptation_knobs.map((knob) => ({
      axis_id: knob.id,
      state_id: knob.options[0],
    })),
    adjacent_difference: {
      previous_shot_id: null,
      changed_axis_ids: [],
      changed_authoring_fields: [],
      content_reason: 'first-shot-baseline',
    },
    provenance_ref_ids: ['srt-source', 'author-source'],
    authoring_signature_sha256: '',
    shot_recipe_sha256: '',
  };
  recipe.authoring_signature_sha256 =
    fingerprintValue(deriveSubstantiveVisualCore(recipe));
  const { shot_recipe_sha256: ignoredRecipeHash, ...recipeCore } = recipe;
  recipe.shot_recipe_sha256 = fingerprintValue(recipeCore);
  const pageCore = {
    schema_version: 1,
    artifact_type: 'visual-grammar-recipe-page',
    program_id: 'fixture-visual-grammar',
    page_id: 'recipe-page-001',
    page_number: 1,
    shot_start: 1,
    shot_end: 1,
    recipes: [recipe],
  };
  const page = { ...pageCore, page_sha256: fingerprintValue(pageCore) };
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
    ['author-source', 'author-curation', 'author-artifact', repeatedSha('9')],
  ];
  const program = {
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
      exact_recipe_window_shots: 2,
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
        role: `冻结 ${sourceKind} 对作者决策的事实约束。`,
      })),
    },
    shot_count: 1,
    pagination: {
      max_recipes_per_page: 8,
      page_count: 1,
      page_index: [{
        page_id: page.page_id,
        page_number: 1,
        shot_start: 1,
        shot_end: 1,
        shot_ids: ['S001'],
        recipe_sha256s: [recipe.shot_recipe_sha256],
        page_sha256: page.page_sha256,
      }],
    },
    pages: [page],
    program_sha256: '',
  };
  const { pages: ignoredPages, program_sha256: ignoredProgramHash, ...programCore } = program;
  program.program_sha256 = fingerprintValue(programCore);
  const programReceipt = validateVisualGrammarProgram(program, {
    projection,
    designSelection: selectedDesign,
    designSlice,
    baseTemplate: selectedTemplate,
    designLibrary: packagedLibrary,
  });
  return {
    projection,
    program,
    programReceipt,
    designSlice,
    designSelection: selectedDesign,
    baseTemplate: selectedTemplate,
    designLibrary: packagedLibrary,
  };
}

function rulesFixture() {
  const visual = grammarFixture();
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
    ...visual.program.bindings,
    visual_grammar_program_sha256: visual.program.program_sha256,
    asset_route_policy_sha256: fingerprintValue(assetRoutePolicy),
    delivery_profile_sha256: fingerprintValue(deliveryProfile),
    namespace_policy_sha256: fingerprintValue(namespacePolicy),
    seam_policy_sha256: fingerprintValue(seamPolicy),
    anti_template_policy_sha256: fingerprintValue(antiTemplatePolicy),
  };
  const rulesCore = {
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
      program_id: visual.program.program_id,
      program_sha256: visual.programReceipt.program_sha256,
      identity_sha256: visual.programReceipt.identity_sha256,
      anti_identity_sha256: visual.programReceipt.anti_identity_sha256,
      stable_invariants_sha256: visual.programReceipt.stable_invariants_sha256,
      shared_directive_sha256: visual.programReceipt.shared_directive_sha256,
      variation_axes_sha256: visual.programReceipt.variation_axes_sha256,
      exhaustion_cooldown_sha256: visual.programReceipt.exhaustion_cooldown_sha256,
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
  };
  return {
    projection: visual.projection,
    visualGrammarProgram: visual.program,
    designSlice: visual.designSlice,
    designSelection: visual.designSelection,
    baseTemplate: visual.baseTemplate,
    designLibrary: visual.designLibrary,
    designSelectionReplayReceipt: designSelectionReplayReceipt(
      visual.designSelection,
      visual.designLibrary,
    ),
    wholeFilmRules: {
      ...rulesCore,
      whole_film_rules_sha256: fingerprintValue(rulesCore),
    },
  };
}

function artifactRef(artifactId, bytes, mediaType) {
  return {
    artifact_id: artifactId,
    sha256: hashBytes(bytes),
    size_bytes: bytes.length,
    media_type: mediaType,
  };
}

async function styleFixture(fixture) {
  const { plan } = fixture;
  const block = plan.blocks[0];
  const artifacts = new Map();
  const sourceBytes = Buffer.from(
    '<section><svg><text>第一镜结论</text></svg></section>',
    'utf8',
  );
  const sourceInput = new Map([[
    'scene.html',
    {
      artifact_id: 'source-B001',
      relative_path: 'scene.html',
      media_type: 'text/html',
      bytes: sourceBytes,
    },
  ]]);
  const chunkManifest = createAuthoringChunkManifest({
    plan: fixture.authoringPlan,
    chunk_id: 'C001',
    attempt: 1,
    producer_isolation_sha256: sha('producer-B001'),
    sourceBytes: sourceInput,
    gates: {
      source: 'passed',
      font: 'passed',
      asset: 'passed',
      hyperframes: 'passed',
      seek: 'passed',
      profile: 'passed',
      pixel: 'passed',
    },
  });
  const chunkSourceBytes = chunkManifest.source_bytes;
  const sourceRecord = chunkManifest.source_files[0];
  const sourceRef = {
    artifact_id: sourceRecord.artifact_id,
    sha256: sourceRecord.sha256,
    size_bytes: sourceRecord.size_bytes,
    media_type: sourceRecord.media_type,
  };
  artifacts.set(sourceRef.artifact_id, sourceBytes);
  const blockManifestSha256 = chunkManifest.manifest_sha256;
  const producerIsolationSha256 =
    chunkManifest.producer_isolation_sha256;
  const reviewGeneration = 1;
  const entrypointArtifactId = sourceRef.artifact_id;
  const rendererConfig = {
    schema_version: 1,
    runner_contract: 'style-trusted-capture-runner-v1',
    viewport: { width: 3840, height: 2160 },
    device_scale_factor: 1,
    color_space: 'srgb',
    animations: 'seek-projected-frame',
  };
  const rendererConfigBytes = jsonBytes(rendererConfig);
  const rendererConfigRef = artifactRef(
    'renderer-config-B001',
    rendererConfigBytes,
    'application/json',
  );
  artifacts.set(rendererConfigRef.artifact_id, rendererConfigBytes);
  const authoringContext = block.authoring_context;
  const authoringContextBytes = jsonBytes(authoringContext);
  const authoringContextRef = artifactRef(
    'authoring-context-B001',
    authoringContextBytes,
    'application/json',
  );
  artifacts.set(authoringContextRef.artifact_id, authoringContextBytes);
  const captureSchedule = [{
    shot_id: 'S001',
    distinct_projected_frames_required: true,
    entry: { projected_frame: 1, timestamp_ms: 40 },
    result: { projected_frame: 25, timestamp_ms: 1000 },
    exit: { projected_frame: 49, timestamp_ms: 1960 },
  }];
  const measured = await measureStyleFrameBytes(PNG);
  const projectionBytes = jsonBytes(fixture.projection);
  const projectionRef = artifactRef(
    'frame-projection',
    projectionBytes,
    'application/json',
  );
  const rendererCore = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
    kind: 'trusted-style-capture-run-receipt',
    runner_contract: 'style-trusted-capture-runner-v1',
    input_manifest: {
      block_id: block.block_id,
      block_manifest_sha256: blockManifestSha256,
      source_artifacts: [sourceRef],
      entrypoint_artifact_id: entrypointArtifactId,
      projection: projectionRef,
      renderer_tool_id: 'hyperframes-capture',
      renderer_tool_version: '1.2.3',
      renderer_config: rendererConfigRef,
      review_generation: reviewGeneration,
    },
    capture_schedule: captureSchedule,
    output_manifest: ['entry', 'result', 'exit'].map((phase) => ({
      shot_id: 'S001',
      phase,
      projected_frame: captureSchedule[0][phase].projected_frame,
      timestamp_ms: captureSchedule[0][phase].timestamp_ms,
      sha256: measured.sha256,
      size_bytes: measured.size_bytes,
      media_type: measured.media_type,
      width: measured.width,
      height: measured.height,
      decoded_rgba_sha256: measured.decoded_rgba_sha256,
    })),
  };
  const rendererReceipt = {
    ...rendererCore,
    receipt_sha256: fingerprintArtifactValue(rendererCore),
  };
  const rendererBytes = jsonBytes(rendererReceipt);
  const rendererRef = artifactRef(
    'renderer-receipt-B001',
    rendererBytes,
    'application/json',
  );
  artifacts.set(rendererRef.artifact_id, rendererBytes);
  const stateRefs = {};
  for (const state of ['entry', 'result', 'exit']) {
    const captureCore = {
      artifact_id: `S001-${state}`,
      block_manifest_sha256: blockManifestSha256,
      source_sha256s: [sourceRef.sha256],
      shot_id: 'S001',
      phase: state,
      projected_frame: captureSchedule[0][state].projected_frame,
      timestamp_ms: captureSchedule[0][state].timestamp_ms,
      projection_sha256: plan.bindings.projection_sha256,
      shot_recipe_sha256:
        authoringContext.recipe_packet.recipes[0].shot_recipe_sha256,
      renderer_tool_id:
        rendererReceipt.input_manifest.renderer_tool_id,
      renderer_tool_version:
        rendererReceipt.input_manifest.renderer_tool_version,
      renderer_receipt_sha256: rendererReceipt.receipt_sha256,
      review_generation: reviewGeneration,
      sha256: measured.sha256,
      size_bytes: measured.size_bytes,
      media_type: measured.media_type,
      width: measured.width,
      height: measured.height,
      decoded_rgba_sha256: measured.decoded_rgba_sha256,
    };
    stateRefs[state] = {
      ...captureCore,
      capture_binding_sha256: fingerprintArtifactValue(captureCore),
    };
    artifacts.set(stateRefs[state].artifact_id, PNG);
  }
  const factsCore = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
    producer: 'measure-style-pixel-facts-v1',
    authority_scope: 'objective-pixel-facts-only',
    block_id: block.block_id,
    block_manifest_sha256: blockManifestSha256,
    source_sha256s: [sourceRef.sha256],
    projection_sha256: plan.bindings.projection_sha256,
    review_generation: reviewGeneration,
      renderer: {
      tool_id: rendererReceipt.input_manifest.renderer_tool_id,
      tool_version: rendererReceipt.input_manifest.renderer_tool_version,
      receipt_sha256: rendererReceipt.receipt_sha256,
    },
    shot_count: 1,
    frame_count: 3,
    frames: ['entry', 'result', 'exit'].map((state) => ({
      ...stateRefs[state],
      measurement_thresholds: measured.measurement_thresholds,
      whole_frame_facts: measured.whole_frame_facts,
      declared_roi: null,
      roi_facts: null,
    })),
  };
  const facts = { ...factsCore, facts_sha256: fingerprintArtifactValue(factsCore) };
  const factsBytes = jsonBytes(facts);
  const factsRef = artifactRef('pixel-facts-B001', factsBytes, 'application/json');
  artifacts.set(factsRef.artifact_id, factsBytes);
  const pageCore = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
    gate: 'style_conformance_review',
    block_id: block.block_id,
    block_manifest_sha256: blockManifestSha256,
    source_sha256s: [sourceRef.sha256],
    projection_sha256: plan.bindings.projection_sha256,
    review_generation: reviewGeneration,
    authoring_context_sha256: authoringContext.context_sha256,
    shared_directive_sha256:
      authoringContext.recipe_packet.shared_visual_authoring_directive
        .directive_sha256,
    shot_recipe_sha256s:
      authoringContext.recipe_packet.recipes.map(
        (recipe) => recipe.shot_recipe_sha256,
      ),
    renderer_receipt_sha256: rendererReceipt.receipt_sha256,
    shot_count: 1,
    shots: [{ shot_id: 'S001', ...stateRefs }],
    pixel_facts: factsRef,
  };
  const page = { ...pageCore, page_sha256: fingerprintArtifactValue(pageCore) };
  const pageBytes = jsonBytes(page);
  const pageRef = artifactRef('style-page-B001', pageBytes, 'application/json');
  artifacts.set(pageRef.artifact_id, pageBytes);
  const globalArtifacts = [
    ['visual-grammar-program', fixture.visualGrammarProgram],
    ['whole-film-rules', fixture.wholeFilmRules],
    ['frame-projection', fixture.projection],
    ['design-selection', fixture.designSelection],
    ['base-template', fixture.baseTemplate],
    ['design-library', fixture.designLibrary],
  ].map(([artifactId, document]) => {
    const bytes = jsonBytes(document);
    const ref = artifactRef(artifactId, bytes, 'application/json');
    artifacts.set(artifactId, bytes);
    return ref;
  });
  const global = {
    visual_grammar_sha256: plan.bindings.visual_grammar_program_sha256,
    whole_film_rules_sha256: plan.bindings.whole_film_rules_sha256,
    design_slice_sha256: plan.bindings.design_slice_sha256,
    chunk_plan_sha256: plan.chunk_plan_sha256,
    projection_sha256: plan.bindings.projection_sha256,
    review_generation: reviewGeneration,
  };
  const indexCore = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
    gate: 'style_conformance_review',
    ...global,
    visual_grammar_program: globalArtifacts[0],
    whole_film_rules: globalArtifacts[1],
    frame_projection: globalArtifacts[2],
    design_selection: globalArtifacts[3],
    base_template: globalArtifacts[4],
    design_library: globalArtifacts[5],
    block_count: 1,
    blocks: [{
      block_id: block.block_id,
      block_manifest_sha256: blockManifestSha256,
      producer_isolation_sha256: producerIsolationSha256,
      source_artifacts: [sourceRef],
      authoring_context: authoringContextRef,
      renderer_config: rendererConfigRef,
      renderer_receipt: rendererRef,
      evidence_page: pageRef,
    }],
  };
  const packetIndex = {
    ...indexCore,
    packet_index_sha256: fingerprintArtifactValue(indexCore),
  };
  const packetIndexBytes = jsonBytes(packetIndex);
  const reviewerIsolationSha256 = sha('main-style-reviewer');
  const checks = {
    visual_identity: true,
    anti_identity: true,
    attention_geometry: true,
    subject_title_relationship: true,
    real_html_svg_text_readability: true,
    accent_visibility_load: true,
    material_texture_language: true,
    negative_space_responsibility: true,
  };
  const review = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
    gate: 'style_conformance_review',
    authority_scope: 'static-style-review',
    subject_packet_index_sha256: hashBytes(packetIndexBytes),
    ...global,
    reviewer_role: 'erduo-hyperframes-broll-main-agent',
    reviewer_model_id: 'gpt-5',
    reviewer_isolation_sha256: reviewerIsolationSha256,
    reviewed_blocks: [{
      block_id: block.block_id,
      block_manifest_sha256: blockManifestSha256,
      inspected_source_sha256s: [sourceRef.sha256],
      authoring_context_sha256: authoringContext.context_sha256,
      shared_directive_sha256:
        authoringContext.recipe_packet.shared_visual_authoring_directive
          .directive_sha256,
      shot_recipe_sha256s:
        authoringContext.recipe_packet.recipes.map(
          (recipe) => recipe.shot_recipe_sha256,
        ),
      renderer_receipt_sha256: rendererReceipt.receipt_sha256,
      inspected_evidence_page_sha256: hashBytes(pageBytes),
      inspected_still_sha256s: [
        stateRefs.entry.sha256,
        stateRefs.result.sha256,
        stateRefs.exit.sha256,
      ],
      inspected_capture_binding_sha256s: [
        stateRefs.entry.capture_binding_sha256,
        stateRefs.result.capture_binding_sha256,
        stateRefs.exit.capture_binding_sha256,
      ],
      inspected_pixel_facts_sha256: hashBytes(factsBytes),
      shot_reviews: [{ shot_id: 'S001', checks, finding_ids: [] }],
    }],
    adjacent_result_reviews: [],
    findings: [],
    block_revision_findings: [],
    decision: {
      outcome: 'approved',
      viewed_all_pages: true,
      read_all_bound_sources: true,
      static_scope_only: true,
      animation_approved_from_stills: false,
      rhythm_approved_from_stills: false,
      transitions_approved_from_stills: false,
      five_phase_lifecycle_approved_from_stills: false,
      seek_behavior_approved_from_stills: false,
      block_revision_count: 0,
      finding_count: 0,
      decision_sha256: '',
    },
    review_sha256: '',
  };
  const { decision_sha256: ignoredDecisionHash, ...decisionCore } = review.decision;
  review.decision.decision_sha256 = fingerprintArtifactValue({
    reviewed_blocks: review.reviewed_blocks,
    adjacent_result_reviews: review.adjacent_result_reviews,
    findings: review.findings,
    block_revision_findings: review.block_revision_findings,
    decision: decisionCore,
  });
  const { review_sha256: ignoredReviewHash, ...reviewCore } = review;
  review.review_sha256 = fingerprintArtifactValue(reviewCore);
  return {
    blocks: [{
      block_id: block.block_id,
      block_manifest_sha256: blockManifestSha256,
      producer_isolation_sha256: producerIsolationSha256,
      shot_ids: block.shot_ids,
      source_sha256s: [sourceRef.sha256],
      source_files: structuredClone(chunkManifest.source_files),
      renderer: {
        tool_id: rendererReceipt.input_manifest.renderer_tool_id,
        tool_version:
          rendererReceipt.input_manifest.renderer_tool_version,
        entrypoint_artifact_id: entrypointArtifactId,
        config_sha256: rendererConfigRef.sha256,
        receipt_sha256: rendererReceipt.receipt_sha256,
      },
      capture_schedule: captureSchedule,
    }],
    artifacts,
    packetIndexBytes,
    review,
    reviewerIsolationSha256,
    reviewerModelId: review.reviewer_model_id,
    reviewGeneration,
    chunks: [chunkManifest],
    chunkSourceBytes: new Map([['C001', chunkSourceBytes]]),
    trustedCaptureRunner: async (request) => ({
      runner_contract: 'style-trusted-capture-runner-v1',
      outputs: request.capture_schedule.flatMap((shot) =>
        ['entry', 'result', 'exit'].map((phase) => ({
          shot_id: shot.shot_id,
          phase,
          projected_frame: shot[phase].projected_frame,
          timestamp_ms: shot[phase].timestamp_ms,
          bytes: Buffer.from(PNG),
        }))),
    }),
  };
}

function planFixture() {
  const fixture = rulesFixture();
  const flatShotKitSetSha256 = sha('flat-kit-set');
  const authoringPlan = createAuthoringPlan({
    global_rules_sha256:
      fixture.wholeFilmRules.whole_film_rules_sha256,
    parsed_srt_sha256:
      fixture.wholeFilmRules.bindings.parsed_srt_sha256,
    plan_sha256: fixture.wholeFilmRules.bindings.shot_plan_sha256,
    projection_sha256:
      fixture.wholeFilmRules.bindings.projection_sha256,
    design_slice_sha256:
      fixture.wholeFilmRules.bindings.design_slice_sha256,
    kit_set_sha256: flatShotKitSetSha256,
    fps: fixture.projection.fps,
    shots: fixture.projection.shots.map((shot) => ({
      shot_id: shot.shot_id,
      srt_window_ms: shot.srt_window_ms,
    })),
    max_shots_per_chunk: 8,
    max_chunk_duration_ms: 45_000,
  });
  const projectedShot = fixture.projection.shots[0];
  const plannedBlocks = [{
    block_id: 'B001',
    planner_chunk_id: authoringPlan.chunks[0].chunk_id,
    planner_chunk_spec_sha256:
      authoringPlan.chunks[0].chunk_spec_sha256,
    shot_ids: ['S001'],
    start_ms: projectedShot.srt_window_ms.start_ms,
    end_ms: projectedShot.srt_window_ms.end_ms,
    start_frame: projectedShot.frame_window.start_frame,
    end_frame: projectedShot.frame_window.end_frame,
    long_singleton: false,
    namespace: 'b001',
    preceding_seam: { neighbor_block_id: null, obligation: 'none' },
    following_seam: { neighbor_block_id: null, obligation: 'none' },
  }];
  const kits = [kitFixture(fixture)];
  const assetVisualGrammarBindings =
    createAssetVisualGrammarBindings({
      ...fixture,
      director_manifest_sha256: sha('director-manifest'),
      flat_shot_kit_set_sha256: flatShotKitSetSha256,
      kits,
    });
  const plan = bindVisualAuthoringChunkPlan({
    ...fixture,
    authoringPlan,
    expected_authoring_plan_sha256:
      authoringPlan.authoring_plan_sha256,
    director_manifest_sha256: sha('director-manifest'),
    assets_manifest_sha256: sha('assets-manifest'),
    asset_fact_review_sha256: sha('asset-review'),
    asset_visual_bindings_sha256:
      assetVisualGrammarBindings.asset_visual_bindings_sha256,
    flat_shot_kit_set_sha256: flatShotKitSetSha256,
    kits,
    assetVisualGrammarBindings,
    font_package_sha256:
      fixture.wholeFilmRules.bindings.font_package_sha256,
    planned_blocks: plannedBlocks,
  });
  return {
    ...fixture,
    authoringPlan,
    expected_authoring_plan_sha256:
      authoringPlan.authoring_plan_sha256,
    plan,
    plannedBlocks,
    flatShotKitSetSha256,
    kits,
    assetVisualGrammarBindings,
  };
}

function kitFixture(fixture) {
  const kit = {
    shot_id: 'S001',
    design_slice_sha256:
      fixture.wholeFilmRules.bindings.design_slice_sha256,
    primary_asset: {
      route: 'image-generation',
      media_kind: 'image',
    },
    composition_fit: {
      subject_bbox: { x: 100, y: 100, width: 1200, height: 800 },
      focal_point: { x: 600, y: 400 },
      output_crop_bbox: { x: 0, y: 0, width: 1920, height: 1080 },
      text_safe_regions: [{ x: 1300, y: 80, width: 500, height: 600 }],
      protected_regions: [{
        region_id: 'subject-safe',
        kind: 'subject',
        bbox: { x: 100, y: 100, width: 1200, height: 800 },
      }],
      motion: { source_motion: 'static', treatment_motion: 'causal-pan' },
      palette: { dominant_hex: '#231f20', accent_hex: '#ef5b38' },
      title_relation: {
        mode: 'inside-text-safe-region',
        title_bbox: { x: 1320, y: 120, width: 420, height: 240 },
        text_safe_region_index: 0,
        min_clearance_px: 40,
      },
      result_roi: { x: 100, y: 100, width: 1200, height: 800 },
    },
    consumer_plan: { element: 'img' },
    target_preview: { frame_sha256: sha('kit-preview') },
  };
  return {
    flat_shot_kit_sha256: fingerprintArtifactValue(kit),
    kit,
  };
}

export async function createFullStyleLineageEvidenceFixture() {
  const fixture = planFixture();
  const style = await styleFixture(fixture);
  const evidenceCore = {
    ...fixture,
    chunkPlan: fixture.plan,
    authoringPlan: fixture.authoringPlan,
    blocks: style.blocks,
    chunks: style.chunks,
    chunkSourceBytes: style.chunkSourceBytes,
    integrator_isolation_sha256: sha('integration-agent'),
    reviewer_isolation_sha256: style.reviewerIsolationSha256,
    reviewer_model_id: style.reviewerModelId,
    review_generation: style.reviewGeneration,
    review: style.review,
    packetIndexBytes: style.packetIndexBytes,
    artifactBytes: style.artifacts,
    trustedCaptureRunner: style.trustedCaptureRunner,
  };
  const authorizedIntegration =
    await createStyleAuthorizedIntegration(evidenceCore);
  const integrationManifest =
    authorizedIntegration.integrationManifest;
  const sourceCodeReview = createSourceCodeReview({
    integrationManifest,
    plan: fixture.authoringPlan,
    chunks: style.chunks,
    chunkSourceBytes: style.chunkSourceBytes,
    reviewer_isolation_sha256: sha('source-reviewer'),
    reviewer_model_id: 'gpt-5-source',
    checks: {
      positions: true,
      z_order: true,
      shot_order: true,
      timing: true,
      lifecycle: true,
      selectors: true,
      cross_chunk_seams: true,
      errors: true,
    },
    still_evidence: {
      uses: ['font', 'crop', 'material-visibility'],
      animation_approval: false,
      evidence_sha256: sha('source-still-evidence'),
    },
  });
  const evidence = {
    ...evidenceCore,
    styleIntegrationAuthorization:
      authorizedIntegration.styleIntegrationAuthorization,
    integrationManifest,
    sourceCodeReview,
  };
  const lineage =
    await revalidateStyleAuthorizedIntegrationForRender(evidence);
  return {
    evidence,
    fixture,
    style,
    lineage,
    integrationManifest,
    sourceCodeReview,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
test('builds a deterministic progressive-disclosure chunk plan and exact block packet', () => {
  const fixture = planFixture();
  const receipt = validateVisualAuthoringChunkPlan(fixture.plan, fixture);
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.block_count, 1);
  assert.equal(fixture.plan.blocks[0].block_id, 'B001');
  assert.equal(fixture.plan.blocks[0].planner_chunk_id, 'C001');
  assert.equal(
    fixture.plan.blocks[0].planner_chunk_spec_sha256,
    fixture.authoringPlan.chunks[0].chunk_spec_sha256,
  );
  assert.equal(
    fixture.plan.blocks[0].identity_projection_sha256,
    fixture.plan.identity_projection.identity_projection_sha256,
  );
  assert.deepEqual(
    fixture.plan.blocks[0].authoring_context.recipe_packet
      .shared_visual_authoring_directive.identity,
    fixture.visualGrammarProgram.identity,
  );
  const packet = extractVisualBlockAuthoringPacket(
    fixture.plan,
    'B001',
    fixture,
  );
  assert.equal('pages' in packet, false);
  assert.equal('provenance' in packet, false);
  assert.equal(
    packet.scoped_materials.input_policy.self_contained,
    true,
  );
  assert.equal(
    packet.scoped_materials.scoped_materials_sha256,
    packet.block.scoped_materials_sha256,
  );
  assert.deepEqual(
    packet.scoped_materials.shots.map((item) => item.shot_id),
    packet.block.shot_ids,
  );
  assert.deepEqual(
    packet.scoped_materials.shots[0].design_shot,
    fixture.designSlice.shots[0],
  );
  assert.deepEqual(
    packet.scoped_materials.shots[0].flat_shot_kit,
    fixture.kits[0].kit,
  );
  assert.deepEqual(
    packet.scoped_materials.shots[0].asset_visual_binding,
    fixture.assetVisualGrammarBindings.shots[0],
  );
  assert.deepEqual(
    packet.block.allowed_design_shot_sha256s,
    packet.scoped_materials.shots.map(
      (item) => item.design_shot_sha256,
    ),
  );
  assert.deepEqual(
    packet.block.allowed_flat_shot_kit_sha256s,
    packet.scoped_materials.shots.map(
      (item) => item.flat_shot_kit_sha256,
    ),
  );
  assert.equal(
    validateVisualBlockAuthoringPacket(packet, fixture.plan, 'B001', fixture).status,
    'passed',
  );
  const tampered = structuredClone(packet);
  tampered.block.authoring_context.recipe_packet.recipes[0].typography.hierarchy =
    '攻击者替换了块内排版义务。';
  assert.throws(
    () => validateVisualBlockAuthoringPacket(tampered, fixture.plan, 'B001', fixture),
    (error) => error.code === 'visual_block_packet_invalid',
  );
  for (const mutate of [
    (value) => { value.scoped_materials.shots = []; },
    (value) => {
      value.scoped_materials.shots.push(
        structuredClone(value.scoped_materials.shots[0]),
      );
    },
    (value) => {
      value.scoped_materials.shots[0].flat_shot_kit =
        structuredClone(value.scoped_materials.shots[0].design_shot);
    },
    (value) => {
      value.side_loaded_assets = [{
        artifact_id: 'undeclared-side-input',
      }];
    },
  ]) {
    const attackedPacket = structuredClone(packet);
    mutate(attackedPacket);
    assert.throws(
      () => validateVisualBlockAuthoringPacket(
        attackedPacket,
        fixture.plan,
        'B001',
        fixture,
      ),
      (error) => error.code === 'visual_block_packet_invalid',
    );
  }

  const missingKits = { ...fixture, kits: [] };
  assert.throws(
    () => extractVisualBlockAuthoringPacket(
      fixture.plan,
      'B001',
      missingKits,
    ),
    (error) => [
      'asset_visual_binding_invalid',
      'visual_block_material_set_invalid',
      'visual_chunk_plan_tampered',
    ].includes(error.code),
  );
  const extraKits = {
    ...fixture,
    kits: [
      ...fixture.kits,
      structuredClone(fixture.kits[0]),
    ],
  };
  assert.throws(
    () => extractVisualBlockAuthoringPacket(
      fixture.plan,
      'B001',
      extraKits,
    ),
    (error) => [
      'asset_visual_binding_invalid',
      'visual_block_material_set_invalid',
      'visual_chunk_plan_tampered',
    ].includes(error.code),
  );
  const staleDesign = structuredClone(fixture.designSlice);
  staleDesign.shots[0].semantic_claim =
    '攻击者在计划冻结后替换设计记录内容。';
  assert.throws(
    () => extractVisualBlockAuthoringPacket(
      fixture.plan,
      'B001',
      { ...fixture, designSlice: staleDesign },
    ),
    (error) => [
      'visual_block_material_set_invalid',
      'visual_chunk_plan_tampered',
    ].includes(error.code),
  );
  const substitutedKit = structuredClone(fixture.kits);
  substitutedKit[0].kit.composition_fit.palette.accent_hex =
    '#00ff00';
  assert.throws(
    () => extractVisualBlockAuthoringPacket(
      fixture.plan,
      'B001',
      { ...fixture, kits: substitutedKit },
    ),
    (error) => [
      'ordinary_primary_required',
      'asset_visual_binding_tampered',
      'visual_chunk_plan_tampered',
    ].includes(error.code),
  );

  const renamed = structuredClone(fixture.plannedBlocks);
  renamed[0].namespace = 'b999';
  assert.throws(
    () => bindVisualAuthoringChunkPlan({
      ...fixture,
      director_manifest_sha256: sha('director-manifest'),
      assets_manifest_sha256: sha('assets-manifest'),
      asset_fact_review_sha256: sha('asset-review'),
      asset_visual_bindings_sha256: sha('asset-visual-bindings'),
      flat_shot_kit_set_sha256: sha('flat-kit-set'),
      planned_blocks: renamed,
    }),
    (error) => error.code === 'visual_chunk_plan_mismatch',
  );

  for (const mutate of [
    (blocks) => { blocks[0].planner_chunk_id = 'C999'; },
    (blocks) => { blocks[0].planner_chunk_spec_sha256 = sha('foreign-spec'); },
    (blocks) => { blocks[0].start_ms += 1; },
    (blocks) => { blocks.push(structuredClone(blocks[0])); },
  ]) {
    const attacked = structuredClone(fixture.plannedBlocks);
    mutate(attacked);
    assert.throws(
      () => bindVisualAuthoringChunkPlan({
        ...fixture,
        director_manifest_sha256: sha('director-manifest'),
        assets_manifest_sha256: sha('assets-manifest'),
        asset_fact_review_sha256: sha('asset-review'),
        asset_visual_bindings_sha256: sha('asset-visual-bindings'),
        flat_shot_kit_set_sha256: fixture.flatShotKitSetSha256,
        planned_blocks: attacked,
      }),
      (error) => error.code === 'visual_chunk_plan_mismatch',
    );
  }
});

test('rejects substituted, truncated, regrouped, duplicate, or omitted sole planner identities', () => {
  const shots = [
    { shot_id: 'S001', start_ms: 0, end_ms: 1000 },
    { shot_id: 'S002', start_ms: 1000, end_ms: 2000 },
    { shot_id: 'S003', start_ms: 2000, end_ms: 3000 },
  ];
  const canonicalPolicy = {
    max_shots: 8,
    max_duration_ms: 45_000,
    oversize_singleton: true,
  };
  const makePlan = (planShots = shots, policy = canonicalPolicy) =>
    createAuthoringPlan({
      global_rules_sha256: sha('rules-complete-set'),
      parsed_srt_sha256: sha('srt-complete-set'),
      plan_sha256: sha('shot-plan-complete-set'),
      projection_sha256: sha('projection-complete-set'),
      design_slice_sha256: sha('design-complete-set'),
      kit_set_sha256: sha('kits-complete-set'),
      fps: { numerator: 25, denominator: 1 },
      shots: planShots,
      max_shots_per_chunk: policy.max_shots,
      max_chunk_duration_ms: policy.max_duration_ms,
    });
  const completePlan = makePlan();
  const projection = {
    shots: shots.map((shot) => ({
      shot_id: shot.shot_id,
      srt_window_ms: {
        start_ms: shot.start_ms,
        end_ms: shot.end_ms,
      },
    })),
  };
  const visualGrammarProgram = {
    pages: [{
      recipes: shots.map((shot) => ({
        shot_id: shot.shot_id,
        srt_window_ms: {
          start_ms: shot.start_ms,
          end_ms: shot.end_ms,
        },
      })),
    }],
  };
  const validInput = {
    authoringPlan: completePlan,
    expectedAuthoringPlanSha256:
      completePlan.authoring_plan_sha256,
    projection,
    visualGrammarProgram,
    canonicalChunkPolicy: canonicalPolicy,
  };
  assert.equal(
    validateSoleAuthoringPlanIdentity(validInput).shot_count,
    3,
  );

  const substituted = makePlan(shots, {
    ...canonicalPolicy,
    max_shots: 2,
  });
  assert.throws(
    () => validateSoleAuthoringPlanIdentity({
      ...validInput,
      authoringPlan: substituted,
    }),
    (error) => error.code === 'visual_chunk_plan_manifest_mismatch',
  );

  const truncated = makePlan(shots.slice(0, 2));
  assert.throws(
    () => validateSoleAuthoringPlanIdentity({
      ...validInput,
      authoringPlan: truncated,
      expectedAuthoringPlanSha256:
        truncated.authoring_plan_sha256,
    }),
    (error) => error.code === 'visual_chunk_plan_complete_set_mismatch',
  );

  const smallerPolicy = makePlan(shots, {
    ...canonicalPolicy,
    max_shots: 2,
  });
  assert.throws(
    () => validateSoleAuthoringPlanIdentity({
      ...validInput,
      authoringPlan: smallerPolicy,
      expectedAuthoringPlanSha256:
        smallerPolicy.authoring_plan_sha256,
    }),
    (error) => error.code === 'visual_chunk_policy_invalid',
  );

  for (const mutate of [
    (plan) => { plan.chunks[0].shots.push(structuredClone(plan.chunks[0].shots[0])); },
    (plan) => { plan.chunks[0].shots.pop(); },
  ]) {
    const attacked = structuredClone(completePlan);
    mutate(attacked);
    const { authoring_plan_sha256: ignored, ...core } = attacked;
    attacked.authoring_plan_sha256 =
      fingerprintArtifactValue(core);
    assert.throws(
      () => validateSoleAuthoringPlanIdentity({
        ...validInput,
        authoringPlan: attacked,
        expectedAuthoringPlanSha256:
          attacked.authoring_plan_sha256,
      }),
      (error) => [
        'authoring_plan_tampered',
        'visual_chunk_plan_complete_set_mismatch',
      ].includes(error.code),
    );
  }
});

test('binds each asset crop, title relation, and material treatment to its exact shot recipe', () => {
  const fixture = planFixture();
  const kit = kitFixture(fixture);
  const options = {
    ...fixture,
    director_manifest_sha256: sha('director-manifest'),
    flat_shot_kit_set_sha256: sha('flat-kit-set'),
    kits: [kit],
  };
  const bindings = createAssetVisualGrammarBindings(options);
  assert.equal(
    validateAssetVisualGrammarBindings(bindings, options).status,
    'passed',
  );
  const changed = structuredClone(bindings);
  changed.shots[0].title_application_sha256 = sha('replacement-title-binding');
  assert.throws(
    () => validateAssetVisualGrammarBindings(changed, options),
    (error) => error.code === 'asset_visual_binding_tampered',
  );
  const nativeOnly = kitFixture(fixture);
  nativeOnly.kit.primary_asset.route = 'hyperframes-native';
  nativeOnly.flat_shot_kit_sha256 = fingerprintArtifactValue(nativeOnly.kit);
  assert.throws(
    () => createAssetVisualGrammarBindings({ ...options, kits: [nativeOnly] }),
    (error) => error.code === 'ordinary_primary_required',
  );
});

test('authorizes integration only from an approved review over the exact current block bytes', async () => {
  const fixture = planFixture();
  const style = await styleFixture(fixture);
  const options = {
    ...fixture,
    chunkPlan: fixture.plan,
    authoringPlan: fixture.authoringPlan,
    blocks: style.blocks,
    chunks: style.chunks,
    chunkSourceBytes: style.chunkSourceBytes,
    integrator_isolation_sha256: sha('integration-agent'),
    reviewer_isolation_sha256: style.reviewerIsolationSha256,
    reviewer_model_id: style.reviewerModelId,
    review_generation: style.reviewGeneration,
    review: style.review,
    packetIndexBytes: style.packetIndexBytes,
    artifactBytes: style.artifacts,
    trustedCaptureRunner: style.trustedCaptureRunner,
  };
  const authorization = await createStyleIntegrationAuthorization(options);
  assert.equal(authorization.status, 'approved');
  assert.equal(
    (await validateStyleIntegrationAuthorization(authorization, options)).status,
    'approved',
  );
  const authorizedIntegration =
    await createStyleAuthorizedIntegration(options);
  const integrationReceipt = await validateStyleAuthorizedIntegration(
    authorizedIntegration.integrationManifest,
    authorizedIntegration.styleIntegrationAuthorization,
    options,
  );
  assert.equal(integrationReceipt.status, 'passed');
  assert.equal(
    integrationReceipt.style_source_ledger_sha256,
    authorization.style_source_ledger_sha256,
  );
  const integrationManifest =
    authorizedIntegration.integrationManifest;
  const sourceReview = createSourceCodeReview({
    integrationManifest,
    plan: fixture.authoringPlan,
    chunks: style.chunks,
    chunkSourceBytes: style.chunkSourceBytes,
    reviewer_isolation_sha256: sha('source-reviewer'),
    reviewer_model_id: 'gpt-5-source',
    checks: {
      positions: true,
      z_order: true,
      shot_order: true,
      timing: true,
      lifecycle: true,
      selectors: true,
      cross_chunk_seams: true,
      errors: true,
    },
    still_evidence: {
      uses: ['font', 'crop', 'material-visibility'],
      animation_approval: false,
      evidence_sha256: sha('source-still-evidence'),
    },
  });
  const lineage =
    await revalidateStyleAuthorizedIntegrationForRender({
      ...options,
      styleIntegrationAuthorization:
        authorizedIntegration.styleIntegrationAuthorization,
      integrationManifest,
    });
  const styleReviewSummary = {
    gate: 'style_conformance_review',
    status: 'approved',
    reviewer_role: lineage.reviewer_role,
    reviewer_model_id: lineage.reviewer_model_id,
    reviewer_isolation_sha256:
      lineage.reviewer_isolation_sha256,
    authority_scope: lineage.authority_scope,
    subject_packet_index_sha256:
      lineage.subject_packet_index_sha256,
    review_generation: lineage.review_generation,
    style_conformance_review_sha256:
      lineage.style_conformance_review_sha256,
    style_validator_receipt_sha256:
      lineage.style_validator_receipt_sha256,
    style_source_ledger_sha256:
      lineage.style_source_ledger_sha256,
    style_integration_authorization_sha256:
      lineage.style_integration_authorization_sha256,
    lineage_receipt_sha256:
      lineage.lineage_receipt_sha256,
  };
  const sourceReviewSummary = {
    gate: 'source_code_review',
    status: 'approved',
    reviewer_role: sourceReview.reviewer_role,
    reviewer_model_id: sourceReview.reviewer_model_id,
    reviewer_isolation_sha256:
      sourceReview.reviewer_isolation_sha256,
    authority_scope: sourceReview.authority_scope,
    approval_sha256: sourceReview.approval_sha256,
    authoring_topology_id:
      sourceReview.authoring_topology_id,
    phase: sourceReview.phase,
    authoring_plan_sha256:
      sourceReview.authoring_plan_sha256,
    integration_manifest_sha256:
      sourceReview.integration_manifest_sha256,
    source_bundle_sha256:
      sourceReview.source_bundle_sha256,
    no_rewrite_receipt_sha256:
      sourceReview.no_rewrite_receipt_sha256,
    style_integration_authorization_sha256:
      sourceReview.style_integration_authorization_sha256,
    style_source_ledger_sha256:
      sourceReview.style_source_ledger_sha256,
    style_validator_receipt_sha256:
      sourceReview.style_validator_receipt_sha256,
  };
  const masterMetrics = {
    authoring_topology_id: 'bounded-authoring-cluster-v1',
    source_gate_passed: true,
    font_gate_passed: true,
    asset_gate_passed: true,
    hyperframes_gate_passed: true,
    seek_gate_passed: true,
    profile_gate_passed: true,
    pixel_gate_passed: true,
    chunk_count: style.chunks.length,
    validated_chunk_count: style.chunks.length,
    source_file_count:
      integrationManifest.source_files.length
        + integrationManifest.generated_files.length,
    no_rewrite_passed: true,
    authoring_plan_sha256:
      integrationManifest.authoring_plan_sha256,
    integration_manifest_sha256:
      integrationReceipt.integration_manifest_sha256,
    source_bundle_sha256:
      integrationReceipt.source_bundle_sha256,
    no_rewrite_receipt_sha256:
      integrationReceipt.no_rewrite_receipt_sha256,
  };
  const stageReceipt = createStageReceipt({
    stage: 'master-build',
    run_id: 'style-lineage-render-preflight',
    input_sha256: sha('master-input'),
    execution_isolation: {
      host: 'fixture-test',
      mechanism: 'fixture',
      dispatch_evidence_sha256: sha('master-dispatch'),
      stage_context_sha256: sha('integration-agent'),
    },
    output: {
      manifest_envelope: {
        schema_version: 2,
        pipeline_contract_version: 2,
        stage: 'master-build',
        package_id: 'style-lineage-master-build',
        manifest_sha256:
          integrationReceipt.integration_manifest_sha256,
        upstream_manifest_sha256: sha('assets-manifest'),
        artifact_counts: { json: 1 },
        metrics: masterMetrics,
        producer_isolation_sha256: sha('integration-agent'),
      },
      review_refs: [],
      main_review_refs: [
        styleReviewSummary,
        sourceReviewSummary,
      ],
    },
  });
  const renderPreflight = await assertFinalRenderPreflight(
    stageReceipt,
    {
      ...options,
      styleIntegrationAuthorization:
        authorizedIntegration.styleIntegrationAuthorization,
      integrationManifest,
      sourceCodeReview: sourceReview,
    },
  );
  assert.equal(
    renderPreflight.lineage_receipt_sha256,
    lineage.lineage_receipt_sha256,
  );
  assert.equal(
    renderPreflight.style_validator_receipt_sha256,
    authorization.style_validator_receipt_sha256,
  );

  await assert.rejects(
    createStyleIntegrationAuthorization({
      ...options,
      trustedCaptureRunner: undefined,
    }),
    (error) => error.code === 'style_review_capture_runner_required',
  );
  await assert.rejects(
    createStyleIntegrationAuthorization({
      ...options,
      trustedCaptureRunner: async (request) => ({
        runner_contract: 'style-trusted-capture-runner-v1',
        outputs: request.capture_schedule.flatMap((shot) =>
          ['entry', 'result', 'exit'].map((phase) => ({
            shot_id: shot.shot_id,
            phase,
            projected_frame: shot[phase].projected_frame,
            timestamp_ms: shot[phase].timestamp_ms,
            bytes: Buffer.from('not-the-submitted-capture', 'utf8'),
          }))),
      }),
    }),
    (error) => [
      'style_review_capture_runner_invalid',
      'style_review_capture_replay_mismatch',
    ].includes(error.code),
  );

  const changedBlocks = structuredClone(style.blocks);
  changedBlocks[0].source_sha256s[0] = sha('changed-source');
  await assert.rejects(
    createStyleIntegrationAuthorization({ ...options, blocks: changedBlocks }),
    (error) => [
      'style_integration_block_set_invalid',
      'style_review_block_unbound',
    ].includes(error.code),
  );

  const substitutedSource = Buffer.from(
    '<section><svg><text>Source B substituted</text></svg></section>',
    'utf8',
  );
  const substitutedChunk = createAuthoringChunkManifest({
    plan: fixture.authoringPlan,
    chunk_id: 'C001',
    attempt: 1,
    producer_isolation_sha256:
      style.chunks[0].producer_isolation_sha256,
    sourceBytes: new Map([[
      'scene.html',
      {
        artifact_id: 'source-B001',
        relative_path: 'scene.html',
        media_type: 'text/html',
        bytes: substitutedSource,
      },
    ]]),
    gates: {
      source: 'passed',
      font: 'passed',
      asset: 'passed',
      hyperframes: 'passed',
      seek: 'passed',
      profile: 'passed',
      pixel: 'passed',
    },
  });
  await assert.rejects(
    createStyleAuthorizedIntegration({
      ...options,
      chunks: [substitutedChunk],
      chunkSourceBytes: new Map([[
        'C001',
        substitutedChunk.source_bytes,
      ]]),
    }),
    (error) => [
      'style_source_ledger_mapping_mismatch',
      'style_source_ledger_record_mismatch',
      'style_source_ledger_bytes_mismatch',
    ].includes(error.code),
  );

  const sameLabelsDifferentBytes =
    new Map(style.chunkSourceBytes);
  sameLabelsDifferentBytes.set(
    'C001',
    new Map([[
      style.chunks[0].source_files[0].artifact_id,
      substitutedSource,
    ]]),
  );
  await assert.rejects(
    createStyleAuthorizedIntegration({
      ...options,
      chunkSourceBytes: sameLabelsDifferentBytes,
    }),
    (error) => [
      'source_bytes_mismatch',
      'style_source_ledger_bytes_mismatch',
    ].includes(error.code),
  );

  const renamedChunk = structuredClone(style.chunks[0]);
  renamedChunk.source_files[0].artifact_id = 'renamed-source';
  await assert.rejects(
    createStyleAuthorizedIntegration({
      ...options,
      chunks: [renamedChunk],
      chunkSourceBytes: new Map([[
        'C001',
        new Map([[
          'renamed-source',
          style.artifacts.get('source-B001'),
        ]]),
      ]]),
    }),
    (error) => [
      'authoring_chunk_source_unbound',
      'authoring_chunk_tampered',
      'style_source_ledger_record_mismatch',
      'style_source_ledger_mapping_mismatch',
    ].includes(error.code),
  );

  await assert.rejects(
    validateStyleIntegrationAuthorization(authorization, {
      ...options,
      review_generation: style.reviewGeneration + 1,
    }),
    (error) => [
      'style_review_packet_unbound',
      'style_review_binding_mismatch',
    ].includes(error.code),
  );

  const temporalOverreach = structuredClone(style.review);
  temporalOverreach.decision.animation_approved_from_stills = true;
  await assert.rejects(
    createStyleIntegrationAuthorization({ ...options, review: temporalOverreach }),
    (error) => error.code === 'style_review_decision_invalid',
  );
});
}
