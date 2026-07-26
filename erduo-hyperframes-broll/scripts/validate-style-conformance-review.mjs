#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fingerprintArtifactValue } from './artifact-manifest.mjs';
import { validateFrameProjection } from './compile-frame-projection.mjs';
import { measureStyleFrameBytes } from './measure-style-pixel-facts.mjs';
import { validateVisualGrammarProgram } from './validate-visual-grammar-program.mjs';
import {
  validateWholeFilmBlockContext,
  validateWholeFilmRules,
} from './validate-whole-film-rules.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const BLOCK_ID = /^B\d{3}$/u;
const SHOT_ID = /^S\d{3}$/u;
const ARTIFACT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const TOOL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const TOOL_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+/-]{0,95}$/u;
const FINDING_ID = /^B\d{3}-F\d{3}$/u;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const TOPOLOGY_ID = 'bounded-authoring-cluster-v1';
const MAIN_REVIEW_ROLE = 'erduo-hyperframes-broll-main-agent';
const GATE = 'style_conformance_review';
const AUTHORITY = 'static-style-review';
export const TRUSTED_CAPTURE_RUNNER_CONTRACT = 'style-trusted-capture-runner-v1';
const STATES = ['entry', 'result', 'exit'];
const CAPTURE_FIELDS = [
  'artifact_id',
  'block_manifest_sha256',
  'source_sha256s',
  'shot_id',
  'phase',
  'projected_frame',
  'timestamp_ms',
  'projection_sha256',
  'shot_recipe_sha256',
  'renderer_tool_id',
  'renderer_tool_version',
  'renderer_receipt_sha256',
  'review_generation',
  'sha256',
  'size_bytes',
  'media_type',
  'width',
  'height',
  'decoded_rgba_sha256',
  'capture_binding_sha256',
];
const MAX_PACKET_BYTES = 1024 * 1024;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const MAX_IMAGE_BYTES = 128 * 1024 * 1024;
const MAX_BLOCKS = 256;
const MAX_SHOTS = 2048;
const CHECKS = [
  'visual_identity',
  'anti_identity',
  'attention_geometry',
  'subject_title_relationship',
  'real_html_svg_text_readability',
  'accent_visibility_load',
  'material_texture_language',
  'negative_space_responsibility',
];
const CRITERIA = new Set([...CHECKS, 'adjacent_result_text_swap']);
const CODES_BY_CRITERION = {
  visual_identity: new Set(['visual_identity_mismatch']),
  anti_identity: new Set(['anti_identity_violation']),
  attention_geometry: new Set(['attention_geometry_conflict']),
  subject_title_relationship: new Set(['subject_title_relationship_weak']),
  real_html_svg_text_readability: new Set(['html_svg_text_unreadable_or_not_real']),
  accent_visibility_load: new Set(['accent_invisible', 'accent_overload']),
  material_texture_language: new Set(['material_texture_language_mismatch']),
  negative_space_responsibility: new Set(['negative_space_unresolved']),
  adjacent_result_text_swap: new Set(['adjacent_result_text_swap_only']),
};
const SOURCE_MEDIA_TYPES = new Set([
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'image/svg+xml',
]);

export class StyleConformanceReviewError extends Error {
  constructor(code, message, field) {
    super(message);
    this.name = 'StyleConformanceReviewError';
    this.code = code;
    if (field) this.field = field;
  }
}

const fail = (code, message, field) => {
  throw new StyleConformanceReviewError(code, message, field);
};
const exact = (value, fields, code = 'style_review_invalid', field = '$') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) {
    fail(code, 'Style-conformance value has an invalid shape.', field);
  }
};
const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const isSha = (value) => typeof value === 'string' && SHA256.test(value);
const asBuffer = (value, code, field) => {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    fail(code, 'Required artifact bytes are unresolved.', field);
  }
  return Buffer.from(value);
};
const same = (left, right) => fingerprintArtifactValue(left) === fingerprintArtifactValue(right);

function parseJsonBytes(value, { code, maxBytes, field }) {
  const bytes = asBuffer(value, code, field);
  if (bytes.length < 1 || bytes.length > maxBytes) {
    fail(code, 'JSON artifact is empty or exceeds its byte limit.', field);
  }
  try {
    return { bytes, document: JSON.parse(bytes.toString('utf8')) };
  } catch {
    fail(code, 'Artifact is not valid JSON.', field);
  }
}

function validateExpected(expected) {
  exact(expected, [
    'pipeline_contract_version',
    'authoring_topology_id',
    'visual_grammar_sha256',
    'whole_film_rules_sha256',
    'design_slice_sha256',
    'chunk_plan_sha256',
    'projection_sha256',
    'review_generation',
    'reviewer_isolation_sha256',
    'blocks',
  ], 'style_review_expected_invalid', '$expected');
  if (expected.pipeline_contract_version !== 2 || expected.authoring_topology_id !== TOPOLOGY_ID
    || !isSha(expected.visual_grammar_sha256) || !isSha(expected.whole_film_rules_sha256)
    || !isSha(expected.design_slice_sha256) || !isSha(expected.chunk_plan_sha256)
    || !isSha(expected.projection_sha256)
    || !Number.isSafeInteger(expected.review_generation) || expected.review_generation < 1
    || !isSha(expected.reviewer_isolation_sha256) || !Array.isArray(expected.blocks)
    || expected.blocks.length < 1 || expected.blocks.length > MAX_BLOCKS) {
    fail('style_review_expected_invalid', 'Expected style-review bindings are invalid.', '$expected');
  }
  const blockIds = new Set();
  const shotIds = new Set();
  for (const [index, block] of expected.blocks.entries()) {
    const field = `$expected.blocks[${index}]`;
    exact(block, [
      'block_id',
      'block_manifest_sha256',
      'producer_isolation_sha256',
      'shot_ids',
      'source_sha256s',
      'block_scope',
      'authoring_context_sha256',
      'shared_directive_sha256',
      'shot_recipe_sha256s',
      'renderer',
      'capture_schedule',
    ], 'style_review_expected_invalid', field);
    exact(block.block_scope, [
      'namespace',
      'start_ms',
      'end_ms',
      'start_frame',
      'end_frame',
      'preceding_seam',
      'following_seam',
    ], 'style_review_expected_invalid', `${field}.block_scope`);
    exact(block.renderer, [
      'tool_id',
      'tool_version',
      'entrypoint_artifact_id',
      'config_sha256',
      'receipt_sha256',
    ], 'style_review_expected_invalid', `${field}.renderer`);
    if (!BLOCK_ID.test(block.block_id ?? '') || blockIds.has(block.block_id)
      || !isSha(block.block_manifest_sha256) || !isSha(block.producer_isolation_sha256)
      || !Array.isArray(block.shot_ids) || block.shot_ids.length < 1 || block.shot_ids.length > 8
      || block.shot_ids.some((item) => !SHOT_ID.test(item) || shotIds.has(item))
      || !Array.isArray(block.source_sha256s) || block.source_sha256s.length < 1 || block.source_sha256s.length > 64
      || block.source_sha256s.some((item) => !isSha(item))
      || typeof block.block_scope.namespace !== 'string' || !block.block_scope.namespace
      || !Number.isSafeInteger(block.block_scope.start_ms) || block.block_scope.start_ms < 0
      || !Number.isSafeInteger(block.block_scope.end_ms) || block.block_scope.end_ms <= block.block_scope.start_ms
      || !Number.isSafeInteger(block.block_scope.start_frame) || block.block_scope.start_frame < 0
      || !Number.isSafeInteger(block.block_scope.end_frame) || block.block_scope.end_frame <= block.block_scope.start_frame
      || !isSha(block.authoring_context_sha256) || !isSha(block.shared_directive_sha256)
      || !Array.isArray(block.shot_recipe_sha256s) || block.shot_recipe_sha256s.length !== block.shot_ids.length
      || block.shot_recipe_sha256s.some((item) => !isSha(item))
      || !TOOL_ID.test(block.renderer.tool_id ?? '') || !TOOL_VERSION.test(block.renderer.tool_version ?? '')
      || !ARTIFACT_ID.test(block.renderer.entrypoint_artifact_id ?? '')
      || !isSha(block.renderer.config_sha256) || !isSha(block.renderer.receipt_sha256)
      || !Array.isArray(block.capture_schedule) || block.capture_schedule.length !== block.shot_ids.length) {
      fail('style_review_expected_invalid', 'Expected block bindings are invalid.', field);
    }
    for (const [shotIndex, capture] of block.capture_schedule.entries()) {
      const captureField = `${field}.capture_schedule[${shotIndex}]`;
      exact(capture, ['shot_id', 'distinct_projected_frames_required', 'entry', 'result', 'exit'], 'style_review_expected_invalid', captureField);
      if (capture.shot_id !== block.shot_ids[shotIndex] || capture.distinct_projected_frames_required !== true) {
        fail('style_review_expected_invalid', 'Capture schedule must bind each shot and require three distinct projected phases.', captureField);
      }
      const coordinates = STATES.map((state) => {
        exact(capture[state], ['projected_frame', 'timestamp_ms'], 'style_review_expected_invalid', `${captureField}.${state}`);
        if (!Number.isSafeInteger(capture[state].projected_frame) || capture[state].projected_frame < 0
          || !Number.isSafeInteger(capture[state].timestamp_ms) || capture[state].timestamp_ms < 0) {
          fail('style_review_expected_invalid', 'Capture schedule coordinates are invalid.', `${captureField}.${state}`);
        }
        return capture[state];
      });
      if (!(coordinates[0].projected_frame < coordinates[1].projected_frame
        && coordinates[1].projected_frame < coordinates[2].projected_frame
        && coordinates[0].timestamp_ms < coordinates[1].timestamp_ms
        && coordinates[1].timestamp_ms < coordinates[2].timestamp_ms)) {
        fail('style_review_expected_invalid', 'Capture phase coordinates must be strictly ordered.', captureField);
      }
    }
    blockIds.add(block.block_id);
    block.shot_ids.forEach((shotId) => shotIds.add(shotId));
  }
  const expectedBlockIds = expected.blocks.map((block) => block.block_id);
  if (!same(expectedBlockIds, [...expectedBlockIds].sort())
    || !same([...shotIds], [...shotIds].sort())
    || shotIds.size > MAX_SHOTS) {
    fail('style_review_expected_invalid', 'Expected blocks and shots must be globally ordered.', '$expected.blocks');
  }
  if (expected.blocks.some((block) => block.producer_isolation_sha256 === expected.reviewer_isolation_sha256)) {
    fail('style_review_self_attested', 'The main reviewer cannot share isolation with a block producer.', '$expected.reviewer_isolation_sha256');
  }
  return expected;
}

function validateArtifactRef(ref, kind, field) {
  exact(ref, ['artifact_id', 'sha256', 'size_bytes', 'media_type'], 'style_review_artifact_ref_invalid', field);
  const limit = kind === 'source' ? MAX_SOURCE_BYTES : kind === 'image' ? MAX_IMAGE_BYTES : MAX_JSON_BYTES;
  const mediaValid = kind === 'source' ? SOURCE_MEDIA_TYPES.has(ref.media_type)
    : kind === 'image' ? ['image/png', 'image/jpeg'].includes(ref.media_type)
      : ref.media_type === 'application/json';
  if (!ARTIFACT_ID.test(ref.artifact_id ?? '') || !isSha(ref.sha256)
    || !Number.isSafeInteger(ref.size_bytes) || ref.size_bytes < 1 || ref.size_bytes > limit
    || !mediaValid) {
    fail(ref.size_bytes > limit ? 'style_review_artifact_oversized' : 'style_review_artifact_ref_invalid', 'Style-review artifact reference is invalid.', field);
  }
  return ref;
}

function resolveRef(ref, kind, artifactBytes, field) {
  validateArtifactRef(ref, kind, field);
  if (!(artifactBytes instanceof Map) || !artifactBytes.has(ref.artifact_id)) {
    fail('style_review_page_missing', 'A declared style-review artifact is missing.', field);
  }
  const bytes = asBuffer(artifactBytes.get(ref.artifact_id), 'style_review_page_missing', field);
  if (bytes.length !== ref.size_bytes || hashBytes(bytes) !== ref.sha256) {
    fail('style_review_artifact_hash_mismatch', 'Resolved style-review bytes do not match their reference.', field);
  }
  if (kind === 'image') {
    const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if ((ref.media_type === 'image/png' && !png) || (ref.media_type === 'image/jpeg' && !jpeg)) {
      fail('style_review_image_type_mismatch', 'Still bytes do not match their declared PNG/JPEG media type.', field);
    }
  }
  return bytes;
}

function validateIndex(packetIndexBytes, artifactBytes, expected) {
  const parsed = parseJsonBytes(packetIndexBytes, {
    code: 'style_review_packet_invalid',
    maxBytes: MAX_PACKET_BYTES,
    field: '$packet_index',
  });
  const index = parsed.document;
  exact(index, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'gate',
    'visual_grammar_sha256',
    'whole_film_rules_sha256',
    'design_slice_sha256',
    'chunk_plan_sha256',
    'projection_sha256',
    'review_generation',
    'visual_grammar_program',
    'whole_film_rules',
    'frame_projection',
    'design_selection',
    'base_template',
    'design_library',
    'block_count',
    'blocks',
    'packet_index_sha256',
  ], 'style_review_packet_invalid', '$packet_index');
  const { packet_index_sha256: declaredHash, ...core } = index;
  if (index.schema_version !== 1 || index.pipeline_contract_version !== 2
    || index.authoring_topology_id !== TOPOLOGY_ID || index.gate !== GATE
    || index.visual_grammar_sha256 !== expected.visual_grammar_sha256
    || index.whole_film_rules_sha256 !== expected.whole_film_rules_sha256
    || index.design_slice_sha256 !== expected.design_slice_sha256
    || index.chunk_plan_sha256 !== expected.chunk_plan_sha256
    || index.projection_sha256 !== expected.projection_sha256
    || index.review_generation !== expected.review_generation
    || index.block_count !== expected.blocks.length || !Array.isArray(index.blocks)
    || index.blocks.length !== index.block_count || declaredHash !== fingerprintArtifactValue(core)) {
    fail('style_review_packet_unbound', 'Style-review packet index is stale, incomplete, or bound to another rule chain.', '$packet_index');
  }
  const blockPages = [];
  const artifactIds = new Set();
  const resolveUnique = (ref, kind, field) => {
    const bytes = resolveRef(ref, kind, artifactBytes, field);
    if (artifactIds.has(ref.artifact_id)) {
      fail('style_review_artifact_id_duplicate', 'Each rules, source, page, still, and facts artifact needs a unique opaque ID.', field);
    }
    artifactIds.add(ref.artifact_id);
    return bytes;
  };
  const visualGrammarBytes = resolveUnique(index.visual_grammar_program, 'json', '$packet_index.visual_grammar_program');
  const wholeFilmRulesBytes = resolveUnique(index.whole_film_rules, 'json', '$packet_index.whole_film_rules');
  const projectionBytes = resolveUnique(index.frame_projection, 'json', '$packet_index.frame_projection');
  const designSelectionBytes = resolveUnique(index.design_selection, 'json', '$packet_index.design_selection');
  const baseTemplateBytes = resolveUnique(index.base_template, 'json', '$packet_index.base_template');
  const designLibraryBytes = resolveUnique(index.design_library, 'json', '$packet_index.design_library');
  const visualGrammar = parseJsonBytes(visualGrammarBytes, {
    code: 'style_review_visual_grammar_invalid',
    maxBytes: MAX_JSON_BYTES,
    field: '$visual_grammar_program',
  }).document;
  const wholeFilmRules = parseJsonBytes(wholeFilmRulesBytes, {
    code: 'style_review_whole_film_rules_invalid',
    maxBytes: MAX_JSON_BYTES,
    field: '$whole_film_rules',
  }).document;
  const projection = parseJsonBytes(projectionBytes, {
    code: 'style_review_projection_invalid',
    maxBytes: MAX_JSON_BYTES,
    field: '$frame_projection',
  }).document;
  const designSelection = parseJsonBytes(designSelectionBytes, {
    code: 'style_review_design_selection_invalid',
    maxBytes: MAX_JSON_BYTES,
    field: '$design_selection',
  }).document;
  const baseTemplate = parseJsonBytes(baseTemplateBytes, {
    code: 'style_review_base_template_invalid',
    maxBytes: MAX_JSON_BYTES,
    field: '$base_template',
  }).document;
  const designLibrary = parseJsonBytes(designLibraryBytes, {
    code: 'style_review_design_library_invalid',
    maxBytes: MAX_JSON_BYTES,
    field: '$design_library',
  }).document;
  const effectiveBaseOption = designSelection.base_template === 'hyperframes-native'
    ? { nativeBaseCompiler: baseTemplate }
    : { baseTemplate };
  let projectionResult;
  let visualGrammarResult;
  let wholeFilmRulesResult;
  try {
    projectionResult = validateFrameProjection(projection);
    visualGrammarResult = validateVisualGrammarProgram(visualGrammar, {
      projection,
      designSelection,
      designLibrary,
      ...effectiveBaseOption,
    });
    wholeFilmRulesResult = validateWholeFilmRules(wholeFilmRules, {
      visualGrammarProgram: visualGrammar,
      projection,
      designSelection,
      designLibrary,
      ...effectiveBaseOption,
    });
  } catch {
    fail('style_review_authoring_rules_invalid', 'Actual projection, visual grammar, or whole-film rules failed deterministic revalidation.');
  }
  if (projectionResult.receipt.projection_sha256 !== expected.projection_sha256
    || visualGrammarResult.program_sha256 !== expected.visual_grammar_sha256
    || wholeFilmRulesResult.whole_film_rules_sha256 !== expected.whole_film_rules_sha256
    || visualGrammar.bindings?.design_slice_sha256 !== expected.design_slice_sha256
    || wholeFilmRules.bindings?.design_slice_sha256 !== expected.design_slice_sha256) {
    fail('style_review_authoring_rules_unbound', 'Actual authoring rules do not match the expected projection, VGP, WFR, or design slice.');
  }
  for (const [position, block] of index.blocks.entries()) {
    const field = `$packet_index.blocks[${position}]`;
    exact(block, [
      'block_id',
      'block_manifest_sha256',
      'producer_isolation_sha256',
      'source_artifacts',
      'authoring_context',
      'renderer_config',
      'renderer_receipt',
      'evidence_page',
    ], 'style_review_packet_invalid', field);
    const expectedBlock = expected.blocks[position];
    if (block.block_id !== expectedBlock.block_id
      || block.block_manifest_sha256 !== expectedBlock.block_manifest_sha256
      || block.producer_isolation_sha256 !== expectedBlock.producer_isolation_sha256
      || !Array.isArray(block.source_artifacts) || block.source_artifacts.length !== expectedBlock.source_sha256s.length) {
      fail('style_review_block_unbound', 'Packet block identity or source count differs from the frozen block.', field);
    }
    const sourceBytes = [];
    const sourceHashes = [];
    for (const [sourceIndex, source] of block.source_artifacts.entries()) {
      const sourceField = `${field}.source_artifacts[${sourceIndex}]`;
      sourceBytes.push(resolveRef(source, 'source', artifactBytes, sourceField));
      if (artifactIds.has(source.artifact_id)) {
        fail('style_review_artifact_id_duplicate', 'Each source, page, still, and facts artifact needs a unique opaque ID.', sourceField);
      }
      artifactIds.add(source.artifact_id);
      sourceHashes.push(source.sha256);
    }
    if (!same(sourceHashes, expectedBlock.source_sha256s)) {
      fail('style_review_block_unbound', 'Packet sources differ from the frozen block-source hashes.', `${field}.source_artifacts`);
    }
    if (!block.source_artifacts.some((source) => source.artifact_id === expectedBlock.renderer.entrypoint_artifact_id)) {
      fail('style_review_renderer_input_invalid', 'Renderer entrypoint is not one of the exact frozen source artifacts.', `${field}.source_artifacts`);
    }
    const authoringContextBytes = resolveUnique(block.authoring_context, 'json', `${field}.authoring_context`);
    const rendererConfigBytes = resolveUnique(block.renderer_config, 'json', `${field}.renderer_config`);
    const rendererConfig = parseJsonBytes(rendererConfigBytes, {
      code: 'style_review_renderer_config_invalid',
      maxBytes: MAX_JSON_BYTES,
      field: `${field}.renderer_config`,
    }).document;
    if (block.renderer_config.sha256 !== expectedBlock.renderer.config_sha256) {
      fail('style_review_renderer_input_invalid', 'Renderer config differs from the frozen expected config.', `${field}.renderer_config`);
    }
    const rendererReceiptBytes = resolveUnique(block.renderer_receipt, 'json', `${field}.renderer_receipt`);
    const pageField = `${field}.evidence_page`;
    const pageBytes = resolveUnique(block.evidence_page, 'json', pageField);
    blockPages.push({
      index: block,
      expected: expectedBlock,
      source_bytes: sourceBytes,
      source_sha256s: sourceHashes,
      authoring_context_bytes: authoringContextBytes,
      renderer_config_bytes: rendererConfigBytes,
      renderer_config: rendererConfig,
      renderer_receipt_bytes: rendererReceiptBytes,
      evidence_page_bytes: pageBytes,
    });
  }
  return {
    index,
    index_bytes: parsed.bytes,
    index_bytes_sha256: hashBytes(parsed.bytes),
    block_pages: blockPages,
    artifact_ids: artifactIds,
    visual_grammar: visualGrammar,
    whole_film_rules: wholeFilmRules,
    projection,
    design_selection: designSelection,
    base_template: baseTemplate,
    design_library: designLibrary,
    projection_ref: index.frame_projection,
    visual_grammar_result: visualGrammarResult,
    whole_film_rules_result: wholeFilmRulesResult,
  };
}

function validateMetricFacts(facts, field) {
  exact(facts, [
    'pixel_count',
    'average_luma_milli',
    'luma_stddev_milli',
    'chroma_pixel_basis_points',
    'edge_pixel_basis_points',
    'border_deviation_occupancy_basis_points',
    'alpha_nonzero_basis_points',
    'opaque_pixel_basis_points',
  ], 'style_pixel_facts_invalid', field);
  if (!Number.isSafeInteger(facts.pixel_count) || facts.pixel_count < 1
    || !Number.isSafeInteger(facts.average_luma_milli) || facts.average_luma_milli < 0 || facts.average_luma_milli > 255_000
    || !Number.isSafeInteger(facts.luma_stddev_milli) || facts.luma_stddev_milli < 0 || facts.luma_stddev_milli > 255_000
    || [
      facts.chroma_pixel_basis_points,
      facts.edge_pixel_basis_points,
      facts.border_deviation_occupancy_basis_points,
      facts.alpha_nonzero_basis_points,
      facts.opaque_pixel_basis_points,
    ].some((value) => !Number.isSafeInteger(value) || value < 0 || value > 10_000)) {
    fail('style_pixel_facts_invalid', 'Objective pixel metrics are out of range.', field);
  }
}

function validateBlockAuthoringCriteria(block, packet) {
  const contextField = `$.authoring_context:${block.expected.block_id}`;
  const context = parseJsonBytes(block.authoring_context_bytes, {
    code: 'style_review_authoring_context_invalid',
    maxBytes: MAX_JSON_BYTES,
    field: contextField,
  }).document;
  const scope = {
    block_id: block.expected.block_id,
    shot_ids: block.expected.shot_ids,
    start_ms: block.expected.block_scope.start_ms,
    end_ms: block.expected.block_scope.end_ms,
    start_frame: block.expected.block_scope.start_frame,
    end_frame: block.expected.block_scope.end_frame,
    namespace: block.expected.block_scope.namespace,
    preceding_seam: block.expected.block_scope.preceding_seam,
    following_seam: block.expected.block_scope.following_seam,
  };
  let validation;
  const effectiveBaseOption = packet.design_selection.base_template === 'hyperframes-native'
    ? { nativeBaseCompiler: packet.base_template }
    : { baseTemplate: packet.base_template };
  try {
    validation = validateWholeFilmBlockContext(
      context,
      packet.whole_film_rules,
      scope,
      {
        visualGrammarProgram: packet.visual_grammar,
        projection: packet.projection,
        designSelection: packet.design_selection,
        designLibrary: packet.design_library,
        ...effectiveBaseOption,
      },
    );
  } catch {
    fail('style_review_authoring_context_invalid', 'Compact shared directive and shot recipes do not reconstruct from current VGP/WFR.', contextField);
  }
  const recipePacket = context.recipe_packet;
  const recipeHashes = recipePacket?.recipes?.map((recipe) => recipe.shot_recipe_sha256);
  if (validation.context_sha256 !== block.expected.authoring_context_sha256
    || validation.shared_directive_sha256 !== block.expected.shared_directive_sha256
    || !same(recipeHashes, block.expected.shot_recipe_sha256s)
    || recipePacket?.shared_visual_authoring_directive?.directive_sha256 !== block.expected.shared_directive_sha256
    || !same(recipePacket?.shot_ids, block.expected.shot_ids)) {
    fail('style_review_authoring_context_unbound', 'Shared directive or exact per-shot recipes differ from expected current authoring criteria.', contextField);
  }
  return {
    ...block,
    authoring_context: context,
    authoring_context_sha256: validation.context_sha256,
    shared_directive_sha256: validation.shared_directive_sha256,
    shot_recipe_sha256s: recipeHashes,
  };
}

function orderedScheduledCaptures(captureSchedule) {
  return captureSchedule.flatMap((shot) => STATES.map((phase) => ({
    shot_id: shot.shot_id,
    phase,
    projected_frame: shot[phase].projected_frame,
    timestamp_ms: shot[phase].timestamp_ms,
  })));
}

async function runTrustedCapture(block, packet, globalExpected, trustedCaptureRunner) {
  const field = `$.trusted_capture_runner:${block.expected.block_id}`;
  if (typeof trustedCaptureRunner !== 'function') {
    fail('style_review_capture_runner_required', 'A trusted deterministic capture-runner adapter is required.', field);
  }
  const request = {
    runner_contract: TRUSTED_CAPTURE_RUNNER_CONTRACT,
    pipeline_contract_version: 2,
    authoring_topology_id: TOPOLOGY_ID,
    block_id: block.expected.block_id,
    block_manifest_sha256: block.expected.block_manifest_sha256,
    source_bundle: block.index.source_artifacts.map((source, index) => ({
      ...source,
      bytes: Buffer.from(block.source_bytes[index]),
    })),
    entrypoint_artifact_id: block.expected.renderer.entrypoint_artifact_id,
    projection: {
      manifest: structuredClone(packet.projection_ref),
      document: structuredClone(packet.projection),
    },
    renderer: {
      tool_id: block.expected.renderer.tool_id,
      tool_version: block.expected.renderer.tool_version,
      config_manifest: structuredClone(block.index.renderer_config),
      config: structuredClone(block.renderer_config),
    },
    review_generation: globalExpected.review_generation,
    capture_schedule: structuredClone(block.expected.capture_schedule),
  };
  let result;
  try {
    result = await trustedCaptureRunner(request);
  } catch {
    fail('style_review_capture_runner_failed', 'Trusted capture runner failed to produce deterministic outputs.', field);
  }
  exact(result, ['runner_contract', 'outputs'], 'style_review_capture_runner_invalid', field);
  if (result.runner_contract !== TRUSTED_CAPTURE_RUNNER_CONTRACT || !Array.isArray(result.outputs)) {
    fail('style_review_capture_runner_invalid', 'Trusted capture runner returned an invalid contract.', field);
  }
  const schedule = orderedScheduledCaptures(block.expected.capture_schedule);
  if (result.outputs.length !== schedule.length) {
    fail('style_review_capture_output_missing', 'Trusted capture runner must return every scheduled output exactly once.', `${field}.outputs`);
  }
  const outputs = [];
  const outputManifest = [];
  for (const [index, output] of result.outputs.entries()) {
    const outputField = `${field}.outputs[${index}]`;
    exact(output, [
      'shot_id',
      'phase',
      'projected_frame',
      'timestamp_ms',
      'bytes',
    ], 'style_review_capture_runner_invalid', outputField);
    const scheduled = schedule[index];
    if (output.shot_id !== scheduled.shot_id
      || output.phase !== scheduled.phase
      || output.projected_frame !== scheduled.projected_frame
      || output.timestamp_ms !== scheduled.timestamp_ms) {
      fail('style_review_capture_output_relabelled', 'Trusted capture output order or scheduled coordinates drifted.', outputField);
    }
    const bytes = asBuffer(output.bytes, 'style_review_capture_runner_invalid', `${outputField}.bytes`);
    let measured;
    try {
      measured = await measureStyleFrameBytes(bytes, { field: outputField });
    } catch {
      fail('style_review_capture_runner_invalid', 'Trusted capture runner returned undecodable or invalid image bytes.', outputField);
    }
    outputs.push({ ...scheduled, bytes, measured });
    outputManifest.push({
      ...scheduled,
      sha256: measured.sha256,
      size_bytes: measured.size_bytes,
      media_type: measured.media_type,
      width: measured.width,
      height: measured.height,
      decoded_rgba_sha256: measured.decoded_rgba_sha256,
    });
  }
  const receiptCore = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: TOPOLOGY_ID,
    kind: 'trusted-style-capture-run-receipt',
    runner_contract: TRUSTED_CAPTURE_RUNNER_CONTRACT,
    input_manifest: {
      block_id: block.expected.block_id,
      block_manifest_sha256: block.expected.block_manifest_sha256,
      source_artifacts: structuredClone(block.index.source_artifacts),
      entrypoint_artifact_id: block.expected.renderer.entrypoint_artifact_id,
      projection: structuredClone(packet.projection_ref),
      renderer_tool_id: block.expected.renderer.tool_id,
      renderer_tool_version: block.expected.renderer.tool_version,
      renderer_config: structuredClone(block.index.renderer_config),
      review_generation: globalExpected.review_generation,
    },
    capture_schedule: structuredClone(block.expected.capture_schedule),
    output_manifest: outputManifest,
  };
  return {
    request,
    outputs,
    receipt: { ...receiptCore, receipt_sha256: fingerprintArtifactValue(receiptCore) },
  };
}

function validateRendererReceipt(block, expected, trustedCapture) {
  const field = `$.renderer_receipt:${expected.block_id}`;
  const receipt = parseJsonBytes(block.renderer_receipt_bytes, {
    code: 'style_review_renderer_receipt_invalid',
    maxBytes: MAX_JSON_BYTES,
    field,
  }).document;
  if (!same(receipt, trustedCapture.receipt)
    || receipt.receipt_sha256 !== expected.renderer.receipt_sha256) {
    fail('style_review_renderer_receipt_stale', 'Renderer receipt differs from a fresh trusted run over the exact source, entrypoint, projection, config, generation, schedule, or output bytes.', field);
  }
  return {
    ...block,
    renderer_receipt: receipt,
    trusted_capture: trustedCapture,
  };
}

function projectTimestamp(timestampMs, fps) {
  const numerator = BigInt(timestampMs) * BigInt(fps.numerator);
  const denominator = 1000n * BigInt(fps.denominator);
  return Number(((2n * numerator) + denominator) / (2n * denominator));
}

const artifactRefFromCapture = (capture) => Object.fromEntries(
  ['artifact_id', 'sha256', 'size_bytes', 'media_type'].map((field) => [field, capture[field]]),
);
const captureCore = (capture) => Object.fromEntries(
  CAPTURE_FIELDS.filter((field) => field !== 'capture_binding_sha256').map((field) => [field, capture[field]]),
);
const captureSubset = (capture) => Object.fromEntries(
  CAPTURE_FIELDS.map((field) => [field, capture[field]]),
);

function validateCaptureRecord(capture, {
  block,
  globalExpected,
  projection,
  shotIndex,
  phase,
  field,
}) {
  exact(capture, CAPTURE_FIELDS, 'style_capture_binding_invalid', field);
  const schedule = block.expected.capture_schedule[shotIndex][phase];
  const projectedShot = projection.shots.find((shot) => shot.shot_id === capture.shot_id);
  if (!ARTIFACT_ID.test(capture.artifact_id ?? '')
    || capture.block_manifest_sha256 !== block.expected.block_manifest_sha256
    || !same(capture.source_sha256s, block.expected.source_sha256s)
    || capture.shot_id !== block.expected.shot_ids[shotIndex]
    || capture.phase !== phase
    || capture.projected_frame !== schedule.projected_frame
    || capture.timestamp_ms !== schedule.timestamp_ms
    || capture.projection_sha256 !== globalExpected.projection_sha256
    || capture.shot_recipe_sha256 !== block.expected.shot_recipe_sha256s[shotIndex]
    || capture.renderer_tool_id !== block.expected.renderer.tool_id
    || capture.renderer_tool_version !== block.expected.renderer.tool_version
    || capture.renderer_receipt_sha256 !== block.expected.renderer.receipt_sha256
    || capture.review_generation !== globalExpected.review_generation
    || !isSha(capture.sha256) || !Number.isSafeInteger(capture.size_bytes) || capture.size_bytes < 1
    || !['image/png', 'image/jpeg'].includes(capture.media_type)
    || !Number.isSafeInteger(capture.width) || capture.width < 1
    || !Number.isSafeInteger(capture.height) || capture.height < 1
    || !isSha(capture.decoded_rgba_sha256)
    || !isSha(capture.capture_binding_sha256)
    || capture.capture_binding_sha256 !== fingerprintArtifactValue(captureCore(capture))
    || !projectedShot
    || capture.timestamp_ms < projectedShot.srt_window_ms.start_ms
    || capture.timestamp_ms >= projectedShot.srt_window_ms.end_ms
    || capture.projected_frame < projectedShot.frame_window.start_frame
    || capture.projected_frame >= projectedShot.frame_window.end_frame
    || projectTimestamp(capture.timestamp_ms, projection.fps) !== capture.projected_frame) {
    fail('style_capture_binding_invalid', 'Still capture is mislabeled or drifts from source, recipe, projection, renderer, or review generation.', field);
  }
  return capture;
}

async function validatePixelFacts(document, page, block, stillBytes, globalExpected, field) {
  exact(document, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'producer',
    'authority_scope',
    'block_id',
    'block_manifest_sha256',
    'source_sha256s',
    'projection_sha256',
    'review_generation',
    'renderer',
    'shot_count',
    'frame_count',
    'frames',
    'facts_sha256',
  ], 'style_pixel_facts_invalid', field);
  exact(document.renderer, ['tool_id', 'tool_version', 'receipt_sha256'], 'style_pixel_facts_invalid', `${field}.renderer`);
  const { facts_sha256: declaredHash, ...core } = document;
  if (document.schema_version !== 1 || document.pipeline_contract_version !== 2
    || document.authoring_topology_id !== TOPOLOGY_ID
    || document.producer !== 'measure-style-pixel-facts-v1'
    || document.authority_scope !== 'objective-pixel-facts-only'
    || document.block_id !== block.expected.block_id
    || document.block_manifest_sha256 !== block.expected.block_manifest_sha256
    || !same(document.source_sha256s, block.expected.source_sha256s)
    || document.projection_sha256 !== globalExpected.projection_sha256
    || document.review_generation !== globalExpected.review_generation
    || !same(document.renderer, {
      tool_id: block.expected.renderer.tool_id,
      tool_version: block.expected.renderer.tool_version,
      receipt_sha256: block.expected.renderer.receipt_sha256,
    })
    || document.shot_count !== block.expected.shot_ids.length
    || document.frame_count !== block.expected.shot_ids.length * 3
    || !Array.isArray(document.frames) || document.frames.length !== document.frame_count
    || declaredHash !== fingerprintArtifactValue(core)) {
    fail('style_pixel_facts_unbound', 'Pixel facts are stale or bound to another block, projection, renderer, or generation.', field);
  }
  const pageFrames = page.shots.flatMap((shot) => STATES.map((state) => shot[state]));
  for (const [index, facts] of document.frames.entries()) {
    const frameField = `${field}.frames[${index}]`;
    exact(facts, [
      ...CAPTURE_FIELDS,
      'measurement_thresholds',
      'whole_frame_facts',
      'declared_roi',
      'roi_facts',
    ], 'style_pixel_facts_invalid', frameField);
    exact(facts.measurement_thresholds, ['chroma_delta', 'edge_luma_delta', 'border_deviation_delta'], 'style_pixel_facts_invalid', `${frameField}.measurement_thresholds`);
    const expectedCapture = pageFrames[index];
    if (!expectedCapture || !same(captureSubset(facts), captureSubset(expectedCapture))
      || facts.width * facts.height !== facts.whole_frame_facts?.pixel_count
      || facts.measurement_thresholds.chroma_delta !== 32
      || facts.measurement_thresholds.edge_luma_delta !== 24
      || facts.measurement_thresholds.border_deviation_delta !== 24) {
      fail('style_pixel_facts_unbound', 'A pixel-facts frame does not bind its exact authoritative capture record.', frameField);
    }
    validateMetricFacts(facts.whole_frame_facts, `${frameField}.whole_frame_facts`);
    if (facts.declared_roi === null) {
      if (facts.roi_facts !== null) fail('style_pixel_facts_invalid', 'ROI facts require a declared ROI.', frameField);
    } else {
      exact(facts.declared_roi, ['x', 'y', 'width', 'height'], 'style_pixel_facts_invalid', `${frameField}.declared_roi`);
      if (![facts.declared_roi.x, facts.declared_roi.y, facts.declared_roi.width, facts.declared_roi.height].every(Number.isSafeInteger)
        || facts.declared_roi.x < 0 || facts.declared_roi.y < 0
        || facts.declared_roi.width < 1 || facts.declared_roi.height < 1
        || facts.declared_roi.x + facts.declared_roi.width > facts.width
        || facts.declared_roi.y + facts.declared_roi.height > facts.height) {
        fail('style_pixel_facts_invalid', 'Declared facts ROI is outside the still raster.', `${frameField}.declared_roi`);
      }
      validateMetricFacts(facts.roi_facts, `${frameField}.roi_facts`);
      if (facts.roi_facts.pixel_count !== facts.declared_roi.width * facts.declared_roi.height) {
        fail('style_pixel_facts_invalid', 'ROI pixel count differs from its rectangle.', `${frameField}.roi_facts.pixel_count`);
      }
    }
    let recomputed;
    try {
      recomputed = await measureStyleFrameBytes(stillBytes[index], {
        declaredRoi: facts.declared_roi,
        field: frameField,
      });
    } catch {
      fail('style_pixel_facts_recompute_failed', 'Consumer could not independently decode and measure a bound still.', frameField);
    }
    const claimedMeasurement = {
      sha256: facts.sha256,
      size_bytes: facts.size_bytes,
      media_type: facts.media_type,
      width: facts.width,
      height: facts.height,
      decoded_rgba_sha256: facts.decoded_rgba_sha256,
      measurement_thresholds: facts.measurement_thresholds,
      whole_frame_facts: facts.whole_frame_facts,
      declared_roi: facts.declared_roi,
      roi_facts: facts.roi_facts,
    };
    if (!same(claimedMeasurement, recomputed)) {
      fail('style_pixel_facts_recompute_mismatch', 'Re-signed pixel facts do not match independently recomputed still pixels.', frameField);
    }
  }
  return document;
}

async function validateEvidencePage(block, artifactBytes, artifactIds, packet, globalExpected) {
  const parsed = parseJsonBytes(block.evidence_page_bytes, {
    code: 'style_review_evidence_page_invalid',
    maxBytes: MAX_JSON_BYTES,
    field: `$.evidence_page:${block.expected.block_id}`,
  });
  const page = parsed.document;
  exact(page, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'gate',
    'block_id',
    'block_manifest_sha256',
    'source_sha256s',
    'projection_sha256',
    'review_generation',
    'authoring_context_sha256',
    'shared_directive_sha256',
    'shot_recipe_sha256s',
    'renderer_receipt_sha256',
    'shot_count',
    'shots',
    'pixel_facts',
    'page_sha256',
  ], 'style_review_evidence_page_invalid', `$.evidence_page:${block.expected.block_id}`);
  const { page_sha256: declaredHash, ...core } = page;
  if (page.schema_version !== 1 || page.pipeline_contract_version !== 2
    || page.authoring_topology_id !== TOPOLOGY_ID || page.gate !== GATE
    || page.block_id !== block.expected.block_id
    || page.block_manifest_sha256 !== block.expected.block_manifest_sha256
    || !same(page.source_sha256s, block.expected.source_sha256s)
    || page.projection_sha256 !== globalExpected.projection_sha256
    || page.review_generation !== globalExpected.review_generation
    || page.authoring_context_sha256 !== block.expected.authoring_context_sha256
    || page.shared_directive_sha256 !== block.expected.shared_directive_sha256
    || !same(page.shot_recipe_sha256s, block.expected.shot_recipe_sha256s)
    || page.renderer_receipt_sha256 !== block.expected.renderer.receipt_sha256
    || page.shot_count !== block.expected.shot_ids.length
    || !Array.isArray(page.shots) || page.shots.length !== page.shot_count
    || declaredHash !== fingerprintArtifactValue(core)) {
    fail('style_review_evidence_page_unbound', 'Evidence page is incomplete or bound to another block.', `$.evidence_page:${block.expected.block_id}`);
  }
  const stillHashes = [];
  const stillRefs = [];
  const stillBytes = [];
  const captureBindingHashes = [];
  const resultHashes = new Map();
  for (const [index, shot] of page.shots.entries()) {
    const field = `$.evidence_page:${block.expected.block_id}.shots[${index}]`;
    exact(shot, ['shot_id', 'entry', 'result', 'exit'], 'style_review_evidence_page_invalid', field);
    if (shot.shot_id !== block.expected.shot_ids[index]) {
      fail('style_review_shot_coverage_incomplete', 'Evidence pages must cover every allocated shot in order.', field);
    }
    for (const [stateIndex, state] of STATES.entries()) {
      const ref = validateCaptureRecord(shot[state], {
        block,
        globalExpected,
        projection: packet.projection,
        shotIndex: index,
        phase: state,
        field: `${field}.${state}`,
      });
      const stateField = `${field}.${state}`;
      const bytes = resolveRef(artifactRefFromCapture(ref), 'image', artifactBytes, stateField);
      const trustedOutput = block.trusted_capture.outputs[(index * STATES.length) + stateIndex];
      if (!trustedOutput || !bytes.equals(trustedOutput.bytes)
        || ref.sha256 !== trustedOutput.measured.sha256
        || ref.size_bytes !== trustedOutput.measured.size_bytes
        || ref.media_type !== trustedOutput.measured.media_type
        || ref.width !== trustedOutput.measured.width
        || ref.height !== trustedOutput.measured.height
        || ref.decoded_rgba_sha256 !== trustedOutput.measured.decoded_rgba_sha256) {
        fail('style_review_capture_output_mismatch', 'Submitted still bytes differ from a fresh trusted source-to-renderer capture.', stateField);
      }
      if (artifactIds.has(ref.artifact_id)) {
        fail('style_review_artifact_id_duplicate', 'Each source, page, still, and facts artifact needs a unique opaque ID.', stateField);
      }
      artifactIds.add(ref.artifact_id);
      stillHashes.push(ref.sha256);
      stillRefs.push(ref);
      stillBytes.push(bytes);
      captureBindingHashes.push(ref.capture_binding_sha256);
      if (state === 'result') resultHashes.set(shot.shot_id, ref.sha256);
    }
  }
  const factsField = `$.evidence_page:${block.expected.block_id}.pixel_facts`;
  const factsBytes = resolveRef(page.pixel_facts, 'json', artifactBytes, factsField);
  if (artifactIds.has(page.pixel_facts.artifact_id)) {
    fail('style_review_artifact_id_duplicate', 'Each source, page, still, and facts artifact needs a unique opaque ID.', factsField);
  }
  artifactIds.add(page.pixel_facts.artifact_id);
  const parsedFacts = parseJsonBytes(factsBytes, {
    code: 'style_pixel_facts_invalid',
    maxBytes: MAX_JSON_BYTES,
    field: `$.pixel_facts:${block.expected.block_id}`,
  });
  const facts = await validatePixelFacts(
    parsedFacts.document,
    page,
    block,
    stillBytes,
    globalExpected,
    `$.pixel_facts:${block.expected.block_id}`,
  );
  return {
    ...block,
    page,
    page_bytes_sha256: hashBytes(parsed.bytes),
    still_hashes: stillHashes,
    still_refs: stillRefs,
    capture_binding_sha256s: captureBindingHashes,
    result_hashes: resultHashes,
    pixel_facts: facts,
    pixel_facts_bytes_sha256: hashBytes(parsedFacts.bytes),
  };
}

function validateReviewIdentity(review, packet, expected) {
  if (review.pipeline_contract_version !== 2) fail('pipeline_upgrade_required', 'Legacy style reviews cannot authorize integration.');
  if (review.schema_version !== 1 || review.authoring_topology_id !== TOPOLOGY_ID
    || review.gate !== GATE || review.authority_scope !== AUTHORITY
    || review.subject_packet_index_sha256 !== packet.index_bytes_sha256
    || review.visual_grammar_sha256 !== expected.visual_grammar_sha256
    || review.whole_film_rules_sha256 !== expected.whole_film_rules_sha256
    || review.design_slice_sha256 !== expected.design_slice_sha256
    || review.chunk_plan_sha256 !== expected.chunk_plan_sha256
    || review.projection_sha256 !== expected.projection_sha256
    || review.review_generation !== expected.review_generation) {
    fail('style_review_binding_mismatch', 'Style review is bound to another topology, packet, grammar, rules, design, or chunk plan.');
  }
  if (review.reviewer_role !== MAIN_REVIEW_ROLE || !MODEL_ID.test(review.reviewer_model_id ?? '')
    || !isSha(review.reviewer_isolation_sha256)
    || review.reviewer_isolation_sha256 !== expected.reviewer_isolation_sha256) {
    fail('style_review_main_agent_identity_invalid', 'Style review lacks the expected main-agent identity and isolation.');
  }
  if (expected.blocks.some((block) => block.producer_isolation_sha256 === review.reviewer_isolation_sha256)) {
    fail('style_review_self_attested', 'A block producer cannot issue its own style review.');
  }
}

function validateFinding(value, position, context) {
  const field = `$.review.findings[${position}]`;
  exact(value, [
    'finding_id',
    'block_id',
    'shot_ids',
    'criterion',
    'severity',
    'code',
    'summary',
    'evidence_sha256s',
    'required_change',
  ], 'style_review_finding_invalid', field);
  const owner = context.blockById.get(value.block_id);
  if (!FINDING_ID.test(value.finding_id ?? '') || !value.finding_id.startsWith(`${value.block_id}-`)
    || context.findingIds.has(value.finding_id)
    || !owner || !Array.isArray(value.shot_ids) || value.shot_ids.length < 1 || value.shot_ids.length > 2
    || value.shot_ids.some((shotId) => !context.shotToBlock.has(shotId))
    || new Set(value.shot_ids).size !== value.shot_ids.length
    || !CRITERIA.has(value.criterion) || !CODES_BY_CRITERION[value.criterion]?.has(value.code)
    || value.severity !== 'revision_required'
    || typeof value.summary !== 'string' || value.summary.trim() !== value.summary
    || value.summary.length < 1 || Buffer.byteLength(value.summary, 'utf8') > 500
    || typeof value.required_change !== 'string' || value.required_change.trim() !== value.required_change
    || value.required_change.length < 1 || Buffer.byteLength(value.required_change, 'utf8') > 1000
    || !Array.isArray(value.evidence_sha256s) || value.evidence_sha256s.length < 1 || value.evidence_sha256s.length > 16
    || value.evidence_sha256s.some((item) => !isSha(item) || !context.allEvidenceHashes.has(item))
    || new Set(value.evidence_sha256s).size !== value.evidence_sha256s.length) {
    fail('style_review_finding_invalid', 'Style finding is invalid, unbound, or not revision-actionable.', field);
  }
  if (!value.shot_ids.some((shotId) => context.shotToBlock.get(shotId) === value.block_id)) {
    fail('style_review_finding_not_block_scoped', 'Every finding must affect at least one shot owned by its revision block.', field);
  }
  if (value.criterion !== 'adjacent_result_text_swap'
    && value.shot_ids.some((shotId) => context.shotToBlock.get(shotId) !== value.block_id)) {
    fail('style_review_finding_not_block_scoped', 'Non-adjacent findings cannot reach outside their revision block.', field);
  }
  context.findingIds.add(value.finding_id);
  return value;
}

function validateReviewedBlocks(reviewedBlocks, findings, packet, context) {
  if (!Array.isArray(reviewedBlocks) || reviewedBlocks.length !== packet.block_pages.length) {
    fail('style_review_block_coverage_incomplete', 'The style review must inspect every block page.', '$.review.reviewed_blocks');
  }
  for (const [index, reviewed] of reviewedBlocks.entries()) {
    const block = packet.block_pages[index];
    const field = `$.review.reviewed_blocks[${index}]`;
    exact(reviewed, [
      'block_id',
      'block_manifest_sha256',
      'inspected_source_sha256s',
      'authoring_context_sha256',
      'shared_directive_sha256',
      'shot_recipe_sha256s',
      'renderer_receipt_sha256',
      'inspected_evidence_page_sha256',
      'inspected_still_sha256s',
      'inspected_capture_binding_sha256s',
      'inspected_pixel_facts_sha256',
      'shot_reviews',
    ], 'style_review_block_invalid', field);
    if (reviewed.block_id !== block.expected.block_id
      || reviewed.block_manifest_sha256 !== block.expected.block_manifest_sha256
      || !same(reviewed.inspected_source_sha256s, block.expected.source_sha256s)
      || reviewed.authoring_context_sha256 !== block.expected.authoring_context_sha256
      || reviewed.shared_directive_sha256 !== block.expected.shared_directive_sha256
      || !same(reviewed.shot_recipe_sha256s, block.expected.shot_recipe_sha256s)
      || reviewed.renderer_receipt_sha256 !== block.expected.renderer.receipt_sha256
      || reviewed.inspected_evidence_page_sha256 !== block.page_bytes_sha256
      || !same(reviewed.inspected_still_sha256s, block.still_hashes)
      || !same(reviewed.inspected_capture_binding_sha256s, block.capture_binding_sha256s)
      || reviewed.inspected_pixel_facts_sha256 !== block.pixel_facts_bytes_sha256
      || !Array.isArray(reviewed.shot_reviews)
      || reviewed.shot_reviews.length !== block.expected.shot_ids.length) {
      fail('style_review_pages_unbound', 'Reviewed block does not bind every source, still, and facts page in order.', field);
    }
    for (const [shotIndex, shotReview] of reviewed.shot_reviews.entries()) {
      const shotField = `${field}.shot_reviews[${shotIndex}]`;
      exact(shotReview, ['shot_id', 'checks', 'finding_ids'], 'style_review_shot_invalid', shotField);
      exact(shotReview.checks, CHECKS, 'style_review_shot_invalid', `${shotField}.checks`);
      const shotId = block.expected.shot_ids[shotIndex];
      const shotFindings = findings.filter((finding) => finding.block_id === block.expected.block_id
        && finding.criterion !== 'adjacent_result_text_swap' && finding.shot_ids.includes(shotId));
      if (shotReview.shot_id !== shotId || CHECKS.some((check) => typeof shotReview.checks[check] !== 'boolean')
        || !Array.isArray(shotReview.finding_ids)
        || !same(shotReview.finding_ids, shotFindings.map((finding) => finding.finding_id))) {
        fail('style_review_shot_invalid', 'Shot review identity, checklist, or finding links are incomplete.', shotField);
      }
      for (const check of CHECKS) {
        const hasFinding = shotFindings.some((finding) => finding.criterion === check);
        if (shotReview.checks[check] === hasFinding) {
          fail('style_review_check_finding_mismatch', 'Each failed static-style check needs a bound finding and passing checks cannot retain one.', `${shotField}.checks.${check}`);
        }
      }
    }
  }
}

function validateAdjacentReviews(reviews, findings, context) {
  const orderedShots = [...context.shotToBlock.keys()];
  const expectedPairs = orderedShots.slice(1).map((right, index) => {
    const left = orderedShots[index];
    return { left, right, owner: context.shotToBlock.get(right) };
  });
  if (!Array.isArray(reviews) || reviews.length !== expectedPairs.length) {
    fail('style_review_adjacent_coverage_incomplete', 'Every adjacent result pair must be reviewed once.', '$.review.adjacent_result_reviews');
  }
  for (const [index, record] of reviews.entries()) {
    const field = `$.review.adjacent_result_reviews[${index}]`;
    exact(record, [
      'left_shot_id',
      'right_shot_id',
      'owner_block_id',
      'left_result_sha256',
      'right_result_sha256',
      'only_text_changed',
      'finding_ids',
    ], 'style_review_adjacent_invalid', field);
    const pair = expectedPairs[index];
    const pairFindings = findings.filter((finding) => finding.criterion === 'adjacent_result_text_swap'
      && finding.block_id === pair.owner && same(finding.shot_ids, [pair.left, pair.right]));
    if (record.left_shot_id !== pair.left || record.right_shot_id !== pair.right
      || record.owner_block_id !== pair.owner
      || record.left_result_sha256 !== context.resultHashes.get(pair.left)
      || record.right_result_sha256 !== context.resultHashes.get(pair.right)
      || typeof record.only_text_changed !== 'boolean'
      || !Array.isArray(record.finding_ids)
      || !same(record.finding_ids, pairFindings.map((finding) => finding.finding_id))
      || record.only_text_changed !== (pairFindings.length > 0)) {
      fail('style_review_adjacent_invalid', 'Adjacent-result review is missing, stale, or not tied to its block-scoped finding.', field);
    }
  }
  const adjacentFindingCount = findings.filter((finding) => finding.criterion === 'adjacent_result_text_swap').length;
  const linkedCount = reviews.reduce((sum, record) => sum + record.finding_ids.length, 0);
  if (adjacentFindingCount !== linkedCount) {
    fail('style_review_adjacent_invalid', 'An adjacent-result finding is orphaned or duplicated.');
  }
}

function validateRevisionAggregation(aggregates, findings, expected) {
  const expectedAggregates = expected.blocks.map((block) => {
    const ids = findings.filter((finding) => finding.block_id === block.block_id).map((finding) => finding.finding_id);
    return { block_id: block.block_id, finding_count: ids.length, finding_ids: ids };
  }).filter((item) => item.finding_count > 0);
  if (!Array.isArray(aggregates) || !same(aggregates, expectedAggregates)) {
    fail('style_review_revision_aggregation_invalid', 'Revision findings must be aggregated exactly once by owning block.', '$.review.block_revision_findings');
  }
}

function validateDecision(review, findings) {
  exact(review.decision, [
    'outcome',
    'viewed_all_pages',
    'read_all_bound_sources',
    'static_scope_only',
    'animation_approved_from_stills',
    'rhythm_approved_from_stills',
    'transitions_approved_from_stills',
    'five_phase_lifecycle_approved_from_stills',
    'seek_behavior_approved_from_stills',
    'block_revision_count',
    'finding_count',
    'decision_sha256',
  ], 'style_review_decision_invalid', '$.review.decision');
  const expectedOutcome = findings.length === 0 ? 'approved' : 'revision_required';
  const expectedRevisionCount = new Set(findings.map((finding) => finding.block_id)).size;
  const { decision_sha256: declaredDecisionHash, ...decisionCore } = review.decision;
  const calculatedDecisionHash = fingerprintArtifactValue({
    reviewed_blocks: review.reviewed_blocks,
    adjacent_result_reviews: review.adjacent_result_reviews,
    findings: review.findings,
    block_revision_findings: review.block_revision_findings,
    decision: decisionCore,
  });
  if (review.decision.outcome !== expectedOutcome
    || review.decision.viewed_all_pages !== true
    || review.decision.read_all_bound_sources !== true
    || review.decision.static_scope_only !== true
    || review.decision.animation_approved_from_stills !== false
    || review.decision.rhythm_approved_from_stills !== false
    || review.decision.transitions_approved_from_stills !== false
    || review.decision.five_phase_lifecycle_approved_from_stills !== false
    || review.decision.seek_behavior_approved_from_stills !== false
    || review.decision.block_revision_count !== expectedRevisionCount
    || review.decision.finding_count !== findings.length
    || declaredDecisionHash !== calculatedDecisionHash) {
    fail('style_review_decision_invalid', 'Style decision is incoherent or claims forbidden temporal authority.', '$.review.decision');
  }
}

/**
 * Validate the independent main-agent static-style decision against every
 * frozen block source, a fresh operator-trusted deterministic capture rerun,
 * every submitted entry/result/exit still, and objective pixel-facts page.
 */
export async function validateStyleConformanceReview({
  review,
  packetIndexBytes,
  artifactBytes,
  expected,
  trustedCaptureRunner,
} = {}) {
  validateExpected(expected);
  exact(review, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'gate',
    'authority_scope',
    'subject_packet_index_sha256',
    'visual_grammar_sha256',
    'whole_film_rules_sha256',
    'design_slice_sha256',
    'chunk_plan_sha256',
    'projection_sha256',
    'review_generation',
    'reviewer_role',
    'reviewer_model_id',
    'reviewer_isolation_sha256',
    'reviewed_blocks',
    'adjacent_result_reviews',
    'findings',
    'block_revision_findings',
    'decision',
    'review_sha256',
  ], 'style_review_invalid', '$.review');
  const indexed = validateIndex(packetIndexBytes, artifactBytes, expected);
  const validatedBlocks = [];
  for (const rawBlock of indexed.block_pages) {
    let block = validateBlockAuthoringCriteria(rawBlock, indexed);
    const trustedCapture = await runTrustedCapture(block, indexed, expected, trustedCaptureRunner);
    block = validateRendererReceipt(block, block.expected, trustedCapture);
    block = await validateEvidencePage(block, artifactBytes, indexed.artifact_ids, indexed, expected);
    validatedBlocks.push(block);
  }
  indexed.block_pages = validatedBlocks;
  validateReviewIdentity(review, indexed, expected);

  if (!Array.isArray(review.findings) || review.findings.length > 512) {
    fail('style_review_finding_invalid', 'Style-review findings must be a bounded array.', '$.review.findings');
  }
  const context = {
    blockById: new Map(indexed.block_pages.map((block) => [block.expected.block_id, block])),
    shotToBlock: new Map(),
    resultHashes: new Map(),
    allEvidenceHashes: new Set([indexed.index_bytes_sha256]),
    findingIds: new Set(),
  };
  for (const block of indexed.block_pages) {
    block.expected.shot_ids.forEach((shotId) => context.shotToBlock.set(shotId, block.expected.block_id));
    block.result_hashes.forEach((hash, shotId) => context.resultHashes.set(shotId, hash));
    block.expected.source_sha256s.forEach((hash) => context.allEvidenceHashes.add(hash));
    context.allEvidenceHashes.add(block.authoring_context_sha256);
    context.allEvidenceHashes.add(block.shared_directive_sha256);
    block.shot_recipe_sha256s.forEach((hash) => context.allEvidenceHashes.add(hash));
    context.allEvidenceHashes.add(block.renderer_receipt.receipt_sha256);
    context.allEvidenceHashes.add(block.page_bytes_sha256);
    block.still_hashes.forEach((hash) => context.allEvidenceHashes.add(hash));
    context.allEvidenceHashes.add(block.pixel_facts_bytes_sha256);
    context.allEvidenceHashes.add(block.pixel_facts.facts_sha256);
  }
  const findings = review.findings.map((finding, index) => validateFinding(finding, index, context));
  validateReviewedBlocks(review.reviewed_blocks, findings, indexed, context);
  validateAdjacentReviews(review.adjacent_result_reviews, findings, context);
  validateRevisionAggregation(review.block_revision_findings, findings, expected);
  validateDecision(review, findings);

  const { review_sha256: declaredReviewHash, ...reviewCore } = review;
  if (!isSha(declaredReviewHash) || declaredReviewHash !== fingerprintArtifactValue(reviewCore)) {
    fail('style_review_hash_mismatch', 'Style-review hash does not match the exact review artifact.', '$.review.review_sha256');
  }
  return {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: TOPOLOGY_ID,
    gate: GATE,
    authority_scope: AUTHORITY,
    projection_sha256: expected.projection_sha256,
    review_generation: expected.review_generation,
    status: review.decision.outcome,
    block_count: indexed.block_pages.length,
    shot_count: context.shotToBlock.size,
    finding_count: findings.length,
    revision_block_ids: review.block_revision_findings.map((item) => item.block_id),
    review_sha256: review.review_sha256,
  };
}

function usage() {
  return `Usage:
  node validate-style-conformance-review.mjs --review <review.json>
       --packet-index <packet-index.json> --artifact-map <artifact-map.json>
       --artifact-root <artifact-root> --expected <expected-bindings.json>
       --capture-runner <trusted-adapter.mjs>
       [--output <receipt.json>]

The artifact map is a JSON object from opaque artifact_id to a portable path
relative to --artifact-root. Realpath escape and every symlink component fail.
The capture-runner module must be operator-pinned outside producer control and
export captureStyleFrames(request) for ${TRUSTED_CAPTURE_RUNNER_CONTRACT}.
This gate reviews static style only. It cannot approve animation, rhythm,
transitions, five-phase lifecycle execution, or seek behavior from stills.
`;
}

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const allowed = new Set([
    '--review',
    '--packet-index',
    '--artifact-map',
    '--artifact-root',
    '--expected',
    '--capture-runner',
    '--output',
  ]);
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || typeof value !== 'string' || value.startsWith('--')) {
      fail('style_review_cli_invalid', 'Invalid command-line arguments. Use --help.');
    }
    result[key.slice(2)] = value;
  }
  for (const required of ['review', 'packet-index', 'artifact-map', 'artifact-root', 'expected', 'capture-runner']) {
    if (!result[required]) fail('style_review_cli_invalid', `--${required} is required. Use --help.`);
  }
  return result;
}

export async function loadStyleArtifactMap(artifactMap, { root } = {}) {
  if (!artifactMap || typeof artifactMap !== 'object' || Array.isArray(artifactMap)
    || typeof root !== 'string' || !root) {
    fail('style_review_artifact_map_invalid', 'Artifact map and its real root are required.');
  }
  const lexicalRoot = path.resolve(root);
  let rootStat;
  let resolvedRoot;
  try {
    const filesystemRoot = path.parse(lexicalRoot).root;
    let rootCursor = filesystemRoot;
    for (const component of path.relative(filesystemRoot, lexicalRoot).split(path.sep).filter(Boolean)) {
      rootCursor = path.join(rootCursor, component);
      const componentStat = await lstat(rootCursor);
      if (componentStat.isSymbolicLink()) {
        fail('style_review_artifact_root_symlink_ancestor', 'Artifact root cannot traverse a symlink component.');
      }
    }
    rootStat = await lstat(lexicalRoot);
    resolvedRoot = await realpath(lexicalRoot);
  } catch (error) {
    if (error instanceof StyleConformanceReviewError) throw error;
    fail('style_review_artifact_root_invalid', 'Artifact root is missing or cannot be resolved.');
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    fail('style_review_artifact_root_symlink', 'Artifact root must be a real directory, not a symlink.');
  }
  const artifactBytes = new Map();
  for (const [artifactId, locator] of Object.entries(artifactMap)) {
    if (!ARTIFACT_ID.test(artifactId) || typeof locator !== 'string' || !locator
      || locator.includes('\\') || path.posix.isAbsolute(locator)
      || path.posix.normalize(locator) !== locator || locator === '.'
      || locator.startsWith('../') || locator.includes('/../')) {
      fail('style_review_artifact_map_invalid', 'Artifact map contains an invalid ID or portable locator.');
    }
    const target = path.resolve(lexicalRoot, locator);
    if (!target.startsWith(`${lexicalRoot}${path.sep}`)) {
      fail('style_review_artifact_realpath_escape', `Mapped artifact ${artifactId} escapes its lexical root.`);
    }
    let cursor = lexicalRoot;
    for (const component of locator.split('/')) {
      cursor = path.join(cursor, component);
      let componentStat;
      try {
        componentStat = await lstat(cursor);
      } catch {
        fail('style_review_page_missing', `Mapped artifact ${artifactId} is missing.`);
      }
      if (componentStat.isSymbolicLink()) {
        fail('style_review_artifact_symlink_ancestor', `Mapped artifact ${artifactId} traverses a symlink component.`);
      }
    }
    const stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail('style_review_artifact_map_invalid', `Mapped artifact ${artifactId} is not a regular file.`);
    }
    const resolvedTarget = await realpath(target);
    if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
      fail('style_review_artifact_realpath_escape', `Mapped artifact ${artifactId} escapes its real root.`);
    }
    artifactBytes.set(artifactId, await readFile(resolvedTarget));
  }
  return artifactBytes;
}

async function readJson(filename, code) {
  try {
    return JSON.parse(await readFile(filename, 'utf8'));
  } catch {
    fail(code, `Cannot read valid JSON from ${path.basename(filename)}.`);
  }
}

async function cli(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  const review = await readJson(args.review, 'style_review_input_unreadable');
  const expected = await readJson(args.expected, 'style_review_expected_invalid');
  const artifactMap = await readJson(args['artifact-map'], 'style_review_artifact_map_invalid');
  const artifactBytes = await loadStyleArtifactMap(artifactMap, { root: args['artifact-root'] });
  let trustedCaptureRunner;
  try {
    const adapterPath = await realpath(path.resolve(args['capture-runner']));
    const adapter = await import(pathToFileURL(adapterPath).href);
    trustedCaptureRunner = adapter.captureStyleFrames;
  } catch {
    fail('style_review_capture_runner_required', 'Trusted capture-runner module cannot be loaded.');
  }
  if (typeof trustedCaptureRunner !== 'function') {
    fail('style_review_capture_runner_required', 'Trusted capture-runner module must export captureStyleFrames.');
  }
  const result = await validateStyleConformanceReview({
    review,
    packetIndexBytes: await readFile(args['packet-index']),
    artifactBytes,
    expected,
    trustedCaptureRunner,
  });
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (args.output) await writeFile(args.output, output, 'utf8');
  else process.stdout.write(output);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  cli(process.argv.slice(2)).catch((error) => {
    const code = error instanceof StyleConformanceReviewError ? error.code : 'style_review_internal_error';
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
