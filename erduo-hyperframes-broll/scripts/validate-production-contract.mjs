#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContextBudgetError, validateContextBudget } from './validate-context-budget.mjs';

export const PIPELINE_CONTRACT_VERSION = 3;
export const AUTHORING_TOPOLOGY_ID = 'script-only-authoring-cluster-v1';
export const VALIDATION_POLICY_ID = 'script-only-production-v1';
export const GATE_NAMES = Object.freeze([
  'policy-gate',
  'source-conformance-gate',
  'runtime-seek-gate',
  'pixel-signal-gate',
  'integration-delivery-gate',
]);
export const REQUIRED_COMPONENT_IDS = Object.freeze([
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
]);

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const TOKEN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const SHOT_ID = /^S[0-9]{3}$/u;
const CHAPTER_ID = /^C[0-9]{2}$/u;
const SELECTOR = /^#[A-Za-z][A-Za-z0-9_-]{0,95}$/u;
const CONTROL_CHARACTERS = /[\x00-\x08\x0b\x0c\x0e-\x1f]/u;
const LEGACY_FIELDS = new Set([
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
]);
const LEGACY_ACTIVE_FIELD_ALIASES = new Set([
  ...LEGACY_FIELDS,
  'media_locator',
  'preview_image',
  'review_packet',
]);
const REQUIRED_TYPE_ROLES = new Set([
  'display',
  'body',
  'status',
  'data',
  'meta',
  'microtext-texture',
]);
const PHASES = ['entry', 'action', 'result', 'hold', 'exit'];
const SHOT_KINDS = new Set([
  'hero',
  'chapter-card',
  'process',
  'data',
  'relation',
  'judgment',
  'comparison',
  'cta',
  'ordinary-media',
]);
const TRANSITION_OWNERS = new Set(['shot', 'next-shot', 'host']);
const EVIDENCE_ROLES = new Set(['measured', 'reported', 'illustrative']);
const CHANGED_DIMENSIONS = new Set([
  'core-geometry',
  'focus-position',
  'focus-scale',
  'density',
  'component-family',
  'material-expression',
  'motion-causality',
]);
const CREATIVE_MODULE_IDS = new Set([
  'narrative-attention-v1',
  'physical-media-v1',
  'reference-variation-v1',
  'editorial-evidence-v1',
  'cultural-evidence-v1',
]);
const CREATIVE_DIRECTIVE_REF = /^(semantic-object|text-element|component|safe-region|next-shot):([A-Za-z0-9][A-Za-z0-9._-]{0,95})$/u;
const BLOCK_ID = /^B[0-9]{3}$/u;
const FORBIDDEN_BLOCK_PACKET_KEY = /(?:^|_)(?:raw|director_contract|assets?_contract|parsed_srt|srt(?:_bytes|_text|_content)?|source(?:_bytes|_code|_content|_html|_css|_js)?|html(?:_source|_bytes)?|css(?:_source|_bytes)?|javascript(?:_source|_bytes)?|js(?:_source|_bytes)?|image(?:_bytes|_url|_data)?|screenshot|prompt(?:_body|_text|_payload)?|reference(?:_original|_text|_payload)?)(?:_|$)/u;
const DIRECTOR_FIELDS = [
  'schema_version',
  'pipeline_contract_version',
  'authoring_topology_id',
  'validation_policy_id',
  'contract_phase',
  'parsed_srt_sha256',
  'shot_plan_sha256',
  'design_system_sha256',
  'component_registry_sha256',
  'validation_policy_sha256',
  'reference_style_profile_sha256',
  'font_package_sha256',
  'projection_sha256',
  'delivery_profile_sha256',
  'production_contract_sha256',
];
const SEALED_FIELDS = [
  ...DIRECTOR_FIELDS,
  'prior_contract_sha256',
  'asset_manifest_sha256',
];
const DOCUMENT_ARTIFACT_FIELDS = [
  ['shot_plan_sha256', 'shotPlan', 'shot_plan_sha256'],
  ['design_system_sha256', 'designSystem', 'design_system_sha256'],
  ['component_registry_sha256', 'componentRegistry', 'component_registry_sha256'],
  ['validation_policy_sha256', 'validationPolicy', 'validation_policy_sha256'],
];

export class ScriptOnlyV3ContractError extends Error {
  constructor(code, message, location) {
    super(message);
    this.name = 'ScriptOnlyV3ContractError';
    this.code = code;
    if (location) this.location = location;
  }
}

const fail = (code, message, location) => {
  throw new ScriptOnlyV3ContractError(code, message, location);
};

function canonicalize(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('canonical_value_invalid', 'Contract contains a non-finite number.');
    return value;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) {
    fail('canonical_value_invalid', 'Contract contains an unsupported or cyclic value.');
  }
  seen.add(value);
  const normalized = Array.isArray(value)
    ? value.map((item) => canonicalize(item, seen))
    : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key], seen)]));
  seen.delete(value);
  return normalized;
}

export const fingerprintV3Value = (value) => createHash('sha256')
  .update(JSON.stringify(canonicalize(value)), 'utf8')
  .digest('hex');

function without(value, field) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
}

function exact(value, fields, code, message, location) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())
  ) fail(code, message, location);
}

function verifySelfHash(value, field, code) {
  if (!SHA256.test(value?.[field] ?? '') || fingerprintV3Value(without(value, field)) !== value[field]) {
    fail(code, `${field} does not bind the exact canonical document.`);
  }
}

function text(value, code, message, location, { min = 1, max = 600 } = {}) {
  if (
    typeof value !== 'string'
    || value.trim().length < min
    || Buffer.byteLength(value, 'utf8') > max
    || CONTROL_CHARACTERS.test(value)
  ) fail(code, message, location);
  return value.trim();
}

function stringList(value, code, message, location, {
  min = 1,
  max = 32,
  pattern = null,
} = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail(code, message, location);
  }
  for (const item of value) {
    text(item, code, message, location, { max: 240 });
    if (pattern && !pattern.test(item)) fail(code, message, location);
  }
  if (new Set(value).size !== value.length) fail(code, message, location);
  return value;
}

function integer(value, code, message, location, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(code, message, location);
  return value;
}

function verifyV3Identity(value, code = 'v3_identity_invalid') {
  if (
    value?.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
    || value?.authoring_topology_id && value.authoring_topology_id !== AUTHORING_TOPOLOGY_ID
    || value?.validation_policy_id && value.validation_policy_id !== VALIDATION_POLICY_ID
  ) fail(code, 'Script-only v3 identity is invalid.');
}

export function assertNoLegacyActiveFields(value, seen = new Set()) {
  if (value === null || typeof value !== 'object') return;
  if (ArrayBuffer.isView(value)) return;
  if (seen.has(value)) fail('canonical_value_invalid', 'Contract contains a cycle.');
  seen.add(value);
  for (const [rawKey, item] of Object.entries(value)) {
    const key = rawKey
      .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
      .replace(/[-.]+/gu, '_')
      .toLowerCase();
    if (
      LEGACY_ACTIVE_FIELD_ALIASES.has(rawKey)
      || LEGACY_ACTIVE_FIELD_ALIASES.has(key)
    ) {
      fail('legacy_field_forbidden', `Legacy field is forbidden in v3: ${rawKey}.`);
    }
    assertNoLegacyActiveFields(item, seen);
  }
  seen.delete(value);
}

function allowedShape(value, requiredFields, optionalFields, code, message, location) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, message, location);
  const actual = new Set(Object.keys(value));
  if (requiredFields.some((field) => !actual.has(field))
    || [...actual].some((field) => !requiredFields.includes(field) && !optionalFields.includes(field))) {
    fail(code, message, location);
  }
}

function number(value, code, message, location, {
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
} = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(code, message, location);
  }
  return value;
}

function sameJson(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function validateLifecycle(value, shot, policy) {
  exact(value, PHASES, 'causal_lifecycle_invalid', 'Causal lifecycle phases are incomplete.', shot.shot_id);
  const fps = policy.__shot_plan_fps;
  const expectedFrames = Math.round(
    (shot.duration_ms * fps.numerator) / (1000 * fps.denominator),
  );
  let previousEnd = 0;
  for (const phase of PHASES) {
    const record = value[phase];
    exact(
      record,
      ['start_frame', 'end_frame', 'selectors', 'timeline_calls'],
      'causal_lifecycle_invalid',
      'Lifecycle binding is invalid.',
      `${shot.shot_id}:${phase}`,
    );
    integer(record.start_frame, 'causal_lifecycle_invalid', 'Lifecycle start frame is invalid.', shot.shot_id);
    integer(record.end_frame, 'causal_lifecycle_invalid', 'Lifecycle end frame is invalid.', shot.shot_id, { min: 1 });
    if (record.start_frame !== previousEnd || record.end_frame <= record.start_frame) {
      fail('causal_lifecycle_invalid', 'Lifecycle phases must be ordered, contiguous and non-empty.', shot.shot_id);
    }
    stringList(
      record.selectors,
      'causal_lifecycle_invalid',
      'Lifecycle selectors are invalid.',
      shot.shot_id,
      { min: 1, max: 16, pattern: SELECTOR },
    );
    stringList(
      record.timeline_calls,
      'causal_lifecycle_invalid',
      'Lifecycle timeline calls are invalid.',
      shot.shot_id,
      { min: 1, max: 16, pattern: SAFE_ID },
    );
    previousEnd = record.end_frame;
  }
  if (previousEnd !== expectedFrames) {
    fail('causal_lifecycle_invalid', 'Lifecycle must end at the derived shot frame count.', shot.shot_id);
  }
  const holdFrames = value.hold.end_frame - value.hold.start_frame;
  const inferredComplex = shot.readability_class === 'complex'
    || shot.shot_kind === 'data'
    || ['chart', 'terminal-form-table', 'comparison'].includes(shot.component_id)
    || Array.isArray(shot.data_points) && shot.data_points.length > 0
    || shot.text_elements.length >= 4;
  const requiredFrames = inferredComplex
    ? policy.readable_hold_policy.complex_min_frames
    : policy.readable_hold_policy.ordinary_min_frames;
  if (holdFrames < requiredFrames) {
    fail('readable_hold_insufficient', 'Stable result hold is shorter than policy.', shot.shot_id);
  }
  const holdStartMs = shot.start_ms + Math.round(
    (value.hold.start_frame * 1000 * fps.denominator) / fps.numerator,
  );
  const holdEndMs = shot.start_ms + Math.round(
    (value.hold.end_frame * 1000 * fps.denominator) / fps.numerator,
  );
  if (shot.hold_window.from_ms !== holdStartMs || shot.hold_window.to_ms !== holdEndMs) {
    fail('causal_lifecycle_invalid', 'Hold milliseconds must bind the lifecycle hold frames.', shot.shot_id);
  }
}

function evaluateDataFormula(formula, denominator, unit, shotId) {
  exact(
    formula,
    ['operator', 'operands', 'result_unit'],
    'data_formula_mismatch',
    'Data formula must be a restricted structured operation.',
    shotId,
  );
  if (!['literal', 'add', 'subtract', 'multiply', 'divide', 'percentage'].includes(formula.operator)
    || !Array.isArray(formula.operands)
    || formula.operands.length < 1
    || formula.operands.length > 8
    || formula.operands.some((operand) => typeof operand !== 'number' || !Number.isFinite(operand))
    || formula.result_unit !== unit) {
    fail('data_formula_mismatch', 'Data formula operator, operands or result unit is invalid.', shotId);
  }
  let result;
  switch (formula.operator) {
    case 'literal':
      if (formula.operands.length !== 1) fail('data_formula_mismatch', 'Literal formulas take one operand.', shotId);
      [result] = formula.operands;
      break;
    case 'add':
      result = formula.operands.reduce((sum, operand) => sum + operand, 0);
      break;
    case 'subtract':
      if (formula.operands.length !== 2) fail('data_formula_mismatch', 'Subtract formulas take two operands.', shotId);
      result = formula.operands[0] - formula.operands[1];
      break;
    case 'multiply':
      result = formula.operands.reduce((product, operand) => product * operand, 1);
      break;
    case 'divide':
    case 'percentage':
      if (formula.operands.length !== 2 || formula.operands[1] === 0) {
        fail('data_formula_mismatch', 'Divide/percentage formulas require a non-zero denominator.', shotId);
      }
      if (formula.operands[1] !== denominator.value) {
        fail('data_formula_mismatch', 'Formula denominator does not bind the declared denominator.', shotId);
      }
      result = formula.operands[0] / formula.operands[1]
        * (formula.operator === 'percentage' ? 100 : 1);
      break;
    default:
      fail('data_formula_mismatch', 'Unsupported data formula.', shotId);
  }
  if (!formula.operands.includes(denominator.value)) {
    fail('data_formula_mismatch', 'Every formula operator must bind the declared denominator value.', shotId);
  }
  return result;
}

function normalizedUnit(value) {
  return value.toLowerCase().trim().replaceAll('_', ' ').replaceAll('-', ' ');
}

function basisContainsUnit(basis, unit) {
  const normalizedBasis = normalizedUnit(basis);
  const normalized = normalizedUnit(unit);
  if (normalizedBasis.includes(normalized)) return true;
  if (normalized.endsWith('s') && normalizedBasis.includes(normalized.slice(0, -1))) return true;
  return false;
}

function isPrivateLocalPath(value) {
  return typeof value === 'string' && (
    /^file:\/\//iu.test(value)
    || /^\/(?:Users|home|private|var\/folders)\//u.test(value)
    || /^[A-Za-z]:[\\/]/u.test(value)
  );
}

function validateDataPoint(value, policy, shotId) {
  exact(
    value,
    ['data_id', 'label', 'value', 'unit', 'denominator', 'formula', 'source_ref', 'evidence_role'],
    'data_provenance_invalid',
    'Data point shape is invalid.',
    shotId,
  );
  if (!TOKEN.test(value.data_id ?? '')) fail('data_provenance_invalid', 'Data ID is invalid.', shotId);
  text(value.label, 'data_provenance_invalid', 'Data label is invalid.', shotId, { max: 120 });
  if (!(typeof value.value === 'number' && Number.isFinite(value.value)) && typeof value.value !== 'string') {
    fail('data_provenance_invalid', 'Data value is invalid.', shotId);
  }
  text(value.unit, 'data_provenance_invalid', 'Data unit is required.', shotId, { max: 120 });
  exact(
    value.denominator,
    ['value', 'unit', 'basis'],
    'data_formula_mismatch',
    'Data denominator must be structured.',
    shotId,
  );
  number(value.denominator.value, 'data_formula_mismatch', 'Data denominator value is invalid.', shotId);
  text(value.denominator.unit, 'data_formula_mismatch', 'Data denominator unit is invalid.', shotId, { max: 120 });
  text(value.denominator.basis, 'data_formula_mismatch', 'Data denominator basis is invalid.', shotId, { max: 240 });
  text(value.source_ref, 'data_provenance_invalid', 'Data source_ref is required.', shotId, { max: 240 });
  if (!basisContainsUnit(value.denominator.basis, value.denominator.unit)) {
    fail('data_formula_mismatch', 'Data denominator unit contradicts its basis.', shotId);
  }
  if (isPrivateLocalPath(value.source_ref)) {
    fail('private_path_forbidden', 'Canonical data source_ref cannot contain a private local path.', shotId);
  }
  if (typeof value.value !== 'number') {
    fail('data_formula_mismatch', 'Formula-backed data values must be numeric.', shotId);
  }
  const evaluated = evaluateDataFormula(value.formula, value.denominator, value.unit, shotId);
  if (Math.abs(evaluated - value.value) > 1e-9) {
    fail('data_formula_mismatch', 'Data value conflicts with its formula, denominator or unit.', shotId);
  }
  if (!EVIDENCE_ROLES.has(value.evidence_role)
    || !policy.data_policy.evidence_roles.includes(value.evidence_role)) {
    fail('data_provenance_invalid', 'Data evidence role is invalid.', shotId);
  }
}

function validateCognitiveAction(value, shotId, objectIds) {
  exact(
    value,
    ['primary_action_id', 'actions'],
    'cognitive_action_cardinality_invalid',
    'Cognitive action must declare exactly one primary action.',
    shotId,
  );
  if (!SAFE_ID.test(value.primary_action_id ?? '')
    || !Array.isArray(value.actions)
    || value.actions.length !== 1) {
    fail('cognitive_action_cardinality_invalid', 'Each shot must expose exactly one cognitive action.', shotId);
  }
  const [action] = value.actions;
  exact(
    action,
    ['action_id', 'verb', 'actor_object_id', 'target_object_ids'],
    'cognitive_action_cardinality_invalid',
    'Primary action shape is invalid.',
    shotId,
  );
  if (action.action_id !== value.primary_action_id
    || !SAFE_ID.test(action.action_id ?? '')
    || !objectIds.has(action.actor_object_id)
    || !Array.isArray(action.target_object_ids)
    || action.target_object_ids.length < 1
    || action.target_object_ids.some((id) => !objectIds.has(id))) {
    fail('cognitive_action_cardinality_invalid', 'Primary action is not bound to declared semantic objects.', shotId);
  }
  text(action.verb, 'cognitive_action_cardinality_invalid', 'Primary action verb is required.', shotId, { max: 80 });
}

function validateSemanticObjects(value, shotId) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 16) {
    fail('semantic_evidence_chain_incomplete', 'A shot needs at least two structured semantic objects.', shotId);
  }
  const objectIds = new Set();
  const continuityIds = new Set();
  for (const object of value) {
    exact(
      object,
      ['object_id', 'continuity_id', 'semantic_role', 'initial_state', 'result_state'],
      'semantic_evidence_chain_incomplete',
      'Semantic object shape is invalid.',
      shotId,
    );
    if (!SAFE_ID.test(object.object_id ?? '') || objectIds.has(object.object_id)
      || !SAFE_ID.test(object.continuity_id ?? '') || continuityIds.has(object.continuity_id)) {
      fail('semantic_evidence_chain_incomplete', 'Semantic object and continuity IDs must be valid and unique.', shotId);
    }
    for (const field of ['semantic_role', 'initial_state', 'result_state']) {
      text(object[field], 'semantic_evidence_chain_incomplete', `Semantic object ${field} is required.`, shotId, { max: 160 });
    }
    objectIds.add(object.object_id);
    continuityIds.add(object.continuity_id);
  }
  return objectIds;
}

function validateSemanticChain(shot) {
  const objectIds = validateSemanticObjects(shot.semantic_objects, shot.shot_id);
  validateCognitiveAction(shot.cognitive_action, shot.shot_id, objectIds);
  exact(
    shot.spatial_relation,
    ['relation_id', 'subject_object_id', 'predicate', 'object_id', 'direction'],
    'semantic_evidence_chain_incomplete',
    'Spatial relation must be structured.',
    shot.shot_id,
  );
  if (!SAFE_ID.test(shot.spatial_relation.relation_id ?? '')
    || !objectIds.has(shot.spatial_relation.subject_object_id)
    || !objectIds.has(shot.spatial_relation.object_id)) {
    fail('semantic_evidence_chain_incomplete', 'Spatial relation references an unknown semantic object.', shot.shot_id);
  }
  text(shot.spatial_relation.predicate, 'semantic_evidence_chain_incomplete', 'Spatial relation predicate is required.', shot.shot_id, { max: 120 });
  text(shot.spatial_relation.direction, 'semantic_evidence_chain_incomplete', 'Spatial relation direction is required.', shot.shot_id, { max: 120 });
  exact(
    shot.input_state,
    ['object_id', 'property', 'value'],
    'semantic_evidence_chain_incomplete',
    'Input state must be structured.',
    shot.shot_id,
  );
  exact(
    shot.operation,
    ['action_id', 'actor_object_id', 'target_object_ids', 'property', 'from', 'to'],
    'semantic_evidence_chain_incomplete',
    'Operation must bind actor, targets, property, from and to.',
    shot.shot_id,
  );
  exact(
    shot.result_state,
    ['object_id', 'property', 'value', 'semantic_carrier_element_id'],
    'semantic_evidence_chain_incomplete',
    'Result state must bind a semantic carrier.',
    shot.shot_id,
  );
  if (!objectIds.has(shot.input_state.object_id)
    || !objectIds.has(shot.operation.actor_object_id)
    || !Array.isArray(shot.operation.target_object_ids)
    || shot.operation.target_object_ids.length < 1
    || shot.operation.target_object_ids.some((id) => !objectIds.has(id))
    || !objectIds.has(shot.result_state.object_id)
    || shot.operation.action_id !== shot.cognitive_action.primary_action_id) {
    fail('semantic_evidence_chain_incomplete', 'State/operation/result object bindings are incomplete.', shot.shot_id);
  }
  const primaryAction = shot.cognitive_action.actions[0];
  if (primaryAction.actor_object_id !== shot.operation.actor_object_id
    || !sameJson(primaryAction.target_object_ids, shot.operation.target_object_ids)) {
    fail('semantic_evidence_chain_incomplete', 'Cognitive action actor/targets must exactly bind the operation.', shot.shot_id);
  }
  for (const [record, fields] of [
    [shot.input_state, ['property', 'value']],
    [shot.operation, ['property', 'from', 'to']],
    [shot.result_state, ['property', 'value', 'semantic_carrier_element_id']],
  ]) {
    for (const field of fields) {
      text(record[field], 'semantic_evidence_chain_incomplete', `Semantic ${field} is required.`, shot.shot_id, { max: 160 });
    }
  }
  if (shot.operation.from === shot.operation.to
    || shot.result_state.object_id !== shot.operation.target_object_ids.at(-1)
    || shot.result_state.property !== shot.operation.property
    || shot.result_state.value !== shot.operation.to) {
    fail(
      shot.shot_kind === 'process' ? 'process_semantic_chain_invalid' : 'semantic_evidence_chain_incomplete',
      'Operation must produce a non-opacity state change on the result object.',
      shot.shot_id,
    );
  }
  const resultObject = shot.semantic_objects.find(
    (object) => object.object_id === shot.result_state.object_id,
  );
  if (resultObject.initial_state !== shot.operation.from
    || resultObject.result_state !== shot.operation.to) {
    fail('semantic_evidence_chain_incomplete', 'Result object states must bind operation from/to.', shot.shot_id);
  }
  if ((shot.shot_kind === 'process' || ['pipeline', 'topology'].includes(shot.component_id))
    && /^(?:opacity|alpha|visibility|visible|display)/iu.test(shot.operation.property)) {
    fail('process_semantic_chain_invalid', 'Process shots cannot use opacity/visibility as their semantic state change.', shot.shot_id);
  }
  return objectIds;
}

function validateTextElements(shot) {
  if (!Array.isArray(shot.text_elements) || shot.text_elements.length < 1 || shot.text_elements.length > 32) {
    fail('type_role_invalid', 'Every shot needs per-text-element bindings.', shot.shot_id);
  }
  const ids = new Set();
  const selectors = new Set();
  for (const element of shot.text_elements) {
    exact(
      element,
      ['element_id', 'selector', 'type_role', 'semantic_responsibility', 'carries_primary_meaning'],
      'type_role_invalid',
      'Text-element binding is invalid.',
      shot.shot_id,
    );
    if (!SAFE_ID.test(element.element_id ?? '') || ids.has(element.element_id)
      || !SELECTOR.test(element.selector ?? '') || selectors.has(element.selector)
      || !TOKEN.test(element.type_role ?? '')
      || typeof element.carries_primary_meaning !== 'boolean') {
      fail('type_role_invalid', 'Text-element identity, selector or role is invalid.', shot.shot_id);
    }
    text(element.semantic_responsibility, 'type_role_invalid', 'Text semantic responsibility is required.', shot.shot_id, { max: 120 });
    if (element.type_role === 'microtext-texture'
      && (element.carries_primary_meaning || element.semantic_responsibility === 'result')) {
      fail('microtext_semantic_role_forbidden', 'Microtext cannot carry result or primary meaning.', shot.shot_id);
    }
    ids.add(element.element_id);
    selectors.add(element.selector);
  }
  const carrier = shot.text_elements.find(
    (element) => element.element_id === shot.result_state.semantic_carrier_element_id,
  );
  if (!carrier || carrier.type_role === 'microtext-texture'
    || carrier.semantic_responsibility !== 'result' || carrier.carries_primary_meaning !== true) {
    fail('microtext_semantic_role_forbidden', 'Result state needs a functional primary semantic carrier.', shot.shot_id);
  }
}

function validateSemanticCarrierLifecycle(shot) {
  const carrier = shot.text_elements.find(
    (element) => element.element_id === shot.result_state.semantic_carrier_element_id,
  );
  if (!shot.causal_lifecycle.result.selectors.includes(carrier.selector)
    || !shot.causal_lifecycle.hold.selectors.includes(carrier.selector)) {
    fail('semantic_carrier_lifecycle_unbound', 'Result carrier selector must participate in Result and Hold.', shot.shot_id);
  }
}

function parseCreativeDirectiveRef(value, shot, allowedKinds, code) {
  if (typeof value !== 'string' || !CREATIVE_DIRECTIVE_REF.test(value)) {
    fail(code, 'Creative-directive reference is invalid.', shot.shot_id);
  }
  const [, kind, id] = value.match(CREATIVE_DIRECTIVE_REF);
  if (!allowedKinds.has(kind)) {
    fail(code, 'Creative-directive reference kind is not allowed here.', shot.shot_id);
  }
  const semanticObjectIds = new Set(shot.semantic_objects.map((object) => object.object_id));
  const textElementIds = new Set(shot.text_elements.map((element) => element.element_id));
  if (kind === 'semantic-object' && !semanticObjectIds.has(id)
    || kind === 'text-element' && !textElementIds.has(id)
    || kind === 'component' && id !== shot.component_id) {
    fail(code, 'Creative-directive reference is not closed over this shot.', shot.shot_id);
  }
  return { kind, id };
}

function validateCreativeDirective(value, shot, nextShot) {
  exact(value, [
    'primary_visual_decision',
    'attention_plan',
    'modules',
    'creative_directive_sha256',
  ], 'creative_directive_invalid', 'Creative directive shape is invalid.', shot.shot_id);
  text(
    value.primary_visual_decision,
    'creative_directive_invalid',
    'Creative directive needs one bounded primary visual decision.',
    shot.shot_id,
    { max: 480 },
  );
  exact(value.attention_plan, [
    'primary_focus_ref',
    'reading_order_refs',
    'negative_space_region_refs',
    'transition_exit_ref',
  ], 'creative_directive_attention_invalid', 'Attention plan shape is invalid.', shot.shot_id);
  const primaryFocus = parseCreativeDirectiveRef(
    value.attention_plan.primary_focus_ref,
    shot,
    new Set(['semantic-object', 'text-element', 'component']),
    'creative_directive_attention_invalid',
  );
  stringList(
    value.attention_plan.reading_order_refs,
    'creative_directive_attention_invalid',
    'Attention-plan reading order is invalid.',
    shot.shot_id,
    { min: 1, max: 8 },
  );
  if (value.attention_plan.reading_order_refs[0] !== value.attention_plan.primary_focus_ref) {
    fail('creative_directive_attention_invalid', 'Attention-plan reading order must start at the primary focus.', shot.shot_id);
  }
  value.attention_plan.reading_order_refs.forEach((reference) => parseCreativeDirectiveRef(
    reference,
    shot,
    new Set(['semantic-object', 'text-element', 'component']),
    'creative_directive_attention_invalid',
  ));
  stringList(
    value.attention_plan.negative_space_region_refs,
    'creative_directive_attention_invalid',
    'Attention-plan negative-space responsibilities are invalid.',
    shot.shot_id,
    { min: 1, max: 8 },
  );
  value.attention_plan.negative_space_region_refs.forEach((reference) => parseCreativeDirectiveRef(
    reference,
    shot,
    new Set(['safe-region']),
    'creative_directive_attention_invalid',
  ));
  const exit = parseCreativeDirectiveRef(
    value.attention_plan.transition_exit_ref,
    shot,
    new Set(['semantic-object', 'text-element', 'next-shot']),
    'creative_directive_attention_invalid',
  );
  if (exit.kind === 'next-shot' && (!nextShot || exit.id !== nextShot.shot_id)) {
    fail('creative_directive_attention_invalid', 'Attention-plan next-shot handoff must bind the adjacent shot.', shot.shot_id);
  }
  if (!Array.isArray(value.modules) || value.modules.length > 3) {
    fail('creative_directive_module_invalid', 'Creative directive may enable at most three conditional modules.', shot.shot_id);
  }
  const moduleIds = new Set();
  for (const module of value.modules) {
    exact(module, ['module_id', 'fact_binding_sha256'], 'creative_directive_module_invalid', 'Creative module shape is invalid.', shot.shot_id);
    if (!CREATIVE_MODULE_IDS.has(module.module_id) || moduleIds.has(module.module_id)
      || !SHA256.test(module.fact_binding_sha256 ?? '')) {
      fail('creative_directive_module_invalid', 'Creative module ID or fact binding is invalid.', shot.shot_id);
    }
    moduleIds.add(module.module_id);
  }
  verifySelfHash(value, 'creative_directive_sha256', 'creative_directive_hash_mismatch');
  return primaryFocus;
}

function validateShot(value, policy, previous, nextShot) {
  const fields = [
    'shot_id',
    'chapter_id',
    'shot_kind',
    'start_ms',
    'end_ms',
    'duration_ms',
    'semantic_claim',
    'creative_directive',
    'cognitive_action',
    'visual_structure',
    'semantic_objects',
    'spatial_relation',
    'input_state',
    'operation',
    'result_state',
    'readability_class',
    'hold_window',
    'transition_owner',
    'callback_of',
    'payoff_shot_id',
    'text_roles',
    'text_elements',
    'cue_ids',
    'focal_role',
    'density_level',
    'layout_family',
    'metaphor_id',
    'dominant_axis',
    'primary_primitive',
    'component_id',
    'motion_profile_id',
    'causal_lifecycle',
    'data_points',
  ];
  exact(value, fields, 'shot_plan_invalid', 'Shot shape is invalid.', value?.shot_id);
  if (!SHOT_ID.test(value.shot_id ?? '') || !CHAPTER_ID.test(value.chapter_id ?? '')
    || !SHOT_KINDS.has(value.shot_kind)) {
    fail('shot_plan_invalid', 'Shot identity is invalid.', value?.shot_id);
  }
  integer(value.start_ms, 'shot_plan_invalid', 'Shot start is invalid.', value.shot_id);
  integer(value.end_ms, 'shot_plan_invalid', 'Shot end is invalid.', value.shot_id, { min: 1 });
  integer(value.duration_ms, 'shot_plan_invalid', 'Shot duration is invalid.', value.shot_id, { min: 1 });
  if (value.duration_ms !== value.end_ms - value.start_ms
    || previous && value.start_ms !== previous.end_ms
    || !previous && value.start_ms !== 0) {
    fail('shot_time_truth_invalid', 'Shot milliseconds must be contiguous and derived from start/end.', value.shot_id);
  }
  for (const field of [
    'semantic_claim',
    'visual_structure',
    'focal_role',
    'layout_family',
    'metaphor_id',
    'dominant_axis',
    'primary_primitive',
  ]) text(value[field], 'semantic_evidence_chain_incomplete', `Shot ${field} is required.`, value.shot_id);
  stringList(value.cue_ids, 'shot_plan_invalid', 'Shot cue bindings are invalid.', value.shot_id, {
    min: 1,
    max: 64,
    pattern: SAFE_ID,
  });
  validateSemanticChain(value);
  validateTextElements(value);
  validateCreativeDirective(value.creative_directive, value, nextShot);
  if (!['ordinary', 'complex'].includes(value.readability_class)) {
    fail('readable_hold_invalid', 'Readability class is invalid.', value.shot_id);
  }
  exact(value.hold_window, ['from_ms', 'to_ms'], 'readable_hold_invalid', 'Hold window is invalid.', value.shot_id);
  if (
    !Number.isSafeInteger(value.hold_window.from_ms)
    || !Number.isSafeInteger(value.hold_window.to_ms)
    || value.hold_window.from_ms < value.start_ms
    || value.hold_window.to_ms > value.end_ms
    || value.hold_window.to_ms <= value.hold_window.from_ms
  ) fail('readable_hold_invalid', 'Hold window is outside the shot.', value.shot_id);
  if (!TRANSITION_OWNERS.has(value.transition_owner)) {
    fail('shot_plan_invalid', 'Transition owner is invalid.', value.shot_id);
  }
  for (const field of ['callback_of', 'payoff_shot_id']) {
    if (value[field] !== null && !SHOT_ID.test(value[field] ?? '')) {
      fail('callback_ledger_open', 'Callback references are invalid.', value.shot_id);
    }
  }
  stringList(value.text_roles, 'type_role_invalid', 'Shot type roles are invalid.', value.shot_id, {
    min: 1,
    max: 12,
    pattern: TOKEN,
  });
  if (value.text_roles.every((role) => role === 'microtext-texture')) {
    fail('microtext_semantic_role_forbidden', 'Microtext cannot carry the only semantic meaning.', value.shot_id);
  }
  if (!sameJson(
    [...new Set(value.text_elements.map((element) => element.type_role))].sort(),
    [...value.text_roles].sort(),
  )) fail('type_role_invalid', 'Shot text_roles must be derived from its text elements.', value.shot_id);
  integer(value.density_level, 'density_budget_invalid', 'Density level is invalid.', value.shot_id, {
    min: policy.whole_film_budgets.density_level_min,
    max: policy.whole_film_budgets.density_level_max,
  });
  if (!TOKEN.test(value.component_id ?? '') || !TOKEN.test(value.motion_profile_id ?? '')) {
    fail('shot_plan_invalid', 'Component or motion profile ID is invalid.', value.shot_id);
  }
  if (!Array.isArray(value.data_points) || value.data_points.length > 24) {
    fail('data_provenance_invalid', 'Shot data points are invalid.', value.shot_id);
  }
  validateLifecycle(value.causal_lifecycle, value, policy);
  value.data_points.forEach((item) => validateDataPoint(item, policy, value.shot_id));
  if (value.shot_kind === 'data' && value.data_points.length === 0) {
    fail('data_provenance_invalid', 'Data shots require a bound data point.', value.shot_id);
  }
}

export function validateV3ShotPlan(value, validationPolicy) {
  const policy = validateValidationPolicy(validationPolicy, { internal: true });
  exact(value, [
    'schema_version',
    'pipeline_contract_version',
    'parsed_srt_sha256',
    'fps',
    'shots',
    'chapters',
    'chapter_promise_payoff_ledger',
    'motif_callback_ledger',
    'emphasis_ledger',
    'density_curve',
    'layout_and_metaphor_cooldown',
    'shot_plan_sha256',
  ], 'shot_plan_invalid', 'Script-only v3 shot plan shape is invalid.');
  if (value.schema_version !== 1 || value.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
    || !SHA256.test(value.parsed_srt_sha256 ?? '')) {
    fail('shot_plan_invalid', 'Script-only v3 shot plan identity is invalid.');
  }
  exact(value.fps, ['numerator', 'denominator'], 'shot_plan_invalid', 'Shot plan fps is invalid.');
  integer(value.fps.numerator, 'shot_plan_invalid', 'FPS numerator is invalid.', undefined, { min: 1 });
  integer(value.fps.denominator, 'shot_plan_invalid', 'FPS denominator is invalid.', undefined, { min: 1 });
  policy.__shot_plan_fps = value.fps;
  if (!Array.isArray(value.shots) || value.shots.length < 1 || value.shots.length > 999) {
    fail('shot_plan_invalid', 'Shot plan must contain 1-999 shots.');
  }
  value.shots.forEach((shot, index) => validateShot(
    shot,
    policy,
    value.shots[index - 1],
    value.shots[index + 1],
  ));
  const shotIds = value.shots.map((shot) => shot.shot_id);
  if (new Set(shotIds).size !== shotIds.length) fail('shot_plan_invalid', 'Shot IDs must be unique.');
  const shotById = new Map(value.shots.map((shot) => [shot.shot_id, shot]));
  const selectorOwners = new Map();
  const timelineOwners = new Map();
  for (const shot of value.shots) {
    const selectors = [
      ...shot.text_elements.map((element) => element.selector),
      ...PHASES.flatMap((phase) => shot.causal_lifecycle[phase].selectors),
    ];
    const timelineCalls = PHASES.flatMap((phase) => shot.causal_lifecycle[phase].timeline_calls);
    for (const selector of new Set(selectors)) {
      if (selectorOwners.has(selector) && selectorOwners.get(selector) !== shot.shot_id) {
        fail('causal_binding_conflict', 'Selectors must be namespaced uniquely across shots.', shot.shot_id);
      }
      selectorOwners.set(selector, shot.shot_id);
    }
    for (const call of new Set(timelineCalls)) {
      if (timelineOwners.has(call) && timelineOwners.get(call) !== shot.shot_id) {
        fail('causal_binding_conflict', 'Timeline call IDs must be namespaced uniquely across shots.', shot.shot_id);
      }
      timelineOwners.set(call, shot.shot_id);
    }
  }
  value.shots.forEach(validateSemanticCarrierLifecycle);

  if (!Array.isArray(value.chapters) || value.chapters.length < 1) {
    fail('chapter_ledger_invalid', 'At least one chapter is required.');
  }
  const chapterIds = new Set();
  const assignedShots = [];
  for (const chapter of value.chapters) {
    exact(chapter, [
      'chapter_id',
      'shot_ids',
      'problem_or_goal',
      'mechanism',
      'result',
      'next_chapter_handoff',
    ], 'chapter_ledger_invalid', 'Chapter shape is invalid.');
    if (!CHAPTER_ID.test(chapter.chapter_id ?? '') || chapterIds.has(chapter.chapter_id)) {
      fail('chapter_ledger_invalid', 'Chapter IDs must be valid and unique.');
    }
    chapterIds.add(chapter.chapter_id);
    stringList(chapter.shot_ids, 'chapter_ledger_invalid', 'Chapter shot IDs are invalid.', chapter.chapter_id, {
      min: 1,
      max: 999,
      pattern: SHOT_ID,
    });
    for (const id of chapter.shot_ids) {
      if (!shotById.has(id) || shotById.get(id).chapter_id !== chapter.chapter_id) {
        fail('chapter_ledger_invalid', 'Chapter shot identity is unbound.', chapter.chapter_id);
      }
      assignedShots.push(id);
    }
    for (const field of ['problem_or_goal', 'mechanism', 'result', 'next_chapter_handoff']) {
      text(chapter[field], 'chapter_ledger_invalid', `Chapter ${field} is required.`, chapter.chapter_id);
    }
  }
  if (JSON.stringify(assignedShots) !== JSON.stringify(shotIds)) {
    fail('chapter_ledger_invalid', 'Chapter shot coverage must match the ordered shot plan.');
  }

  if (!Array.isArray(value.chapter_promise_payoff_ledger)
    || value.chapter_promise_payoff_ledger.length < 1) {
    fail('chapter_promise_payoff_open', 'At least one ordered promise/payoff record is required.');
  }
  const promiseIds = new Set();
  for (const record of value.chapter_promise_payoff_ledger) {
    exact(record, [
      'promise_id',
      'promise_chapter_id',
      'promise_shot_id',
      'payoff_chapter_id',
      'payoff_shot_id',
      'object_id',
      'direction',
      'required_state_delta',
    ], 'chapter_promise_payoff_open', 'Chapter promise/payoff record is invalid.');
    exact(
      record.required_state_delta,
      ['property', 'from', 'to'],
      'chapter_promise_payoff_open',
      'Promise state delta must be structured.',
    );
    if (!SAFE_ID.test(record.promise_id ?? '') || promiseIds.has(record.promise_id)
      || !chapterIds.has(record.promise_chapter_id) || !chapterIds.has(record.payoff_chapter_id)
      || !shotById.has(record.promise_shot_id) || !shotById.has(record.payoff_shot_id)
      || shotById.get(record.promise_shot_id).chapter_id !== record.promise_chapter_id
      || shotById.get(record.payoff_shot_id).chapter_id !== record.payoff_chapter_id
      || shotIds.indexOf(record.promise_shot_id) >= shotIds.indexOf(record.payoff_shot_id)) {
      fail('chapter_promise_payoff_open', 'Chapter promise/payoff does not close in order.');
    }
    text(record.object_id, 'chapter_promise_payoff_open', 'Promise object identity is required.', undefined, { max: 96 });
    text(record.direction, 'chapter_promise_payoff_open', 'Promise direction is required.', undefined, { max: 96 });
    for (const field of ['property', 'from', 'to']) {
      text(record.required_state_delta[field], 'chapter_promise_payoff_open', 'Promise state delta is incomplete.', undefined, { max: 120 });
    }
    if (record.required_state_delta.from === record.required_state_delta.to) {
      fail('chapter_promise_payoff_open', 'Promise must require a real state delta.');
    }
    const promiseObject = shotById.get(record.promise_shot_id).semantic_objects.find(
      (object) => object.object_id === record.object_id,
    );
    const payoffObject = shotById.get(record.payoff_shot_id).semantic_objects.find(
      (object) => object.object_id === record.object_id,
    );
    if (!promiseObject || !payoffObject
      || promiseObject.continuity_id !== payoffObject.continuity_id
      || promiseObject.initial_state !== record.required_state_delta.from
      || payoffObject.result_state !== record.required_state_delta.to) {
      fail('chapter_promise_payoff_open', 'Promise object continuity or state delta is not bound to both shots.');
    }
    promiseIds.add(record.promise_id);
  }

  if (!Array.isArray(value.motif_callback_ledger)) {
    fail('callback_ledger_open', 'Motif callback ledger is invalid.');
  }
  const callbackPairs = new Set();
  for (const record of value.motif_callback_ledger) {
    exact(record, [
      'callback_id',
      'motif_id',
      'setup_shot_id',
      'payoff_shot_id',
      'object_id',
      'setup_direction',
      'payoff_direction',
      'state_delta',
    ], 'callback_ledger_open', 'Callback record is invalid.');
    exact(record.state_delta, ['property', 'from', 'to'], 'callback_ledger_open', 'Callback state delta is invalid.');
    if (!SAFE_ID.test(record.callback_id ?? '') || !TOKEN.test(record.motif_id ?? '')
      || !shotById.has(record.setup_shot_id)
      || !shotById.has(record.payoff_shot_id)
      || shotIds.indexOf(record.setup_shot_id) >= shotIds.indexOf(record.payoff_shot_id)) {
      fail('callback_ledger_open', 'Callback record does not bind an ordered setup/payoff.');
    }
    const promise = value.chapter_promise_payoff_ledger.find(
      (candidate) => candidate.promise_shot_id === record.setup_shot_id
        && candidate.payoff_shot_id === record.payoff_shot_id,
    );
    if (!promise || promise.object_id !== record.object_id
      || promise.direction !== record.setup_direction
      || record.setup_direction !== record.payoff_direction
      || !sameJson(promise.required_state_delta, record.state_delta)) {
      fail('callback_continuity_invalid', 'Callback identity, direction or state delta is discontinuous.');
    }
    const setupShot = shotById.get(record.setup_shot_id);
    const payoffShot = shotById.get(record.payoff_shot_id);
    const setupObject = setupShot.semantic_objects.find((object) => object.object_id === record.object_id);
    const payoffObject = payoffShot.semantic_objects.find((object) => object.object_id === record.object_id);
    if (!setupObject || !payoffObject || setupObject.continuity_id !== payoffObject.continuity_id
      || setupShot.spatial_relation.direction !== record.setup_direction
      || payoffShot.spatial_relation.direction !== record.payoff_direction
      || record.state_delta.property !== setupShot.operation.property
      || record.state_delta.property !== payoffShot.operation.property
      || record.state_delta.property !== setupShot.result_state.property
      || record.state_delta.property !== payoffShot.result_state.property
      || record.state_delta.from !== setupShot.operation.from
      || record.state_delta.to !== payoffShot.operation.to) {
      fail('callback_continuity_invalid', 'Callback does not bind stable shot object identity and direction.');
    }
    callbackPairs.add(`${record.setup_shot_id}:${record.payoff_shot_id}`);
  }
  for (const shot of value.shots) {
    if (shot.callback_of && !callbackPairs.has(`${shot.callback_of}:${shot.shot_id}`)) {
      fail('callback_ledger_open', 'Callback shot lacks a payoff ledger record.', shot.shot_id);
    }
    if (shot.payoff_shot_id && !callbackPairs.has(`${shot.shot_id}:${shot.payoff_shot_id}`)) {
      fail('callback_ledger_open', 'Setup shot lacks a callback payoff record.', shot.shot_id);
    }
  }

  if (!Array.isArray(value.emphasis_ledger)
    || value.emphasis_ledger.length > policy.whole_film_budgets.emphasis_max_events) {
    fail('emphasis_budget_invalid', 'Emphasis budget is invalid.');
  }
  const emphasisShots = new Set();
  for (const record of value.emphasis_ledger) {
    exact(record, ['shot_id', 'emphasis_type', 'semantic_reason'], 'emphasis_budget_invalid', 'Emphasis record is invalid.');
    if (!shotById.has(record.shot_id) || emphasisShots.has(record.shot_id)) {
      fail('emphasis_budget_invalid', 'Emphasis shot IDs must be valid and unique.');
    }
    emphasisShots.add(record.shot_id);
    text(record.emphasis_type, 'emphasis_budget_invalid', 'Emphasis type is invalid.');
    text(record.semantic_reason, 'emphasis_budget_invalid', 'Emphasis reason is required.');
  }

  if (!Array.isArray(value.density_curve) || value.density_curve.length !== value.shots.length) {
    fail('density_budget_invalid', 'Density curve must cover every shot.');
  }
  value.density_curve.forEach((record, index) => {
    exact(record, ['shot_id', 'density_level'], 'density_budget_invalid', 'Density curve record is invalid.');
    if (record.shot_id !== value.shots[index].shot_id
      || record.density_level !== value.shots[index].density_level) {
      fail('density_budget_invalid', 'Density curve must match ordered shot declarations.');
    }
  });

  if (!Array.isArray(value.layout_and_metaphor_cooldown)
    || value.layout_and_metaphor_cooldown.length !== Math.max(0, value.shots.length - 1)) {
    fail('cooldown_budget_invalid', 'Cooldown ledger must cover each adjacent shot pair.');
  }
  value.layout_and_metaphor_cooldown.forEach((record, index) => {
    exact(record, ['from_shot_id', 'to_shot_id', 'changed_dimensions'], 'cooldown_budget_invalid', 'Cooldown record is invalid.');
    if (record.from_shot_id !== value.shots[index].shot_id
      || record.to_shot_id !== value.shots[index + 1].shot_id) {
      fail('cooldown_budget_invalid', 'Cooldown record must bind adjacent shots.');
    }
    stringList(record.changed_dimensions, 'cooldown_budget_invalid', 'Cooldown changed dimensions are invalid.', undefined, {
      min: policy.whole_film_budgets.cooldown_min_changed_dimensions,
      max: CHANGED_DIMENSIONS.size,
    });
    if (record.changed_dimensions.some((item) => !CHANGED_DIMENSIONS.has(item))) {
      fail('cooldown_budget_invalid', 'Cooldown dimension is not registered.');
    }
    const from = value.shots[index];
    const to = value.shots[index + 1];
    const actual = [];
    if (from.layout_family !== to.layout_family
      || from.metaphor_id !== to.metaphor_id
      || from.dominant_axis !== to.dominant_axis
      || from.primary_primitive !== to.primary_primitive
      || from.component_id !== to.component_id) actual.push('core-geometry');
    if (from.focal_role !== to.focal_role) actual.push('focus-position');
    if (from.density_level !== to.density_level) actual.push('density');
    if (from.motion_profile_id !== to.motion_profile_id) actual.push('motion-causality');
    if (!sameJson([...record.changed_dimensions].sort(), actual.sort())) {
      fail('cooldown_claim_mismatch', 'Cooldown changed_dimensions must equal recomputed adjacent-shot facts.');
    }
  });
  for (const [field, maximum] of [
    ['layout_family', policy.whole_film_budgets.max_same_layout_run],
    ['metaphor_id', policy.whole_film_budgets.max_same_metaphor_run],
  ]) {
    let run = 0;
    let previousValue;
    for (const shot of value.shots) {
      run = shot[field] === previousValue ? run + 1 : 1;
      previousValue = shot[field];
      if (run > maximum) {
        fail('cooldown_budget_invalid', `Actual ${field} run exceeds policy.`);
      }
    }
  }
  verifySelfHash(value, 'shot_plan_sha256', 'shot_plan_hash_mismatch');
  delete policy.__shot_plan_fps;
  return {
    status: 'passed',
    shot_count: value.shots.length,
    chapter_count: value.chapters.length,
    callback_count: value.motif_callback_ledger.length,
    emphasis_count: value.emphasis_ledger.length,
    shot_plan_sha256: value.shot_plan_sha256,
  };
}

export function validateDesignSystem(value, { referenceStyleProfile } = {}) {
  exact(value, [
    'schema_version',
    'design_system_id',
    'reference_style_profile',
    'palette_roles',
    'type_roles',
    'safe_regions',
    'spacing_tokens',
    'radius_tokens',
    'material_recipes',
    'z_bands',
    'component_roles',
    'motion_profiles',
    'identity_invariants',
    'anti_identity_rules',
    'prohibited_motifs',
    'whole_film_budget_refs',
    'design_system_sha256',
  ], 'design_system_invalid', 'Design-system shape is invalid.');
  if (value.schema_version !== 1 || !TOKEN.test(value.design_system_id ?? '')) {
    fail('design_system_invalid', 'Design-system identity is invalid.');
  }
  exact(value.reference_style_profile, [
    'profile_id',
    'profile_sha256',
    'project_id',
    'project_only',
    'public_default',
    'status',
  ], 'reference_style_profile_scope_invalid', 'Reference style profile binding is invalid.');
  if (!TOKEN.test(value.reference_style_profile.profile_id ?? '')
    || !SHA256.test(value.reference_style_profile.profile_sha256 ?? '')
    || !SAFE_ID.test(value.reference_style_profile.project_id ?? '')
    || value.reference_style_profile.project_only !== true
    || value.reference_style_profile.public_default !== false
    || value.reference_style_profile.status !== 'draft') {
    fail('reference_style_profile_scope_invalid', 'Reference style profile must remain project-bound, project-only, draft and non-default.');
  }
  if (referenceStyleProfile) {
    exact(referenceStyleProfile, [
      'schema_version',
      'profile_id',
      'project_id',
      'project_only',
      'public_default',
      'status',
      'parameters',
    ], 'reference_style_profile_scope_invalid', 'Actual reference style profile is incomplete.');
    if (referenceStyleProfile.schema_version !== 1
      || !TOKEN.test(referenceStyleProfile.profile_id ?? '')
      || !SAFE_ID.test(referenceStyleProfile.project_id ?? '')
      || referenceStyleProfile.project_only !== true
      || referenceStyleProfile.public_default !== false
      || referenceStyleProfile.status !== 'draft') {
      fail('reference_style_profile_scope_invalid', 'Actual reference profile must be project-only, draft and non-default.');
    }
    const reservedParameterKeys = new Set([
      'project_id',
      'project_only',
      'public_default',
      'default_profile_id',
      'status',
    ]);
    if (!referenceStyleProfile.parameters
      || typeof referenceStyleProfile.parameters !== 'object'
      || Array.isArray(referenceStyleProfile.parameters)
      || Object.keys(referenceStyleProfile.parameters).some((key) => reservedParameterKeys.has(key))) {
      fail('reference_style_profile_scope_invalid', 'Reference profile parameters cannot override scope, default or status.');
    }
        assertNoLegacyActiveFields(referenceStyleProfile);
    if (value.reference_style_profile.profile_id !== referenceStyleProfile.profile_id
      || value.reference_style_profile.project_id !== referenceStyleProfile.project_id
      || value.reference_style_profile.project_only !== referenceStyleProfile.project_only
      || value.reference_style_profile.public_default !== referenceStyleProfile.public_default
      || value.reference_style_profile.status !== referenceStyleProfile.status
      || value.reference_style_profile.profile_sha256 !== fingerprintV3Value(referenceStyleProfile)) {
      fail('reference_style_profile_binding_mismatch', 'Design system does not bind the actual project profile.');
    }
  }

  const arrayFields = [
    'palette_roles',
    'type_roles',
    'safe_regions',
    'spacing_tokens',
    'radius_tokens',
    'material_recipes',
    'z_bands',
    'component_roles',
    'motion_profiles',
    'identity_invariants',
    'anti_identity_rules',
    'prohibited_motifs',
    'whole_film_budget_refs',
  ];
  for (const field of arrayFields) {
    if (!Array.isArray(value[field]) || value[field].length < 1 || value[field].length > 128) {
      fail('design_system_invalid', `Design-system ${field} is invalid.`);
    }
  }
  const paletteRoles = new Set();
  const paletteTokens = new Set();
  for (const record of value.palette_roles) {
    exact(record, ['role', 'token', 'value'], 'design_system_invalid', 'Palette role is invalid.');
    if (!TOKEN.test(record.role ?? '') || !TOKEN.test(record.token ?? '')
      || paletteRoles.has(record.role) || paletteTokens.has(record.token)) {
      fail('design_system_invalid', 'Palette role and token must be valid and unique.');
    }
    text(record.value, 'design_system_invalid', 'Palette value is invalid.', record.role, { max: 120 });
    paletteRoles.add(record.role);
    paletteTokens.add(record.token);
  }
  const typeRoles = new Set();
  for (const role of value.type_roles) {
    exact(role, [
      'role',
      'semantic_class',
      'may_carry_primary_meaning',
      'min_height_ratio',
      'font_role_id',
    ], 'type_role_invalid', 'Type role is invalid.');
    if (!TOKEN.test(role.role ?? '') || typeRoles.has(role.role)
      || !['functional', 'texture'].includes(role.semantic_class)
      || typeof role.may_carry_primary_meaning !== 'boolean'
      || typeof role.min_height_ratio !== 'number'
      || !Number.isFinite(role.min_height_ratio)
      || role.min_height_ratio <= 0
      || role.min_height_ratio > 0.5
      || !TOKEN.test(role.font_role_id ?? '')) {
      fail('type_role_invalid', 'Type role declaration is invalid.');
    }
    if (role.role === 'microtext-texture'
      && (role.semantic_class !== 'texture' || role.may_carry_primary_meaning !== false)) {
      fail('microtext_semantic_role_forbidden', 'Microtext texture cannot carry primary meaning.');
    }
    typeRoles.add(role.role);
  }
  if ([...REQUIRED_TYPE_ROLES].some((role) => !typeRoles.has(role))) {
    fail('type_role_invalid', 'Design system lacks a required role-aware type role.');
  }
  const motionIds = new Set();
  for (const profile of value.motion_profiles) {
    exact(profile, [
      'motion_profile_id',
      'entry_frames',
      'action_frames_min',
      'finite_repeat_only',
      'paused_timeline_required',
    ], 'motion_profile_invalid', 'Motion profile is invalid.');
    if (!TOKEN.test(profile.motion_profile_id ?? '') || motionIds.has(profile.motion_profile_id)
      || !Number.isSafeInteger(profile.entry_frames) || profile.entry_frames < 0
      || !Number.isSafeInteger(profile.action_frames_min) || profile.action_frames_min < 1
      || profile.finite_repeat_only !== true || profile.paused_timeline_required !== true) {
      fail('motion_profile_invalid', 'Motion profile must be deterministic and finite.');
    }
    motionIds.add(profile.motion_profile_id);
  }
  const safeRegionIds = new Set();
  for (const region of value.safe_regions) {
    exact(region, ['region_id', 'x', 'y', 'width', 'height'], 'design_system_invalid', 'Safe region is invalid.');
    if (!TOKEN.test(region.region_id ?? '') || safeRegionIds.has(region.region_id)) {
      fail('design_system_invalid', 'Safe-region IDs must be valid and unique.');
    }
    for (const field of ['x', 'y', 'width', 'height']) {
      if (typeof region[field] !== 'number' || !Number.isFinite(region[field])) {
        fail('design_system_invalid', 'Safe-region coordinates are invalid.', region.region_id);
      }
    }
    if (region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0
      || region.x + region.width > 1 || region.y + region.height > 1) {
      fail('design_system_invalid', 'Safe region exceeds the normalized canvas.', region.region_id);
    }
    safeRegionIds.add(region.region_id);
  }
  for (const field of ['spacing_tokens', 'radius_tokens']) {
    const seen = new Set();
    for (const record of value[field]) {
      exact(record, ['token', 'value_px'], 'design_system_invalid', `${field} record is invalid.`);
      if (!TOKEN.test(record.token ?? '') || seen.has(record.token)
        || !Number.isSafeInteger(record.value_px) || record.value_px < 0 || record.value_px > 10000) {
        fail('design_system_invalid', `${field} tokens must be unique non-negative integers.`);
      }
      seen.add(record.token);
    }
  }
  const materialIds = new Set();
  for (const recipe of value.material_recipes) {
    exact(recipe, ['recipe_id', 'description'], 'design_system_invalid', 'Material recipe is invalid.');
    if (!TOKEN.test(recipe.recipe_id ?? '') || materialIds.has(recipe.recipe_id)) {
      fail('design_system_invalid', 'Material-recipe IDs must be valid and unique.');
    }
    text(recipe.description, 'design_system_invalid', 'Material recipe needs a description.', recipe.recipe_id);
    materialIds.add(recipe.recipe_id);
  }
  const zBandIds = new Set();
  let previousZMax = Number.NEGATIVE_INFINITY;
  for (const band of [...value.z_bands].sort((left, right) => left.min - right.min)) {
    exact(band, ['band_id', 'min', 'max'], 'design_system_invalid', 'Z band is invalid.');
    if (!TOKEN.test(band.band_id ?? '') || zBandIds.has(band.band_id)
      || !Number.isSafeInteger(band.min) || !Number.isSafeInteger(band.max)
      || band.max < band.min || band.min <= previousZMax) {
      fail('design_system_invalid', 'Z bands must be valid, unique and non-overlapping.');
    }
    zBandIds.add(band.band_id);
    previousZMax = band.max;
  }
  const componentRoleIds = new Set();
  for (const role of value.component_roles) {
    exact(role, ['component_id', 'role'], 'design_system_invalid', 'Component role is invalid.');
    if (!TOKEN.test(role.component_id ?? '') || componentRoleIds.has(role.component_id)) {
      fail('design_system_invalid', 'Component-role IDs must be valid and unique.');
    }
    text(role.role, 'design_system_invalid', 'Component role description is invalid.', role.component_id);
    componentRoleIds.add(role.component_id);
  }
  for (const field of ['identity_invariants', 'anti_identity_rules', 'prohibited_motifs']) {
    stringList(value[field], 'design_system_invalid', `${field} is invalid.`, undefined, {
      min: 1,
      max: 128,
    });
  }
  if (JSON.stringify([...value.whole_film_budget_refs].sort()) !== JSON.stringify([
    'density_curve',
    'emphasis_budget',
    'layout_and_metaphor_cooldown',
  ])) fail('design_system_invalid', 'Whole-film budget references are incomplete.');
  verifySelfHash(value, 'design_system_sha256', 'design_system_hash_mismatch');
  return {
    status: 'passed',
    type_role_count: value.type_roles.length,
    motion_profile_count: value.motion_profiles.length,
    reference_style_profile_sha256: value.reference_style_profile.profile_sha256,
    design_system_sha256: value.design_system_sha256,
  };
}

export function validateComponentRegistry(value) {
  exact(value, [
    'schema_version',
    'registry_id',
    'components',
    'component_registry_sha256',
  ], 'component_registry_invalid', 'Component registry shape is invalid.');
  if (value.schema_version !== 1 || !TOKEN.test(value.registry_id ?? '')
    || !Array.isArray(value.components) || value.components.length < REQUIRED_COMPONENT_IDS.length
    || value.components.length > 128) {
    fail('component_registry_invalid', 'Component registry identity or count is invalid.');
  }
  const ids = new Set();
  for (const component of value.components) {
    exact(component, [
      'component_id',
      'semantic_roles',
      'allowed_type_roles',
      'layout_contract',
      'motion_profile_ids',
      'z_band_ids',
      'stable_result_assertions',
      'status_color_roles',
      'allows_overshoot',
      'allows_stroke_animation',
      'allows_overflow',
    ], 'component_registry_invalid', 'Component record is invalid.');
    if (!TOKEN.test(component.component_id ?? '') || ids.has(component.component_id)) {
      fail('component_registry_invalid', 'Component IDs must be valid and unique.');
    }
    ids.add(component.component_id);
    for (const field of [
      'semantic_roles',
      'allowed_type_roles',
      'motion_profile_ids',
      'z_band_ids',
      'stable_result_assertions',
      'status_color_roles',
    ]) stringList(component[field], 'component_registry_invalid', `Component ${field} is invalid.`, component.component_id, { min: 1, max: 24 });
    exact(component.layout_contract, [
      'layout_families',
      'focal_roles',
      'dominant_axes',
    ], 'component_registry_invalid', 'Component layout contract is invalid.', component.component_id);
    for (const field of ['layout_families', 'focal_roles', 'dominant_axes']) {
      stringList(component.layout_contract[field], 'component_registry_invalid', 'Component layout contract list is invalid.', component.component_id, { min: 1, max: 16 });
    }
    for (const field of ['allows_overshoot', 'allows_stroke_animation', 'allows_overflow']) {
      if (typeof component[field] !== 'boolean') {
        fail('component_registry_invalid', 'Component behavior flags must be boolean.', component.component_id);
      }
    }
  }
  if (REQUIRED_COMPONENT_IDS.some((id) => !ids.has(id))) {
    fail('component_registry_incomplete', 'Component registry lacks a required semantic family.');
  }
  verifySelfHash(value, 'component_registry_sha256', 'component_registry_hash_mismatch');
  return {
    status: 'passed',
    component_count: value.components.length,
    component_registry_sha256: value.component_registry_sha256,
  };
}

export function validateValidationPolicy(value, { internal = false } = {}) {
  exact(value, [
    'schema_version',
    'pipeline_contract_version',
    'validation_policy_id',
    'context_budget',
    'profile_policy',
    'readable_hold_policy',
    'data_policy',
    'whole_film_budgets',
    'runtime_sample_strategy',
    'pixel_thresholds',
    'gate_policies',
    'cache_key_fields',
    'tool_bindings',
    'legacy_policy',
    'validation_policy_sha256',
  ], 'validation_policy_invalid', 'Validation policy shape is invalid.');
  if (value.schema_version !== 1) fail('validation_policy_invalid', 'Validation policy schema version is invalid.');
  verifyV3Identity(value, 'validation_policy_invalid');
  try {
    validateContextBudget({}, { kind: 'block-receipt', policy: value.context_budget });
  } catch (error) {
    if (error instanceof ContextBudgetError) fail(error.code, error.message);
    throw error;
  }
  exact(value.profile_policy, [
    'project_profile_required',
    'public_default_profile_id',
    'forbidden_public_default_profiles',
  ], 'validation_policy_invalid', 'Profile policy is invalid.');
  if (value.profile_policy.project_profile_required !== true
    || value.profile_policy.public_default_profile_id !== null
    || !Array.isArray(value.profile_policy.forbidden_public_default_profiles)
    || !value.profile_policy.forbidden_public_default_profiles.includes('deep-current-hud')) {
    fail('reference_style_profile_scope_invalid', 'Deep Current must remain a project-only profile.');
  }
  exact(value.readable_hold_policy, [
    'ordinary_min_frames',
    'complex_min_frames',
    'complex_classes',
    'short_window_action',
  ], 'validation_policy_invalid', 'Readable hold policy is invalid.');
  if (!Number.isSafeInteger(value.readable_hold_policy.ordinary_min_frames)
    || value.readable_hold_policy.ordinary_min_frames < 24
    || !Number.isSafeInteger(value.readable_hold_policy.complex_min_frames)
    || value.readable_hold_policy.complex_min_frames < 45
    || value.readable_hold_policy.complex_min_frames < value.readable_hold_policy.ordinary_min_frames
    || value.readable_hold_policy.short_window_action !== 'reduce-content-or-motion') {
    fail('readable_hold_invalid', 'Readable hold policy violates the frozen minimum.');
  }
  stringList(value.readable_hold_policy.complex_classes, 'validation_policy_invalid', 'Complex readability classes are invalid.');
  if (!sameJson(value.readable_hold_policy.complex_classes, ['table', 'chart', 'multi-field', 'data'])) {
    fail('validation_policy_invalid', 'Complex readability classes must equal the frozen registry.');
  }
  exact(value.data_policy, [
    'evidence_roles',
    'require_unit',
    'require_denominator',
    'require_formula',
    'require_source_ref',
  ], 'validation_policy_invalid', 'Data policy is invalid.');
  if (JSON.stringify([...value.data_policy.evidence_roles].sort()) !== JSON.stringify([...EVIDENCE_ROLES].sort())
    || ['require_unit', 'require_denominator', 'require_formula', 'require_source_ref']
      .some((field) => value.data_policy[field] !== true)) {
    fail('data_provenance_invalid', 'Data provenance policy is incomplete.');
  }
  exact(value.whole_film_budgets, [
    'emphasis_max_events',
    'density_level_min',
    'density_level_max',
    'max_same_layout_run',
    'max_same_metaphor_run',
    'cooldown_min_changed_dimensions',
  ], 'validation_policy_invalid', 'Whole-film budgets are invalid.');
  for (const field of Object.keys(value.whole_film_budgets)) {
    integer(value.whole_film_budgets[field], 'validation_policy_invalid', `Whole-film budget ${field} is invalid.`, undefined, { min: 1 });
  }
  if (value.whole_film_budgets.density_level_min >= value.whole_film_budgets.density_level_max
    || value.whole_film_budgets.cooldown_min_changed_dimensions < 2) {
    fail('cooldown_budget_invalid', 'Whole-film density/cooldown budgets are invalid.');
  }
  exact(value.runtime_sample_strategy, [
    'paths',
    'causal_phases',
    'state_hash_required',
  ], 'validation_policy_invalid', 'Runtime sample strategy is invalid.');
  if (JSON.stringify(value.runtime_sample_strategy.paths) !== JSON.stringify([
    'fresh_direct',
    'zero_to_t',
    'end_to_t',
    'repeat_to_t',
  ]) || JSON.stringify(value.runtime_sample_strategy.causal_phases) !== JSON.stringify(PHASES)
    || value.runtime_sample_strategy.state_hash_required !== true) {
    fail('validation_policy_invalid', 'Runtime sample strategy must include all deterministic seek paths.');
  }
  exact(value.pixel_thresholds, [
    'near_black_luma_max',
    'near_empty_coverage_max_ratio',
    'text_overflow_tolerance_px',
    'primary_roi_min_ratio',
  ], 'validation_policy_invalid', 'Pixel thresholds are invalid.');
  for (const metric of Object.values(value.pixel_thresholds)) {
    if (typeof metric !== 'number' || !Number.isFinite(metric) || metric < 0) {
      fail('validation_policy_invalid', 'Pixel threshold is invalid.');
    }
  }
  if (value.pixel_thresholds.near_black_luma_max > 255
    || value.pixel_thresholds.near_empty_coverage_max_ratio > 1
    || value.pixel_thresholds.primary_roi_min_ratio > 1) {
    fail('validation_policy_invalid', 'Pixel threshold exceeds its schema maximum.');
  }
  exact(value.gate_policies, GATE_NAMES, 'validation_policy_invalid', 'Five gate policies are required.');
  for (const gate of GATE_NAMES) {
    exact(value.gate_policies[gate], [
      'hard_failure_codes',
      'warning_codes',
    ], 'validation_policy_invalid', 'Gate policy is invalid.', gate);
    stringList(value.gate_policies[gate].hard_failure_codes, 'validation_policy_invalid', 'Gate hard failures are invalid.', gate);
    stringList(value.gate_policies[gate].warning_codes, 'validation_policy_invalid', 'Gate warnings are invalid.', gate);
  }
  if (JSON.stringify(value.cache_key_fields) !== JSON.stringify([
    'source_sha256',
    'policy_sha256',
    'production_contract_sha256',
    'renderer_version',
    'hyperframes_version',
    'state_or_frame',
  ])) fail('validation_policy_invalid', 'Cache-key fields are incomplete.');
  exact(value.tool_bindings, [
    'renderer_version',
    'hyperframes_version',
    'policy_version',
  ], 'validation_policy_invalid', 'Tool bindings are invalid.');
  for (const version of Object.values(value.tool_bindings)) {
    text(version, 'validation_policy_invalid', 'Tool version must be explicit.', undefined, { max: 120 });
  }
  exact(value.legacy_policy, [
    'accepted_pipeline_contract_version',
    'legacy_pipeline_contract_versions',
    'mode',
    'resume_allowed',
    'resign_allowed',
    'render_authorization_allowed',
    'forbidden_active_fields',
  ], 'validation_policy_invalid', 'Legacy policy is invalid.');
  if (value.legacy_policy.accepted_pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
    || JSON.stringify(value.legacy_policy.legacy_pipeline_contract_versions) !== JSON.stringify([2])
    || value.legacy_policy.mode !== 'inspection-only'
    || value.legacy_policy.resume_allowed !== false
    || value.legacy_policy.resign_allowed !== false
    || value.legacy_policy.render_authorization_allowed !== false
    || JSON.stringify([...value.legacy_policy.forbidden_active_fields].sort())
      !== JSON.stringify([...LEGACY_FIELDS].sort())) {
    fail('legacy_policy_invalid', 'Legacy v2 must remain inspection-only and non-authorizing.');
  }
  verifySelfHash(value, 'validation_policy_sha256', 'validation_policy_hash_mismatch');
  if (internal) return structuredClone(value);
  return {
    status: 'passed',
    gate_count: GATE_NAMES.length,
    validation_policy_sha256: value.validation_policy_sha256,
  };
}

function validateParsedSrtAndProjection(artifacts) {
  const {
    parsedSrt,
    shotPlan,
    projection,
  } = artifacts;
  exact(
    parsedSrt,
    ['schema_version', 'artifact_kind', 'cues'],
    'parsed_srt_invalid',
    'Actual parsed-SRT artifact is required.',
  );
  if (parsedSrt.schema_version !== 1 || parsedSrt.artifact_kind !== 'parsed-srt'
    || !Array.isArray(parsedSrt.cues) || parsedSrt.cues.length < 1) {
    fail('parsed_srt_invalid', 'Parsed-SRT identity or cue list is invalid.');
  }
  const cueIds = new Set();
  let priorCueEnd = 0;
  for (const cue of parsedSrt.cues) {
    exact(cue, ['cue_id', 'start_ms', 'end_ms', 'text'], 'parsed_srt_invalid', 'Parsed-SRT cue is invalid.');
    if (!SAFE_ID.test(cue.cue_id ?? '') || cueIds.has(cue.cue_id)) {
      fail('parsed_srt_invalid', 'Parsed-SRT cue IDs must be valid and unique.');
    }
    integer(cue.start_ms, 'parsed_srt_invalid', 'Cue start is invalid.', cue.cue_id);
    integer(cue.end_ms, 'parsed_srt_invalid', 'Cue end is invalid.', cue.cue_id, { min: 1 });
    text(cue.text, 'parsed_srt_invalid', 'Cue text is required.', cue.cue_id, { max: 2000 });
    if (cue.end_ms <= cue.start_ms || cue.start_ms < priorCueEnd) {
      fail('parsed_srt_invalid', 'Parsed-SRT cues must be ordered and non-overlapping.', cue.cue_id);
    }
    priorCueEnd = cue.end_ms;
    cueIds.add(cue.cue_id);
  }
  const parsedHash = fingerprintV3Value(parsedSrt);
  if (shotPlan.parsed_srt_sha256 !== parsedHash) {
    fail('parsed_srt_binding_mismatch', 'Shot plan does not bind the actual parsed-SRT artifact.');
  }
  if (parsedSrt.cues[0].start_ms !== shotPlan.shots[0].start_ms
    || parsedSrt.cues.at(-1).end_ms !== shotPlan.shots.at(-1).end_ms) {
    fail('parsed_srt_window_mismatch', 'Actual parsed-SRT first/last boundaries must equal the shot-plan timeline.');
  }
  exact(projection, [
    'schema_version',
    'pipeline_contract_version',
    'artifact_kind',
    'parsed_srt_sha256',
    'shot_plan_sha256',
    'fps',
    'shots',
  ], 'projection_binding_mismatch', 'Actual frame projection is required.');
  if (projection.schema_version !== 1
    || projection.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
    || projection.artifact_kind !== 'frame-projection'
    || projection.parsed_srt_sha256 !== parsedHash
    || projection.shot_plan_sha256 !== shotPlan.shot_plan_sha256
    || !sameJson(projection.fps, shotPlan.fps)
    || !Array.isArray(projection.shots)
    || projection.shots.length !== shotPlan.shots.length) {
    fail('projection_binding_mismatch', 'Projection identity, SRT, shot-plan or FPS binding is invalid.');
  }
  const coveredCues = new Set();
  for (let index = 0; index < shotPlan.shots.length; index += 1) {
    const shot = shotPlan.shots[index];
    const projected = projection.shots[index];
    exact(
      projected,
      ['shot_id', 'cue_ids', 'srt_window_ms', 'frame_window'],
      'projection_binding_mismatch',
      'Projected shot shape is invalid.',
      shot.shot_id,
    );
    exact(projected.srt_window_ms, ['start_ms', 'end_ms'], 'projection_binding_mismatch', 'Projected SRT window is invalid.', shot.shot_id);
    exact(projected.frame_window, ['start_frame', 'end_frame', 'duration_frames'], 'projection_binding_mismatch', 'Projected frame window is invalid.', shot.shot_id);
    const expectedStartFrame = Math.round(
      shot.start_ms * shotPlan.fps.numerator / (1000 * shotPlan.fps.denominator),
    );
    const expectedEndFrame = Math.round(
      shot.end_ms * shotPlan.fps.numerator / (1000 * shotPlan.fps.denominator),
    );
    const actualCueIds = parsedSrt.cues
      .filter((cue) => cue.start_ms < shot.end_ms && cue.end_ms > shot.start_ms)
      .map((cue) => cue.cue_id);
    if (projected.shot_id !== shot.shot_id
      || projected.srt_window_ms.start_ms !== shot.start_ms
      || projected.srt_window_ms.end_ms !== shot.end_ms
      || projected.frame_window.start_frame !== expectedStartFrame
      || projected.frame_window.end_frame !== expectedEndFrame
      || projected.frame_window.duration_frames !== expectedEndFrame - expectedStartFrame
      || shot.causal_lifecycle.exit.end_frame !== projected.frame_window.duration_frames
      || !sameJson(projected.cue_ids, shot.cue_ids)
      || !sameJson(shot.cue_ids, actualCueIds)) {
      fail('projection_binding_mismatch', 'Projection does not match shot SRT coverage or derived frame mapping.', shot.shot_id);
    }
    projected.cue_ids.forEach((id) => coveredCues.add(id));
  }
  if (coveredCues.size !== cueIds.size || [...cueIds].some((id) => !coveredCues.has(id))) {
    fail('projection_binding_mismatch', 'Projection does not cover every parsed-SRT cue.');
  }
}

function validateCanonicalCrossBindings(artifacts) {
  const required = [
    'parsedSrt',
    'shotPlan',
    'designSystem',
    'componentRegistry',
    'validationPolicy',
    'referenceStyleProfile',
    'fontPackage',
    'projection',
    'deliveryProfile',
  ];
  if (!artifacts || typeof artifacts !== 'object' || required.some((field) => !artifacts[field])) {
    fail('production_contract_artifacts_required', 'Actual canonical artifacts are required; hashes alone are insufficient.');
  }
  for (const field of required) assertNoLegacyActiveFields(artifacts[field]);
  validateValidationPolicy(artifacts.validationPolicy);
  validateV3ShotPlan(artifacts.shotPlan, artifacts.validationPolicy);
  validateDesignSystem(artifacts.designSystem, {
    referenceStyleProfile: artifacts.referenceStyleProfile,
  });
  validateComponentRegistry(artifacts.componentRegistry);
  validateParsedSrtAndProjection(artifacts);
  const typeRoles = new Set(artifacts.designSystem.type_roles.map((record) => record.role));
  const motionProfiles = new Set(artifacts.designSystem.motion_profiles.map((record) => record.motion_profile_id));
  const paletteRoles = new Set(artifacts.designSystem.palette_roles.map((record) => record.role));
  const zBands = new Set(artifacts.designSystem.z_bands.map((record) => record.band_id));
  const safeRegionIds = new Set(artifacts.designSystem.safe_regions.map((record) => record.region_id));
  const components = new Set(artifacts.componentRegistry.components.map((record) => record.component_id));
  const designComponentRoles = new Set(
    artifacts.designSystem.component_roles.map((record) => record.component_id),
  );
  if ([...components].some((componentId) => !designComponentRoles.has(componentId))) {
    fail('canonical_artifact_reference_unregistered', 'Design system lacks a registered component role.');
  }
  for (const component of artifacts.componentRegistry.components) {
    if (component.allowed_type_roles.some((role) => !typeRoles.has(role))
      || component.motion_profile_ids.some((profile) => !motionProfiles.has(profile))
      || component.z_band_ids.some((band) => !zBands.has(band))
      || component.status_color_roles.some((role) => !paletteRoles.has(role))) {
      fail('canonical_artifact_reference_unregistered', 'Component registry references an unknown design-system role.', component.component_id);
    }
  }
  for (const shot of artifacts.shotPlan.shots) {
    const component = artifacts.componentRegistry.components.find(
      (record) => record.component_id === shot.component_id,
    );
    if (shot.text_roles.some((role) => !typeRoles.has(role))
      || !motionProfiles.has(shot.motion_profile_id)
      || !components.has(shot.component_id)
      || shot.text_roles.some((role) => !component.allowed_type_roles.includes(role))
      || !component.layout_contract.layout_families.includes(shot.layout_family)
      || !component.layout_contract.focal_roles.includes(shot.focal_role)
      || !component.motion_profile_ids.includes(shot.motion_profile_id)) {
      fail('canonical_artifact_reference_unregistered', 'Shot plan references an unregistered type, motion or component.', shot.shot_id);
    }
    for (const element of shot.text_elements) {
      const role = artifacts.designSystem.type_roles.find((record) => record.role === element.type_role);
      if (!role || element.carries_primary_meaning && role.may_carry_primary_meaning !== true) {
        fail('canonical_artifact_reference_unregistered', 'Text element uses an unregistered semantic type role.', shot.shot_id);
      }
    }
    for (const reference of shot.creative_directive.attention_plan.negative_space_region_refs) {
      const [, regionId] = reference.split(':', 2);
      if (!safeRegionIds.has(regionId)) {
        fail('creative_directive_attention_invalid', 'Creative directive references an unregistered negative-space region.', shot.shot_id);
      }
    }
  }
}

export function validateProductionContractShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('production_contract_invalid', 'Production contract is invalid.');
  }
  if (value.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION) {
    fail('pipeline_upgrade_required', 'Legacy production artifacts cannot resume into v3.');
  }
  assertNoLegacyActiveFields(value);
  const fields = value.contract_phase === 'director' ? DIRECTOR_FIELDS
    : value.contract_phase === 'sealed' ? SEALED_FIELDS : null;
  if (!fields) fail('production_contract_phase_invalid', 'Production contract phase is invalid.');
  exact(value, fields, 'production_contract_invalid', 'Production contract shape is invalid.');
  if (value.schema_version !== 1) fail('production_contract_invalid', 'Production contract schema version is invalid.');
  verifyV3Identity(value, 'production_contract_invalid');
  for (const field of fields.filter((field) => field.endsWith('_sha256'))) {
    if (!SHA256.test(value[field] ?? '')) {
      fail('production_contract_invalid', `Production contract hash is invalid: ${field}.`);
    }
  }
  verifySelfHash(value, 'production_contract_sha256', 'production_contract_hash_mismatch');
  return value;
}

export function validateProductionContract(value, {
  priorContract,
  assetManifest,
  artifacts,
} = {}) {
  validateProductionContractShape(value);
  validateCanonicalCrossBindings(artifacts);
  for (const [contractField, artifactField, artifactHashField] of DOCUMENT_ARTIFACT_FIELDS) {
    if (value[contractField] !== artifacts[artifactField][artifactHashField]) {
      fail('production_contract_binding_mismatch', `Production contract does not bind ${artifactField}.`);
    }
  }
  const directBindings = [
    ['parsed_srt_sha256', fingerprintV3Value(artifacts.parsedSrt)],
    ['reference_style_profile_sha256', fingerprintV3Value(artifacts.referenceStyleProfile)],
    ['font_package_sha256', fingerprintV3Value(artifacts.fontPackage)],
    ['projection_sha256', fingerprintV3Value(artifacts.projection)],
    ['delivery_profile_sha256', fingerprintV3Value(artifacts.deliveryProfile)],
  ];
  for (const [field, expected] of directBindings) {
    if (value[field] !== expected) {
      fail('production_contract_binding_mismatch', `Production contract does not bind actual ${field}.`);
    }
  }
  if (value.contract_phase === 'director') {
    if (priorContract !== undefined || assetManifest !== undefined
      || Object.hasOwn(value, 'asset_manifest_sha256')
      || Object.hasOwn(value, 'prior_contract_sha256')) {
      fail('director_contract_asset_forbidden', 'Director contract cannot contain unknown future asset hashes.');
    }
    return {
      status: 'passed',
      contract_phase: 'director',
      production_contract_sha256: value.production_contract_sha256,
    };
  }
  if (!priorContract || !assetManifest) {
    fail('sealed_contract_inputs_required', 'Sealed contract requires the actual prior contract and asset manifest.');
  }
  assertNoLegacyActiveFields(priorContract);
  assertNoLegacyActiveFields(assetManifest);
  validateProductionContractShape(priorContract);
  if (priorContract.contract_phase !== 'director'
    || value.prior_contract_sha256 !== priorContract.production_contract_sha256) {
    fail('production_contract_prior_mismatch', 'Sealed contract does not bind its exact director predecessor.');
  }
  for (const field of DIRECTOR_FIELDS.filter((name) => name !== 'contract_phase' && name !== 'production_contract_sha256')) {
    if (value[field] !== priorContract[field]) {
      fail('production_contract_prior_mismatch', 'Sealed contract changed a director-phase canonical binding.');
    }
  }
  if (value.asset_manifest_sha256 !== fingerprintV3Value(assetManifest)) {
    fail('production_contract_binding_mismatch', 'Sealed contract does not bind the actual asset manifest.');
  }
  return {
    status: 'passed',
    contract_phase: 'sealed',
    production_contract_sha256: value.production_contract_sha256,
    prior_contract_sha256: value.prior_contract_sha256,
    asset_manifest_sha256: value.asset_manifest_sha256,
  };
}

function validateBlockCreativeDefinition(block, shotPlan) {
  exact(block, ['block_id', 'shot_ids'], 'scoped_block_packet_invalid', 'Block creative packet needs one closed block identity.');
  if (!BLOCK_ID.test(block.block_id ?? '')) {
    fail('scoped_block_packet_invalid', 'Block ID is invalid.');
  }
  stringList(block.shot_ids, 'scoped_block_packet_invalid', 'Block shot IDs are invalid.', block.block_id, {
    min: 1,
    max: 8,
    pattern: SHOT_ID,
  });
  const allShotIds = shotPlan.shots.map((shot) => shot.shot_id);
  const firstIndex = allShotIds.indexOf(block.shot_ids[0]);
  const expectedShotIds = allShotIds.slice(firstIndex, firstIndex + block.shot_ids.length);
  if (firstIndex < 0 || !sameJson(block.shot_ids, expectedShotIds)) {
    fail('scoped_block_packet_cross_block_fact', 'Block shots must be one ordered contiguous slice of the canonical shot plan.', block.block_id);
  }
  const shots = shotPlan.shots.slice(firstIndex, firstIndex + block.shot_ids.length);
  const spanMs = shots.at(-1).end_ms - shots[0].start_ms;
  if (shots.length > 1 && spanMs > 45_000) {
    fail('scoped_block_packet_invalid', 'Multi-shot blocks cannot exceed the bounded 45-second authoring span.', block.block_id);
  }
  return shots;
}

function assertNoForbiddenBlockPacketContent(value, seen = new Set()) {
  if (typeof value === 'string') {
    if (isPrivateLocalPath(value)) {
      fail('scoped_block_packet_forbidden_content', 'Scoped block packets cannot contain private paths.');
    }
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) fail('canonical_value_invalid', 'Scoped block packet contains a cycle.');
  seen.add(value);
  for (const [key, item] of Object.entries(value)) {
    const normalized = key
      .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
      .replace(/[-.]+/gu, '_')
      .toLowerCase();
    if (FORBIDDEN_BLOCK_PACKET_KEY.test(normalized)) {
      fail('scoped_block_packet_forbidden_content', `Scoped block packet cannot carry ${key}.`);
    }
    assertNoForbiddenBlockPacketContent(item, seen);
  }
  seen.delete(value);
}

function scopedShotCreativeFacts(shot) {
  return {
    shot_id: shot.shot_id,
    chapter_id: shot.chapter_id,
    time_window: {
      start_ms: shot.start_ms,
      end_ms: shot.end_ms,
    },
    semantic_claim: shot.semantic_claim,
    creative_directive: structuredClone(shot.creative_directive),
    design_facts: {
      focal_role: shot.focal_role,
      density_level: shot.density_level,
      layout_family: shot.layout_family,
      dominant_axis: shot.dominant_axis,
      primary_primitive: shot.primary_primitive,
      component_id: shot.component_id,
      motion_profile_id: shot.motion_profile_id,
    },
    typography_facts: {
      text_roles: [...shot.text_roles],
      text_elements: structuredClone(shot.text_elements),
    },
    lifecycle_facts: {
      hold_window: structuredClone(shot.hold_window),
      causal_lifecycle: structuredClone(shot.causal_lifecycle),
    },
  };
}

export function createScopedBlockCreativePacketCore({
  block,
  productionContract,
  artifacts,
  priorContract,
  assetManifest,
} = {}) {
  validateProductionContract(productionContract, {
    artifacts,
    priorContract,
    assetManifest,
  });
  if (productionContract.contract_phase !== 'sealed') {
    fail('scoped_block_packet_contract_phase_invalid', 'Scoped block creative packets require the sealed production contract.');
  }
  const shots = validateBlockCreativeDefinition(block, artifacts.shotPlan);
  const firstShotIndex = artifacts.shotPlan.shots.findIndex((shot) => shot.shot_id === shots[0].shot_id);
  const before = artifacts.shotPlan.shots[firstShotIndex - 1] ?? null;
  const after = artifacts.shotPlan.shots[firstShotIndex + shots.length] ?? null;
  return {
    schema_version: 1,
    artifact_kind: 'scoped-block-creative-packet',
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    block_id: block.block_id,
    shot_ids: [...block.shot_ids],
    production_contract_sha256: productionContract.production_contract_sha256,
    shot_plan_sha256: productionContract.shot_plan_sha256,
    design_system_sha256: productionContract.design_system_sha256,
    font_package_sha256: productionContract.font_package_sha256,
    asset_manifest_sha256: productionContract.asset_manifest_sha256,
    block_time_window: {
      start_ms: shots[0].start_ms,
      end_ms: shots.at(-1).end_ms,
    },
    adjacent_seams: {
      previous_shot_id: before?.shot_id ?? null,
      next_shot_id: after?.shot_id ?? null,
    },
    scoped_shots: shots.map(scopedShotCreativeFacts),
  };
}

export function validateScopedBlockCreativePacket(packet, {
  block,
  productionContract,
  artifacts,
  priorContract,
  assetManifest,
} = {}) {
  assertNoLegacyActiveFields(packet);
  assertNoForbiddenBlockPacketContent(packet);
  exact(packet, [
    'schema_version',
    'artifact_kind',
    'pipeline_contract_version',
    'authoring_topology_id',
    'block_id',
    'shot_ids',
    'production_contract_sha256',
    'shot_plan_sha256',
    'design_system_sha256',
    'font_package_sha256',
    'asset_manifest_sha256',
    'block_time_window',
    'adjacent_seams',
    'scoped_shots',
    'packet_sha256',
  ], 'scoped_block_packet_invalid', 'Scoped block creative packet shape is invalid.');
  if (packet.schema_version !== 1
    || packet.artifact_kind !== 'scoped-block-creative-packet'
    || packet.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
    || packet.authoring_topology_id !== AUTHORING_TOPOLOGY_ID) {
    fail('scoped_block_packet_invalid', 'Scoped block creative packet identity is invalid.');
  }
  verifySelfHash(packet, 'packet_sha256', 'scoped_block_packet_hash_mismatch');
  try {
    validateContextBudget(packet, {
      kind: 'scoped-block-creative-packet',
      policy: artifacts?.validationPolicy?.context_budget,
    });
  } catch (error) {
    if (error instanceof ContextBudgetError) {
      if (error.code === 'context_budget_exceeded') {
        fail('scoped_block_packet_budget_exceeded', 'Scoped block creative packet exceeds the frozen 24 KiB child budget.');
      }
      if (error.code === 'child_bootstrap_cross_block_fact') {
        fail('scoped_block_packet_binding_mismatch', 'Scoped block creative packet contains facts outside its bound block.');
      }
      if (error.code === 'child_bootstrap_forbidden_content') {
        fail('scoped_block_packet_forbidden_content', 'Scoped block creative packet contains forbidden raw content.');
      }
      fail('scoped_block_packet_invalid', error.message);
    }
    throw error;
  }
  const expected = createScopedBlockCreativePacketCore({
    block,
    productionContract,
    artifacts,
    priorContract,
    assetManifest,
  });
  if (!sameJson(without(packet, 'packet_sha256'), expected)) {
    fail('scoped_block_packet_binding_mismatch', 'Scoped block creative packet does not equal the bound canonical block facts.');
  }
  return {
    status: 'passed',
    block_id: packet.block_id,
    shot_count: packet.shot_ids.length,
    packet_sha256: packet.packet_sha256,
  };
}

function validateGatePhase(gate, phase, productionContract) {
  const valid = gate === 'policy-gate'
    ? ['director', 'sealed']
    : gate === 'integration-delivery-gate'
      ? ['integration', 'delivery']
      : ['block'];
  if (!GATE_NAMES.includes(gate) || !valid.includes(phase)) {
    fail('gate_receipt_phase_invalid', 'Gate receipt phase is invalid.');
  }
  const requiredContractPhase = phase === 'director' ? 'director' : 'sealed';
  if (productionContract.contract_phase !== requiredContractPhase) {
    fail('gate_receipt_contract_phase_mismatch', 'Gate receipt uses the wrong production-contract phase.');
  }
}

function validateHashBindings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length < 1 || Object.keys(value).length > 24) {
    fail('gate_receipt_binding_invalid', 'Gate input bindings are invalid.');
  }
  for (const [key, hash] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9_]{1,95}_sha256$/u.test(key) || !SHA256.test(hash ?? '')) {
      fail('gate_receipt_binding_invalid', 'Gate input binding must be a named SHA-256.');
    }
  }
}

const DIRECTOR_RECEIPT_BINDINGS = Object.freeze([
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
]);

function requiredReceiptBindings(gate, phase) {
  if (gate === 'policy-gate') {
    return phase === 'director'
      ? DIRECTOR_RECEIPT_BINDINGS
      : [...DIRECTOR_RECEIPT_BINDINGS, 'prior_contract_sha256', 'asset_manifest_sha256'];
  }
  if (gate === 'source-conformance-gate') {
    return [
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
    ];
  }
  if (gate === 'runtime-seek-gate') {
    return [
      'production_contract_sha256',
      'shot_plan_sha256',
      'validation_policy_sha256',
      'font_package_sha256',
      'projection_sha256',
      'asset_manifest_sha256',
      'block_manifest_sha256',
      'source_sha256',
      'source_conformance_receipt_sha256',
    ];
  }
  if (gate === 'pixel-signal-gate') {
    return [
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
    ];
  }
  const integrationBindings = [
    ...DIRECTOR_RECEIPT_BINDINGS,
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
  return phase === 'delivery'
    ? [
      ...integrationBindings,
      'integration_receipt_sha256',
      'render_receipt_sha256',
      'technical_verify_receipt_sha256',
      'master_media_sha256',
    ]
    : integrationBindings;
}

function validateRequiredReceiptBindings(value, productionContract) {
  const required = requiredReceiptBindings(value.gate, value.phase);
  if (!sameJson(Object.keys(value.input_bindings).sort(), [...required].sort())) {
    fail('gate_receipt_binding_invalid', 'Gate input bindings do not equal the phase-specific closed set.');
  }
  for (const field of required) {
    if (Object.hasOwn(productionContract, field)
      && value.input_bindings[field] !== productionContract[field]) {
      fail('gate_receipt_binding_invalid', `Gate input binding does not match production contract: ${field}.`);
    }
  }
}

function validateCodes(value, code) {
  if (!Array.isArray(value) || value.length > 64 || new Set(value).size !== value.length
    || value.some((item) => !/^[a-z][a-z0-9_]{2,95}$/u.test(item))) {
    fail(code, 'Gate failure/warning codes are invalid.');
  }
}

function validateReceiptMetrics(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 24) {
    fail('gate_receipt_metrics_invalid', 'Gate metrics are invalid.');
  }
  for (const [key, metric] of Object.entries(value)) {
    if (!TOKEN.test(key.replaceAll('_', '-')) || !(
      metric === null
      || typeof metric === 'boolean'
      || typeof metric === 'string' && Buffer.byteLength(metric, 'utf8') <= 160
      || Number.isSafeInteger(metric)
    )) fail('gate_receipt_metrics_invalid', 'Gate metric is invalid.');
  }
}

function rejectCalibrationReceiptFields(value, seen = new Set()) {
  if (typeof value === 'string') {
    const normalizedValue = value.toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
    if (normalizedValue.includes('reachsurge')
      || normalizedValue.includes('positive_reference')
      || normalizedValue.includes('positive_calibration')
      || normalizedValue.includes('gold_pass')) {
      fail('calibration_receipt_forbidden', 'Positive or ReachSurge gold calibration verdicts are forbidden in PASS receipts.');
    }
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) fail('canonical_value_invalid', 'Receipt metrics contain a cycle.');
  seen.add(value);
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase().replaceAll('-', '_');
    if (normalized.includes('reachsurge')
      || normalized.includes('gold_pass')
      || normalized.includes('gold_verdict')
      || normalized.includes('positive_calibration')
      || normalized.includes('positive_reference')) {
      fail('calibration_receipt_forbidden', 'Positive or ReachSurge gold calibration verdicts are forbidden in PASS receipts.');
    }
    rejectCalibrationReceiptFields(item, seen);
  }
  seen.delete(value);
}

function rejectReceiptPrivatePaths(value, seen = new Set()) {
  if (typeof value === 'string') {
    if (isPrivateLocalPath(value)) {
      fail('private_path_forbidden', 'PASS receipt cannot contain private local paths.');
    }
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) fail('canonical_value_invalid', 'Receipt contains a cycle.');
  seen.add(value);
  for (const item of Object.values(value)) rejectReceiptPrivatePaths(item, seen);
  seen.delete(value);
}

export function validateGateReceipt(value, {
  productionContract,
  validationPolicy,
} = {}) {
  const policy = validateValidationPolicy(validationPolicy, { internal: true });
  validateProductionContractShape(productionContract);
  exact(value, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'validation_policy_id',
    'gate',
    'phase',
    'scope_id',
    'production_contract_sha256',
    'input_bindings',
    'status',
    'hard_failure_codes',
    'warning_codes',
    'metrics',
    'cache',
    'receipt_sha256',
  ], 'gate_receipt_invalid', 'Gate receipt shape is invalid.');
  if (value.schema_version !== 1 || !SAFE_ID.test(value.scope_id ?? '')) {
    fail('gate_receipt_invalid', 'Gate receipt identity is invalid.');
  }
  verifyV3Identity(value, 'gate_receipt_invalid');
  validateGatePhase(value.gate, value.phase, productionContract);
  if (value.production_contract_sha256 !== productionContract.production_contract_sha256) {
    fail('gate_receipt_contract_unbound', 'Gate receipt does not bind the current production contract.');
  }
  if (value.status === 'passed') {
    rejectReceiptPrivatePaths({
      input_bindings: value.input_bindings,
      warning_codes: value.warning_codes,
      metrics: value.metrics,
    });
    rejectCalibrationReceiptFields({
      input_bindings: value.input_bindings,
      warning_codes: value.warning_codes,
      metrics: value.metrics,
    });
  }
  validateHashBindings(value.input_bindings);
  if (value.input_bindings.production_contract_sha256 !== value.production_contract_sha256) {
    fail('gate_receipt_binding_invalid', 'Gate input bindings omit the production contract.');
  }
  if (Object.hasOwn(value.input_bindings, 'validation_policy_sha256')
    && (policy.validation_policy_sha256 !== productionContract.validation_policy_sha256
      || value.input_bindings.validation_policy_sha256 !== productionContract.validation_policy_sha256
      || value.input_bindings.validation_policy_sha256 !== policy.validation_policy_sha256)) {
    fail('gate_receipt_policy_binding_mismatch', 'Receipt policy registry must equal the contract and receipt policy binding.');
  }
  validateRequiredReceiptBindings(value, productionContract);
  if (value.gate === 'policy-gate' && value.phase === 'sealed'
    && value.input_bindings.prior_contract_sha256 !== productionContract.prior_contract_sha256) {
    fail('gate_receipt_binding_invalid', 'Sealed policy receipt must rebind the director contract.');
  }
  validateCodes(value.hard_failure_codes, 'gate_receipt_failure_codes_invalid');
  validateCodes(value.warning_codes, 'gate_receipt_warning_codes_invalid');
  const gatePolicy = policy.gate_policies[value.gate];
  if (value.hard_failure_codes.some((code) => !gatePolicy.hard_failure_codes.includes(code))) {
    fail('gate_receipt_failure_codes_invalid', 'Gate receipt hard failures are not registered for this gate.');
  }
  if (value.warning_codes.some((code) => !gatePolicy.warning_codes.includes(code))) {
    fail('gate_receipt_warning_codes_invalid', 'Gate receipt warnings are not registered for this gate.');
  }
  if (!['passed', 'failed'].includes(value.status)
    || value.status === 'passed' && value.hard_failure_codes.length
    || value.status === 'failed' && !value.hard_failure_codes.length) {
    fail('gate_receipt_status_invalid', 'Gate receipt status conflicts with hard failures.');
  }
  validateReceiptMetrics(value.metrics);
  exact(value.cache, ['status', 'cache_key_sha256'], 'gate_receipt_cache_invalid', 'Gate cache record is invalid.');
  if (!['hit', 'miss', 'bypass'].includes(value.cache.status)
    || !SHA256.test(value.cache.cache_key_sha256 ?? '')) {
    fail('gate_receipt_cache_invalid', 'Gate cache binding is invalid.');
  }
  verifySelfHash(value, 'receipt_sha256', 'gate_receipt_hash_mismatch');
  try {
    validateContextBudget(value, {
      kind: 'block-receipt',
      policy: policy.context_budget,
    });
  } catch (error) {
    if (error instanceof ContextBudgetError) fail(error.code, error.message);
    throw error;
  }
  return {
    status: value.status,
    gate: value.gate,
    phase: value.phase,
    scope_id: value.scope_id,
    receipt_sha256: value.receipt_sha256,
  };
}

export function createGateReceipt({
  gate,
  phase,
  scope_id,
  productionContract,
  input_bindings,
  status,
  hard_failure_codes,
  warning_codes,
  metrics,
  cache,
  validationPolicy,
}) {
  validateValidationPolicy(validationPolicy);
  validateProductionContractShape(productionContract);
  validateGatePhase(gate, phase, productionContract);
  const core = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    gate,
    phase,
    scope_id,
    production_contract_sha256: productionContract.production_contract_sha256,
    input_bindings,
    status,
    hard_failure_codes,
    warning_codes,
    metrics,
    cache,
  };
  const receipt = { ...core, receipt_sha256: fingerprintV3Value(core) };
  validateGateReceipt(receipt, { productionContract, validationPolicy });
  return receipt;
}

export function inspectV3Compatibility(value) {
  const pipelineVersion = Number.isSafeInteger(value?.pipeline_contract_version)
    ? value.pipeline_contract_version : null;
  const topology = typeof value?.authoring_topology_id === 'string'
    ? value.authoring_topology_id : null;
  if (pipelineVersion !== PIPELINE_CONTRACT_VERSION || topology !== AUTHORING_TOPOLOGY_ID) {
    return {
      pipeline_contract_version: pipelineVersion,
      authoring_topology_id: topology,
      mode: 'inspection-only',
      resume_eligible: false,
      resign_eligible: false,
      render_authorization_eligible: false,
      code: 'pipeline_upgrade_required',
    };
  }
  try {
    assertNoLegacyActiveFields(value);
  } catch {
    return {
      pipeline_contract_version: pipelineVersion,
      authoring_topology_id: topology,
      mode: 'rejected',
      resume_eligible: false,
      resign_eligible: false,
      render_authorization_eligible: false,
      code: 'legacy_field_forbidden',
    };
  }
  return {
    pipeline_contract_version: pipelineVersion,
    authoring_topology_id: topology,
    mode: 'v3-contract-validation-required',
    resume_eligible: false,
    resign_eligible: false,
    render_authorization_eligible: false,
    code: 'canonical_artifact_validation_required',
  };
}

function usage() {
  return 'Usage: node validate-production-contract.mjs <contract.json> --artifacts <canonical-artifacts.json> [--prior <director-contract.json> --assets <asset-manifest.json>]';
}

async function main(argv) {
  if (argv.includes('--help')) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const contractPath = argv[0];
  const artifactsIndex = argv.indexOf('--artifacts');
  const priorIndex = argv.indexOf('--prior');
  const assetsIndex = argv.indexOf('--assets');
  if (!contractPath || artifactsIndex < 0 || !argv[artifactsIndex + 1]) fail('usage', usage());
  const [contract, artifacts, priorContract, assetManifest] = await Promise.all([
    readFile(path.resolve(contractPath), 'utf8').then(JSON.parse),
    readFile(path.resolve(argv[artifactsIndex + 1]), 'utf8').then(JSON.parse),
    priorIndex < 0 ? undefined : readFile(path.resolve(argv[priorIndex + 1]), 'utf8').then(JSON.parse),
    assetsIndex < 0 ? undefined : readFile(path.resolve(argv[assetsIndex + 1]), 'utf8').then(JSON.parse),
  ]);
  process.stdout.write(`${JSON.stringify(validateProductionContract(contract, {
    artifacts,
    priorContract,
    assetManifest,
  }))}\n`);
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    const known = error instanceof ScriptOnlyV3ContractError;
    process.stderr.write(`${JSON.stringify({
      status: 'failed',
      code: known ? error.code : 'production_contract_validation_failed',
      message: known ? error.message : 'Production contract validation failed.',
    })}\n`);
    process.exitCode = known && error.code === 'usage' ? 64 : 2;
  }
}
