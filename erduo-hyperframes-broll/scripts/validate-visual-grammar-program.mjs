#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FRAME_PROJECTION_CONTRACT,
  FRAME_PROJECTION_RULE,
  validateFrameProjection,
} from './compile-frame-projection.mjs';
import { fingerprintRenderValue, fingerprintValue } from './state.mjs';

export const VISUAL_GRAMMAR_PROGRAM_CONTRACT =
  'scripts/validate-visual-grammar-program.mjs#schema-v1';
export const VISUAL_GRAMMAR_PROGRAM_TYPE = 'visual-grammar-program';
export const AUTHORING_TOPOLOGY_ID = 'bounded-authoring-cluster-v1';

const SHA256 = /^[0-9a-f]{64}$/u;
const ID = /^[a-z0-9][a-z0-9-]{1,63}$/u;
const SHOT_ID = /^S[0-9]{3}$/u;
const BLOCK_ID = /^B[0-9]{3}$/u;
const CONTROL_CHARACTERS = /[\x00-\x08\x0b\x0c\x0e-\x1f]/u;
const PRIVATE_INSTRUCTION = /(?:(?:system|developer|private|hidden)\s+(?:prompt|instruction)|系统提示词|私有提示词|隐藏指令)/iu;
const MAX_RECIPES_PER_PAGE = 8;
const MAX_BLOCK_DURATION_MS = 45_000;
const NATIVE_BASE_COMPILER_ID = 'hyperframes-native';
const SELECTABLE_TEMPLATE_COUNT = 7;
const PROTECTED_USER_LAYERS = new Set([
  'visual_system',
  'scene_grammar',
  'motion_grammar',
  'compositing',
]);
const NATIVE_SOURCE_BINDINGS = [
  {
    artifact_id: 'native-fallback-contract',
    relative_path: 'references/native-fallback-contract.md',
  },
  {
    artifact_id: 'native-fallback-compiler',
    relative_path: 'scripts/native-fallback.mjs',
  },
  {
    artifact_id: 'visual-grammar-compiler-contract',
    relative_path: 'references/visual-grammar-compiler-contract.md',
  },
];
const AUTHORING_FIELDS = [
  'surface',
  'attention_geometry',
  'semantic_anchor',
  'anchor_treatment',
  'typography',
  'color',
  'material_texture',
  'motion_causality',
  'emotional_temperature',
  'hard_avoids',
];
const POSITIVE_VISUAL_FIELDS = [
  'surface',
  'attention_geometry',
  'anchor_treatment',
  'typography',
  'color',
  'material_texture',
  'motion_causality',
  'emotional_temperature',
];
const VARIABLE_AUTHORING_FIELDS = new Set(AUTHORING_FIELDS.slice(0, -1));
const SOURCE_BINDINGS = new Map([
  ['confirmed-brief', 'confirmed_brief_sha256'],
  ['parsed-srt', 'parsed_srt_sha256'],
  ['shot-plan', 'shot_plan_sha256'],
  ['frame-projection', 'projection_sha256'],
  ['design-slice', 'design_slice_sha256'],
  ['display-selection', 'display_selection_sha256'],
  ['font-package', 'font_package_sha256'],
  ['design-selection', 'design_selection_sha256'],
  ['base-template', 'base_template_sha256'],
  ['design-library-snapshot', 'design_library_snapshot_sha256'],
]);

export class VisualGrammarProgramError extends Error {
  constructor(code, message, shot) {
    super(message);
    this.name = 'VisualGrammarProgramError';
    this.code = code;
    if (shot !== undefined) this.shot = shot;
  }
}

function fail(code, message, shot) {
  throw new VisualGrammarProgramError(code, message, shot);
}

function exact(value, fields, code = 'visual_grammar_schema_invalid', message = 'Visual grammar program shape is invalid.', shot) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, message, shot);
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) {
    fail(code, message, shot);
  }
}

function integer(value, code, message, shot, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(code, message, shot);
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

function text(value, code, message, shot, { min = 1, max = 800, pathFree = true } = {}) {
  if (
    typeof value !== 'string'
    || value !== value.trim()
    || value.trim().length < min
    || value.length > max
    || CONTROL_CHARACTERS.test(value)
    || (pathFree && containsForbiddenLocalPathToken(value))
    || (pathFree && PRIVATE_INSTRUCTION.test(value))
  ) fail(code, message, shot);
  return value.trim();
}

function id(value, code, message, shot) {
  if (typeof value !== 'string' || !ID.test(value)) fail(code, message, shot);
  return value;
}

function textList(value, code, message, shot, { min = 1, max = 16, itemMax = 500 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(code, message, shot);
  const normalized = value.map((item) => text(item, code, message, shot, { max: itemMax }));
  if (new Set(normalized).size !== normalized.length) fail(code, message, shot);
  return normalized;
}

function idList(value, code, message, shot, { min = 0, max = 32 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(code, message, shot);
  const normalized = value.map((item) => id(item, code, message, shot));
  if (new Set(normalized).size !== normalized.length) fail(code, message, shot);
  return normalized;
}

function hash(value, code, message, shot) {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(code, message, shot);
  return value;
}

function authoringDecision(value, fields, shot) {
  exact(value, fields, 'visual_grammar_recipe_invalid', 'Shot authoring decision shape is invalid.', shot);
  const normalized = {};
  for (const field of fields) {
    if (field === 'decision_id' || field.endsWith('_id')) {
      normalized[field] = id(value[field], 'visual_grammar_recipe_invalid', 'Shot authoring decision ID is invalid.', shot);
    } else {
      normalized[field] = text(value[field], 'visual_grammar_recipe_invalid', 'Shot authoring decision text is invalid.', shot, {
        min: field === 'temperature_label' ? 2 : 8,
        max: 700,
      });
    }
  }
  return normalized;
}

function validateIdentity(value) {
  exact(value, ['identity_id', 'statement', 'recognizable_traits'], 'visual_grammar_identity_invalid', 'Visual identity shape is invalid.');
  return {
    identity_id: id(value.identity_id, 'visual_grammar_identity_invalid', 'Visual identity ID is invalid.'),
    statement: text(value.statement, 'visual_grammar_identity_invalid', 'Visual identity statement is invalid.', undefined, { min: 20 }),
    recognizable_traits: textList(value.recognizable_traits, 'visual_grammar_identity_invalid', 'Recognizable visual traits are invalid.', undefined, { min: 2, max: 12 }),
  };
}

function validateAntiIdentity(value) {
  exact(value, ['statement', 'rejected_traits'], 'visual_grammar_identity_invalid', 'Anti-identity shape is invalid.');
  return {
    statement: text(value.statement, 'visual_grammar_identity_invalid', 'Anti-identity statement is invalid.', undefined, { min: 20 }),
    rejected_traits: textList(value.rejected_traits, 'visual_grammar_identity_invalid', 'Anti-identity traits are invalid.', undefined, { min: 2, max: 16 }),
  };
}

function validateStableInvariants(value) {
  exact(value, AUTHORING_FIELDS, 'visual_grammar_identity_invalid', 'Stable invariant shape is invalid.');
  const normalized = {};
  for (const field of AUTHORING_FIELDS) {
    normalized[field] = field === 'hard_avoids'
      ? textList(value[field], 'visual_grammar_identity_invalid', 'Stable hard avoids are invalid.', undefined, { min: 1, max: 20 })
      : text(value[field], 'visual_grammar_identity_invalid', 'Stable invariant text is invalid.', undefined, { min: 12 });
  }
  return normalized;
}

function validateVariationAxes(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 24) {
    fail('visual_grammar_variation_invalid', 'At least one bounded variation axis is required.');
  }
  const axisIds = new Set();
  const fieldIds = new Set();
  return value.map((axis) => {
    exact(axis, ['axis_id', 'authoring_field', 'purpose', 'states'], 'visual_grammar_variation_invalid', 'Variation axis shape is invalid.');
    const axisId = id(axis.axis_id, 'visual_grammar_variation_invalid', 'Variation axis ID is invalid.');
    if (axisIds.has(axisId)) fail('visual_grammar_variation_invalid', 'Variation axis IDs must be unique.');
    axisIds.add(axisId);
    if (!VARIABLE_AUTHORING_FIELDS.has(axis.authoring_field) || fieldIds.has(axis.authoring_field)) {
      fail('visual_grammar_variation_invalid', 'A variable authoring field may be owned by at most one axis.');
    }
    fieldIds.add(axis.authoring_field);
    if (!Array.isArray(axis.states) || axis.states.length < 2 || axis.states.length > 16) {
      fail('visual_grammar_variation_invalid', 'Variation axes require two to sixteen authored states.');
    }
    const stateIds = new Set();
    const states = axis.states.map((state) => {
      exact(state, ['state_id', 'description'], 'visual_grammar_variation_invalid', 'Variation state shape is invalid.');
      const stateId = id(state.state_id, 'visual_grammar_variation_invalid', 'Variation state ID is invalid.');
      if (stateIds.has(stateId)) fail('visual_grammar_variation_invalid', 'Variation state IDs must be unique inside an axis.');
      stateIds.add(stateId);
      return {
        state_id: stateId,
        description: text(state.description, 'visual_grammar_variation_invalid', 'Variation state description is invalid.', undefined, { min: 8 }),
      };
    });
    return {
      axis_id: axisId,
      authoring_field: axis.authoring_field,
      purpose: text(axis.purpose, 'visual_grammar_variation_invalid', 'Variation axis purpose is invalid.', undefined, { min: 12 }),
      states,
    };
  });
}

function validateCooldown(value, axes) {
  exact(value, ['exact_recipe_window_shots', 'exact_recipe_max_uses', 'minimum_exact_recipe_gap_shots', 'axis_cooldowns'], 'visual_grammar_cooldown_invalid', 'Exhaustion and cooldown policy shape is invalid.');
  const normalized = {
    exact_recipe_window_shots: integer(value.exact_recipe_window_shots, 'visual_grammar_cooldown_invalid', 'Exact-recipe window is invalid.', undefined, 1),
    exact_recipe_max_uses: integer(value.exact_recipe_max_uses, 'visual_grammar_cooldown_invalid', 'Exact-recipe use limit is invalid.', undefined, 1),
    minimum_exact_recipe_gap_shots: integer(value.minimum_exact_recipe_gap_shots, 'visual_grammar_cooldown_invalid', 'Exact-recipe gap is invalid.', undefined, 1),
    axis_cooldowns: value.axis_cooldowns,
  };
  if (
    normalized.exact_recipe_max_uses > normalized.exact_recipe_window_shots
    || normalized.minimum_exact_recipe_gap_shots > normalized.exact_recipe_window_shots
    || !Array.isArray(value.axis_cooldowns)
    || value.axis_cooldowns.length !== axes.length
  ) fail('visual_grammar_cooldown_invalid', 'Exhaustion and cooldown bounds are inconsistent.');
  const axisIds = new Set();
  normalized.axis_cooldowns = value.axis_cooldowns.map((cooldown) => {
    exact(cooldown, ['axis_id', 'window_shots', 'max_same_state_uses', 'minimum_same_state_gap_shots'], 'visual_grammar_cooldown_invalid', 'Axis cooldown shape is invalid.');
    const axisId = id(cooldown.axis_id, 'visual_grammar_cooldown_invalid', 'Axis cooldown ID is invalid.');
    if (axisIds.has(axisId) || !axes.some((axis) => axis.axis_id === axisId)) {
      fail('visual_grammar_cooldown_invalid', 'Axis cooldowns must cover each declared axis exactly once.');
    }
    axisIds.add(axisId);
    const item = {
      axis_id: axisId,
      window_shots: integer(cooldown.window_shots, 'visual_grammar_cooldown_invalid', 'Axis cooldown window is invalid.', undefined, 1),
      max_same_state_uses: integer(cooldown.max_same_state_uses, 'visual_grammar_cooldown_invalid', 'Axis state use limit is invalid.', undefined, 1),
      minimum_same_state_gap_shots: integer(cooldown.minimum_same_state_gap_shots, 'visual_grammar_cooldown_invalid', 'Axis state gap is invalid.', undefined, 1),
    };
    if (item.max_same_state_uses > item.window_shots || item.minimum_same_state_gap_shots > item.window_shots) {
      fail('visual_grammar_cooldown_invalid', 'Axis cooldown bounds are inconsistent.');
    }
    return item;
  });
  if (JSON.stringify(normalized.axis_cooldowns.map((item) => item.axis_id)) !== JSON.stringify(axes.map((axis) => axis.axis_id))) {
    fail('visual_grammar_cooldown_invalid', 'Axis cooldown order must match variation-axis order.');
  }
  return normalized;
}

function validateBindings(value) {
  const fields = [
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
  exact(value, fields, 'visual_grammar_binding_invalid', 'Visual grammar bindings shape is invalid.');
  return Object.fromEntries(fields.map((field) => [
    field,
    field === 'base_template_id'
      ? id(value[field], 'visual_grammar_binding_invalid', 'Bound base template ID is invalid.')
      : hash(value[field], 'visual_grammar_binding_invalid', `Visual grammar binding ${field} is invalid.`),
  ]));
}

function designLibrarySnapshotCore(designLibrary) {
  return {
    policy: designLibrary.policy,
    source_registry: designLibrary.sourceRegistry,
    templates: [...designLibrary.templates].sort((left, right) => (
      String(left?.id ?? '').localeCompare(String(right?.id ?? ''))
    )),
    native_base_compiler: designLibrary.nativeBaseCompiler,
    native_compiler_source_bundle_sha256:
      designLibrary.nativeBaseCompiler.native_compiler_source_bundle_sha256,
  };
}

function normalizedPackagePath(value) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.includes('\\')
    || value.startsWith('/')
  ) return false;
  const parts = value.split('/');
  return parts.every((part) => part.length > 0 && part !== '.' && part !== '..');
}

function nativeCompilerSourceBundleSha256(value) {
  return fingerprintRenderValue({
    source_refs: [...value.provenance.source_refs].sort((left, right) => (
      left.artifact_id.localeCompare(right.artifact_id)
    )),
  });
}

function validateNativeBaseCompiler(value) {
  exact(value, [
    'schema_version',
    'artifact_type',
    'artifact_version',
    'id',
    'status',
    'catalog_scope',
    'summary',
    'compiler_contract',
    'native_compiler_source_bundle_sha256',
    'provenance',
    'hard_rules',
    'adaptation_knobs',
  ], 'visual_grammar_design_binding_invalid', 'Native base compiler shape is invalid.');
  if (
    value.schema_version !== 1
    || value.artifact_type !== 'native-base-compiler'
    || value.artifact_version !== 1
    || value.id !== NATIVE_BASE_COMPILER_ID
    || value.status !== 'built-in'
    || value.catalog_scope !== 'non-template'
    || value.compiler_contract
      !== 'references/native-fallback-contract.md#hyperframes-native-auxiliary-contract'
    || typeof value.native_compiler_source_bundle_sha256 !== 'string'
    || !SHA256.test(value.native_compiler_source_bundle_sha256)
    || typeof value.summary !== 'string'
    || value.summary.length < 1
  ) fail('visual_grammar_design_binding_invalid', 'Native base compiler identity is invalid.');
  exact(value.provenance, [
    'source_kind',
    'evidence_role',
    'source_refs',
  ], 'visual_grammar_design_binding_invalid', 'Native base compiler provenance is invalid.');
  if (
    value.provenance.source_kind !== 'packaged-native-compiler'
    || value.provenance.evidence_role !== 'built-in-runtime-contract'
    || !Array.isArray(value.provenance.source_refs)
    || value.provenance.source_refs.length !== NATIVE_SOURCE_BINDINGS.length
    || !Array.isArray(value.hard_rules)
    || value.hard_rules.length < 1
    || new Set(value.hard_rules).size !== value.hard_rules.length
    || value.hard_rules.some((rule) => typeof rule !== 'string' || rule.length < 1)
    || !Array.isArray(value.adaptation_knobs)
    || value.adaptation_knobs.length !== 7
  ) fail('visual_grammar_design_binding_invalid', 'Native base compiler content is invalid.');
  const sourceArtifactIds = new Set();
  for (let index = 0; index < NATIVE_SOURCE_BINDINGS.length; index += 1) {
    const reference = value.provenance.source_refs[index];
    const expected = NATIVE_SOURCE_BINDINGS[index];
    exact(reference, [
      'artifact_id',
      'relative_path',
      'sha256',
      'size_bytes',
    ], 'visual_grammar_design_binding_invalid', 'Native base compiler source reference is invalid.');
    if (
      reference.artifact_id !== expected.artifact_id
      || reference.relative_path !== expected.relative_path
      || sourceArtifactIds.has(reference.artifact_id)
      || !ID.test(reference.artifact_id)
      || !normalizedPackagePath(reference.relative_path)
      || typeof reference.sha256 !== 'string'
      || !SHA256.test(reference.sha256)
      || !Number.isSafeInteger(reference.size_bytes)
      || reference.size_bytes < 1
    ) fail('visual_grammar_design_binding_invalid', 'Native base compiler source reference is invalid.');
    sourceArtifactIds.add(reference.artifact_id);
  }
  let actualSourceBundleSha256;
  try {
    actualSourceBundleSha256 = nativeCompilerSourceBundleSha256(value);
  } catch {
    fail('visual_grammar_design_binding_invalid', 'Native compiler source bundle contains non-canonical values.');
  }
  if (
    actualSourceBundleSha256
    !== value.native_compiler_source_bundle_sha256
  ) fail('visual_grammar_design_binding_mismatch', 'Native compiler source bundle hash does not match its structured source references.');
  const axisIds = new Set();
  for (const knob of value.adaptation_knobs) {
    exact(knob, [
      'id',
      'purpose',
      'options',
      'constraints',
    ], 'visual_grammar_design_binding_invalid', 'Native base compiler adaptation axis is invalid.');
    if (
      typeof knob.id !== 'string'
      || !ID.test(knob.id)
      || axisIds.has(knob.id)
      || typeof knob.purpose !== 'string'
      || knob.purpose.length < 1
      || !Array.isArray(knob.options)
      || knob.options.length < 2
      || knob.options.length > 16
      || new Set(knob.options).size !== knob.options.length
      || knob.options.some((option) => typeof option !== 'string' || !ID.test(option))
      || !Array.isArray(knob.constraints)
      || knob.constraints.length < 1
      || new Set(knob.constraints).size !== knob.constraints.length
      || knob.constraints.some((constraint) => typeof constraint !== 'string' || constraint.length < 1)
    ) fail('visual_grammar_design_binding_invalid', 'Native base compiler adaptation axis is invalid.');
    axisIds.add(knob.id);
  }
  return {
    compiler: value,
    native_compiler_source_bundle_sha256: actualSourceBundleSha256,
  };
}

function validateDesignLibrary(value) {
  exact(value, [
    'policy',
    'templates',
    'sourceRegistry',
    'nativeBaseCompiler',
  ], 'visual_grammar_design_binding_invalid', 'Design library adapter shape is invalid.');
  if (
    !Array.isArray(value.templates)
    || value.templates.length !== SELECTABLE_TEMPLATE_COUNT
  ) fail('visual_grammar_design_binding_invalid', 'Design library must preserve the seven-template selectable catalog.');
  const libraryIds = value.templates.map((template) => template?.id);
  if (
    libraryIds.some((templateId) => (
      typeof templateId !== 'string'
      || !ID.test(templateId)
      || templateId === NATIVE_BASE_COMPILER_ID
    ))
    || new Set(libraryIds).size !== libraryIds.length
  ) fail('visual_grammar_design_binding_invalid', 'Design library template IDs are invalid.');
  const profileIds = value.policy?.profiles?.map((profile) => profile?.template_id);
  if (
    !Array.isArray(profileIds)
    || profileIds.length !== SELECTABLE_TEMPLATE_COUNT
    || new Set(profileIds).size !== profileIds.length
    || profileIds.includes(NATIVE_BASE_COMPILER_ID)
    || [...libraryIds].sort().join('\n') !== [...profileIds].sort().join('\n')
    || value.policy?.selection?.no_candidate_fallback !== NATIVE_BASE_COMPILER_ID
    || !Array.isArray(value.policy?.selection?.default_eligible_statuses)
    || value.policy.selection.default_eligible_statuses.includes('draft')
  ) fail('visual_grammar_design_binding_invalid', 'Design library catalog policy is invalid.');
  const nativeFacts = validateNativeBaseCompiler(value.nativeBaseCompiler);
  return {
    library: value,
    native_compiler_source_bundle_sha256:
      nativeFacts.native_compiler_source_bundle_sha256,
  };
}

function validateProtectedUserLayers(value) {
  if (
    !Array.isArray(value)
    || new Set(value).size !== value.length
    || value.some((layer) => !PROTECTED_USER_LAYERS.has(layer))
  ) fail('visual_grammar_design_binding_invalid', 'Design selection protected user layers are invalid.');
  return [...value];
}

function validateCompilationGuard(value, expectedGuard) {
  exact(value, [
    'eligible',
    'guard_code',
  ], 'visual_grammar_design_binding_invalid', 'Design selection visual grammar guard is invalid.');
  if (value.eligible !== true || value.guard_code !== expectedGuard) {
    fail('visual_grammar_design_binding_mismatch', 'Design selection visual grammar guard does not match its effective base.');
  }
  return value.guard_code;
}

function validateTemplateVisualGrammarConstraints(value, templateAxes, axes) {
  if (value === undefined) return undefined;
  const code = 'visual_grammar_template_axis_mismatch';
  exact(value, [
    'axis_authoring_fields',
    'adjacent_min_axis_changes',
    'adjacent_required_any_axis_ids',
  ], code, 'Selected template visual grammar constraints shape is invalid.');
  if (
    !Array.isArray(value.axis_authoring_fields)
    || value.axis_authoring_fields.length !== templateAxes.length
  ) fail(code, 'Selected template axis-to-authoring-field mapping must cover every adaptation axis exactly once.');
  const mappedAxisIds = new Set();
  const mappedAuthoringFields = new Set();
  const axisAuthoringFields = value.axis_authoring_fields.map((mapping, index) => {
    exact(mapping, [
      'axis_id',
      'authoring_field',
    ], code, 'Selected template axis-to-authoring-field mapping shape is invalid.');
    const expectedAxis = templateAxes[index];
    if (
      mapping.axis_id !== expectedAxis.axis_id
      || mappedAxisIds.has(mapping.axis_id)
      || !VARIABLE_AUTHORING_FIELDS.has(mapping.authoring_field)
      || mappedAuthoringFields.has(mapping.authoring_field)
      || axes[index].axis_id !== mapping.axis_id
      || axes[index].authoring_field !== mapping.authoring_field
    ) fail(code, 'Selected template axis-to-authoring-field mapping does not match the compiled visual grammar axes.');
    mappedAxisIds.add(mapping.axis_id);
    mappedAuthoringFields.add(mapping.authoring_field);
    return {
      axis_id: mapping.axis_id,
      authoring_field: mapping.authoring_field,
    };
  });
  const adjacentMinAxisChanges = integer(
    value.adjacent_min_axis_changes,
    code,
    'Selected template adjacent axis-change minimum is invalid.',
    undefined,
    1,
  );
  if (adjacentMinAxisChanges > templateAxes.length) {
    fail(code, 'Selected template adjacent axis-change minimum exceeds its declared axes.');
  }
  const adjacentRequiredAnyAxisIds = idList(
    value.adjacent_required_any_axis_ids,
    code,
    'Selected template required adjacent axis list is invalid.',
    undefined,
    { min: 1, max: templateAxes.length },
  );
  if (adjacentRequiredAnyAxisIds.some((axisId) => !mappedAxisIds.has(axisId))) {
    fail(code, 'Selected template required adjacent axes must reference declared adaptation axes.');
  }
  return {
    axis_authoring_fields: axisAuthoringFields,
    adjacent_min_axis_changes: adjacentMinAxisChanges,
    adjacent_required_any_axis_ids: adjacentRequiredAnyAxisIds,
  };
}

function validateDesignArtifacts({
  designSelection,
  baseTemplate,
  nativeBaseCompiler,
  designLibrary,
}, bindings, axes) {
  if (!designSelection || !designLibrary) {
    fail('visual_grammar_design_artifacts_required', 'Actual design selection and design library artifacts are required.');
  }
  const libraryFacts = validateDesignLibrary(designLibrary);
  if (
    !designSelection
    || typeof designSelection !== 'object'
    || Array.isArray(designSelection)
    || typeof designSelection.selection_sha256 !== 'string'
    || !SHA256.test(designSelection.selection_sha256)
  ) fail('visual_grammar_design_binding_invalid', 'Design selection artifact is invalid.');
  const protectedUserLayers = validateProtectedUserLayers(
    designSelection.protected_user_layers,
  );
  const nativeMode = bindings.base_template_id === NATIVE_BASE_COMPILER_ID;
  let effectiveBase;
  let expectedGuard;
  if (nativeMode) {
    if (!nativeBaseCompiler || baseTemplate !== undefined) {
      fail('visual_grammar_design_artifacts_required', 'Native selection requires the actual native base compiler and no selectable-template substitute.');
    }
    if (
      designSelection.base_template !== NATIVE_BASE_COMPILER_ID
      || designSelection.fallback !== NATIVE_BASE_COMPILER_ID
      || !['native-fallback', 'user-design-native-supplement'].includes(designSelection.mode)
      || designSelection.template_status !== 'built-in'
      || (designSelection.mode === 'native-fallback' && protectedUserLayers.length !== 0)
      || (
        designSelection.mode === 'user-design-native-supplement'
        && protectedUserLayers.length < 1
      )
    ) fail('visual_grammar_design_binding_mismatch', 'Native design selection does not declare the canonical fallback mode and protected-layer facts.');
    expectedGuard = designSelection.mode === 'native-fallback'
      ? 'NATIVE_BASE_COMPILER_BOUND'
      : 'NATIVE_SUPPORT_ONLY_USER_LAYERS_PROTECTED';
    effectiveBase = validateNativeBaseCompiler(nativeBaseCompiler).compiler;
  } else {
    if (!baseTemplate || nativeBaseCompiler !== undefined) {
      fail('visual_grammar_design_artifacts_required', 'Selected-template mode requires the actual base template and no native-compiler substitute.');
    }
    if (
      !['base-template', 'supplement-user-design'].includes(designSelection.mode)
      || designSelection.base_template === NATIVE_BASE_COMPILER_ID
      || designSelection.base_template !== bindings.base_template_id
      || designSelection.template_status !== baseTemplate?.status
      || Object.hasOwn(designSelection, 'fallback')
      || (designSelection.mode === 'base-template' && protectedUserLayers.length !== 0)
      || (
        designSelection.mode === 'supplement-user-design'
        && protectedUserLayers.length < 1
      )
    ) fail('visual_grammar_design_binding_mismatch', 'Selected-template design selection does not match the canonical template mode.');
    expectedGuard = 'BASE_TEMPLATE_BOUND';
    effectiveBase = baseTemplate;
  }
  const guardCode = validateCompilationGuard(
    designSelection.visual_grammar_compilation,
    expectedGuard,
  );
  if (
    designSelection.native_compiler_source_bundle_sha256
      !== libraryFacts.native_compiler_source_bundle_sha256
  ) fail('visual_grammar_design_binding_mismatch', 'Design selection does not bind the actual native compiler source bundle.');
  const { selection_sha256: declaredSelectionSha256, ...selectionCore } = designSelection;
  let actualSelectionSha256;
  let actualBaseSha256;
  let actualLibrarySnapshotSha256;
  try {
    actualSelectionSha256 = fingerprintValue(selectionCore);
    actualBaseSha256 = fingerprintRenderValue(effectiveBase);
    actualLibrarySnapshotSha256 = fingerprintRenderValue(designLibrarySnapshotCore(designLibrary));
  } catch {
    fail('visual_grammar_design_binding_invalid', 'Design artifacts contain non-canonical values.');
  }
  if (
    declaredSelectionSha256 !== actualSelectionSha256
    || declaredSelectionSha256 !== bindings.design_selection_sha256
    || designSelection.briefs_sha256 !== bindings.confirmed_brief_sha256
    || designSelection.base_template !== bindings.base_template_id
    || designSelection.base_template_sha256 !== bindings.base_template_sha256
    || designSelection.design_library_snapshot_sha256
      !== bindings.design_library_snapshot_sha256
    || effectiveBase?.id !== bindings.base_template_id
    || actualBaseSha256 !== bindings.base_template_sha256
    || actualLibrarySnapshotSha256 !== bindings.design_library_snapshot_sha256
  ) fail('visual_grammar_design_binding_mismatch', 'Design selection, template or library snapshot does not match the visual grammar bindings.');
  const canonicalLibraryBase = nativeMode
    ? designLibrary.nativeBaseCompiler
    : designLibrary.templates.find((template) => template.id === bindings.base_template_id);
  if (
    !canonicalLibraryBase
    || fingerprintRenderValue(canonicalLibraryBase) !== actualBaseSha256
  ) fail('visual_grammar_design_binding_mismatch', 'Effective base bytes do not match the canonical design-library member.');
  if (!Array.isArray(effectiveBase.adaptation_knobs) || effectiveBase.adaptation_knobs.length < 1) {
    fail('visual_grammar_template_axis_mismatch', 'Effective base declares no adaptation axes.');
  }
  const templateAxes = effectiveBase.adaptation_knobs.map((knob) => {
    if (
      !knob
      || typeof knob !== 'object'
      || Array.isArray(knob)
      || typeof knob.id !== 'string'
      || !ID.test(knob.id)
      || !Array.isArray(knob.options)
      || knob.options.length < 2
      || new Set(knob.options).size !== knob.options.length
      || knob.options.some((option) => typeof option !== 'string' || !ID.test(option))
    ) fail('visual_grammar_template_axis_mismatch', 'Selected template adaptation axis is invalid.');
    return { axis_id: knob.id, state_ids: [...knob.options] };
  });
  if (
    new Set(templateAxes.map((axis) => axis.axis_id)).size !== templateAxes.length
    || axes.length !== templateAxes.length
  ) fail('visual_grammar_template_axis_mismatch', 'Visual grammar axes must exactly compile the selected template axes.');
  for (let index = 0; index < templateAxes.length; index += 1) {
    if (
      axes[index].axis_id !== templateAxes[index].axis_id
      || JSON.stringify(axes[index].states.map((state) => state.state_id))
        !== JSON.stringify(templateAxes[index].state_ids)
    ) fail('visual_grammar_template_axis_mismatch', 'Visual grammar axis IDs, order and states must equal the selected template adaptation axes.');
  }
  const visualGrammarConstraints = nativeMode
    ? undefined
    : validateTemplateVisualGrammarConstraints(
      effectiveBase.visual_grammar_constraints,
      templateAxes,
      axes,
    );
  return {
    design_selection_sha256: actualSelectionSha256,
    base_template_id: bindings.base_template_id,
    base_template_sha256: actualBaseSha256,
    design_library_snapshot_sha256: actualLibrarySnapshotSha256,
    selection_mode: designSelection.mode,
    visual_grammar_guard_code: guardCode,
    protected_user_layers: protectedUserLayers,
    native_compiler_source_bundle_sha256:
      libraryFacts.native_compiler_source_bundle_sha256,
    template_axis_ids: templateAxes.map((axis) => axis.axis_id),
    visual_grammar_constraints: visualGrammarConstraints,
  };
}

function validateProvenance(value, bindings) {
  exact(value, ['method', 'private_inputs_exposed', 'source_refs'], 'visual_grammar_provenance_invalid', 'Visual grammar provenance shape is invalid.');
  if (
    value.method !== 'human-authored-first-principles-deterministic-validation-v1'
    || value.private_inputs_exposed !== false
    || !Array.isArray(value.source_refs)
    || value.source_refs.length < SOURCE_BINDINGS.size + 1
    || value.source_refs.length > 32
  ) fail('visual_grammar_provenance_invalid', 'Visual grammar provenance identity is invalid.');
  const refIds = new Set();
  const artifactIds = new Set();
  const kinds = new Map();
  const sourceRefs = value.source_refs.map((reference) => {
    exact(reference, ['source_ref_id', 'source_kind', 'artifact_id', 'sha256', 'role'], 'visual_grammar_provenance_invalid', 'Provenance reference shape is invalid.');
    const sourceRefId = id(reference.source_ref_id, 'visual_grammar_provenance_invalid', 'Provenance reference ID is invalid.');
    if (refIds.has(sourceRefId)) fail('visual_grammar_provenance_invalid', 'Provenance reference IDs must be unique.');
    refIds.add(sourceRefId);
    const allowedKinds = new Set([...SOURCE_BINDINGS.keys(), 'author-curation']);
    if (!allowedKinds.has(reference.source_kind)) fail('visual_grammar_provenance_invalid', 'Provenance source kind is invalid.');
    kinds.set(reference.source_kind, (kinds.get(reference.source_kind) ?? 0) + 1);
    const artifactId = id(reference.artifact_id, 'visual_grammar_provenance_invalid', 'Provenance artifact ID must be opaque and path-free.');
    if (artifactIds.has(artifactId)) {
      fail('visual_grammar_provenance_invalid', 'Provenance artifact IDs must be unique.');
    }
    artifactIds.add(artifactId);
    const result = {
      source_ref_id: sourceRefId,
      source_kind: reference.source_kind,
      artifact_id: artifactId,
      sha256: hash(reference.sha256, 'visual_grammar_provenance_invalid', 'Provenance artifact hash is invalid.'),
      role: text(reference.role, 'visual_grammar_provenance_invalid', 'Provenance role is invalid.', undefined, { min: 8 }),
    };
    const bindingField = SOURCE_BINDINGS.get(reference.source_kind);
    if (bindingField && result.sha256 !== bindings[bindingField]) {
      fail('visual_grammar_binding_mismatch', `Provenance ${reference.source_kind} does not match the bound artifact.`);
    }
    return result;
  });
  for (const kind of SOURCE_BINDINGS.keys()) {
    if (kinds.get(kind) !== 1) fail('visual_grammar_provenance_invalid', `Provenance must contain exactly one ${kind} reference.`);
  }
  if ((kinds.get('author-curation') ?? 0) < 1) {
    fail('visual_grammar_provenance_invalid', 'Provenance must bind at least one author-curation artifact.');
  }
  return {
    method: value.method,
    private_inputs_exposed: false,
    source_refs: sourceRefs,
  };
}

export function deriveSubstantiveVisualCore(recipe) {
  return {
    surface: {
      intent: recipe.surface.intent,
      implementation_obligation: recipe.surface.implementation_obligation,
    },
    attention_geometry: {
      primary_focus: recipe.attention_geometry.primary_focus,
      reading_order: recipe.attention_geometry.reading_order,
      negative_space_responsibility: recipe.attention_geometry.negative_space_responsibility,
    },
    anchor_treatment: {
      relationship: recipe.anchor_treatment.relationship,
      protection: recipe.anchor_treatment.protection,
    },
    typography: {
      hierarchy: recipe.typography.hierarchy,
      line_break_policy: recipe.typography.line_break_policy,
      display_role: recipe.typography.display_role,
    },
    color: {
      palette_relationship: recipe.color.palette_relationship,
      contrast_logic: recipe.color.contrast_logic,
      accent_responsibility: recipe.color.accent_responsibility,
    },
    material_texture: {
      primary_material_role: recipe.material_texture.primary_material_role,
      texture_behavior: recipe.material_texture.texture_behavior,
      route_intent: recipe.material_texture.route_intent,
    },
    motion_causality: {
      cause: recipe.motion_causality.cause,
      action: recipe.motion_causality.action,
      result: recipe.motion_causality.result,
      lifecycle: recipe.motion_causality.lifecycle,
    },
    emotional_temperature: {
      temperature_label: recipe.emotional_temperature.temperature_label,
      intent: recipe.emotional_temperature.intent,
    },
  };
}

function deriveSubstantiveVariableAuthoringCore(recipe) {
  return {
    ...deriveSubstantiveVisualCore(recipe),
    semantic_anchor: {
      claim: recipe.semantic_anchor.claim,
    },
  };
}

function validateRecipe(value, axes, sourceRefIds, projectedShot, index) {
  const shotNumber = index + 1;
  exact(value, [
    'shot_id',
    'srt_window_ms',
    'frame_window',
    'semantic_claim',
    ...AUTHORING_FIELDS,
    'variation_states',
    'adjacent_difference',
    'provenance_ref_ids',
    'authoring_signature_sha256',
    'shot_recipe_sha256',
  ], 'visual_grammar_recipe_invalid', 'Shot recipe shape is invalid.', shotNumber);
  const expectedShotId = `S${String(shotNumber).padStart(3, '0')}`;
  if (value.shot_id !== expectedShotId || !SHOT_ID.test(value.shot_id ?? '')) {
    fail('visual_grammar_shot_order_invalid', 'Shot recipes must be ordered S001 onward.', shotNumber);
  }
  exact(value.srt_window_ms, ['start_ms', 'end_ms'], 'visual_grammar_recipe_invalid', 'Shot SRT window shape is invalid.', shotNumber);
  exact(value.frame_window, ['start_frame', 'end_frame', 'duration_frames'], 'visual_grammar_recipe_invalid', 'Shot frame window shape is invalid.', shotNumber);
  for (const field of ['start_ms', 'end_ms']) integer(value.srt_window_ms[field], 'visual_grammar_recipe_invalid', 'Shot SRT window is invalid.', shotNumber);
  for (const field of ['start_frame', 'end_frame', 'duration_frames']) integer(value.frame_window[field], 'visual_grammar_recipe_invalid', 'Shot frame window is invalid.', shotNumber);
  if (
    value.srt_window_ms.end_ms <= value.srt_window_ms.start_ms
    || value.frame_window.end_frame <= value.frame_window.start_frame
    || value.frame_window.duration_frames !== value.frame_window.end_frame - value.frame_window.start_frame
  ) fail('visual_grammar_recipe_invalid', 'Shot timing windows must be non-empty and internally consistent.', shotNumber);
  if (
    projectedShot.shot_id !== value.shot_id
    || fingerprintValue(projectedShot.srt_window_ms) !== fingerprintValue(value.srt_window_ms)
    || fingerprintValue(projectedShot.frame_window) !== fingerprintValue(value.frame_window)
  ) fail('visual_grammar_projection_mismatch', 'Shot recipe timing must equal the shared projection artifact.', shotNumber);

  const normalized = {
    shot_id: value.shot_id,
    srt_window_ms: value.srt_window_ms,
    frame_window: value.frame_window,
    semantic_claim: text(value.semantic_claim, 'visual_grammar_recipe_invalid', 'Shot semantic claim is invalid.', shotNumber, { min: 8 }),
    surface: authoringDecision(value.surface, ['decision_id', 'intent', 'implementation_obligation'], shotNumber),
    attention_geometry: authoringDecision(value.attention_geometry, ['decision_id', 'primary_focus', 'reading_order', 'negative_space_responsibility'], shotNumber),
    semantic_anchor: value.semantic_anchor,
    anchor_treatment: authoringDecision(value.anchor_treatment, ['decision_id', 'relationship', 'protection'], shotNumber),
    typography: authoringDecision(value.typography, ['decision_id', 'hierarchy', 'line_break_policy', 'display_role'], shotNumber),
    color: authoringDecision(value.color, ['decision_id', 'palette_relationship', 'contrast_logic', 'accent_responsibility'], shotNumber),
    material_texture: authoringDecision(value.material_texture, ['decision_id', 'primary_material_role', 'texture_behavior', 'route_intent'], shotNumber),
    motion_causality: value.motion_causality,
    emotional_temperature: authoringDecision(value.emotional_temperature, ['decision_id', 'temperature_label', 'intent'], shotNumber),
    hard_avoids: textList(value.hard_avoids, 'visual_grammar_recipe_invalid', 'Shot hard avoids are invalid.', shotNumber, { min: 1, max: 20 }),
    variation_states: value.variation_states,
    adjacent_difference: value.adjacent_difference,
    provenance_ref_ids: idList(value.provenance_ref_ids, 'visual_grammar_provenance_invalid', 'Shot provenance references are invalid.', shotNumber, { min: 1 }),
    authoring_signature_sha256: value.authoring_signature_sha256,
    shot_recipe_sha256: value.shot_recipe_sha256,
  };
  exact(value.semantic_anchor, ['decision_id', 'anchor_id', 'claim', 'source_ref_ids'], 'visual_grammar_recipe_invalid', 'Semantic anchor shape is invalid.', shotNumber);
  normalized.semantic_anchor = {
    decision_id: id(value.semantic_anchor.decision_id, 'visual_grammar_recipe_invalid', 'Semantic anchor decision ID is invalid.', shotNumber),
    anchor_id: id(value.semantic_anchor.anchor_id, 'visual_grammar_recipe_invalid', 'Semantic anchor ID is invalid.', shotNumber),
    claim: text(value.semantic_anchor.claim, 'visual_grammar_recipe_invalid', 'Semantic anchor claim is invalid.', shotNumber, { min: 8 }),
    source_ref_ids: idList(value.semantic_anchor.source_ref_ids, 'visual_grammar_provenance_invalid', 'Semantic anchor provenance is invalid.', shotNumber, { min: 1 }),
  };
  exact(value.motion_causality, ['decision_id', 'cause', 'action', 'result', 'lifecycle'], 'visual_grammar_recipe_invalid', 'Motion causality shape is invalid.', shotNumber);
  exact(value.motion_causality.lifecycle, ['entry', 'action', 'result', 'hold', 'exit'], 'visual_grammar_recipe_invalid', 'Motion lifecycle shape is invalid.', shotNumber);
  normalized.motion_causality = {
    decision_id: id(value.motion_causality.decision_id, 'visual_grammar_recipe_invalid', 'Motion decision ID is invalid.', shotNumber),
    cause: text(value.motion_causality.cause, 'visual_grammar_recipe_invalid', 'Motion cause is invalid.', shotNumber, { min: 8 }),
    action: text(value.motion_causality.action, 'visual_grammar_recipe_invalid', 'Motion action is invalid.', shotNumber, { min: 8 }),
    result: text(value.motion_causality.result, 'visual_grammar_recipe_invalid', 'Motion result is invalid.', shotNumber, { min: 8 }),
    lifecycle: Object.fromEntries(['entry', 'action', 'result', 'hold', 'exit'].map((phase) => [
      phase,
      text(value.motion_causality.lifecycle[phase], 'visual_grammar_recipe_invalid', 'Motion lifecycle phase is invalid.', shotNumber, { min: 8 }),
    ])),
  };
  for (const referenceId of [...normalized.provenance_ref_ids, ...normalized.semantic_anchor.source_ref_ids]) {
    if (!sourceRefIds.has(referenceId)) fail('visual_grammar_provenance_invalid', 'Shot recipe references an unknown provenance source.', shotNumber);
  }
  if (!Array.isArray(value.variation_states) || value.variation_states.length !== axes.length) {
    fail('visual_grammar_variation_invalid', 'Every recipe must select one state for every variation axis.', shotNumber);
  }
  normalized.variation_states = value.variation_states.map((selection, axisIndex) => {
    exact(selection, ['axis_id', 'state_id'], 'visual_grammar_variation_invalid', 'Variation selection shape is invalid.', shotNumber);
    const axis = axes[axisIndex];
    if (
      selection.axis_id !== axis.axis_id
      || !axis.states.some((state) => state.state_id === selection.state_id)
    ) fail('visual_grammar_variation_invalid', 'Variation selections must follow axis order and use declared states.', shotNumber);
    return { axis_id: selection.axis_id, state_id: selection.state_id };
  });
  exact(value.adjacent_difference, ['previous_shot_id', 'changed_axis_ids', 'changed_authoring_fields', 'content_reason'], 'visual_grammar_adjacent_difference_invalid', 'Adjacent difference fact shape is invalid.', shotNumber);
  const previousShotId = value.adjacent_difference.previous_shot_id;
  if (previousShotId !== null && (typeof previousShotId !== 'string' || !SHOT_ID.test(previousShotId))) {
    fail('visual_grammar_adjacent_difference_invalid', 'Previous shot ID is invalid.', shotNumber);
  }
  normalized.adjacent_difference = {
    previous_shot_id: previousShotId,
    changed_axis_ids: idList(value.adjacent_difference.changed_axis_ids, 'visual_grammar_adjacent_difference_invalid', 'Changed axis list is invalid.', shotNumber),
    changed_authoring_fields: Array.isArray(value.adjacent_difference.changed_authoring_fields)
      ? [...value.adjacent_difference.changed_authoring_fields]
      : fail('visual_grammar_adjacent_difference_invalid', 'Changed authoring field list is invalid.', shotNumber),
    content_reason: text(value.adjacent_difference.content_reason, 'visual_grammar_adjacent_difference_invalid', 'Adjacent difference reason is invalid.', shotNumber, { min: shotNumber === 1 ? 1 : 12 }),
  };
  if (
    normalized.adjacent_difference.changed_authoring_fields.length > POSITIVE_VISUAL_FIELDS.length
    || new Set(normalized.adjacent_difference.changed_authoring_fields).size
      !== normalized.adjacent_difference.changed_authoring_fields.length
    || normalized.adjacent_difference.changed_authoring_fields.some((field) => !POSITIVE_VISUAL_FIELDS.includes(field))
  ) {
    fail('visual_grammar_adjacent_difference_invalid', 'Changed authoring fields must name positive visible design dimensions.', shotNumber);
  }
  const substantiveVisualCore = deriveSubstantiveVisualCore(normalized);
  const computedAuthoringSignature = fingerprintValue(substantiveVisualCore);
  if (
    !SHA256.test(value.authoring_signature_sha256 ?? '')
    || value.authoring_signature_sha256 !== computedAuthoringSignature
  ) fail('visual_grammar_hash_mismatch', 'Shot authoring signature does not match first-principles fields.', shotNumber);
  const { shot_recipe_sha256: declaredRecipeHash, ...recipeCore } = normalized;
  const computedRecipeHash = fingerprintValue(recipeCore);
  if (!SHA256.test(declaredRecipeHash ?? '') || declaredRecipeHash !== computedRecipeHash) {
    fail('visual_grammar_hash_mismatch', 'Shot recipe hash does not match its content.', shotNumber);
  }
  return normalized;
}

function validateAdjacentDifference(recipes, visualGrammarConstraints) {
  for (let index = 0; index < recipes.length; index += 1) {
    const recipe = recipes[index];
    const difference = recipe.adjacent_difference;
    if (index === 0) {
      if (
        difference.previous_shot_id !== null
        || difference.changed_axis_ids.length
        || difference.changed_authoring_fields.length
        || difference.content_reason !== 'first-shot-baseline'
      ) fail('visual_grammar_adjacent_difference_invalid', 'The first recipe must declare the exact baseline fact.', 1);
      continue;
    }
    const previous = recipes[index - 1];
    const substantive = deriveSubstantiveVisualCore(recipe);
    const previousSubstantive = deriveSubstantiveVisualCore(previous);
    const changedAxes = recipe.variation_states
      .filter((selection, axisIndex) => selection.state_id !== previous.variation_states[axisIndex].state_id)
      .map((selection) => selection.axis_id);
    const changedFields = POSITIVE_VISUAL_FIELDS.filter(
      (field) => fingerprintValue(substantive[field]) !== fingerprintValue(previousSubstantive[field]),
    );
    if (
      difference.previous_shot_id !== previous.shot_id
      || JSON.stringify(difference.changed_axis_ids) !== JSON.stringify(changedAxes)
      || JSON.stringify(difference.changed_authoring_fields) !== JSON.stringify(changedFields)
      || changedFields.length < 1
    ) fail('visual_grammar_adjacent_difference_invalid', 'Adjacent difference facts must exactly match recomputed recipe changes.', index + 1);
    if (
      visualGrammarConstraints
    ) {
      const variableCore = deriveSubstantiveVariableAuthoringCore(recipe);
      const previousVariableCore =
        deriveSubstantiveVariableAuthoringCore(previous);
      const axesWithChangedMappedFields =
        visualGrammarConstraints.axis_authoring_fields
          .filter(({ authoring_field: authoringField }) => (
            fingerprintValue(variableCore[authoringField])
              !== fingerprintValue(previousVariableCore[authoringField])
          ))
          .map(({ axis_id: axisId }) => axisId);
      if (
        JSON.stringify(changedAxes)
          !== JSON.stringify(axesWithChangedMappedFields)
      ) {
        fail(
          'visual_grammar_adjacent_difference_invalid',
          'Changed template axes must exactly correspond to changes in their mapped substantive authoring fields.',
          index + 1,
        );
      }
      if (
        changedAxes.length
          < visualGrammarConstraints.adjacent_min_axis_changes
        || !visualGrammarConstraints.adjacent_required_any_axis_ids.some(
          (axisId) => axesWithChangedMappedFields.includes(axisId),
        )
      ) {
        fail(
          'visual_grammar_adjacent_difference_invalid',
          'Adjacent axis changes do not satisfy the selected template visual grammar constraints.',
          index + 1,
        );
      }
    }
  }
}

function enforceCooldown(recipes, cooldown) {
  const enforce = (keys, windowShots, maximumUses, minimumGap, codeFacts) => {
    const histories = new Map();
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const history = histories.get(key) ?? [];
      const inWindow = history.filter((priorIndex) => index - priorIndex < windowShots);
      if (inWindow.length + 1 > maximumUses) {
        fail('visual_grammar_cooldown_violation', `${codeFacts} exceeds its declared window limit.`, index + 1);
      }
      if (history.length && index - history.at(-1) < minimumGap) {
        fail('visual_grammar_cooldown_violation', `${codeFacts} returns before its declared minimum gap.`, index + 1);
      }
      history.push(index);
      histories.set(key, history);
    }
  };
  enforce(
    recipes.map((recipe) => recipe.authoring_signature_sha256),
    cooldown.exact_recipe_window_shots,
    cooldown.exact_recipe_max_uses,
    cooldown.minimum_exact_recipe_gap_shots,
    'Exact authoring recipe',
  );
  for (const axisCooldown of cooldown.axis_cooldowns) {
    const axisIndex = recipes[0].variation_states.findIndex((selection) => selection.axis_id === axisCooldown.axis_id);
    enforce(
      recipes.map((recipe) => `${axisCooldown.axis_id}:${recipe.variation_states[axisIndex].state_id}`),
      axisCooldown.window_shots,
      axisCooldown.max_same_state_uses,
      axisCooldown.minimum_same_state_gap_shots,
      `Variation state ${axisCooldown.axis_id}`,
    );
  }
}

function pageCore(page) {
  const { page_sha256: ignored, ...core } = page;
  return core;
}

function programCore(document) {
  const { pages: ignoredPages, program_sha256: ignoredHash, ...core } = document;
  return core;
}

export function validateVisualGrammarProgram(document, {
  projection,
  designSelection,
  baseTemplate,
  nativeBaseCompiler,
  designLibrary,
} = {}) {
  exact(document, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'artifact_type',
    'compiler_contract',
    'program_id',
    'bindings',
    'identity',
    'anti_identity',
    'stable_invariants',
    'variation_axes',
    'exhaustion_cooldown',
    'provenance',
    'shot_count',
    'pagination',
    'pages',
    'program_sha256',
  ]);
  if (
    document.schema_version !== 1
    || document.pipeline_contract_version !== 2
    || document.authoring_topology_id !== AUTHORING_TOPOLOGY_ID
    || document.artifact_type !== VISUAL_GRAMMAR_PROGRAM_TYPE
    || document.compiler_contract !== VISUAL_GRAMMAR_PROGRAM_CONTRACT
  ) fail('visual_grammar_identity_invalid', 'Visual grammar program identity is invalid.');
  id(document.program_id, 'visual_grammar_identity_invalid', 'Visual grammar program ID is invalid.');
  const bindings = validateBindings(document.bindings);
  if (!projection) fail('visual_grammar_projection_required', 'The exact shared projection artifact is required.');
  let validatedProjection;
  try {
    validatedProjection = validateFrameProjection(projection);
  } catch {
    fail('visual_grammar_projection_invalid', 'The shared projection artifact is invalid.');
  }
  if (
    validatedProjection.contract !== FRAME_PROJECTION_CONTRACT
    || validatedProjection.rule_version !== FRAME_PROJECTION_RULE
    || validatedProjection.receipt.projection_sha256 !== bindings.projection_sha256
    || validatedProjection.parsed_srt_sha256 !== bindings.parsed_srt_sha256
    || validatedProjection.plan_sha256 !== bindings.shot_plan_sha256
  ) fail('visual_grammar_binding_mismatch', 'Visual grammar timing bindings do not match the shared projection.');
  const identity = validateIdentity(document.identity);
  const antiIdentity = validateAntiIdentity(document.anti_identity);
  const stableInvariants = validateStableInvariants(document.stable_invariants);
  const axes = validateVariationAxes(document.variation_axes);
  const cooldown = validateCooldown(document.exhaustion_cooldown, axes);
  const designFacts = validateDesignArtifacts({
    designSelection,
    baseTemplate,
    nativeBaseCompiler,
    designLibrary,
  }, bindings, axes);
  const provenance = validateProvenance(document.provenance, bindings);
  integer(document.shot_count, 'visual_grammar_pagination_invalid', 'Shot count is invalid.', undefined, 1);
  if (document.shot_count !== validatedProjection.shots.length) {
    fail('visual_grammar_projection_mismatch', 'Visual grammar shot count does not match the shared projection.');
  }
  exact(document.pagination, ['max_recipes_per_page', 'page_count', 'page_index'], 'visual_grammar_pagination_invalid', 'Pagination shape is invalid.');
  if (
    document.pagination.max_recipes_per_page !== MAX_RECIPES_PER_PAGE
    || !Number.isSafeInteger(document.pagination.page_count)
    || document.pagination.page_count < 1
    || !Array.isArray(document.pagination.page_index)
    || document.pagination.page_count !== document.pagination.page_index.length
    || !Array.isArray(document.pages)
    || document.pages.length !== document.pagination.page_count
  ) fail('visual_grammar_pagination_invalid', 'Pagination identity or counts are invalid.');
  const sourceRefIds = new Set(provenance.source_refs.map((reference) => reference.source_ref_id));
  const recipes = [];
  let expectedShotStart = 1;
  const pageHashes = [];
  for (let pageOffset = 0; pageOffset < document.pages.length; pageOffset += 1) {
    const page = document.pages[pageOffset];
    const descriptor = document.pagination.page_index[pageOffset];
    exact(page, ['schema_version', 'artifact_type', 'program_id', 'page_id', 'page_number', 'shot_start', 'shot_end', 'recipes', 'page_sha256'], 'visual_grammar_page_invalid', 'Visual grammar recipe page shape is invalid.');
    exact(descriptor, ['page_id', 'page_number', 'shot_start', 'shot_end', 'shot_ids', 'recipe_sha256s', 'page_sha256'], 'visual_grammar_pagination_invalid', 'Visual grammar page descriptor shape is invalid.');
    if (
      page.schema_version !== 1
      || page.artifact_type !== 'visual-grammar-recipe-page'
      || page.program_id !== document.program_id
      || page.page_number !== pageOffset + 1
      || descriptor.page_number !== page.page_number
      || descriptor.page_id !== page.page_id
      || !ID.test(page.page_id ?? '')
      || !Array.isArray(page.recipes)
      || page.recipes.length < 1
      || page.recipes.length > MAX_RECIPES_PER_PAGE
      || page.shot_start !== expectedShotStart
      || page.shot_end !== page.shot_start + page.recipes.length - 1
      || descriptor.shot_start !== page.shot_start
      || descriptor.shot_end !== page.shot_end
    ) fail('visual_grammar_page_invalid', 'Visual grammar pages must be ordered, contiguous and bounded.');
    const pageHash = fingerprintValue(pageCore(page));
    if (
      !SHA256.test(page.page_sha256 ?? '')
      || page.page_sha256 !== pageHash
      || descriptor.page_sha256 !== pageHash
    ) fail('visual_grammar_page_hash_mismatch', 'Visual grammar page hash does not match its content.');
    const pageRecipes = page.recipes.map((recipe, localIndex) => validateRecipe(
      recipe,
      axes,
      sourceRefIds,
      validatedProjection.shots[recipes.length + localIndex],
      recipes.length + localIndex,
    ));
    if (
      JSON.stringify(descriptor.shot_ids) !== JSON.stringify(pageRecipes.map((recipe) => recipe.shot_id))
      || JSON.stringify(descriptor.recipe_sha256s) !== JSON.stringify(pageRecipes.map((recipe) => recipe.shot_recipe_sha256))
    ) fail('visual_grammar_pagination_invalid', 'Page descriptor recipe bindings do not match page content.');
    recipes.push(...pageRecipes);
    pageHashes.push(pageHash);
    expectedShotStart = page.shot_end + 1;
  }
  if (recipes.length !== document.shot_count) fail('visual_grammar_pagination_invalid', 'Paginated recipe count does not match shot count.');
  validateAdjacentDifference(recipes, designFacts.visual_grammar_constraints);
  enforceCooldown(recipes, cooldown);
  const computedProgramHash = fingerprintValue(programCore(document));
  if (!SHA256.test(document.program_sha256 ?? '') || document.program_sha256 !== computedProgramHash) {
    fail('visual_grammar_hash_mismatch', 'Visual grammar program hash does not match the hash-bound root.');
  }
  const sharedDirectiveSha256 = fingerprintValue({
    identity,
    anti_identity: antiIdentity,
    stable_invariants: stableInvariants,
  });
  return {
    ok: true,
    authority: 'deterministic-structural-rejection-only',
    pipeline_contract_version: 2,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    program_id: document.program_id,
    program_sha256: computedProgramHash,
    shot_count: recipes.length,
    page_count: pageHashes.length,
    page_sha256s: pageHashes,
    identity_sha256: fingerprintValue(identity),
    anti_identity_sha256: fingerprintValue(antiIdentity),
    stable_invariants_sha256: fingerprintValue(stableInvariants),
    shared_directive_sha256: sharedDirectiveSha256,
    variation_axes_sha256: fingerprintValue(axes),
    exhaustion_cooldown_sha256: fingerprintValue(cooldown),
    design_selection_sha256: designFacts.design_selection_sha256,
    base_template_id: designFacts.base_template_id,
    base_template_sha256: designFacts.base_template_sha256,
    design_library_snapshot_sha256: designFacts.design_library_snapshot_sha256,
    selection_mode: designFacts.selection_mode,
    visual_grammar_guard_code: designFacts.visual_grammar_guard_code,
    protected_user_layers: designFacts.protected_user_layers,
    native_compiler_source_bundle_sha256:
      designFacts.native_compiler_source_bundle_sha256,
    template_axis_ids: designFacts.template_axis_ids,
  };
}

export function extractBlockScopedRecipes(document, block, {
  projection,
  designSelection,
  baseTemplate,
  nativeBaseCompiler,
  designLibrary,
} = {}) {
  const validation = validateVisualGrammarProgram(document, {
    projection,
    designSelection,
    baseTemplate,
    nativeBaseCompiler,
    designLibrary,
  });
  exact(block, ['block_id', 'shot_ids', 'start_ms', 'end_ms', 'start_frame', 'end_frame', 'namespace'], 'visual_grammar_block_scope_invalid', 'Block recipe scope shape is invalid.');
  if (
    !BLOCK_ID.test(block.block_id ?? '')
    || !Array.isArray(block.shot_ids)
    || block.shot_ids.length < 1
    || block.shot_ids.length > MAX_RECIPES_PER_PAGE
    || !ID.test(block.namespace ?? '')
  ) fail('visual_grammar_block_scope_invalid', 'Block identity, namespace or shot count is invalid.');
  for (const field of ['start_ms', 'end_ms', 'start_frame', 'end_frame']) {
    integer(block[field], 'visual_grammar_block_scope_invalid', 'Block timing scope is invalid.');
  }
  const allRecipes = document.pages.flatMap((page) => page.recipes);
  const startIndex = allRecipes.findIndex((recipe) => recipe.shot_id === block.shot_ids[0]);
  const recipes = startIndex < 0 ? [] : allRecipes.slice(startIndex, startIndex + block.shot_ids.length);
  if (
    JSON.stringify(recipes.map((recipe) => recipe.shot_id)) !== JSON.stringify(block.shot_ids)
    || recipes[0]?.srt_window_ms.start_ms !== block.start_ms
    || recipes.at(-1)?.srt_window_ms.end_ms !== block.end_ms
    || recipes[0]?.frame_window.start_frame !== block.start_frame
    || recipes.at(-1)?.frame_window.end_frame !== block.end_frame
    || block.end_ms <= block.start_ms
    || block.end_frame <= block.start_frame
    || (block.end_ms - block.start_ms > MAX_BLOCK_DURATION_MS && recipes.length !== 1)
  ) fail('visual_grammar_block_scope_invalid', 'Block scope must be one exact contiguous projected recipe range.');
  const recipeHashes = new Set(recipes.map((recipe) => recipe.shot_recipe_sha256));
  const sourcePageSha256s = document.pages
    .filter((page) => page.recipes.some((recipe) => recipeHashes.has(recipe.shot_recipe_sha256)))
    .map((page) => page.page_sha256);
  const directiveCore = {
    identity: structuredClone(document.identity),
    anti_identity: structuredClone(document.anti_identity),
    stable_invariants: structuredClone(document.stable_invariants),
  };
  const sharedVisualAuthoringDirective = {
    ...directiveCore,
    directive_sha256: fingerprintValue(directiveCore),
  };
  if (sharedVisualAuthoringDirective.directive_sha256 !== validation.shared_directive_sha256) {
    fail('visual_grammar_block_packet_invalid', 'Shared visual authoring directive does not match the validated program.');
  }
  const core = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    artifact_type: 'visual-grammar-block-recipe-packet',
    block_id: block.block_id,
    namespace: block.namespace,
    visual_grammar_program_sha256: validation.program_sha256,
    bindings: document.bindings,
    shared_visual_authoring_directive: sharedVisualAuthoringDirective,
    shot_ids: [...block.shot_ids],
    start_ms: block.start_ms,
    end_ms: block.end_ms,
    start_frame: block.start_frame,
    end_frame: block.end_frame,
    source_page_sha256s: sourcePageSha256s,
    recipes: structuredClone(recipes),
  };
  return { ...core, packet_sha256: fingerprintValue(core) };
}

export function validateVisualGrammarBlockRecipePacket(packet, document, block, {
  projection,
  designSelection,
  baseTemplate,
  nativeBaseCompiler,
  designLibrary,
} = {}) {
  const expected = extractBlockScopedRecipes(document, block, {
    projection,
    designSelection,
    baseTemplate,
    nativeBaseCompiler,
    designLibrary,
  });
  exact(packet, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'artifact_type',
    'block_id',
    'namespace',
    'visual_grammar_program_sha256',
    'bindings',
    'shared_visual_authoring_directive',
    'shot_ids',
    'start_ms',
    'end_ms',
    'start_frame',
    'end_frame',
    'source_page_sha256s',
    'recipes',
    'packet_sha256',
  ], 'visual_grammar_block_packet_invalid', 'Block recipe packet shape is invalid.');
  exact(packet.shared_visual_authoring_directive, [
    'identity',
    'anti_identity',
    'stable_invariants',
    'directive_sha256',
  ], 'visual_grammar_block_packet_invalid', 'Shared visual authoring directive shape is invalid.');
  const {
    directive_sha256: declaredDirectiveSha256,
    ...directiveCore
  } = packet.shared_visual_authoring_directive;
  const { packet_sha256: declaredPacketSha256, ...packetCoreValue } = packet;
  let actualDirectiveSha256;
  let actualPacketSha256;
  let actualDocumentSha256;
  let expectedDocumentSha256;
  try {
    actualDirectiveSha256 = fingerprintValue(directiveCore);
    actualPacketSha256 = fingerprintValue(packetCoreValue);
    actualDocumentSha256 = fingerprintValue(packet);
    expectedDocumentSha256 = fingerprintValue(expected);
  } catch {
    fail('visual_grammar_block_packet_invalid', 'Block recipe packet contains a non-canonical value.');
  }
  if (
    declaredDirectiveSha256 !== actualDirectiveSha256
    || declaredDirectiveSha256 !== expected.shared_visual_authoring_directive.directive_sha256
    || declaredPacketSha256 !== actualPacketSha256
    || actualDocumentSha256 !== expectedDocumentSha256
  ) fail('visual_grammar_block_packet_invalid', 'Block recipe packet does not match the immutable visual grammar program and block scope.');
  return {
    ok: true,
    authority: 'deterministic-structural-rejection-only',
    block_id: expected.block_id,
    visual_grammar_program_sha256: expected.visual_grammar_program_sha256,
    shared_directive_sha256: declaredDirectiveSha256,
    packet_sha256: declaredPacketSha256,
    shot_count: expected.shot_ids.length,
  };
}

function parseArgs(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) return { help: true };
  const positional = [];
  let projection;
  let designSelection;
  let baseTemplate;
  let nativeBaseCompiler;
  let designLibrary;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--projection') {
      projection = argv[index + 1];
      index += 1;
    } else if (argv[index] === '--design-selection') {
      designSelection = argv[index + 1];
      index += 1;
    } else if (argv[index] === '--base-template') {
      baseTemplate = argv[index + 1];
      index += 1;
    } else if (argv[index] === '--native-base-compiler') {
      nativeBaseCompiler = argv[index + 1];
      index += 1;
    } else if (argv[index] === '--design-library') {
      designLibrary = argv[index + 1];
      index += 1;
    } else positional.push(argv[index]);
  }
  if (
    positional.length !== 1
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
  ) return { error: true };
  return {
    input: positional[0],
    projection,
    designSelection,
    baseTemplate,
    nativeBaseCompiler,
    designLibrary,
  };
}

async function main(argv) {
  const usage = 'Usage: node validate-visual-grammar-program.mjs <visual-grammar-program.json> --projection <frame-projection.json> --design-selection <selection.json> (--base-template <template.json> | --native-base-compiler <compiler.json>) --design-library <library.json>';
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
      projection,
      designSelection,
      baseTemplate,
      nativeBaseCompiler,
      designLibrary,
    ] = await Promise.all([
      readFile(args.input, 'utf8').then(JSON.parse),
      readFile(args.projection, 'utf8').then(JSON.parse),
      readFile(args.designSelection, 'utf8').then(JSON.parse),
      args.baseTemplate
        ? readFile(args.baseTemplate, 'utf8').then(JSON.parse)
        : undefined,
      args.nativeBaseCompiler
        ? readFile(args.nativeBaseCompiler, 'utf8').then(JSON.parse)
        : undefined,
      readFile(args.designLibrary, 'utf8').then(JSON.parse),
    ]);
    process.stdout.write(`${JSON.stringify(validateVisualGrammarProgram(document, {
      projection,
      designSelection,
      baseTemplate,
      nativeBaseCompiler,
      designLibrary,
    }))}\n`);
  } catch (error) {
    const code = error instanceof VisualGrammarProgramError
      ? error.code
      : 'visual_grammar_input_unreadable';
    process.stderr.write(`${JSON.stringify({
      ok: false,
      code,
      message: error.message,
      ...(error.shot === undefined ? {} : { shot: error.shot }),
    })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
