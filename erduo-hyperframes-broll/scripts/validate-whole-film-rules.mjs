#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprintValue } from './state.mjs';
import {
  AUTHORING_TOPOLOGY_ID,
  extractBlockScopedRecipes,
  validateVisualGrammarProgram,
} from './validate-visual-grammar-program.mjs';

export const WHOLE_FILM_RULES_CONTRACT =
  'scripts/validate-whole-film-rules.mjs#schema-v1';

const SHA256 = /^[0-9a-f]{64}$/u;
const ID = /^[a-z0-9][a-z0-9-]{1,63}$/u;
const BLOCK_ID = /^B[0-9]{3}$/u;
const PRIVATE_INSTRUCTION = /(?:(?:system|developer|private|hidden)\s+(?:prompt|instruction)|系统提示词|私有提示词|隐藏指令)/iu;
const BINDING_FIELDS = [
  'confirmed_brief_sha256',
  'parsed_srt_sha256',
  'shot_plan_sha256',
  'projection_sha256',
  'design_slice_sha256',
  'display_selection_sha256',
  'font_package_sha256',
  'design_selection_sha256',
  'base_template_id',
  'base_template_sha256',
  'design_library_snapshot_sha256',
  'visual_grammar_program_sha256',
  'asset_route_policy_sha256',
  'delivery_profile_sha256',
  'namespace_policy_sha256',
  'seam_policy_sha256',
  'anti_template_policy_sha256',
];
const PROGRAM_BINDING_FIELDS = [
  'confirmed_brief_sha256',
  'parsed_srt_sha256',
  'shot_plan_sha256',
  'projection_sha256',
  'design_slice_sha256',
  'display_selection_sha256',
  'font_package_sha256',
  'design_selection_sha256',
  'base_template_id',
  'base_template_sha256',
  'design_library_snapshot_sha256',
];

export class WholeFilmRulesError extends Error {
  constructor(code, message, block) {
    super(message);
    this.name = 'WholeFilmRulesError';
    this.code = code;
    if (block !== undefined) this.block = block;
  }
}

function fail(code, message, block) {
  throw new WholeFilmRulesError(code, message, block);
}

function exact(value, fields, code = 'whole_film_rules_schema_invalid', message = 'Whole-film rules shape is invalid.', block) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, message, block);
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) {
    fail(code, message, block);
  }
}

function id(value, code, message, block) {
  if (typeof value !== 'string' || !ID.test(value)) fail(code, message, block);
  return value;
}

function hash(value, code, message) {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(code, message);
  return value;
}

function integer(value, code, message, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(code, message);
  return value;
}

export function containsForbiddenLocalPathToken(value) {
  if (typeof value !== 'string') return false;
  const boundary = String.raw`(?:^|[\s"'([{=])`;
  const tokenEnd = String.raw`[^\s"'()[\]{}<>]*`;
  return [
    new RegExp(`${boundary}file:(?://)?${tokenEnd}`, 'iu'),
    new RegExp(`${boundary}~[\\\\/]${tokenEnd}`, 'iu'),
    new RegExp(`${boundary}[A-Za-z]:[\\\\/]${tokenEnd}`, 'u'),
    new RegExp(`${boundary}\\\\\\\\[^\\\\\\s]+\\\\${tokenEnd}`, 'u'),
    new RegExp(`${boundary}//[^/\\s]+/${tokenEnd}`, 'u'),
    new RegExp(`${boundary}/(?!/)[^\\s"'()[\\]{}<>]*`, 'u'),
  ].some((pattern) => pattern.test(value));
}

function text(value, code, message, { min = 1, max = 500 } = {}) {
  if (
    typeof value !== 'string'
    || value !== value.trim()
    || value.trim().length < min
    || value.length > max
    || containsForbiddenLocalPathToken(value)
    || PRIVATE_INSTRUCTION.test(value)
  ) fail(code, message);
  return value.trim();
}

function validateBindings(value) {
  exact(value, BINDING_FIELDS, 'whole_film_rules_binding_invalid', 'Whole-film binding shape is invalid.');
  return Object.fromEntries(BINDING_FIELDS.map((field) => [
    field,
    field === 'base_template_id'
      ? id(value[field], 'whole_film_rules_binding_invalid', 'Whole-film base template ID is invalid.')
      : hash(value[field], 'whole_film_rules_binding_invalid', `Whole-film binding ${field} is invalid.`),
  ]));
}

function validateTimingTruth(value, bindings) {
  exact(value, [
    'time_unit',
    'srt_is_only_upstream_time_truth',
    'shared_projection_is_only_frame_derivation',
    'projection_contract',
    'projection_rule',
    'projection_sha256',
    'local_retiming_forbidden',
  ], 'whole_film_rules_timing_invalid', 'Timing-truth policy shape is invalid.');
  if (
    value.time_unit !== 'integer-milliseconds'
    || value.srt_is_only_upstream_time_truth !== true
    || value.shared_projection_is_only_frame_derivation !== true
    || value.projection_contract !== 'scripts/compile-frame-projection.mjs#schema-v1'
    || value.projection_rule !== 'absolute-ms-nearest-half-up-shared-boundary-v1'
    || value.projection_sha256 !== bindings.projection_sha256
    || value.local_retiming_forbidden !== true
  ) fail('whole_film_rules_timing_invalid', 'SRT milliseconds and the bound shared projection must remain the only timing authority.');
  return value;
}

function validateSharedVisualGrammar(value, document, programResult) {
  exact(value, [
    'program_id',
    'program_sha256',
    'identity_sha256',
    'anti_identity_sha256',
    'stable_invariants_sha256',
    'shared_directive_sha256',
    'variation_axes_sha256',
    'exhaustion_cooldown_sha256',
    'block_recipe_contract',
    'recipe_hash_preservation_required',
  ], 'whole_film_rules_visual_grammar_invalid', 'Shared visual grammar binding shape is invalid.');
  if (
    value.program_id !== programResult.program_id
    || value.program_sha256 !== programResult.program_sha256
    || value.program_sha256 !== document.bindings.visual_grammar_program_sha256
    || value.identity_sha256 !== programResult.identity_sha256
    || value.anti_identity_sha256 !== programResult.anti_identity_sha256
    || value.stable_invariants_sha256 !== programResult.stable_invariants_sha256
    || value.shared_directive_sha256 !== programResult.shared_directive_sha256
    || value.variation_axes_sha256 !== programResult.variation_axes_sha256
    || value.exhaustion_cooldown_sha256 !== programResult.exhaustion_cooldown_sha256
    || value.block_recipe_contract !== 'visual-grammar-block-recipe-packet#schema-v1'
    || value.recipe_hash_preservation_required !== true
  ) fail('whole_film_rules_visual_grammar_invalid', 'Shared visual grammar hashes or extraction contract do not match the validated program.');
  return value;
}

function validateAssetRoutePolicy(value) {
  exact(value, ['route_order', 'ordinary_primary_required', 'native_auxiliary_only', 'native_primary_allowed'], 'whole_film_rules_policy_invalid', 'Asset-route policy shape is invalid.');
  if (
    JSON.stringify(value.route_order) !== JSON.stringify(['user-media', 'image-generation', 'pexels', 'native-auxiliary'])
    || value.ordinary_primary_required !== true
    || value.native_auxiliary_only !== true
    || value.native_primary_allowed !== false
  ) fail('whole_film_rules_policy_invalid', 'Asset route must retain the frozen ordinary-primary order.');
  return value;
}

function greatestCommonDivisor(left, right) {
  let a = BigInt(left);
  let b = BigInt(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function validateDeliveryProfile(value) {
  exact(value, ['profile_id', 'width', 'height', 'fps', 'codec', 'audio_policy'], 'whole_film_rules_policy_invalid', 'Delivery profile shape is invalid.');
  exact(value.fps, ['numerator', 'denominator'], 'whole_film_rules_policy_invalid', 'Delivery frame rate shape is invalid.');
  id(value.profile_id, 'whole_film_rules_policy_invalid', 'Delivery profile ID is invalid.');
  integer(value.width, 'whole_film_rules_policy_invalid', 'Delivery width is invalid.', 1);
  integer(value.height, 'whole_film_rules_policy_invalid', 'Delivery height is invalid.', 1);
  integer(value.fps.numerator, 'whole_film_rules_policy_invalid', 'Delivery frame-rate numerator is invalid.', 1);
  integer(value.fps.denominator, 'whole_film_rules_policy_invalid', 'Delivery frame-rate denominator is invalid.', 1);
  if (greatestCommonDivisor(value.fps.numerator, value.fps.denominator) !== 1n) {
    fail('whole_film_rules_policy_invalid', 'Delivery frame rate must be a reduced rational pair.');
  }
  text(value.codec, 'whole_film_rules_policy_invalid', 'Delivery codec is invalid.');
  if (!['required', 'forbidden', 'preserve-if-present'].includes(value.audio_policy)) {
    fail('whole_film_rules_policy_invalid', 'Delivery audio policy is invalid.');
  }
  return value;
}

function validateNamespacePolicy(value) {
  exact(value, [
    'scope',
    'block_namespace_pattern',
    'dom_id_template',
    'selector_uniqueness',
    'cross_block_duplicate_ids_forbidden',
    'author_may_write_outside_allocated_namespace',
  ], 'whole_film_rules_policy_invalid', 'Namespace policy shape is invalid.');
  if (
    value.scope !== 'global-across-all-blocks'
    || value.block_namespace_pattern !== '^b[0-9]{3}$'
    || value.dom_id_template !== '{block_namespace}--{shot_id}--{local_id}'
    || value.selector_uniqueness !== 'global'
    || value.cross_block_duplicate_ids_forbidden !== true
    || value.author_may_write_outside_allocated_namespace !== false
  ) fail('whole_film_rules_policy_invalid', 'Namespace policy identity is invalid.');
  return value;
}

function validateSeamPolicy(value) {
  exact(value, [
    'lifecycle_order',
    'timeline_gap_ms',
    'timeline_overlap_ms',
    'entry_accepts_preceding_exit',
    'exit_hands_off_to_following_entry',
    'cross_block_obligations_required',
    'integrator_repair_forbidden',
  ], 'whole_film_rules_policy_invalid', 'Seam policy shape is invalid.');
  if (
    JSON.stringify(value.lifecycle_order) !== JSON.stringify(['entry', 'action', 'result', 'hold', 'exit'])
    || value.timeline_gap_ms !== 0
    || value.timeline_overlap_ms !== 0
    || value.entry_accepts_preceding_exit !== true
    || value.exit_hands_off_to_following_entry !== true
    || value.cross_block_obligations_required !== true
    || value.integrator_repair_forbidden !== true
  ) fail('whole_film_rules_policy_invalid', 'Seam policy must preserve exact coverage and the five-phase handoff.');
  return value;
}

function validateAntiTemplatePolicy(value) {
  exact(value, [
    'adjacent_difference_facts_required',
    'program_cooldown_enforced',
    'whole_film_signature_gate_contract',
    'whole_film_signature_gate_required',
    'content_driven_exceptions_only',
    'deterministic_gate_may_issue_aesthetic_verdict',
  ], 'whole_film_rules_policy_invalid', 'Anti-template policy shape is invalid.');
  if (
    value.adjacent_difference_facts_required !== true
    || value.program_cooldown_enforced !== true
    || value.whole_film_signature_gate_contract !== 'scripts/validate-anti-template-signatures.mjs#schema-v1'
    || value.whole_film_signature_gate_required !== true
    || value.content_driven_exceptions_only !== true
    || value.deterministic_gate_may_issue_aesthetic_verdict !== false
  ) fail('whole_film_rules_policy_invalid', 'Anti-template policy identity is invalid.');
  return value;
}

function validateDistributionPolicy(value) {
  exact(value, [
    'progressive_disclosure_required',
    'full_program_kept_in_private_artifact_store',
    'block_recipe_packet_only',
    'max_block_shots',
    'max_block_span_ms',
    'long_shot_singleton_allowed',
    'private_locations_exposed',
    'private_author_instructions_exposed',
  ], 'whole_film_rules_policy_invalid', 'Distribution policy shape is invalid.');
  if (
    value.progressive_disclosure_required !== true
    || value.full_program_kept_in_private_artifact_store !== true
    || value.block_recipe_packet_only !== true
    || value.max_block_shots !== 8
    || value.max_block_span_ms !== 45_000
    || value.long_shot_singleton_allowed !== true
    || value.private_locations_exposed !== false
    || value.private_author_instructions_exposed !== false
  ) fail('whole_film_rules_policy_invalid', 'Progressive-disclosure policy identity is invalid.');
  return value;
}

function validateAuthoringAuthority(value) {
  exact(value, [
    'creative_author_required',
    'validator_authority',
    'validator_may_generate_recipe',
    'validator_may_issue_aesthetic_verdict',
  ], 'whole_film_rules_policy_invalid', 'Authoring authority shape is invalid.');
  if (
    value.creative_author_required !== true
    || value.validator_authority !== 'deterministic-structural-rejection-only'
    || value.validator_may_generate_recipe !== false
    || value.validator_may_issue_aesthetic_verdict !== false
  ) fail('whole_film_rules_policy_invalid', 'Deterministic validation cannot replace creative authorship.');
  return value;
}

function rulesCore(document) {
  const { whole_film_rules_sha256: ignored, ...core } = document;
  return core;
}

export function validateWholeFilmRules(document, {
  visualGrammarProgram,
  projection,
  designSelection,
  baseTemplate,
  nativeBaseCompiler,
  designLibrary,
  expectedBindings,
} = {}) {
  exact(document, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'artifact_type',
    'rules_contract',
    'rules_id',
    'bindings',
    'timing_truth',
    'shared_visual_grammar',
    'asset_route_policy',
    'delivery_profile',
    'namespace_policy',
    'seam_policy',
    'anti_template_policy',
    'distribution_policy',
    'authoring_authority',
    'whole_film_rules_sha256',
  ]);
  if (
    document.schema_version !== 1
    || document.pipeline_contract_version !== 2
    || document.authoring_topology_id !== AUTHORING_TOPOLOGY_ID
    || document.artifact_type !== 'whole-film-rules'
    || document.rules_contract !== WHOLE_FILM_RULES_CONTRACT
  ) fail('whole_film_rules_identity_invalid', 'Whole-film rules identity is invalid.');
  id(document.rules_id, 'whole_film_rules_identity_invalid', 'Whole-film rules ID is invalid.');
  const bindings = validateBindings(document.bindings);
  if (
    !visualGrammarProgram
    || !projection
    || !designSelection
    || !designLibrary
    || (
      designSelection.base_template === 'hyperframes-native'
        ? !nativeBaseCompiler || baseTemplate !== undefined
        : !baseTemplate
    )
  ) {
    fail('whole_film_rules_upstream_required', 'The exact visual grammar program, shared projection and design artifacts are required.');
  }
  let programResult;
  try {
    programResult = validateVisualGrammarProgram(visualGrammarProgram, {
      projection,
      designSelection,
      baseTemplate,
      nativeBaseCompiler,
      designLibrary,
    });
  } catch (error) {
    fail('whole_film_rules_visual_grammar_invalid', `Bound visual grammar program is invalid: ${error.code ?? 'unknown'}.`);
  }
  for (const field of PROGRAM_BINDING_FIELDS) {
    if (bindings[field] !== visualGrammarProgram.bindings[field]) {
      fail('whole_film_rules_binding_mismatch', `Whole-film rules do not match the visual grammar binding ${field}.`);
    }
  }
  if (bindings.visual_grammar_program_sha256 !== programResult.program_sha256) {
    fail('whole_film_rules_binding_mismatch', 'Whole-film rules do not match the validated visual grammar program hash.');
  }
  if (expectedBindings !== undefined) {
    exact(expectedBindings, BINDING_FIELDS, 'whole_film_rules_binding_invalid', 'Expected binding map shape is invalid.');
    for (const field of BINDING_FIELDS) {
      if (expectedBindings[field] !== bindings[field]) {
        fail('whole_film_rules_binding_mismatch', `Whole-film rules do not match expected binding ${field}.`);
      }
    }
  }
  const timingTruth = validateTimingTruth(document.timing_truth, bindings);
  const sharedVisualGrammar = validateSharedVisualGrammar(document.shared_visual_grammar, document, programResult);
  const assetRoutePolicy = validateAssetRoutePolicy(document.asset_route_policy);
  const deliveryProfile = validateDeliveryProfile(document.delivery_profile);
  if (fingerprintValue(deliveryProfile.fps) !== fingerprintValue(projection.fps)) {
    fail('whole_film_rules_timing_invalid', 'Delivery FPS must equal the bound shared projection FPS.');
  }
  const namespacePolicy = validateNamespacePolicy(document.namespace_policy);
  const seamPolicy = validateSeamPolicy(document.seam_policy);
  const antiTemplatePolicy = validateAntiTemplatePolicy(document.anti_template_policy);
  const distributionPolicy = validateDistributionPolicy(document.distribution_policy);
  const authoringAuthority = validateAuthoringAuthority(document.authoring_authority);
  const policyBindings = [
    ['asset_route_policy_sha256', assetRoutePolicy],
    ['delivery_profile_sha256', deliveryProfile],
    ['namespace_policy_sha256', namespacePolicy],
    ['seam_policy_sha256', seamPolicy],
    ['anti_template_policy_sha256', antiTemplatePolicy],
  ];
  for (const [bindingField, policy] of policyBindings) {
    if (bindings[bindingField] !== fingerprintValue(policy)) {
      fail('whole_film_rules_policy_hash_mismatch', `${bindingField} does not match its frozen policy object.`);
    }
  }
  const rulesSha256 = fingerprintValue(rulesCore(document));
  if (
    !SHA256.test(document.whole_film_rules_sha256 ?? '')
    || document.whole_film_rules_sha256 !== rulesSha256
  ) fail('whole_film_rules_hash_mismatch', 'Whole-film rules hash does not match the complete immutable object.');
  return {
    ok: true,
    authority: 'deterministic-structural-rejection-only',
    pipeline_contract_version: 2,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    rules_id: document.rules_id,
    whole_film_rules_sha256: rulesSha256,
    visual_grammar_program_sha256: programResult.program_sha256,
    native_compiler_source_bundle_sha256:
      programResult.native_compiler_source_bundle_sha256,
    timing_truth_sha256: fingerprintValue(timingTruth),
    shared_visual_grammar_sha256: fingerprintValue(sharedVisualGrammar),
    distribution_policy_sha256: fingerprintValue(distributionPolicy),
    authoring_authority_sha256: fingerprintValue(authoringAuthority),
  };
}

function validateSeamObligation(value, side, blockId) {
  exact(value, ['neighbor_block_id', 'obligation'], 'whole_film_rules_block_scope_invalid', `${side} seam obligation shape is invalid.`, blockId);
  const blockNumber = Number(blockId.slice(1));
  if (value.neighbor_block_id === null) {
    if (value.obligation !== 'none') fail('whole_film_rules_block_scope_invalid', `Boundary ${side} seam must use obligation none.`, blockId);
    if (side === 'preceding' && blockNumber > 1) {
      fail('whole_film_rules_block_scope_invalid', 'Every non-first block requires its preceding seam obligation.', blockId);
    }
  } else if (
    typeof value.neighbor_block_id !== 'string'
    || !BLOCK_ID.test(value.neighbor_block_id)
    || value.neighbor_block_id === blockId
  ) fail('whole_film_rules_block_scope_invalid', `${side} seam neighbor is invalid.`, blockId);
  else {
    const expectedNumber = side === 'preceding' ? blockNumber - 1 : blockNumber + 1;
    const expectedNeighbor = `B${String(expectedNumber).padStart(3, '0')}`;
    if (value.neighbor_block_id !== expectedNeighbor) {
      fail('whole_film_rules_block_scope_invalid', `${side} seam neighbor must be the adjacent block.`, blockId);
    }
    text(value.obligation, 'whole_film_rules_block_scope_invalid', `${side} seam obligation is invalid.`, { min: 12 });
  }
  return structuredClone(value);
}

export function extractWholeFilmBlockContext(document, block, {
  visualGrammarProgram,
  projection,
  designSelection,
  baseTemplate,
  nativeBaseCompiler,
  designLibrary,
} = {}) {
  const validation = validateWholeFilmRules(document, {
    visualGrammarProgram,
    projection,
    designSelection,
    baseTemplate,
    nativeBaseCompiler,
    designLibrary,
  });
  exact(block, [
    'block_id',
    'shot_ids',
    'start_ms',
    'end_ms',
    'start_frame',
    'end_frame',
    'namespace',
    'preceding_seam',
    'following_seam',
  ], 'whole_film_rules_block_scope_invalid', 'Block authoring context scope is invalid.', block?.block_id);
  if (
    !BLOCK_ID.test(block.block_id ?? '')
    || !new RegExp(document.namespace_policy.block_namespace_pattern, 'u').test(block.namespace ?? '')
    || block.namespace !== block.block_id.toLowerCase()
  ) {
    fail('whole_film_rules_block_scope_invalid', 'Block ID or namespace does not match the frozen policy.', block.block_id);
  }
  const recipePacket = extractBlockScopedRecipes(visualGrammarProgram, {
    block_id: block.block_id,
    shot_ids: block.shot_ids,
    start_ms: block.start_ms,
    end_ms: block.end_ms,
    start_frame: block.start_frame,
    end_frame: block.end_frame,
    namespace: block.namespace,
  }, {
    projection,
    designSelection,
    baseTemplate,
    nativeBaseCompiler,
    designLibrary,
  });
  if (
    recipePacket.shared_visual_authoring_directive.directive_sha256
    !== document.shared_visual_grammar.shared_directive_sha256
  ) fail('whole_film_rules_block_scope_invalid', 'Block directive does not match the whole-film visual grammar binding.', block.block_id);
  const programRecipes = visualGrammarProgram.pages.flatMap((page) => page.recipes);
  const trueFirstShotId = programRecipes[0].shot_id;
  const trueFinalShotId = programRecipes.at(-1).shot_id;
  const scopeStartsAtTrueFirst = recipePacket.shot_ids[0] === trueFirstShotId;
  const scopeEndsAtTrueFinal = recipePacket.shot_ids.at(-1) === trueFinalShotId;
  if (
    (block.preceding_seam?.neighbor_block_id === null) !== scopeStartsAtTrueFirst
    || (block.following_seam?.neighbor_block_id === null) !== scopeEndsAtTrueFinal
    || (scopeStartsAtTrueFirst && block.block_id !== 'B001')
    || (block.block_id === 'B001' && !scopeStartsAtTrueFirst)
  ) fail('whole_film_rules_block_scope_invalid', 'Boundary seam nullability must match the true first and final program shots.', block.block_id);
  const precedingSeam = validateSeamObligation(block.preceding_seam, 'preceding', block.block_id);
  const followingSeam = validateSeamObligation(block.following_seam, 'following', block.block_id);
  const core = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    artifact_type: 'whole-film-block-authoring-context',
    block_id: block.block_id,
    namespace: block.namespace,
    whole_film_rules_sha256: validation.whole_film_rules_sha256,
    bindings: document.bindings,
    timing_truth: document.timing_truth,
    shared_visual_grammar: document.shared_visual_grammar,
    policies: {
      asset_route: document.asset_route_policy,
      delivery_profile: document.delivery_profile,
      namespace: document.namespace_policy,
      seam: document.seam_policy,
      anti_template: document.anti_template_policy,
      distribution: document.distribution_policy,
      authoring_authority: document.authoring_authority,
    },
    preceding_seam: precedingSeam,
    following_seam: followingSeam,
    recipe_packet: recipePacket,
  };
  return { ...core, context_sha256: fingerprintValue(core) };
}

export function validateWholeFilmBlockContext(context, document, block, {
  visualGrammarProgram,
  projection,
  designSelection,
  baseTemplate,
  nativeBaseCompiler,
  designLibrary,
} = {}) {
  const expected = extractWholeFilmBlockContext(document, block, {
    visualGrammarProgram,
    projection,
    designSelection,
    baseTemplate,
    nativeBaseCompiler,
    designLibrary,
  });
  exact(context, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'artifact_type',
    'block_id',
    'namespace',
    'whole_film_rules_sha256',
    'bindings',
    'timing_truth',
    'shared_visual_grammar',
    'policies',
    'preceding_seam',
    'following_seam',
    'recipe_packet',
    'context_sha256',
  ], 'whole_film_rules_block_context_invalid', 'Whole-film block context shape is invalid.', block?.block_id);
  const { context_sha256: declaredContextSha256, ...contextCore } = context;
  let actualContextSha256;
  let actualDocumentSha256;
  let expectedDocumentSha256;
  try {
    actualContextSha256 = fingerprintValue(contextCore);
    actualDocumentSha256 = fingerprintValue(context);
    expectedDocumentSha256 = fingerprintValue(expected);
  } catch {
    fail('whole_film_rules_block_context_invalid', 'Whole-film block context contains a non-canonical value.', block?.block_id);
  }
  if (
    declaredContextSha256 !== actualContextSha256
    || actualDocumentSha256 !== expectedDocumentSha256
  ) fail('whole_film_rules_block_context_invalid', 'Whole-film block context does not match the immutable rules, program and block scope.', block?.block_id);
  return {
    ok: true,
    authority: 'deterministic-structural-rejection-only',
    block_id: expected.block_id,
    whole_film_rules_sha256: expected.whole_film_rules_sha256,
    visual_grammar_program_sha256: expected.recipe_packet.visual_grammar_program_sha256,
    shared_directive_sha256:
      expected.recipe_packet.shared_visual_authoring_directive.directive_sha256,
    context_sha256: declaredContextSha256,
    shot_count: expected.recipe_packet.shot_ids.length,
  };
}

function parseArgs(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) return { help: true };
  const positional = [];
  let visualGrammarProgram;
  let projection;
  let designSelection;
  let baseTemplate;
  let nativeBaseCompiler;
  let designLibrary;
  let expectedBindings;
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--visual-grammar-program') {
      visualGrammarProgram = argv[index + 1];
      index += 1;
    } else if (option === '--projection') {
      projection = argv[index + 1];
      index += 1;
    } else if (option === '--design-selection') {
      designSelection = argv[index + 1];
      index += 1;
    } else if (option === '--base-template') {
      baseTemplate = argv[index + 1];
      index += 1;
    } else if (option === '--native-base-compiler') {
      nativeBaseCompiler = argv[index + 1];
      index += 1;
    } else if (option === '--design-library') {
      designLibrary = argv[index + 1];
      index += 1;
    } else if (option === '--expected-bindings') {
      expectedBindings = argv[index + 1];
      index += 1;
    } else positional.push(option);
  }
  if (
    positional.length !== 1
    || typeof visualGrammarProgram !== 'string'
    || !visualGrammarProgram
    || typeof projection !== 'string'
    || !projection
    || typeof designSelection !== 'string'
    || !designSelection
    || (
      Boolean(typeof baseTemplate === 'string' && baseTemplate)
      === Boolean(typeof nativeBaseCompiler === 'string' && nativeBaseCompiler)
    )
    || typeof designLibrary !== 'string'
    || !designLibrary
    || (expectedBindings !== undefined && (typeof expectedBindings !== 'string' || !expectedBindings))
  ) return { error: true };
  return {
    input: positional[0],
    visualGrammarProgram,
    projection,
    designSelection,
    baseTemplate,
    nativeBaseCompiler,
    designLibrary,
    expectedBindings,
  };
}

async function main(argv) {
  const usage = 'Usage: node validate-whole-film-rules.mjs <whole-film-rules.json> --visual-grammar-program <program.json> --projection <frame-projection.json> --design-selection <selection.json> (--base-template <template.json> | --native-base-compiler <compiler.json>) --design-library <library.json> [--expected-bindings <bindings.json>]';
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  if (args.error) {
    process.stderr.write(`${usage}\n`);
    process.exitCode = 2;
    return;
  }
  try {
    const [
      document,
      visualGrammarProgram,
      projection,
      designSelection,
      baseTemplate,
      nativeBaseCompiler,
      designLibrary,
      expectedBindings,
    ] = await Promise.all([
      readFile(args.input, 'utf8').then(JSON.parse),
      readFile(args.visualGrammarProgram, 'utf8').then(JSON.parse),
      readFile(args.projection, 'utf8').then(JSON.parse),
      readFile(args.designSelection, 'utf8').then(JSON.parse),
      args.baseTemplate
        ? readFile(args.baseTemplate, 'utf8').then(JSON.parse)
        : undefined,
      args.nativeBaseCompiler
        ? readFile(args.nativeBaseCompiler, 'utf8').then(JSON.parse)
        : undefined,
      readFile(args.designLibrary, 'utf8').then(JSON.parse),
      args.expectedBindings
        ? readFile(args.expectedBindings, 'utf8').then(JSON.parse)
        : undefined,
    ]);
    process.stdout.write(`${JSON.stringify(validateWholeFilmRules(document, {
      visualGrammarProgram,
      projection,
      designSelection,
      baseTemplate,
      nativeBaseCompiler,
      designLibrary,
      expectedBindings,
    }))}\n`);
  } catch (error) {
    const code = error instanceof WholeFilmRulesError
      ? error.code
      : 'whole_film_rules_input_unreadable';
    process.stderr.write(`${JSON.stringify({
      ok: false,
      code,
      message: error.message,
      ...(error.block === undefined ? {} : { block: error.block }),
    })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
