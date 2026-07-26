import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  realpath,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { fingerprintArtifactValue } from './artifact-manifest.mjs';
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
import { extractWholeFilmBlockContext } from './validate-whole-film-rules.mjs';
import {
  loadStyleArtifactMap,
  StyleConformanceReviewError,
  TRUSTED_CAPTURE_RUNNER_CONTRACT,
  validateStyleConformanceReview,
} from './validate-style-conformance-review.mjs';

const execFile = promisify(execFileCallback);
const DESIGN_LIBRARY = await loadPackagedDesignLibrary();
const BASE_TEMPLATE = DESIGN_LIBRARY.templates.find((template) => template.id === 'quiet-editorial-print');
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
const sha = (value) => createHash('sha256').update(value).digest('hex');
const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value) => Buffer.from(JSON.stringify(value), 'utf8');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAAAAAAAAQCEeRdzAAAAEklEQVR4nGP4z8DAAMIM/4EAAB/uBfsL2WiLAAAAAElFTkSuQmCC',
  'base64',
);
const JPEG = Buffer.from(
  '/9j//gAPTGF2YzYwLjMuMTAwAP/bAEMACAQEBAQEBQUFBQUFBgYGBgYGBgYGBgYGBgcHBwgICAcHBwYGBwcICAgICQkJCAgICAkJCgoKDAwLCw4ODhERFP/EAGYAAQEAAAAAAAAAAAAAAAAAAAQHAQEBAAAAAAAAAAAAAAAAAAAEAxAAAgICAgMBAAAAAAAAAAAAAgMFAQQHBgC1djchEQACAgIBAwUBAAAAAAAAAAADAgQBBQAGIRIRM3WxcrQ2/8AAEQgAAgACAwESAAISAAMSAP/aAAwDAQACEQMRAD8ArGt4GDydecOe+LjnNbx2EY1rMTHNjDOPQRGZkuyIiK7siu7u7/b6vWPzXhXrMF47H7TlHHsALk2bGPE4xETJz1RFhx1VVWSSqVaofiqqulVXStZyz+pz3uuR/UTRkwuHnu0uXjYEqTJazyJB4oDHOYt95ClKRGchCPds7tdszXd3fnUg9AX0T4rf/9k=',
  'base64',
);
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

function ref(artifactId, bytes, mediaType = 'application/json') {
  return { artifact_id: artifactId, sha256: hashBytes(bytes), size_bytes: bytes.length, media_type: mediaType };
}

function projectionFixture() {
  return compileFrameProjection({
    pipeline_contract_version: 2,
    artifact_id: 'projection-main',
    parsed_srt_sha256: sha('parsed-srt'),
    plan_sha256: sha('shot-plan'),
    fps: { numerator: 25, denominator: 1 },
    shots: [
      { shot_id: 'S001', start_ms: 0, end_ms: 2000 },
      { shot_id: 'S002', start_ms: 2000, end_ms: 4000 },
    ],
  });
}

function authoredRecipe(
  index,
  projectedShot,
  effectiveBase = BASE_TEMPLATE,
) {
  const value = {
    shot_id: `S00${index}`,
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
      previous_shot_id: index === 1 ? null : 'S001',
      changed_axis_ids: index === 1
        ? []
        : effectiveBase.adaptation_knobs.map((knob) => knob.id),
      changed_authoring_fields: index === 1 ? [] : [...AUTHORING_FIELDS],
      content_reason: index === 1 ? 'first-shot-baseline' : '第二镜因果对象和动作改变，因此所有作者字段都重新冻结。',
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

function designSelectionFixture(briefSha256) {
  const core = {
    schema_version: 1,
    briefs_sha256: briefSha256,
    mode: 'base-template',
    base_template: BASE_TEMPLATE.id,
    template_status: BASE_TEMPLATE.status,
    protected_user_layers: [],
    signals: { fixture: 'quiet-editorial-print-explicit-selection' },
    score: 1000,
    reasons: [{ code: 'USER_TEMPLATE_OVERRIDE', points: 1000 }],
    borrowed_patterns: [],
    borrow_rejections: [],
    alternatives: [],
    candidate_rejections: [],
    base_template_sha256: fingerprintRenderValue(BASE_TEMPLATE),
    design_library_snapshot_sha256:
      designLibrarySnapshotSha256(DESIGN_LIBRARY),
    native_compiler_source_bundle_sha256:
      DESIGN_LIBRARY.nativeBaseCompiler.native_compiler_source_bundle_sha256,
    visual_grammar_compilation: {
      eligible: true,
      guard_code: 'BASE_TEMPLATE_BOUND',
    },
  };
  return { ...core, selection_sha256: fingerprintValue(core) };
}

function nativeDesignSelectionFixture(briefSha256) {
  const nativeCompiler = DESIGN_LIBRARY.nativeBaseCompiler;
  const core = {
    schema_version: 1,
    briefs_sha256: briefSha256,
    mode: 'native-fallback',
    base_template: nativeCompiler.id,
    base_template_sha256: fingerprintRenderValue(nativeCompiler),
    design_library_snapshot_sha256:
      designLibrarySnapshotSha256(DESIGN_LIBRARY),
    native_compiler_source_bundle_sha256:
      nativeCompiler.native_compiler_source_bundle_sha256,
    visual_grammar_compilation: {
      eligible: true,
      guard_code: 'NATIVE_BASE_COMPILER_BOUND',
    },
    template_status: nativeCompiler.status,
    fallback: nativeCompiler.id,
    protected_user_layers: [],
    signals: { fixture: 'hyperframes-native-explicit-selection' },
    borrowed_patterns: [],
    borrow_rejections: [],
    candidate_rejections: [],
  };
  return { ...core, selection_sha256: fingerprintValue(core) };
}

function visualGrammarFixture(
  projection,
  designSelection,
  effectiveBase = BASE_TEMPLATE,
  axisField = TEMPLATE_AXIS_FIELD,
) {
  const bindings = {
    confirmed_brief_sha256: sha('brief'),
    parsed_srt_sha256: projection.parsed_srt_sha256,
    shot_plan_sha256: projection.plan_sha256,
    projection_sha256: projection.receipt.projection_sha256,
    design_slice_sha256: sha('design-slice'),
    display_selection_sha256: sha('display'),
    font_package_sha256: sha('font'),
    design_selection_sha256: designSelection.selection_sha256,
    base_template_id: effectiveBase.id,
    base_template_sha256: fingerprintRenderValue(effectiveBase),
    design_library_snapshot_sha256:
      designLibrarySnapshotSha256(DESIGN_LIBRARY),
  };
  const recipes = projection.shots.map((shot, index) =>
    authoredRecipe(index + 1, shot, effectiveBase));
  const page = {
    schema_version: 1,
    artifact_type: 'visual-grammar-recipe-page',
    program_id: 'fixture-visual-grammar',
    page_id: 'recipe-page-001',
    page_number: 1,
    shot_start: 1,
    shot_end: 2,
    recipes,
    page_sha256: '',
  };
  const { page_sha256: ignoredPage, ...pageCore } = page;
  page.page_sha256 = fingerprintValue(pageCore);
  const sourceSpecs = [
    ['brief-source', 'confirmed-brief', bindings.confirmed_brief_sha256],
    ['srt-source', 'parsed-srt', bindings.parsed_srt_sha256],
    ['plan-source', 'shot-plan', bindings.shot_plan_sha256],
    ['projection-source', 'frame-projection', bindings.projection_sha256],
    ['design-source', 'design-slice', bindings.design_slice_sha256],
    ['display-source', 'display-selection', bindings.display_selection_sha256],
    ['font-source', 'font-package', bindings.font_package_sha256],
    ['design-selection-source', 'design-selection', bindings.design_selection_sha256],
    ['base-template-source', 'base-template', bindings.base_template_sha256],
    ['design-library-source', 'design-library-snapshot', bindings.design_library_snapshot_sha256],
    ['author-source', 'author-curation', sha('author')],
  ];
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
      authoring_field: axisField.get(knob.id),
      purpose: `通过 ${knob.id} 轴响应相邻内容变化并防止关系同构。`,
      states: knob.options.map((option) => ({
        state_id: option,
        description: `${option} 是模板 ${knob.id} 轴上的明确作者状态。`,
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
      source_refs: sourceSpecs.map(([sourceRefId, sourceKind, sourceHash]) => ({
        source_ref_id: sourceRefId,
        source_kind: sourceKind,
        artifact_id: `${sourceRefId}-artifact`,
        sha256: sourceHash,
        role: `冻结 ${sourceKind} 对作者决策的事实约束。`,
      })),
    },
    shot_count: 2,
    pagination: {
      max_recipes_per_page: 8,
      page_count: 1,
      page_index: [{
        page_id: page.page_id,
        page_number: 1,
        shot_start: 1,
        shot_end: 2,
        shot_ids: recipes.map((recipe) => recipe.shot_id),
        recipe_sha256s: recipes.map((recipe) => recipe.shot_recipe_sha256),
        page_sha256: page.page_sha256,
      }],
    },
    pages: [page],
    program_sha256: '',
  };
  const { pages: ignoredPages, program_sha256: ignoredHash, ...programCore } = document;
  document.program_sha256 = fingerprintValue(programCore);
  return document;
}

function wholeFilmRulesFixture(
  visualGrammar,
  projection,
  designSelection,
  effectiveBase = BASE_TEMPLATE,
) {
  const result = validateVisualGrammarProgram(visualGrammar, {
    projection,
    designSelection,
    designLibrary: DESIGN_LIBRARY,
    ...(designSelection.base_template === 'hyperframes-native'
      ? { nativeBaseCompiler: effectiveBase }
      : { baseTemplate: effectiveBase }),
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
    ...visualGrammar.bindings,
    visual_grammar_program_sha256: visualGrammar.program_sha256,
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
      program_id: visualGrammar.program_id,
      program_sha256: result.program_sha256,
      identity_sha256: result.identity_sha256,
      anti_identity_sha256: result.anti_identity_sha256,
      stable_invariants_sha256: result.stable_invariants_sha256,
      shared_directive_sha256: result.shared_directive_sha256,
      variation_axes_sha256: result.variation_axes_sha256,
      exhaustion_cooldown_sha256: result.exhaustion_cooldown_sha256,
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
  const { whole_film_rules_sha256: ignored, ...core } = document;
  document.whole_film_rules_sha256 = fingerprintValue(core);
  return document;
}

function blockScopes() {
  return [
    {
      block_id: 'B001',
      shot_ids: ['S001'],
      start_ms: 0,
      end_ms: 2000,
      start_frame: 0,
      end_frame: 50,
      namespace: 'b001',
      preceding_seam: { neighbor_block_id: null, obligation: 'none' },
      following_seam: { neighbor_block_id: 'B002', obligation: 'Hand the established focus to the next block entry.' },
    },
    {
      block_id: 'B002',
      shot_ids: ['S002'],
      start_ms: 2000,
      end_ms: 4000,
      start_frame: 50,
      end_frame: 100,
      namespace: 'b002',
      preceding_seam: { neighbor_block_id: 'B001', obligation: 'Accept the preceding result focus without a visual reset.' },
      following_seam: { neighbor_block_id: null, obligation: 'none' },
    },
  ];
}

function passChecks() {
  return {
    visual_identity: true,
    anti_identity: true,
    attention_geometry: true,
    subject_title_relationship: true,
    real_html_svg_text_readability: true,
    accent_visibility_load: true,
    material_texture_language: true,
    negative_space_responsibility: true,
  };
}

function finalizeReview(review) {
  const { decision_sha256: ignoredDecision, ...decisionCore } = review.decision;
  review.decision = {
    ...decisionCore,
    decision_sha256: fingerprintArtifactValue({
      reviewed_blocks: review.reviewed_blocks,
      adjacent_result_reviews: review.adjacent_result_reviews,
      findings: review.findings,
      block_revision_findings: review.block_revision_findings,
      decision: decisionCore,
    }),
  };
  const { review_sha256: ignoredReview, ...reviewCore } = review;
  review.review_sha256 = fingerprintArtifactValue(reviewCore);
}

function rendererReceipt({
  blockId,
  manifestHash,
  sourceRefs,
  entrypointArtifactId,
  projectionRef,
  rendererConfigRef,
  generation,
  schedule,
  measured,
}) {
  const core = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
    kind: 'trusted-style-capture-run-receipt',
    runner_contract: TRUSTED_CAPTURE_RUNNER_CONTRACT,
    input_manifest: {
      block_id: blockId,
      block_manifest_sha256: manifestHash,
      source_artifacts: structuredClone(sourceRefs),
      entrypoint_artifact_id: entrypointArtifactId,
      projection: projectionRef,
      renderer_tool_id: 'hyperframes-capture',
      renderer_tool_version: '1.2.3',
      renderer_config: rendererConfigRef,
      review_generation: generation,
    },
    capture_schedule: [schedule],
    output_manifest: ['entry', 'result', 'exit'].map((phase) => ({
      shot_id: schedule.shot_id,
      phase,
      projected_frame: schedule[phase].projected_frame,
      timestamp_ms: schedule[phase].timestamp_ms,
      sha256: measured.sha256,
      size_bytes: measured.size_bytes,
      media_type: measured.media_type,
      width: measured.width,
      height: measured.height,
      decoded_rgba_sha256: measured.decoded_rgba_sha256,
    })),
  };
  return { ...core, receipt_sha256: fingerprintArtifactValue(core) };
}

async function makeBlock({
  scope,
  imageBytes,
  authoringContext,
  projection,
  projectionRef,
  generation,
  artifacts,
}) {
  const blockId = scope.block_id;
  const shotId = scope.shot_ids[0];
  const sharedSource = Buffer.from(`<section id="${blockId}"><svg><text>${shotId}</text></svg></section>`, 'utf8');
  const sourceSpecs = blockId === 'B001'
    ? [
      [`source-${blockId}-a`, sharedSource, 'text/html'],
      [`source-${blockId}-css`, Buffer.from(`#${blockId}{display:block}`, 'utf8'), 'text/css'],
      [`source-${blockId}-b`, sharedSource, 'text/html'],
    ]
    : [[`source-${blockId}`, sharedSource, 'text/html']];
  const sourceRefs = sourceSpecs.map(([id, bytes, media]) => {
    const record = ref(id, bytes, media);
    artifacts.set(id, bytes);
    return record;
  });
  const sourceSha256s = sourceRefs.map((record) => record.sha256);
  const manifestHash = sha(`manifest:${blockId}`);
  const contextBytes = jsonBytes(authoringContext);
  const contextRef = ref(`authoring-context-${blockId}`, contextBytes);
  artifacts.set(contextRef.artifact_id, contextBytes);
  const projectedShot = projection.shots.find((shot) => shot.shot_id === shotId);
  const schedule = shotId === 'S001'
    ? {
      shot_id: shotId,
      distinct_projected_frames_required: true,
      entry: { projected_frame: 1, timestamp_ms: 40 },
      result: { projected_frame: 25, timestamp_ms: 1000 },
      exit: { projected_frame: 49, timestamp_ms: 1960 },
    }
    : {
      shot_id: shotId,
      distinct_projected_frames_required: true,
      entry: { projected_frame: 51, timestamp_ms: 2040 },
      result: { projected_frame: 75, timestamp_ms: 3000 },
      exit: { projected_frame: 99, timestamp_ms: 3960 },
    };
  assert.equal(projectedShot.shot_id, shotId);
  const measured = await measureStyleFrameBytes(imageBytes);
  const entrypointArtifactId = sourceRefs[0].artifact_id;
  const rendererConfig = {
    schema_version: 1,
    runner_contract: TRUSTED_CAPTURE_RUNNER_CONTRACT,
    viewport: { width: 3840, height: 2160 },
    device_scale_factor: 1,
    color_space: 'srgb',
    animations: 'seek-projected-frame',
  };
  const rendererConfigBytes = jsonBytes(rendererConfig);
  const rendererConfigRef = ref(`renderer-config-${blockId}`, rendererConfigBytes);
  artifacts.set(rendererConfigRef.artifact_id, rendererConfigBytes);
  const receipt = rendererReceipt({
    blockId,
    manifestHash,
    sourceRefs,
    entrypointArtifactId,
    projectionRef,
    rendererConfigRef,
    generation,
    schedule,
    measured,
  });
  const receiptBytes = jsonBytes(receipt);
  const receiptRef = ref(`renderer-receipt-${blockId}`, receiptBytes);
  artifacts.set(receiptRef.artifact_id, receiptBytes);
  const recipeHash = authoringContext.recipe_packet.recipes[0].shot_recipe_sha256;
  const states = {};
  for (const phase of ['entry', 'result', 'exit']) {
    const core = {
      artifact_id: `${shotId}-${phase}`,
      block_manifest_sha256: manifestHash,
      source_sha256s: sourceSha256s,
      shot_id: shotId,
      phase,
      projected_frame: schedule[phase].projected_frame,
      timestamp_ms: schedule[phase].timestamp_ms,
      projection_sha256: projection.receipt.projection_sha256,
      shot_recipe_sha256: recipeHash,
      renderer_tool_id: receipt.input_manifest.renderer_tool_id,
      renderer_tool_version: receipt.input_manifest.renderer_tool_version,
      renderer_receipt_sha256: receipt.receipt_sha256,
      review_generation: generation,
      sha256: measured.sha256,
      size_bytes: measured.size_bytes,
      media_type: measured.media_type,
      width: measured.width,
      height: measured.height,
      decoded_rgba_sha256: measured.decoded_rgba_sha256,
    };
    states[phase] = { ...core, capture_binding_sha256: fingerprintArtifactValue(core) };
    artifacts.set(states[phase].artifact_id, imageBytes);
  }
  const frames = ['entry', 'result', 'exit'].map((phase) => ({
    ...states[phase],
    measurement_thresholds: measured.measurement_thresholds,
    whole_frame_facts: measured.whole_frame_facts,
    declared_roi: null,
    roi_facts: null,
  }));
  const factsCore = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
    producer: 'measure-style-pixel-facts-v1',
    authority_scope: 'objective-pixel-facts-only',
    block_id: blockId,
    block_manifest_sha256: manifestHash,
    source_sha256s: sourceSha256s,
    projection_sha256: projection.receipt.projection_sha256,
    review_generation: generation,
    renderer: {
      tool_id: receipt.input_manifest.renderer_tool_id,
      tool_version: receipt.input_manifest.renderer_tool_version,
      receipt_sha256: receipt.receipt_sha256,
    },
    shot_count: 1,
    frame_count: 3,
    frames,
  };
  const facts = { ...factsCore, facts_sha256: fingerprintArtifactValue(factsCore) };
  const factsBytes = jsonBytes(facts);
  const factsRef = ref(`pixel-facts-${blockId}`, factsBytes);
  artifacts.set(factsRef.artifact_id, factsBytes);
  const pageCore = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
    gate: 'style_conformance_review',
    block_id: blockId,
    block_manifest_sha256: manifestHash,
    source_sha256s: sourceSha256s,
    projection_sha256: projection.receipt.projection_sha256,
    review_generation: generation,
    authoring_context_sha256: authoringContext.context_sha256,
    shared_directive_sha256: authoringContext.recipe_packet.shared_visual_authoring_directive.directive_sha256,
    shot_recipe_sha256s: [recipeHash],
    renderer_receipt_sha256: receipt.receipt_sha256,
    shot_count: 1,
    shots: [{ shot_id: shotId, ...states }],
    pixel_facts: factsRef,
  };
  const page = { ...pageCore, page_sha256: fingerprintArtifactValue(pageCore) };
  const pageBytes = jsonBytes(page);
  const pageRef = ref(`style-page-${blockId}`, pageBytes);
  artifacts.set(pageRef.artifact_id, pageBytes);
  return {
    block_id: blockId,
    shot_id: shotId,
    scope,
    block_manifest_sha256: manifestHash,
    producer_isolation_sha256: sha(`producer:${blockId}`),
    sourceRefs,
    context: authoringContext,
    contextRef,
    entrypointArtifactId,
    rendererConfig,
    rendererConfigRef,
    receipt,
    receiptRef,
    schedule,
    states,
    facts,
    factsBytes,
    factsRef,
    page,
    pageBytes,
    pageRef,
  };
}

async function fixture({ native = false } = {}) {
  const artifacts = new Map();
  const projection = projectionFixture();
  const effectiveBase = native
    ? DESIGN_LIBRARY.nativeBaseCompiler
    : BASE_TEMPLATE;
  const designSelection = native
    ? nativeDesignSelectionFixture(sha('brief'))
    : designSelectionFixture(sha('brief'));
  const visualGrammar = visualGrammarFixture(
    projection,
    designSelection,
    effectiveBase,
    native ? NATIVE_AXIS_FIELD : TEMPLATE_AXIS_FIELD,
  );
  const wholeFilmRules = wholeFilmRulesFixture(
    visualGrammar,
    projection,
    designSelection,
    effectiveBase,
  );
  const scopes = blockScopes();
  const contexts = scopes.map((scope) => extractWholeFilmBlockContext(wholeFilmRules, scope, {
    visualGrammarProgram: visualGrammar,
    projection,
    designSelection,
    designLibrary: DESIGN_LIBRARY,
    ...(native
      ? { nativeBaseCompiler: effectiveBase }
      : { baseTemplate: effectiveBase }),
  }));
  const globalArtifacts = [
    ['visual-grammar-program', visualGrammar],
    ['whole-film-rules', wholeFilmRules],
    ['frame-projection', projection],
    ['design-selection', designSelection],
    ['base-template', effectiveBase],
    ['design-library', DESIGN_LIBRARY],
  ].map(([id, document]) => {
    const bytes = jsonBytes(document);
    const record = ref(id, bytes);
    artifacts.set(id, bytes);
    return record;
  });
  const generation = 4;
  const blocks = [
    await makeBlock({
      scope: scopes[0],
      imageBytes: PNG,
      authoringContext: contexts[0],
      projection,
      projectionRef: globalArtifacts[2],
      generation,
      artifacts,
    }),
    await makeBlock({
      scope: scopes[1],
      imageBytes: JPEG,
      authoringContext: contexts[1],
      projection,
      projectionRef: globalArtifacts[2],
      generation,
      artifacts,
    }),
  ];
  const global = {
    visual_grammar_sha256: visualGrammar.program_sha256,
    whole_film_rules_sha256: wholeFilmRules.whole_film_rules_sha256,
    design_slice_sha256: visualGrammar.bindings.design_slice_sha256,
    chunk_plan_sha256: sha('chunk-plan'),
    projection_sha256: projection.receipt.projection_sha256,
    review_generation: generation,
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
    block_count: blocks.length,
    blocks: blocks.map((block) => ({
      block_id: block.block_id,
      block_manifest_sha256: block.block_manifest_sha256,
      producer_isolation_sha256: block.producer_isolation_sha256,
      source_artifacts: block.sourceRefs,
      authoring_context: block.contextRef,
      renderer_config: block.rendererConfigRef,
      renderer_receipt: block.receiptRef,
      evidence_page: block.pageRef,
    })),
  };
  const packetIndex = { ...indexCore, packet_index_sha256: fingerprintArtifactValue(indexCore) };
  const packetIndexBytes = jsonBytes(packetIndex);
  const reviewerIsolation = sha('main-agent-style-review');
  const expected = {
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
    ...global,
    reviewer_isolation_sha256: reviewerIsolation,
    blocks: blocks.map((block) => ({
      block_id: block.block_id,
      block_manifest_sha256: block.block_manifest_sha256,
      producer_isolation_sha256: block.producer_isolation_sha256,
      shot_ids: [block.shot_id],
      source_sha256s: block.sourceRefs.map((record) => record.sha256),
      block_scope: {
        namespace: block.scope.namespace,
        start_ms: block.scope.start_ms,
        end_ms: block.scope.end_ms,
        start_frame: block.scope.start_frame,
        end_frame: block.scope.end_frame,
        preceding_seam: block.scope.preceding_seam,
        following_seam: block.scope.following_seam,
      },
      authoring_context_sha256: block.context.context_sha256,
      shared_directive_sha256: block.context.recipe_packet.shared_visual_authoring_directive.directive_sha256,
      shot_recipe_sha256s: [block.context.recipe_packet.recipes[0].shot_recipe_sha256],
      renderer: {
        tool_id: block.receipt.input_manifest.renderer_tool_id,
        tool_version: block.receipt.input_manifest.renderer_tool_version,
        entrypoint_artifact_id: block.entrypointArtifactId,
        config_sha256: block.rendererConfigRef.sha256,
        receipt_sha256: block.receipt.receipt_sha256,
      },
      capture_schedule: [block.schedule],
    })),
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
    reviewer_isolation_sha256: reviewerIsolation,
    reviewed_blocks: blocks.map((block) => ({
      block_id: block.block_id,
      block_manifest_sha256: block.block_manifest_sha256,
      inspected_source_sha256s: block.sourceRefs.map((record) => record.sha256),
      authoring_context_sha256: block.context.context_sha256,
      shared_directive_sha256: block.context.recipe_packet.shared_visual_authoring_directive.directive_sha256,
      shot_recipe_sha256s: [block.context.recipe_packet.recipes[0].shot_recipe_sha256],
      renderer_receipt_sha256: block.receipt.receipt_sha256,
      inspected_evidence_page_sha256: hashBytes(block.pageBytes),
      inspected_still_sha256s: ['entry', 'result', 'exit'].map((phase) => block.states[phase].sha256),
      inspected_capture_binding_sha256s: ['entry', 'result', 'exit'].map((phase) => block.states[phase].capture_binding_sha256),
      inspected_pixel_facts_sha256: hashBytes(block.factsBytes),
      shot_reviews: [{ shot_id: block.shot_id, checks: passChecks(), finding_ids: [] }],
    })),
    adjacent_result_reviews: [{
      left_shot_id: 'S001',
      right_shot_id: 'S002',
      owner_block_id: 'B002',
      left_result_sha256: blocks[0].states.result.sha256,
      right_result_sha256: blocks[1].states.result.sha256,
      only_text_changed: false,
      finding_ids: [],
    }],
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
      decision_sha256: sha('temporary'),
    },
    review_sha256: sha('temporary'),
  };
  finalizeReview(review);
  const runnerBytesByBlock = new Map([
    ['B001', PNG],
    ['B002', JPEG],
  ]);
  const runnerRequests = [];
  const trustedCaptureRunner = async (request) => {
    runnerRequests.push(request);
    const outputBytes = runnerBytesByBlock.get(request.block_id);
    return {
      runner_contract: TRUSTED_CAPTURE_RUNNER_CONTRACT,
      outputs: request.capture_schedule.flatMap((shot) => ['entry', 'result', 'exit'].map((phase) => ({
        shot_id: shot.shot_id,
        phase,
        projected_frame: shot[phase].projected_frame,
        timestamp_ms: shot[phase].timestamp_ms,
        bytes: Buffer.from(outputBytes),
      }))),
    };
  };
  return {
    artifacts,
    blocks,
    packetIndex,
    packetIndexBytes,
    expected,
    review,
    runnerBytesByBlock,
    runnerRequests,
    trustedCaptureRunner,
  };
}

async function run(value) {
  return validateStyleConformanceReview({
    review: value.review,
    packetIndexBytes: value.packetIndexBytes,
    artifactBytes: value.artifacts,
    expected: value.expected,
    trustedCaptureRunner: value.trustedCaptureRunner,
  });
}

function resignPacketAndReview(value) {
  const { packet_index_sha256: ignored, ...indexCore } = value.packetIndex;
  value.packetIndex.packet_index_sha256 = fingerprintArtifactValue(indexCore);
  value.packetIndexBytes = jsonBytes(value.packetIndex);
  value.review.subject_packet_index_sha256 = hashBytes(value.packetIndexBytes);
  finalizeReview(value.review);
}

function rebindFactsAndPage(value, blockIndex) {
  const block = value.blocks[blockIndex];
  const { facts_sha256: ignoredFacts, ...factsCore } = block.facts;
  block.facts.facts_sha256 = fingerprintArtifactValue(factsCore);
  block.factsBytes = jsonBytes(block.facts);
  block.factsRef = ref(block.factsRef.artifact_id, block.factsBytes);
  value.artifacts.set(block.factsRef.artifact_id, block.factsBytes);
  block.page.pixel_facts = block.factsRef;
  const { page_sha256: ignoredPage, ...pageCore } = block.page;
  block.page.page_sha256 = fingerprintArtifactValue(pageCore);
  block.pageBytes = jsonBytes(block.page);
  block.pageRef = ref(block.pageRef.artifact_id, block.pageBytes);
  value.artifacts.set(block.pageRef.artifact_id, block.pageBytes);
  value.packetIndex.blocks[blockIndex].evidence_page = block.pageRef;
  value.review.reviewed_blocks[blockIndex].inspected_evidence_page_sha256 = hashBytes(block.pageBytes);
  value.review.reviewed_blocks[blockIndex].inspected_pixel_facts_sha256 = hashBytes(block.factsBytes);
  resignPacketAndReview(value);
}

async function forgeBlockEvidenceBytes(value, blockIndex, imageBytes, { forgeReceipt = true } = {}) {
  const block = value.blocks[blockIndex];
  const measured = await measureStyleFrameBytes(imageBytes);
  if (forgeReceipt) {
    block.receipt = rendererReceipt({
      blockId: block.block_id,
      manifestHash: block.block_manifest_sha256,
      sourceRefs: block.sourceRefs,
      entrypointArtifactId: block.entrypointArtifactId,
      projectionRef: value.packetIndex.frame_projection,
      rendererConfigRef: block.rendererConfigRef,
      generation: value.expected.review_generation,
      schedule: block.schedule,
      measured,
    });
    const receiptBytes = jsonBytes(block.receipt);
    block.receiptRef = ref(block.receiptRef.artifact_id, receiptBytes);
    value.artifacts.set(block.receiptRef.artifact_id, receiptBytes);
    value.packetIndex.blocks[blockIndex].renderer_receipt = block.receiptRef;
    value.expected.blocks[blockIndex].renderer.receipt_sha256 = block.receipt.receipt_sha256;
    value.review.reviewed_blocks[blockIndex].renderer_receipt_sha256 = block.receipt.receipt_sha256;
    block.page.renderer_receipt_sha256 = block.receipt.receipt_sha256;
    block.facts.renderer.receipt_sha256 = block.receipt.receipt_sha256;
  }
  for (const phase of ['entry', 'result', 'exit']) {
    const state = block.states[phase];
    Object.assign(state, {
      renderer_receipt_sha256: block.receipt.receipt_sha256,
      sha256: measured.sha256,
      size_bytes: measured.size_bytes,
      media_type: measured.media_type,
      width: measured.width,
      height: measured.height,
      decoded_rgba_sha256: measured.decoded_rgba_sha256,
    });
    const { capture_binding_sha256: ignored, ...captureCore } = state;
    state.capture_binding_sha256 = fingerprintArtifactValue(captureCore);
    value.artifacts.set(state.artifact_id, imageBytes);
    const factsFrame = block.facts.frames.find((frame) => frame.phase === phase);
    Object.assign(factsFrame, state, {
      measurement_thresholds: measured.measurement_thresholds,
      whole_frame_facts: measured.whole_frame_facts,
      declared_roi: null,
      roi_facts: null,
    });
  }
  value.review.reviewed_blocks[blockIndex].inspected_still_sha256s = ['entry', 'result', 'exit']
    .map((phase) => block.states[phase].sha256);
  value.review.reviewed_blocks[blockIndex].inspected_capture_binding_sha256s = ['entry', 'result', 'exit']
    .map((phase) => block.states[phase].capture_binding_sha256);
  if (blockIndex === 0) value.review.adjacent_result_reviews[0].left_result_sha256 = measured.sha256;
  else value.review.adjacent_result_reviews[0].right_result_sha256 = measured.sha256;
  rebindFactsAndPage(value, blockIndex);
}

test('validates actual VGP/WFR criteria, authoritative captures, and consumer-recomputed pixels', async () => {
  const value = await fixture();
  assert.notEqual(value.blocks[0].sourceRefs[0].artifact_id, value.blocks[0].sourceRefs[2].artifact_id);
  assert.equal(value.blocks[0].sourceRefs[0].sha256, value.blocks[0].sourceRefs[2].sha256);
  assert.equal(value.blocks[0].states.entry.sha256, value.blocks[0].states.result.sha256);
  assert.notEqual(value.blocks[0].states.entry.artifact_id, value.blocks[0].states.result.artifact_id);
  const result = await run(value);
  assert.equal(result.status, 'approved');
  assert.equal(result.review_generation, 4);
  assert.equal(value.runnerRequests.length, 2);
  const request = value.runnerRequests[0];
  assert.equal(request.runner_contract, TRUSTED_CAPTURE_RUNNER_CONTRACT);
  assert.equal(request.entrypoint_artifact_id, value.blocks[0].entrypointArtifactId);
  assert.deepEqual(request.capture_schedule, [value.blocks[0].schedule]);
  assert.deepEqual(request.renderer.config, value.blocks[0].rendererConfig);
  assert.equal(request.projection.manifest.sha256, value.packetIndex.frame_projection.sha256);
  assert.deepEqual(
    request.source_bundle.map(({ bytes, ...manifest }) => ({
      ...manifest,
      actual_sha256: hashBytes(bytes),
    })),
    value.blocks[0].sourceRefs.map((manifest) => ({
      ...manifest,
      actual_sha256: manifest.sha256,
    })),
  );
});

test('revalidates the actual native compiler branch and rejects substituted compiler bytes', async () => {
  const value = await fixture({ native: true });
  const result = await run(value);
  assert.equal(result.status, 'approved');
  assert.equal(
    value.packetIndex.base_template.sha256,
    hashBytes(jsonBytes(DESIGN_LIBRARY.nativeBaseCompiler)),
  );

  const substituted = await fixture({ native: true });
  const compiler = structuredClone(DESIGN_LIBRARY.nativeBaseCompiler);
  compiler.summary = `${compiler.summary} substituted`;
  const compilerBytes = jsonBytes(compiler);
  substituted.artifacts.set(
    substituted.packetIndex.base_template.artifact_id,
    compilerBytes,
  );
  substituted.packetIndex.base_template = ref(
    substituted.packetIndex.base_template.artifact_id,
    compilerBytes,
  );
  resignPacketAndReview(substituted);
  await assert.rejects(
    () => run(substituted),
    (error) => error.code === 'style_review_authoring_rules_invalid',
  );
});

test('requires a trusted capture-runner and rejects missing scheduled runner output', async () => {
  const missingRunner = await fixture();
  missingRunner.trustedCaptureRunner = undefined;
  await assert.rejects(
    () => run(missingRunner),
    (error) => error.code === 'style_review_capture_runner_required',
  );

  const missingOutput = await fixture();
  missingOutput.trustedCaptureRunner = async (request) => ({
    runner_contract: TRUSTED_CAPTURE_RUNNER_CONTRACT,
    outputs: [{
      shot_id: request.capture_schedule[0].shot_id,
      phase: 'entry',
      ...request.capture_schedule[0].entry,
      bytes: PNG,
    }],
  });
  await assert.rejects(
    () => run(missingOutput),
    (error) => error.code === 'style_review_capture_output_missing',
  );
});

test('rejects fully re-signed arbitrary still evidence when fresh trusted runner bytes differ', async () => {
  const value = await fixture();
  await forgeBlockEvidenceBytes(value, 0, JPEG);
  await assert.rejects(
    () => run(value),
    (error) => error.code === 'style_review_renderer_receipt_stale',
  );
});

test('rejects submitted still bytes that differ from a matching fresh-run receipt', async () => {
  const value = await fixture();
  await forgeBlockEvidenceBytes(value, 0, JPEG, { forgeReceipt: false });
  await assert.rejects(
    () => run(value),
    (error) => error.code === 'style_review_capture_output_mismatch',
  );
});

test('rejects forged pixel metrics even after facts, page, packet, decision, and review hashes are renewed', async () => {
  const value = await fixture();
  value.blocks[0].facts.frames[0].whole_frame_facts.average_luma_milli += 1000;
  rebindFactsAndPage(value, 0);
  await assert.rejects(
    () => run(value),
    (error) => error instanceof StyleConformanceReviewError && error.code === 'style_pixel_facts_recompute_mismatch',
  );
});

test('rejects arbitrary phase relabeling even when the capture and all outer hashes are renewed', async () => {
  const value = await fixture();
  const capture = value.blocks[0].page.shots[0].entry;
  capture.phase = 'result';
  const { capture_binding_sha256: ignored, ...captureCore } = capture;
  capture.capture_binding_sha256 = fingerprintArtifactValue(captureCore);
  value.blocks[0].facts.frames[0] = {
    ...capture,
    measurement_thresholds: value.blocks[0].facts.frames[0].measurement_thresholds,
    whole_frame_facts: value.blocks[0].facts.frames[0].whole_frame_facts,
    declared_roi: null,
    roi_facts: null,
  };
  rebindFactsAndPage(value, 0);
  await assert.rejects(
    () => run(value),
    (error) => error instanceof StyleConformanceReviewError && error.code === 'style_capture_binding_invalid',
  );
});

test('rejects a stale source-bound renderer receipt after adversarial re-signing', async () => {
  const value = await fixture();
  const block = value.blocks[0];
  block.receipt.input_manifest.source_artifacts[0].sha256 = sha('stale-source');
  const { receipt_sha256: ignored, ...receiptCore } = block.receipt;
  block.receipt.receipt_sha256 = fingerprintArtifactValue(receiptCore);
  const bytes = jsonBytes(block.receipt);
  block.receiptRef = ref(block.receiptRef.artifact_id, bytes);
  value.artifacts.set(block.receiptRef.artifact_id, bytes);
  value.packetIndex.blocks[0].renderer_receipt = block.receiptRef;
  resignPacketAndReview(value);
  await assert.rejects(
    () => run(value),
    (error) => error instanceof StyleConformanceReviewError && error.code === 'style_review_renderer_receipt_stale',
  );
});

test('rejects projected-frame drift even when capture, facts, page, packet, and review are re-signed', async () => {
  const value = await fixture();
  const capture = value.blocks[0].page.shots[0].entry;
  capture.projected_frame += 1;
  const { capture_binding_sha256: ignored, ...captureCore } = capture;
  capture.capture_binding_sha256 = fingerprintArtifactValue(captureCore);
  value.blocks[0].facts.frames[0] = {
    ...capture,
    measurement_thresholds: value.blocks[0].facts.frames[0].measurement_thresholds,
    whole_frame_facts: value.blocks[0].facts.frames[0].whole_frame_facts,
    declared_roi: null,
    roi_facts: null,
  };
  rebindFactsAndPage(value, 0);
  await assert.rejects(
    () => run(value),
    (error) => error instanceof StyleConformanceReviewError && error.code === 'style_capture_binding_invalid',
  );
});

test('rejects a re-signed compact directive that no longer reconstructs from actual VGP/WFR', async () => {
  const value = await fixture();
  const context = structuredClone(value.blocks[0].context);
  context.recipe_packet.shared_visual_authoring_directive.identity.statement += ' 已被篡改';
  const directive = context.recipe_packet.shared_visual_authoring_directive;
  const { directive_sha256: ignoredDirective, ...directiveCore } = directive;
  directive.directive_sha256 = fingerprintValue(directiveCore);
  const { packet_sha256: ignoredPacket, ...packetCore } = context.recipe_packet;
  context.recipe_packet.packet_sha256 = fingerprintValue(packetCore);
  const { context_sha256: ignoredContext, ...contextCore } = context;
  context.context_sha256 = fingerprintValue(contextCore);
  const bytes = jsonBytes(context);
  value.artifacts.set(value.blocks[0].contextRef.artifact_id, bytes);
  value.packetIndex.blocks[0].authoring_context = ref(value.blocks[0].contextRef.artifact_id, bytes);
  resignPacketAndReview(value);
  await assert.rejects(
    () => run(value),
    (error) => error instanceof StyleConformanceReviewError && error.code === 'style_review_authoring_context_invalid',
  );
});

test('preserves repeated source hashes by position and rejects a missing or reordered occurrence', async () => {
  const missing = await fixture();
  missing.review.reviewed_blocks[0].inspected_source_sha256s.pop();
  finalizeReview(missing.review);
  await assert.rejects(() => run(missing), (error) => error.code === 'style_review_pages_unbound');

  const reordered = await fixture();
  const inspected = reordered.review.reviewed_blocks[0].inspected_source_sha256s;
  [inspected[0], inspected[1]] = [inspected[1], inspected[0]];
  finalizeReview(reordered.review);
  await assert.rejects(() => run(reordered), (error) => error.code === 'style_review_pages_unbound');
});

test('rejects duplicate source artifact IDs even when their bytes and hashes match', async () => {
  const value = await fixture();
  value.packetIndex.blocks[0].source_artifacts[2].artifact_id = value.packetIndex.blocks[0].source_artifacts[0].artifact_id;
  resignPacketAndReview(value);
  await assert.rejects(() => run(value), (error) => error.code === 'style_review_artifact_id_duplicate');
});

test('rejects missing pages and producer self-review', async () => {
  const missing = await fixture();
  missing.artifacts.delete('style-page-B002');
  await assert.rejects(() => run(missing), (error) => error.code === 'style_review_page_missing');

  const self = await fixture();
  self.expected.reviewer_isolation_sha256 = self.blocks[0].producer_isolation_sha256;
  self.review.reviewer_isolation_sha256 = self.blocks[0].producer_isolation_sha256;
  finalizeReview(self.review);
  await assert.rejects(() => run(self), (error) => error.code === 'style_review_self_attested');
});

test('still-derived temporal authority remains forbidden', async () => {
  for (const field of [
    'animation_approved_from_stills',
    'rhythm_approved_from_stills',
    'transitions_approved_from_stills',
    'five_phase_lifecycle_approved_from_stills',
    'seek_behavior_approved_from_stills',
  ]) {
    const value = await fixture();
    value.review.decision[field] = true;
    finalizeReview(value.review);
    await assert.rejects(() => run(value), (error) => error.code === 'style_review_decision_invalid', field);
  }
});

test('artifact-map loader rejects an ancestor-directory symlink escape', async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'style-review-root-')));
  const outside = await realpath(await mkdtemp(path.join(os.tmpdir(), 'style-review-outside-')));
  await mkdir(path.join(root, 'safe'));
  await writeFile(path.join(outside, 'artifact.json'), '{}');
  await symlink(outside, path.join(root, 'safe', 'linked'));
  await assert.rejects(
    () => loadStyleArtifactMap({ evidence: 'safe/linked/artifact.json' }, { root }),
    (error) => error instanceof StyleConformanceReviewError && error.code === 'style_review_artifact_symlink_ancestor',
  );
});

test('artifact-map loader rejects a root reached through an ancestor symlink', async () => {
  const realParent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'style-review-real-root-')));
  const aliasParent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'style-review-alias-root-')));
  const realRoot = path.join(realParent, 'artifacts');
  await mkdir(realRoot);
  await writeFile(path.join(realRoot, 'artifact.json'), '{}');
  await symlink(realRoot, path.join(aliasParent, 'linked-artifacts'));
  await assert.rejects(
    () => loadStyleArtifactMap(
      { evidence: 'artifact.json' },
      { root: path.join(aliasParent, 'linked-artifacts') },
    ),
    (error) => error instanceof StyleConformanceReviewError
      && error.code === 'style_review_artifact_root_symlink_ancestor',
  );
});

test('CLI help states real-root containment and the static-only authority boundary', async () => {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'validate-style-conformance-review.mjs');
  const { stdout } = await execFile(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.match(stdout, /artifact-root/u);
  assert.match(stdout, /capture-runner/u);
  assert.match(stdout, /operator-pinned outside producer control/u);
  assert.match(stdout, /static style only/u);
  assert.match(stdout, /cannot approve animation/u);
});
