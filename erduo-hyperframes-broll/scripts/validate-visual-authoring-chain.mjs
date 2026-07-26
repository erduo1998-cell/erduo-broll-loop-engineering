import { fingerprintArtifactValue } from './artifact-manifest.mjs';
import { validateFrameProjection } from './compile-frame-projection.mjs';
import {
  createAuthoringIntegrationManifest,
  validateAuthoringChunkManifest,
  validateAuthoringPlan,
  validateAuthoringIntegrationManifest,
} from './validate-authoring-topology.mjs';
import {
  validateDirectorDesignSelectionReplayReceipt,
} from './validate-director-v2-chain.mjs';
import {
  extractWholeFilmBlockContext,
  validateWholeFilmBlockContext,
  validateWholeFilmRules,
} from './validate-whole-film-rules.mjs';
import { validateStyleConformanceReview } from './validate-style-conformance-review.mjs';

export const AUTHORING_TOPOLOGY_ID = 'bounded-authoring-cluster-v1';
export const VISUAL_AUTHORING_CHAIN_CONTRACT =
  'scripts/validate-visual-authoring-chain.mjs#schema-v1';

const SHA256 = /^[0-9a-f]{64}$/u;
const BLOCK_ID = /^B[0-9]{3}$/u;
const SHOT_ID = /^S[0-9]{3}$/u;

export class VisualAuthoringChainError extends Error {
  constructor(code, message, blockId) {
    super(message);
    this.name = 'VisualAuthoringChainError';
    this.code = code;
    if (blockId) this.block_id = blockId;
  }
}

const fail = (code, message, blockId) => {
  throw new VisualAuthoringChainError(code, message, blockId);
};
const exact = (value, fields, code, message, blockId) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) {
    fail(code, message, blockId);
  }
};
const isSha = (value) => typeof value === 'string' && SHA256.test(value);
const same = (left, right) =>
  fingerprintArtifactValue(left) === fingerprintArtifactValue(right);
const designOptions = (options) => ({
  designSelection: options.designSelection ?? options.design_selection,
  baseTemplate: options.baseTemplate ?? options.base_template,
  nativeBaseCompiler:
    options.nativeBaseCompiler ?? options.native_base_compiler,
  designLibrary: options.designLibrary ?? options.design_library,
});

function replayReceipt(options, rules) {
  const value =
    options.designSelectionReplayReceipt
      ?? options.design_selection_replay_receipt;
  const selection =
    options.designSelection ?? options.design_selection;
  const receipt = validateDirectorDesignSelectionReplayReceipt(value, {
    design_selection_sha256: rules.bindings.design_selection_sha256,
    design_library_snapshot_sha256:
      rules.bindings.design_library_snapshot_sha256,
    base_template_id: rules.bindings.base_template_id,
    base_template_sha256: rules.bindings.base_template_sha256,
    native_compiler_source_bundle_sha256:
      selection?.native_compiler_source_bundle_sha256,
    visual_grammar_guard_code:
      selection?.visual_grammar_compilation?.guard_code,
  });
  return receipt;
}

function externalBindings(options, rules) {
  const value = {
    director_manifest_sha256: options.director_manifest_sha256,
    assets_manifest_sha256: options.assets_manifest_sha256,
    asset_fact_review_sha256: options.asset_fact_review_sha256,
    asset_visual_bindings_sha256: options.asset_visual_bindings_sha256,
    flat_shot_kit_set_sha256: options.flat_shot_kit_set_sha256,
  };
  if (Object.values(value).some((item) => !isSha(item))) {
    fail('visual_chunk_binding_invalid', 'Chunk planning requires exact director, assets, review, recipe-use, and kit hashes.');
  }
  if (options.font_package_sha256 !== undefined
    && options.font_package_sha256 !== rules.bindings.font_package_sha256) {
    fail('visual_chunk_binding_mismatch', 'Chunk planning cannot substitute a block-local font package.');
  }
  const authoringPlan =
    options.authoringPlan ?? options.authoring_plan;
  if (authoringPlan.kit_set_sha256 !== value.flat_shot_kit_set_sha256) {
    fail(
      'visual_chunk_binding_mismatch',
      'The sole authoring plan and visual bridge must bind the same flat-kit set.',
    );
  }
  return value;
}

function internalBindings(rules, rulesReceipt, authoringPlan) {
  return {
    confirmed_brief_sha256: rules.bindings.confirmed_brief_sha256,
    parsed_srt_sha256: rules.bindings.parsed_srt_sha256,
    shot_plan_sha256: rules.bindings.shot_plan_sha256,
    projection_sha256: rules.bindings.projection_sha256,
    design_slice_sha256: rules.bindings.design_slice_sha256,
    display_selection_sha256: rules.bindings.display_selection_sha256,
    font_package_sha256: rules.bindings.font_package_sha256,
    design_selection_sha256: rules.bindings.design_selection_sha256,
    base_template_id: rules.bindings.base_template_id,
    base_template_sha256: rules.bindings.base_template_sha256,
    design_library_snapshot_sha256:
      rules.bindings.design_library_snapshot_sha256,
    visual_grammar_program_sha256: rulesReceipt.visual_grammar_program_sha256,
    whole_film_rules_sha256: rulesReceipt.whole_film_rules_sha256,
    delivery_profile_sha256: rules.bindings.delivery_profile_sha256,
    authoring_plan_sha256: authoringPlan.authoring_plan_sha256,
  };
}

function allRecipes(program) {
  return program.pages.flatMap((page) => page.recipes);
}

export function validateSoleAuthoringPlanIdentity({
  authoringPlan,
  expectedAuthoringPlanSha256,
  projection,
  visualGrammarProgram,
  canonicalChunkPolicy,
}) {
  validateAuthoringPlan(authoringPlan);
  if (!isSha(expectedAuthoringPlanSha256)
    || authoringPlan.authoring_plan_sha256
      !== expectedAuthoringPlanSha256) {
    fail(
      'visual_chunk_plan_manifest_mismatch',
      'The bridge requires the exact authoring-plan hash reopened from the current manifest.',
    );
  }
  if (!same(authoringPlan.chunk_policy, canonicalChunkPolicy)) {
    fail(
      'visual_chunk_policy_invalid',
      'The sole authoring plan policy must exactly equal the frozen canonical visual-authoring policy.',
    );
  }
  const projectedShots = projection.shots.map((shot) => ({
    shot_id: shot.shot_id,
    start_ms: shot.srt_window_ms.start_ms,
    end_ms: shot.srt_window_ms.end_ms,
    duration_ms:
      shot.srt_window_ms.end_ms - shot.srt_window_ms.start_ms,
  }));
  const recipeShots = allRecipes(visualGrammarProgram).map((recipe) => ({
    shot_id: recipe.shot_id,
    start_ms: recipe.srt_window_ms.start_ms,
    end_ms: recipe.srt_window_ms.end_ms,
    duration_ms:
      recipe.srt_window_ms.end_ms - recipe.srt_window_ms.start_ms,
  }));
  const concatenatedChunkShots =
    authoringPlan.chunks.flatMap((chunk) => chunk.shots);
  if (!same(authoringPlan.shots, projectedShots)
    || !same(authoringPlan.shots, recipeShots)
    || !same(authoringPlan.shots, concatenatedChunkShots)) {
    fail(
      'visual_chunk_plan_complete_set_mismatch',
      'The authoring plan, shared projection, visual grammar, and concatenated chunks must cover the exact same complete ordered shot set once.',
    );
  }
  return {
    authoring_plan_sha256: authoringPlan.authoring_plan_sha256,
    shot_count: authoringPlan.shot_count,
    chunk_count: authoringPlan.chunks.length,
  };
}

function normalizeKitInputs(value, rules, program) {
  const recipes = allRecipes(program);
  if (!Array.isArray(value) || value.length !== recipes.length) {
    fail('asset_visual_binding_invalid', 'Asset visual bindings require one actual flat kit per recipe.');
  }
  return value.map((item, index) => {
    exact(
      item,
      ['flat_shot_kit_sha256', 'kit'],
      'asset_visual_binding_invalid',
      'Asset visual kit input has an invalid shape.',
    );
    const recipe = recipes[index];
    const kit = item.kit;
    const composition = kit?.composition_fit;
    if (!isSha(item.flat_shot_kit_sha256)
      || fingerprintArtifactValue(kit) !== item.flat_shot_kit_sha256
      || kit?.shot_id !== recipe.shot_id
      || kit?.design_slice_sha256 !== rules.bindings.design_slice_sha256
      || !composition
      || !kit.primary_asset
      || !['user-media', 'image-generation', 'pexels'].includes(kit.primary_asset.route)
      || !['image', 'video'].includes(kit.primary_asset.media_kind)
      || !kit.consumer_plan
      || !kit.target_preview) {
      fail(
        'ordinary_primary_required',
        'Every recipe requires one ordinary image/video primary; HTML/SVG may remain auxiliary only.',
        recipe.shot_id,
      );
    }
    const cropApplication = {
      recipe_attention_geometry: recipe.attention_geometry,
      subject_bbox: composition.subject_bbox,
      focal_point: composition.focal_point,
      output_crop_bbox: composition.output_crop_bbox,
      text_safe_regions: composition.text_safe_regions,
      protected_regions: composition.protected_regions,
      result_roi: composition.result_roi,
    };
    const titleApplication = {
      recipe_typography: recipe.typography,
      recipe_anchor_treatment: recipe.anchor_treatment,
      title_relation: composition.title_relation,
    };
    const materialApplication = {
      recipe_material_texture: recipe.material_texture,
      recipe_color: recipe.color,
      selected_route: kit.primary_asset.route,
      media_kind: kit.primary_asset.media_kind,
      treatment_motion: composition.motion,
      palette: composition.palette,
      consumer_element: kit.consumer_plan.element,
      preview_sha256: kit.target_preview.frame_sha256,
    };
    return {
      shot_id: recipe.shot_id,
      shot_recipe_sha256: recipe.shot_recipe_sha256,
      flat_shot_kit_sha256: item.flat_shot_kit_sha256,
      crop_application_sha256: fingerprintArtifactValue(cropApplication),
      title_application_sha256: fingerprintArtifactValue(titleApplication),
      material_application_sha256: fingerprintArtifactValue(materialApplication),
    };
  });
}

function normalizeAuthoringMaterials(options, rules, program) {
  const designSlice =
    options.designSlice ?? options.design_slice;
  const recipes = allRecipes(program);
  if (!designSlice || typeof designSlice !== 'object'
    || Array.isArray(designSlice)
    || !Array.isArray(designSlice.shots)
    || designSlice.shots.length !== recipes.length
    || fingerprintArtifactValue(designSlice)
      !== rules.bindings.design_slice_sha256) {
    fail(
      'visual_block_material_set_invalid',
      'Block authoring requires the exact validated design-slice document bound by the whole-film rules.',
    );
  }
  const kitBindings =
    normalizeKitInputs(options.kits, rules, program);
  const assetBindings =
    options.assetVisualGrammarBindings
      ?? options.asset_visual_grammar_bindings;
  const assetReceipt = validateAssetVisualGrammarBindings(
    assetBindings,
    options,
  );
  if (assetReceipt.asset_visual_bindings_sha256
      !== options.asset_visual_bindings_sha256
    || assetBindings.shots.length !== recipes.length) {
    fail(
      'visual_block_material_set_invalid',
      'Block authoring requires the exact validated asset visual-binding set.',
    );
  }
  const kits = options.kits;
  return recipes.map((recipe, index) => {
    const designShot = designSlice.shots[index];
    const kitInput = kits[index];
    const kitBinding = kitBindings[index];
    const assetBinding = assetBindings.shots[index];
    if (designShot?.shot_id !== recipe.shot_id
      || kitInput?.kit?.shot_id !== recipe.shot_id
      || kitBinding.shot_id !== recipe.shot_id
      || assetBinding?.shot_id !== recipe.shot_id
      || assetBinding.shot_recipe_sha256
        !== recipe.shot_recipe_sha256
      || assetBinding.flat_shot_kit_sha256
        !== kitInput.flat_shot_kit_sha256) {
      fail(
        'visual_block_material_set_invalid',
        'Design shots, recipes, flat kits, and asset bindings must cover the exact same ordered shot set once.',
        recipe.shot_id,
      );
    }
    return {
      shot_id: recipe.shot_id,
      design_shot_sha256:
        fingerprintArtifactValue(designShot),
      design_shot: structuredClone(designShot),
      flat_shot_kit_sha256:
        kitInput.flat_shot_kit_sha256,
      flat_shot_kit: structuredClone(kitInput.kit),
      asset_visual_binding_sha256:
        fingerprintArtifactValue(assetBinding),
      asset_visual_binding:
        structuredClone(assetBinding),
    };
  });
}

function createScopedMaterials(materials, bindings) {
  const core = {
    design_slice_sha256: bindings.design_slice_sha256,
    flat_shot_kit_set_sha256:
      bindings.flat_shot_kit_set_sha256,
    asset_visual_bindings_sha256:
      bindings.asset_visual_bindings_sha256,
    input_policy: {
      self_contained: true,
      exact_allocated_shot_set_only: true,
      undeclared_side_inputs_forbidden: true,
    },
    shot_count: materials.length,
    shots: structuredClone(materials),
  };
  return {
    ...core,
    scoped_materials_sha256:
      fingerprintArtifactValue(core),
  };
}

export function createAssetVisualGrammarBindings(options = {}) {
  const rules = options.wholeFilmRules ?? options.whole_film_rules;
  const visualGrammarProgram =
    options.visualGrammarProgram ?? options.visual_grammar_program;
  const projection = validateFrameProjection(options.projection);
  const rulesReceipt = validateWholeFilmRules(rules, {
    visualGrammarProgram,
    projection,
    ...designOptions(options),
  });
  const selectionReplayReceipt = replayReceipt(options, rules);
  if (!isSha(options.director_manifest_sha256)
    || !isSha(options.flat_shot_kit_set_sha256)) {
    fail('asset_visual_binding_invalid', 'Asset visual bindings require exact director and kit-set hashes.');
  }
  const shots = normalizeKitInputs(options.kits, rules, visualGrammarProgram);
  const core = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    artifact_type: 'asset-visual-grammar-bindings',
    contract: VISUAL_AUTHORING_CHAIN_CONTRACT,
    director_manifest_sha256: options.director_manifest_sha256,
    design_selection_replay_sha256:
      selectionReplayReceipt.replay_receipt_sha256,
    visual_grammar_program_sha256: rulesReceipt.visual_grammar_program_sha256,
    whole_film_rules_sha256: rulesReceipt.whole_film_rules_sha256,
    design_slice_sha256: rules.bindings.design_slice_sha256,
    flat_shot_kit_set_sha256: options.flat_shot_kit_set_sha256,
    shot_count: shots.length,
    shots,
  };
  return {
    ...core,
    asset_visual_bindings_sha256: fingerprintArtifactValue(core),
  };
}

export function validateAssetVisualGrammarBindings(document, options = {}) {
  exact(document, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'artifact_type',
    'contract',
    'director_manifest_sha256',
    'design_selection_replay_sha256',
    'visual_grammar_program_sha256',
    'whole_film_rules_sha256',
    'design_slice_sha256',
    'flat_shot_kit_set_sha256',
    'shot_count',
    'shots',
    'asset_visual_bindings_sha256',
  ], 'asset_visual_binding_invalid', 'Asset visual bindings have an invalid shape.');
  const rebuilt = createAssetVisualGrammarBindings(options);
  if (!same(document, rebuilt)) {
    fail('asset_visual_binding_tampered', 'Asset visual bindings differ from the frozen recipes and flat kits.');
  }
  return {
    status: 'passed',
    asset_visual_bindings_sha256: document.asset_visual_bindings_sha256,
    design_selection_replay_sha256:
      document.design_selection_replay_sha256,
    visual_grammar_program_sha256: document.visual_grammar_program_sha256,
    whole_film_rules_sha256: document.whole_film_rules_sha256,
    flat_shot_kit_set_sha256: document.flat_shot_kit_set_sha256,
    shot_count: document.shot_count,
  };
}

function normalizePlannedBlocks(value, authoringPlan, projection) {
  if (!Array.isArray(value) || value.length !== authoringPlan.chunks.length) {
    fail('visual_chunk_plan_mismatch', 'The bridge requires every block from the existing deterministic chunk plan.');
  }
  return value.map((block, index) => {
    exact(block, [
      'block_id',
      'planner_chunk_id',
      'planner_chunk_spec_sha256',
      'shot_ids',
      'start_ms',
      'end_ms',
      'start_frame',
      'end_frame',
      'long_singleton',
      'namespace',
      'preceding_seam',
      'following_seam',
    ], 'visual_chunk_plan_mismatch', 'A supplied deterministic block has an invalid shape.', block?.block_id);
    const plannerChunk = authoringPlan.chunks[index];
    const projectedShots = plannerChunk.shots.map((plannerShot) => {
      const projected = projection.shots.find(
        (shot) => shot.shot_id === plannerShot.shot_id,
      );
      if (!projected
        || projected.srt_window_ms.start_ms !== plannerShot.start_ms
        || projected.srt_window_ms.end_ms !== plannerShot.end_ms) {
        fail(
          'visual_chunk_plan_mismatch',
          'Planner shots and the shared projection differ.',
          block?.block_id,
        );
      }
      return projected;
    });
    const blockId = `B${String(index + 1).padStart(3, '0')}`;
    const expected = {
      block_id: blockId,
      planner_chunk_id: plannerChunk.chunk_id,
      planner_chunk_spec_sha256: plannerChunk.chunk_spec_sha256,
      shot_ids: plannerChunk.shots.map((shot) => shot.shot_id),
      start_ms: plannerChunk.start_ms,
      end_ms: plannerChunk.end_ms,
      start_frame: projectedShots[0].frame_window.start_frame,
      end_frame: projectedShots.at(-1).frame_window.end_frame,
      long_singleton:
        plannerChunk.duration_ms
          > authoringPlan.chunk_policy.max_duration_ms,
      namespace: blockId.toLowerCase(),
    };
    if (block.block_id !== expected.block_id
      || block.planner_chunk_id !== expected.planner_chunk_id
      || block.planner_chunk_spec_sha256
        !== expected.planner_chunk_spec_sha256
      || !same(block.shot_ids, expected.shot_ids)
      || block.start_ms !== expected.start_ms
      || block.end_ms !== expected.end_ms
      || block.start_frame !== expected.start_frame
      || block.end_frame !== expected.end_frame
      || block.long_singleton !== expected.long_singleton
      || block.namespace !== expected.namespace
      || (block.long_singleton && block.shot_ids.length !== 1)) {
      fail(
        'visual_chunk_plan_mismatch',
        'The bridge cannot choose, split, retime, rename, or renamespace a deterministic block.',
        block.block_id,
      );
    }
    return structuredClone(block);
  });
}

export function bindVisualAuthoringChunkPlan(options = {}) {
  const rules = options.wholeFilmRules ?? options.whole_film_rules;
  const visualGrammarProgram =
    options.visualGrammarProgram ?? options.visual_grammar_program;
  const projection = validateFrameProjection(options.projection);
  const authoringPlan =
    options.authoringPlan ?? options.authoring_plan;
  const rulesReceipt = validateWholeFilmRules(rules, {
    visualGrammarProgram,
    projection,
    ...designOptions(options),
  });
  const selectionReplayReceipt = replayReceipt(options, rules);
  if (authoringPlan.parsed_srt_sha256
      !== rules.bindings.parsed_srt_sha256
    || authoringPlan.plan_sha256 !== rules.bindings.shot_plan_sha256
    || authoringPlan.projection_sha256
      !== rules.bindings.projection_sha256
    || authoringPlan.design_slice_sha256
      !== rules.bindings.design_slice_sha256
    || authoringPlan.global_rules_sha256
      !== rulesReceipt.whole_film_rules_sha256
    || !same(authoringPlan.fps, projection.fps)) {
    fail(
      'visual_chunk_plan_mismatch',
      'The sole authoring plan is not bound to the current rules and shared projection.',
    );
  }
  const canonicalChunkPolicy = {
    max_shots: rules.distribution_policy.max_block_shots,
    max_duration_ms: rules.distribution_policy.max_block_span_ms,
    oversize_singleton:
      rules.distribution_policy.long_shot_singleton_allowed,
  };
  validateSoleAuthoringPlanIdentity({
    authoringPlan,
    expectedAuthoringPlanSha256:
      options.expected_authoring_plan_sha256,
    projection,
    visualGrammarProgram,
    canonicalChunkPolicy,
  });
  const plannedBlocks = normalizePlannedBlocks(
    options.planned_blocks,
    authoringPlan,
    projection,
  );
  const identityProjectionCore = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    authoring_plan_sha256: authoringPlan.authoring_plan_sha256,
    mappings: plannedBlocks.map((block) => ({
      planner_chunk_id: block.planner_chunk_id,
      planner_chunk_spec_sha256: block.planner_chunk_spec_sha256,
      block_id: block.block_id,
      namespace: block.namespace,
      shot_ids: block.shot_ids,
      start_ms: block.start_ms,
      end_ms: block.end_ms,
    })),
  };
  const identityProjectionSha256 =
    fingerprintArtifactValue(identityProjectionCore);
  const bindings = {
    ...internalBindings(rules, rulesReceipt, authoringPlan),
    ...externalBindings(options, rules),
    design_selection_replay_sha256:
      selectionReplayReceipt.replay_receipt_sha256,
    identity_projection_sha256: identityProjectionSha256,
  };
  const authoringMaterials = normalizeAuthoringMaterials(
    options,
    rules,
    visualGrammarProgram,
  );
  const blocks = plannedBlocks.map((scope) => {
    const contextScope = {
      block_id: scope.block_id,
      shot_ids: scope.shot_ids,
      start_ms: scope.start_ms,
      end_ms: scope.end_ms,
      start_frame: scope.start_frame,
      end_frame: scope.end_frame,
      namespace: scope.namespace,
      preceding_seam: scope.preceding_seam,
      following_seam: scope.following_seam,
    };
    const authoringContext = extractWholeFilmBlockContext(rules, contextScope, {
      visualGrammarProgram,
      projection,
      ...designOptions(options),
    });
    const scopedMaterials = scope.shot_ids.map((shotId) =>
      authoringMaterials.find((item) => item.shot_id === shotId));
    if (scopedMaterials.some((item) => !item)
      || scopedMaterials.length !== scope.shot_ids.length) {
      fail(
        'visual_block_material_set_invalid',
        'A block material scope is missing an allocated shot.',
        scope.block_id,
      );
    }
    const scopedMaterialsDocument =
      createScopedMaterials(scopedMaterials, bindings);
    const core = {
      block_id: scope.block_id,
      planner_chunk_id: scope.planner_chunk_id,
      planner_chunk_spec_sha256: scope.planner_chunk_spec_sha256,
      authoring_plan_sha256: authoringPlan.authoring_plan_sha256,
      identity_projection_sha256: identityProjectionSha256,
      shot_start: scope.shot_ids[0],
      shot_end: scope.shot_ids.at(-1),
      shot_ids: scope.shot_ids,
      start_ms: scope.start_ms,
      end_ms: scope.end_ms,
      start_frame: scope.start_frame,
      end_frame: scope.end_frame,
      long_singleton: scope.long_singleton,
      namespace: scope.namespace,
      preceding_seam: scope.preceding_seam,
      following_seam: scope.following_seam,
      allowed_shot_recipe_sha256s:
        authoringContext.recipe_packet.recipes.map((recipe) => recipe.shot_recipe_sha256),
      allowed_design_shot_sha256s:
        scopedMaterials.map((item) => item.design_shot_sha256),
      allowed_flat_shot_kit_sha256s:
        scopedMaterials.map((item) => item.flat_shot_kit_sha256),
      allowed_asset_visual_binding_sha256s:
        scopedMaterials.map(
          (item) => item.asset_visual_binding_sha256,
        ),
      scoped_materials_sha256:
        scopedMaterialsDocument.scoped_materials_sha256,
      block_authoring_context_sha256:
        authoringContext.context_sha256,
      authoring_context: authoringContext,
    };
    return { ...core, block_record_sha256: fingerprintArtifactValue(core) };
  });
  const core = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    artifact_type: 'visual-authoring-chunk-plan',
    contract: VISUAL_AUTHORING_CHAIN_CONTRACT,
    bindings,
    identity_projection: {
      ...identityProjectionCore,
      identity_projection_sha256: identityProjectionSha256,
    },
    chunk_policy: structuredClone(authoringPlan.chunk_policy),
    shot_count: projection.shots.length,
    block_count: blocks.length,
    blocks,
  };
  return { ...core, chunk_plan_sha256: fingerprintArtifactValue(core) };
}

export function validateVisualAuthoringChunkPlan(document, options = {}) {
  exact(document, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'artifact_type',
    'contract',
    'bindings',
    'identity_projection',
    'chunk_policy',
    'shot_count',
    'block_count',
    'blocks',
    'chunk_plan_sha256',
  ], 'visual_chunk_plan_invalid', 'Visual chunk plan has an invalid shape.');
  if (document.schema_version !== 1
    || document.pipeline_contract_version !== 2
    || document.authoring_topology_id !== AUTHORING_TOPOLOGY_ID
    || document.artifact_type !== 'visual-authoring-chunk-plan'
    || document.contract !== VISUAL_AUTHORING_CHAIN_CONTRACT
    || !isSha(document.chunk_plan_sha256)) {
    fail('visual_chunk_plan_invalid', 'Visual chunk plan identity is invalid.');
  }
  const plannedBlocks = document.blocks.map((block) => ({
    block_id: block.block_id,
    planner_chunk_id: block.planner_chunk_id,
    planner_chunk_spec_sha256: block.planner_chunk_spec_sha256,
    shot_ids: block.shot_ids,
    start_ms: block.start_ms,
    end_ms: block.end_ms,
    start_frame: block.start_frame,
    end_frame: block.end_frame,
    long_singleton: block.long_singleton,
    namespace: block.namespace,
    preceding_seam: block.preceding_seam,
    following_seam: block.following_seam,
  }));
  const rebuilt = bindVisualAuthoringChunkPlan({
    ...options,
    ...document.bindings,
    planned_blocks: plannedBlocks,
  });
  if (!same(document, rebuilt)) {
    fail('visual_chunk_plan_tampered', 'Visual chunk plan differs from its deterministic reconstruction.');
  }
  for (const block of document.blocks) {
    const scope = {
      block_id: block.block_id,
      shot_ids: block.shot_ids,
      start_ms: block.start_ms,
      end_ms: block.end_ms,
      start_frame: block.start_frame,
      end_frame: block.end_frame,
      namespace: block.namespace,
      preceding_seam: block.preceding_seam,
      following_seam: block.following_seam,
    };
    validateWholeFilmBlockContext(
      block.authoring_context,
      options.wholeFilmRules ?? options.whole_film_rules,
      scope,
      {
        visualGrammarProgram:
          options.visualGrammarProgram ?? options.visual_grammar_program,
        projection: options.projection,
        ...designOptions(options),
      },
    );
  }
  return {
    status: 'passed',
    authority: 'deterministic-structural-rejection-only',
    chunk_plan_sha256: document.chunk_plan_sha256,
    visual_grammar_program_sha256:
      document.bindings.visual_grammar_program_sha256,
    whole_film_rules_sha256: document.bindings.whole_film_rules_sha256,
    authoring_plan_sha256: document.bindings.authoring_plan_sha256,
    identity_projection_sha256:
      document.bindings.identity_projection_sha256,
    shared_directive_sha256:
      document.blocks[0].authoring_context.recipe_packet
        .shared_visual_authoring_directive.directive_sha256,
    block_count: document.block_count,
    shot_count: document.shot_count,
  };
}

export function extractVisualBlockAuthoringPacket(document, blockId, options = {}) {
  validateVisualAuthoringChunkPlan(document, options);
  if (!BLOCK_ID.test(blockId ?? '')) {
    fail('visual_block_packet_invalid', 'Visual block packet ID is invalid.', blockId);
  }
  const block = document.blocks.find((item) => item.block_id === blockId);
  if (!block) {
    fail('visual_block_packet_invalid', 'Visual block is absent from the chunk plan.', blockId);
  }
  const rules =
    options.wholeFilmRules ?? options.whole_film_rules;
  const program =
    options.visualGrammarProgram
      ?? options.visual_grammar_program;
  const materials = normalizeAuthoringMaterials(
    {
      ...options,
      asset_visual_bindings_sha256:
        document.bindings.asset_visual_bindings_sha256,
      flat_shot_kit_set_sha256:
        document.bindings.flat_shot_kit_set_sha256,
      director_manifest_sha256:
        document.bindings.director_manifest_sha256,
    },
    rules,
    program,
  ).filter((item) => block.shot_ids.includes(item.shot_id));
  if (!same(
    materials.map((item) => item.shot_id),
    block.shot_ids,
  )
    || !same(
      materials.map((item) => item.design_shot_sha256),
      block.allowed_design_shot_sha256s,
    )
    || !same(
      materials.map((item) => item.flat_shot_kit_sha256),
      block.allowed_flat_shot_kit_sha256s,
    )
    || !same(
      materials.map(
        (item) => item.asset_visual_binding_sha256,
      ),
      block.allowed_asset_visual_binding_sha256s,
    )) {
    fail(
      'visual_block_material_set_invalid',
      'The scoped packet materials differ from the exact block allocation.',
      blockId,
    );
  }
  const scopedMaterials =
    createScopedMaterials(materials, document.bindings);
  if (scopedMaterials.scoped_materials_sha256
      !== block.scoped_materials_sha256) {
    fail(
      'visual_block_material_set_invalid',
      'The scoped material document differs from its frozen block record.',
      blockId,
    );
  }
  const core = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    artifact_type: 'visual-block-authoring-packet',
    chunk_plan_sha256: document.chunk_plan_sha256,
    bindings: document.bindings,
    block: structuredClone(block),
    scoped_materials: scopedMaterials,
  };
  return { ...core, packet_sha256: fingerprintArtifactValue(core) };
}

export function validateVisualBlockAuthoringPacket(
  packet,
  document,
  blockId,
  options = {},
) {
  const expected = extractVisualBlockAuthoringPacket(document, blockId, options);
  if (!same(packet, expected)) {
    fail('visual_block_packet_invalid', 'Visual block packet is stale, expanded, or non-canonical.', blockId);
  }
  return {
    status: 'passed',
    block_id: blockId,
    packet_sha256: packet.packet_sha256,
    context_sha256: packet.block.authoring_context.context_sha256,
    scoped_materials_sha256:
      packet.scoped_materials.scoped_materials_sha256,
    shot_count: packet.block.shot_ids.length,
  };
}

function normalizeCurrentBlocks(value, chunkPlan) {
  if (!Array.isArray(value) || value.length !== chunkPlan.blocks.length) {
    fail('style_integration_block_set_invalid', 'Style integration requires every current block manifest.');
  }
  return value.map((block, index) => {
    exact(block, [
      'block_id',
      'block_manifest_sha256',
      'producer_isolation_sha256',
      'shot_ids',
      'source_sha256s',
      'source_files',
      'renderer',
      'capture_schedule',
    ], 'style_integration_block_set_invalid', 'A current block binding has an invalid shape.');
    const planned = chunkPlan.blocks[index];
    exact(
      block.renderer,
      [
        'tool_id',
        'tool_version',
        'entrypoint_artifact_id',
        'config_sha256',
        'receipt_sha256',
      ],
      'style_integration_block_set_invalid',
      'A current block renderer binding has an invalid shape.',
      block.block_id,
    );
    if (block.block_id !== planned.block_id
      || !BLOCK_ID.test(block.block_id)
      || !isSha(block.block_manifest_sha256)
      || !isSha(block.producer_isolation_sha256)
      || !Array.isArray(block.shot_ids)
      || block.shot_ids.some((item) => !SHOT_ID.test(item))
      || !same(block.shot_ids, planned.shot_ids)
      || !Array.isArray(block.source_sha256s)
      || !block.source_sha256s.length
      || block.source_sha256s.some((item) => !isSha(item))
      || !Array.isArray(block.source_files)
      || block.source_files.length !== block.source_sha256s.length
      || typeof block.renderer.tool_id !== 'string'
      || !block.renderer.tool_id
      || typeof block.renderer.tool_version !== 'string'
      || !block.renderer.tool_version
      || typeof block.renderer.entrypoint_artifact_id !== 'string'
      || !block.renderer.entrypoint_artifact_id
      || !isSha(block.renderer.config_sha256)
      || !isSha(block.renderer.receipt_sha256)
      || !Array.isArray(block.capture_schedule)
      || block.capture_schedule.length !== planned.shot_ids.length) {
      fail('style_integration_block_set_invalid', 'A current block differs from its planned visual scope.', block.block_id);
    }
    const sourceIds = new Set();
    const sourcePaths = new Set();
    for (const [sourceIndex, source] of block.source_files.entries()) {
      exact(
        source,
        [
          'artifact_id',
          'relative_path',
          'sha256',
          'size_bytes',
          'media_type',
        ],
        'style_integration_block_set_invalid',
        'A current block source record has an invalid shape.',
        block.block_id,
      );
      if (typeof source.artifact_id !== 'string'
        || !source.artifact_id
        || sourceIds.has(source.artifact_id)
        || typeof source.relative_path !== 'string'
        || !source.relative_path
        || source.relative_path.startsWith('/')
        || source.relative_path.includes('\\')
        || source.relative_path.split('/').some(
          (part) => !part || part === '.' || part === '..',
        )
        || sourcePaths.has(source.relative_path)
        || source.sha256 !== block.source_sha256s[sourceIndex]
        || !Number.isSafeInteger(source.size_bytes)
        || source.size_bytes < 1
        || typeof source.media_type !== 'string'
        || !source.media_type) {
        fail(
          'style_integration_block_set_invalid',
          'Current block source records must preserve exact ordered IDs, paths, media facts, sizes, and hashes.',
          block.block_id,
        );
      }
      sourceIds.add(source.artifact_id);
      sourcePaths.add(source.relative_path);
    }
    if (!sourceIds.has(block.renderer.entrypoint_artifact_id)) {
      fail(
        'style_integration_block_set_invalid',
        'The renderer entrypoint must be one exact current block source.',
        block.block_id,
      );
    }
    return structuredClone(block);
  });
}

function styleExpected(
  chunkPlan,
  blocks,
  reviewerIsolationSha256,
  reviewGeneration,
) {
  if (!isSha(reviewerIsolationSha256)) {
    fail('style_integration_reviewer_invalid', 'Style integration requires the exact main-agent isolation hash.');
  }
  if (!Number.isSafeInteger(reviewGeneration) || reviewGeneration < 1) {
    fail('style_integration_generation_invalid', 'Style integration requires a positive review generation.');
  }
  return {
    pipeline_contract_version: 2,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    visual_grammar_sha256: chunkPlan.bindings.visual_grammar_program_sha256,
    whole_film_rules_sha256: chunkPlan.bindings.whole_film_rules_sha256,
    design_slice_sha256: chunkPlan.bindings.design_slice_sha256,
    chunk_plan_sha256: chunkPlan.chunk_plan_sha256,
    projection_sha256: chunkPlan.bindings.projection_sha256,
    review_generation: reviewGeneration,
    reviewer_isolation_sha256: reviewerIsolationSha256,
    blocks: blocks.map((block, index) => {
      const planned = chunkPlan.blocks[index];
      const context = planned.authoring_context;
      return {
        block_id: block.block_id,
        block_manifest_sha256: block.block_manifest_sha256,
        producer_isolation_sha256: block.producer_isolation_sha256,
        shot_ids: block.shot_ids,
        source_sha256s: block.source_sha256s,
        block_scope: {
          namespace: planned.namespace,
          start_ms: planned.start_ms,
          end_ms: planned.end_ms,
          start_frame: planned.start_frame,
          end_frame: planned.end_frame,
          preceding_seam: planned.preceding_seam,
          following_seam: planned.following_seam,
        },
        authoring_context_sha256: context.context_sha256,
        shared_directive_sha256:
          context.recipe_packet.shared_visual_authoring_directive
            .directive_sha256,
        shot_recipe_sha256s:
          context.recipe_packet.recipes.map(
            (recipe) => recipe.shot_recipe_sha256,
          ),
        renderer: block.renderer,
        capture_schedule: block.capture_schedule,
      };
    }),
  };
}

function asSourceBytes(value, code, message) {
  let candidate = value;
  if (candidate
    && typeof candidate === 'object'
    && !Buffer.isBuffer(candidate)
    && !(candidate instanceof Uint8Array)) {
    candidate = candidate.bytes;
  }
  if (!Buffer.isBuffer(candidate)
    && !(candidate instanceof Uint8Array)) {
    fail(code, message);
  }
  return Buffer.from(candidate);
}

function bytesForSourceRecord(sourceBytes, record) {
  if (!(sourceBytes instanceof Map)) {
    fail(
      'style_source_ledger_bytes_missing',
      'Style-to-integration lineage requires actual source bytes for every chunk.',
    );
  }
  let raw = sourceBytes.get(record.artifact_id);
  if (raw === undefined) raw = sourceBytes.get(record.relative_path);
  const bytes = asSourceBytes(
    raw,
    'style_source_ledger_bytes_missing',
    'Style-to-integration lineage cannot resolve one declared chunk source.',
  );
  if (bytes.length !== record.size_bytes) {
    fail(
      'style_source_ledger_bytes_mismatch',
      'Style-to-integration source size differs from the chunk manifest.',
    );
  }
  return bytes;
}

function exactChunkBytesMap(value, chunk) {
  const sourceBytes = value instanceof Map
    ? value
    : chunk.source_bytes;
  if (!(sourceBytes instanceof Map)
    || sourceBytes.size !== chunk.source_files.length) {
    fail(
      'style_source_ledger_bytes_missing',
      'Every chunk must expose exactly one actual byte entry per declared source.',
    );
  }
  return sourceBytes;
}

function chunkByteMaps(value, chunks) {
  if (value !== undefined && !(value instanceof Map)) {
    fail(
      'style_source_ledger_bytes_missing',
      'Chunk source bytes must use the exact chunk-to-byte-map contract.',
    );
  }
  const result = new Map();
  for (const chunk of chunks) {
    const explicit = value?.get(chunk.chunk_id);
    result.set(chunk.chunk_id, exactChunkBytesMap(explicit, chunk));
  }
  if (value instanceof Map && value.size !== chunks.length) {
    fail(
      'style_source_ledger_chunk_set_invalid',
      'Chunk source bytes contain a missing or side-loaded chunk.',
    );
  }
  return result;
}

function packetSourceBlocks(packetIndexBytes) {
  let packet;
  try {
    packet = JSON.parse(Buffer.from(packetIndexBytes).toString('utf8'));
  } catch {
    fail(
      'style_source_ledger_packet_invalid',
      'Validated style packet bytes cannot be reopened for source lineage.',
    );
  }
  if (!Array.isArray(packet?.blocks)) {
    fail(
      'style_source_ledger_packet_invalid',
      'Validated style packet does not contain an ordered block source set.',
    );
  }
  return packet.blocks;
}

function sourceProjection(records) {
  return records.map((record) => ({
    artifact_id: record.artifact_id,
    sha256: record.sha256,
    size_bytes: record.size_bytes,
    media_type: record.media_type,
  }));
}

function artifactSourceBytes(artifactBytes, artifactId) {
  if (!(artifactBytes instanceof Map)) {
    fail(
      'style_source_ledger_bytes_missing',
      'Style packet source bytes must be reopened from the validated artifact map.',
    );
  }
  return asSourceBytes(
    artifactBytes.get(artifactId),
    'style_source_ledger_bytes_missing',
    'A style-reviewed source artifact byte entry is missing.',
  );
}

export function createStyleToIntegrationSourceLedger(options = {}) {
  const chunkPlan = options.chunkPlan ?? options.chunk_plan;
  const authoringPlan =
    options.authoringPlan ?? options.authoring_plan;
  const chunks =
    options.chunks ?? options.chunkManifests ?? options.chunk_manifests;
  const blocks = normalizeCurrentBlocks(options.blocks, chunkPlan);
  validateAuthoringPlan(authoringPlan);
  if (authoringPlan.authoring_plan_sha256
      !== chunkPlan.bindings.authoring_plan_sha256
    || !Array.isArray(chunks)
    || chunks.length !== authoringPlan.chunks.length
    || chunks.length !== blocks.length
    || chunks.length !== chunkPlan.blocks.length) {
    fail(
      'style_source_ledger_chunk_set_invalid',
      'Style-to-integration lineage requires the complete sole plan, block set, and chunk set.',
    );
  }
  const packetBlocks = packetSourceBlocks(
    options.packetIndexBytes ?? options.packet_index_bytes,
  );
  if (packetBlocks.length !== blocks.length) {
    fail(
      'style_source_ledger_packet_invalid',
      'Style packet block count differs from the current integration set.',
    );
  }
  const byteMaps = chunkByteMaps(
    options.chunkSourceBytes
      ?? options.sourceBytesByChunk
      ?? options.chunk_source_bytes,
    chunks,
  );
  const blockSet = [];
  const chunkSet = [];
  const blockProjection = [];
  const chunkProjection = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const plannedBlock = chunkPlan.blocks[index];
    const plannedChunk = authoringPlan.chunks[index];
    const chunk = chunks[index];
    const packetBlock = packetBlocks[index];
    if (block.block_id !== plannedBlock.block_id
      || plannedBlock.planner_chunk_id !== plannedChunk.chunk_id
      || chunk?.chunk_id !== plannedChunk.chunk_id
      || block.block_manifest_sha256 !== chunk.manifest_sha256
      || block.producer_isolation_sha256
        !== chunk.producer_isolation_sha256
      || packetBlock?.block_id !== block.block_id
      || packetBlock.block_manifest_sha256
        !== chunk.manifest_sha256
      || packetBlock.producer_isolation_sha256
        !== chunk.producer_isolation_sha256) {
      fail(
        'style_source_ledger_mapping_mismatch',
        'Each ordinal style block must be the exact corresponding authoring chunk manifest.',
        block.block_id,
      );
    }
    const sourceBytes = byteMaps.get(chunk.chunk_id);
    validateAuthoringChunkManifest(chunk, {
      plan: authoringPlan,
      sourceBytes,
    });
    if (!same(block.source_files, chunk.source_files)
      || !same(block.source_sha256s, chunk.source_files.map(
        (record) => record.sha256,
      ))
      || !same(
        packetBlock.source_artifacts,
        sourceProjection(chunk.source_files),
      )) {
      fail(
        'style_source_ledger_record_mismatch',
        'Style-reviewed and integrated source records differ in order, identity, path-bound facts, or hashes.',
        block.block_id,
      );
    }
    for (const record of chunk.source_files) {
      const styleBytes = artifactSourceBytes(
        options.artifactBytes ?? options.artifact_bytes,
        record.artifact_id,
      );
      const integratedBytes = bytesForSourceRecord(
        sourceBytes,
        record,
      );
      if (styleBytes.length !== integratedBytes.length
        || !styleBytes.equals(integratedBytes)) {
        fail(
          'style_source_ledger_bytes_mismatch',
          'The style-approved source bytes are not the bytes supplied for integration.',
          block.block_id,
        );
      }
    }
    const blockCommon = {
      ordinal: index + 1,
      authoring_plan_sha256: authoringPlan.authoring_plan_sha256,
      chunk_plan_sha256: chunkPlan.chunk_plan_sha256,
      identity_projection_sha256:
        chunkPlan.bindings.identity_projection_sha256,
      block_id: block.block_id,
      chunk_id: chunk.chunk_id,
      planner_chunk_spec_sha256:
        plannedBlock.planner_chunk_spec_sha256,
      block_manifest_sha256: block.block_manifest_sha256,
      chunk_manifest_sha256: block.block_manifest_sha256,
      producer_isolation_sha256:
        block.producer_isolation_sha256,
      source_bundle_sha256:
        fingerprintArtifactValue(block.source_files),
      source_files: structuredClone(block.source_files),
    };
    const chunkCommon = {
      ordinal: index + 1,
      authoring_plan_sha256: authoringPlan.authoring_plan_sha256,
      chunk_plan_sha256: chunkPlan.chunk_plan_sha256,
      identity_projection_sha256:
        chunkPlan.bindings.identity_projection_sha256,
      block_id: plannedBlock.block_id,
      chunk_id: chunk.chunk_id,
      planner_chunk_spec_sha256: chunk.chunk_spec_sha256,
      block_manifest_sha256: chunk.manifest_sha256,
      chunk_manifest_sha256: chunk.manifest_sha256,
      producer_isolation_sha256:
        chunk.producer_isolation_sha256,
      source_bundle_sha256: chunk.source_bundle_sha256,
      source_files: structuredClone(chunk.source_files),
    };
    blockSet.push({
      ordinal: index + 1,
      block_id: block.block_id,
      block_manifest_sha256: block.block_manifest_sha256,
      producer_isolation_sha256:
        block.producer_isolation_sha256,
      source_files: structuredClone(block.source_files),
    });
    chunkSet.push({
      ordinal: index + 1,
      chunk_id: chunk.chunk_id,
      chunk_manifest_sha256: chunk.manifest_sha256,
      producer_isolation_sha256:
        chunk.producer_isolation_sha256,
      source_bundle_sha256: chunk.source_bundle_sha256,
      source_files: structuredClone(chunk.source_files),
    });
    blockProjection.push(blockCommon);
    chunkProjection.push(chunkCommon);
  }
  if (!same(blockProjection, chunkProjection)) {
    fail(
      'style_source_ledger_cross_projection_mismatch',
      'Independently recomputed style-block and integration-chunk ledgers differ.',
    );
  }
  const ledgerCore = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    artifact_type: 'style-to-integration-source-ledger',
    authoring_plan_sha256: authoringPlan.authoring_plan_sha256,
    chunk_plan_sha256: chunkPlan.chunk_plan_sha256,
    identity_projection_sha256:
      chunkPlan.bindings.identity_projection_sha256,
    review_generation: options.review_generation,
    block_set_sha256: fingerprintArtifactValue(blockSet),
    chunk_set_sha256: fingerprintArtifactValue(chunkSet),
    mapping_count: blockProjection.length,
    mappings: blockProjection,
  };
  return {
    ...ledgerCore,
    source_ledger_sha256: fingerprintArtifactValue(ledgerCore),
  };
}

export async function createStyleIntegrationAuthorization(options = {}) {
  const chunkPlan = options.chunkPlan ?? options.chunk_plan;
  validateVisualAuthoringChunkPlan(chunkPlan, options);
  const blocks = normalizeCurrentBlocks(options.blocks, chunkPlan);
  const expected = styleExpected(
    chunkPlan,
    blocks,
    options.reviewer_isolation_sha256,
    options.review_generation,
  );
  const styleReceipt = await validateStyleConformanceReview({
    review: options.review,
    packetIndexBytes: options.packetIndexBytes ?? options.packet_index_bytes,
    artifactBytes: options.artifactBytes ?? options.artifact_bytes,
    expected,
    trustedCaptureRunner:
      options.trustedCaptureRunner ?? options.trusted_capture_runner,
  });
  if (styleReceipt.status !== 'approved') {
    fail('style_review_not_approved', 'Integration is forbidden until the current style review is approved.');
  }
  const sourceLedger =
    createStyleToIntegrationSourceLedger(options);
  if (options.review.reviewer_role
      !== 'erduo-hyperframes-broll-main-agent'
    || options.review.authority_scope !== 'static-style-review'
    || options.review.reviewer_model_id
      !== options.reviewer_model_id
    || options.review.reviewer_isolation_sha256
      !== options.reviewer_isolation_sha256) {
    fail(
      'style_integration_reviewer_invalid',
      'Style authorization must freeze the exact qualified main reviewer, authority, packet, and isolation.',
    );
  }
  const styleReceiptSha256 = fingerprintArtifactValue(styleReceipt);
  const core = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    artifact_type: 'style-integration-authorization',
    gate: 'style_conformance_review',
    status: 'approved',
    chunk_plan_sha256: chunkPlan.chunk_plan_sha256,
    authoring_plan_sha256:
      chunkPlan.bindings.authoring_plan_sha256,
    identity_projection_sha256:
      chunkPlan.bindings.identity_projection_sha256,
    visual_grammar_program_sha256:
      chunkPlan.bindings.visual_grammar_program_sha256,
    whole_film_rules_sha256: chunkPlan.bindings.whole_film_rules_sha256,
    design_slice_sha256: chunkPlan.bindings.design_slice_sha256,
    design_selection_sha256:
      chunkPlan.bindings.design_selection_sha256,
    design_selection_replay_sha256:
      chunkPlan.bindings.design_selection_replay_sha256,
    base_template_id: chunkPlan.bindings.base_template_id,
    base_template_sha256: chunkPlan.bindings.base_template_sha256,
    design_library_snapshot_sha256:
      chunkPlan.bindings.design_library_snapshot_sha256,
    projection_sha256: chunkPlan.bindings.projection_sha256,
    reviewer_role: options.review.reviewer_role,
    reviewer_model_id: options.review.reviewer_model_id,
    reviewer_isolation_sha256:
      options.review.reviewer_isolation_sha256,
    authority_scope: options.review.authority_scope,
    subject_packet_index_sha256:
      options.review.subject_packet_index_sha256,
    review_generation: options.review_generation,
    block_set_sha256: sourceLedger.block_set_sha256,
    chunk_set_sha256: sourceLedger.chunk_set_sha256,
    style_source_ledger_sha256:
      sourceLedger.source_ledger_sha256,
    packet_index_bytes_sha256: options.review.subject_packet_index_sha256,
    style_conformance_review_sha256: options.review.review_sha256,
    style_validator_receipt_sha256: styleReceiptSha256,
  };
  return { ...core, authorization_sha256: fingerprintArtifactValue(core) };
}

export async function validateStyleIntegrationAuthorization(
  authorization,
  options = {},
) {
  const expected = await createStyleIntegrationAuthorization(options);
  if (!same(authorization, expected)) {
    fail('style_integration_authorization_invalid', 'Style integration authorization is stale or was re-signed against different bytes.');
  }
  return {
    status: 'approved',
    authorization_sha256: authorization.authorization_sha256,
    authoring_plan_sha256: authorization.authoring_plan_sha256,
    identity_projection_sha256:
      authorization.identity_projection_sha256,
    style_conformance_review_sha256:
      authorization.style_conformance_review_sha256,
    style_validator_receipt_sha256:
      authorization.style_validator_receipt_sha256,
    block_set_sha256: authorization.block_set_sha256,
    chunk_set_sha256: authorization.chunk_set_sha256,
    style_source_ledger_sha256:
      authorization.style_source_ledger_sha256,
    review_generation: authorization.review_generation,
    reviewer_role: authorization.reviewer_role,
    reviewer_model_id: authorization.reviewer_model_id,
    reviewer_isolation_sha256:
      authorization.reviewer_isolation_sha256,
    authority_scope: authorization.authority_scope,
    subject_packet_index_sha256:
      authorization.subject_packet_index_sha256,
  };
}

export async function createStyleAuthorizedIntegration(options = {}) {
  const styleIntegrationAuthorization =
    await createStyleIntegrationAuthorization(options);
  const integrationManifest = createAuthoringIntegrationManifest({
    ...options,
    plan: options.authoringPlan ?? options.authoring_plan,
    style_integration_authorization_sha256:
      styleIntegrationAuthorization.authorization_sha256,
    style_source_ledger_sha256:
      styleIntegrationAuthorization.style_source_ledger_sha256,
    style_validator_receipt_sha256:
      styleIntegrationAuthorization.style_validator_receipt_sha256,
  });
  return { styleIntegrationAuthorization, integrationManifest };
}

export async function validateStyleAuthorizedIntegration(
  integrationManifest,
  styleIntegrationAuthorization,
  options = {},
) {
  const styleReceipt = await validateStyleIntegrationAuthorization(
    styleIntegrationAuthorization,
    options,
  );
  const integrationReceipt = validateAuthoringIntegrationManifest(
    integrationManifest,
    {
      ...options,
      plan: options.authoringPlan ?? options.authoring_plan,
      style_integration_authorization_sha256:
        styleReceipt.authorization_sha256,
      style_source_ledger_sha256:
        styleIntegrationAuthorization.style_source_ledger_sha256,
      style_validator_receipt_sha256:
        styleIntegrationAuthorization.style_validator_receipt_sha256,
    },
  );
  return {
    status: 'passed',
    style_integration_authorization_sha256:
      styleReceipt.authorization_sha256,
    integration_manifest_sha256: integrationReceipt.manifest_sha256,
    source_bundle_sha256: integrationReceipt.source_bundle_sha256,
    style_source_ledger_sha256:
      integrationReceipt.style_source_ledger_sha256,
    style_validator_receipt_sha256:
      integrationReceipt.style_validator_receipt_sha256,
    block_set_sha256: styleReceipt.block_set_sha256,
    chunk_set_sha256: styleReceipt.chunk_set_sha256,
    review_generation: styleReceipt.review_generation,
    reviewer_role: styleReceipt.reviewer_role,
    reviewer_model_id: styleReceipt.reviewer_model_id,
    reviewer_isolation_sha256:
      styleReceipt.reviewer_isolation_sha256,
    authority_scope: styleReceipt.authority_scope,
    subject_packet_index_sha256:
      styleReceipt.subject_packet_index_sha256,
    style_conformance_review_sha256:
      styleReceipt.style_conformance_review_sha256,
    no_rewrite_receipt_sha256:
      integrationReceipt.no_rewrite_receipt_sha256,
  };
}

export async function revalidateStyleAuthorizedIntegrationForRender(
  options = {},
) {
  const authorization =
    options.styleIntegrationAuthorization
      ?? options.style_integration_authorization;
  const integration =
    options.integrationManifest ?? options.integration_manifest;
  const receipt = await validateStyleAuthorizedIntegration(
    integration,
    authorization,
    options,
  );
  const core = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    artifact_type: 'style-lineage-render-preflight-receipt',
    gate: 'style-lineage-render-preflight',
    status: 'passed',
    reviewer_role: receipt.reviewer_role,
    reviewer_model_id: receipt.reviewer_model_id,
    reviewer_isolation_sha256:
      receipt.reviewer_isolation_sha256,
    authority_scope: receipt.authority_scope,
    subject_packet_index_sha256:
      receipt.subject_packet_index_sha256,
    review_generation: receipt.review_generation,
    style_conformance_review_sha256:
      receipt.style_conformance_review_sha256,
    style_validator_receipt_sha256:
      receipt.style_validator_receipt_sha256,
    block_set_sha256: receipt.block_set_sha256,
    chunk_set_sha256: receipt.chunk_set_sha256,
    style_source_ledger_sha256:
      receipt.style_source_ledger_sha256,
    style_integration_authorization_sha256:
      receipt.style_integration_authorization_sha256,
    integration_manifest_sha256:
      receipt.integration_manifest_sha256,
    source_bundle_sha256: receipt.source_bundle_sha256,
    no_rewrite_receipt_sha256:
      receipt.no_rewrite_receipt_sha256,
  };
  return {
    ...core,
    lineage_receipt_sha256: fingerprintArtifactValue(core),
  };
}

export function validateStyleLineageRenderReceipt(
  receipt,
  expected = {},
) {
  const fields = [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'artifact_type',
    'gate',
    'status',
    'reviewer_role',
    'reviewer_model_id',
    'reviewer_isolation_sha256',
    'authority_scope',
    'subject_packet_index_sha256',
    'review_generation',
    'style_conformance_review_sha256',
    'style_validator_receipt_sha256',
    'block_set_sha256',
    'chunk_set_sha256',
    'style_source_ledger_sha256',
    'style_integration_authorization_sha256',
    'integration_manifest_sha256',
    'source_bundle_sha256',
    'no_rewrite_receipt_sha256',
    'lineage_receipt_sha256',
  ];
  exact(
    receipt,
    fields,
    'style_lineage_receipt_invalid',
    'Style lineage render receipt has an invalid shape.',
  );
  const {
    lineage_receipt_sha256: declaredSha256,
    ...core
  } = receipt;
  if (receipt.schema_version !== 1
    || receipt.pipeline_contract_version !== 2
    || receipt.authoring_topology_id !== AUTHORING_TOPOLOGY_ID
    || receipt.artifact_type
      !== 'style-lineage-render-preflight-receipt'
    || receipt.gate !== 'style-lineage-render-preflight'
    || receipt.status !== 'passed'
    || receipt.reviewer_role
      !== 'erduo-hyperframes-broll-main-agent'
    || typeof receipt.reviewer_model_id !== 'string'
    || !receipt.reviewer_model_id
    || receipt.authority_scope !== 'static-style-review'
    || !Number.isSafeInteger(receipt.review_generation)
    || receipt.review_generation < 1
    || fields.filter((field) => field.endsWith('_sha256'))
      .some((field) => !isSha(receipt[field]))
    || declaredSha256 !== fingerprintArtifactValue(core)) {
    fail(
      'style_lineage_receipt_invalid',
      'Style lineage render receipt is invalid or tampered.',
    );
  }
  for (const [field, value] of Object.entries(expected)) {
    if (value !== undefined && receipt[field] !== value) {
      fail(
        'style_lineage_receipt_unbound',
        'Style lineage render receipt differs from the current consumer boundary.',
      );
    }
  }
  return receipt;
}
