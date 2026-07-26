import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const SKILL_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SCHEMA_PATH = path.join(SKILL_ROOT, 'references', 'design-library', 'template.schema.json');
const PROFILE_PATH = path.join(SKILL_ROOT, 'references', 'design-library', 'templates', 'quiet-editorial-print.json');
const CONSTRAINT_KEYS = [
  'axis_authoring_fields',
  'adjacent_min_axis_changes',
  'adjacent_required_any_axis_ids',
];
const VARIABLE_AUTHORING_FIELDS = [
  'surface',
  'attention_geometry',
  'semantic_anchor',
  'anchor_treatment',
  'typography',
  'color',
  'material_texture',
  'motion_causality',
  'emotional_temperature',
];
const EXPECTED_MAPPING = [
  ['density-tier', 'surface'],
  ['anchor-form', 'semantic_anchor'],
  ['anchor-quadrant', 'attention_geometry'],
  ['type-relation', 'typography'],
  ['accent-form', 'color'],
  ['material-process', 'material_texture'],
  ['motion-cause', 'motion_causality'],
];

const [schema, profile] = await Promise.all([
  readFile(SCHEMA_PATH, 'utf8').then(JSON.parse),
  readFile(PROFILE_PATH, 'utf8').then(JSON.parse),
]);

function validateProfileConstraints(value, adaptationKnobs = profile.adaptation_knobs) {
  const errors = [];
  const definition = schema.$defs.visualGrammarConstraints;
  const axisPattern = new RegExp(schema.$defs.templateId.pattern, 'u');
  const allowedFields = new Set(schema.$defs.authoringField.enum);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['invalid_constraints_object'];
  if (JSON.stringify(Object.keys(value)) !== JSON.stringify(CONSTRAINT_KEYS)) errors.push('invalid_constraints_shape');

  const mappings = value.axis_authoring_fields;
  if (!Array.isArray(mappings) || mappings.length < 1 || mappings.length > definition.properties.axis_authoring_fields.maxItems) {
    errors.push('invalid_mapping_count');
  } else {
    const axisIds = new Set();
    const authoringFields = new Set();
    for (const mapping of mappings) {
      if (
        !mapping
        || typeof mapping !== 'object'
        || Array.isArray(mapping)
        || JSON.stringify(Object.keys(mapping)) !== JSON.stringify(['axis_id', 'authoring_field'])
      ) {
        errors.push('invalid_mapping_shape');
        continue;
      }
      if (typeof mapping.axis_id !== 'string' || !axisPattern.test(mapping.axis_id)) errors.push('invalid_axis_id');
      if (axisIds.has(mapping.axis_id)) errors.push('duplicate_axis_id');
      axisIds.add(mapping.axis_id);
      if (!allowedFields.has(mapping.authoring_field)) errors.push('invalid_authoring_field');
      if (authoringFields.has(mapping.authoring_field)) errors.push('duplicate_authoring_field');
      authoringFields.add(mapping.authoring_field);
    }
    const knobIds = adaptationKnobs.map((knob) => knob.id);
    if (JSON.stringify([...axisIds]) !== JSON.stringify(knobIds)) errors.push('axis_order_or_coverage_mismatch');
  }

  if (
    !Number.isInteger(value.adjacent_min_axis_changes)
    || value.adjacent_min_axis_changes < 1
    || (Array.isArray(mappings) && value.adjacent_min_axis_changes > mappings.length)
  ) {
    errors.push('invalid_adjacent_min');
  }

  const required = value.adjacent_required_any_axis_ids;
  if (!Array.isArray(required) || required.length < 1) {
    errors.push('invalid_required_axis_list');
  } else {
    if (new Set(required).size !== required.length) errors.push('duplicate_required_axis');
    const mappedAxes = new Set(Array.isArray(mappings) ? mappings.map((mapping) => mapping?.axis_id) : []);
    for (const axisId of required) {
      if (typeof axisId !== 'string' || !axisPattern.test(axisId) || !mappedAxes.has(axisId)) {
        errors.push('unbound_required_axis');
      }
    }
  }
  return [...new Set(errors)];
}

test('template schema exposes an optional closed visual-grammar constraint contract', () => {
  assert.equal(schema.required.includes('visual_grammar_constraints'), false);
  assert.deepEqual(schema.properties.visual_grammar_constraints, { $ref: '#/$defs/visualGrammarConstraints' });
  assert.equal(schema.$defs.visualGrammarConstraints.additionalProperties, false);
  assert.deepEqual(schema.$defs.visualGrammarConstraints.required, CONSTRAINT_KEYS);
  assert.deepEqual(schema.$defs.authoringField.enum, VARIABLE_AUTHORING_FIELDS);
  assert.equal(schema.$defs.axisAuthoringField.additionalProperties, false);
  assert.deepEqual(schema.$defs.axisAuthoringField.required, ['axis_id', 'authoring_field']);
  assert.equal(schema.$defs.visualGrammarConstraints.properties.axis_authoring_fields.uniqueItems, true);
  assert.equal(schema.$defs.visualGrammarConstraints.properties.axis_authoring_fields.maxItems, VARIABLE_AUTHORING_FIELDS.length);
  assert.equal(
    schema.$defs.visualGrammarConstraints.properties.axis_authoring_fields.allOf.length,
    VARIABLE_AUTHORING_FIELDS.length,
  );
  for (const uniquenessRule of schema.$defs.visualGrammarConstraints.properties.axis_authoring_fields.allOf) {
    assert.equal(uniquenessRule.minContains, 0);
    assert.equal(uniquenessRule.maxContains, 1);
  }
  assert.equal(schema.$defs.visualGrammarConstraints.properties.adjacent_min_axis_changes.minimum, 1);
  assert.equal(schema.$defs.visualGrammarConstraints.properties.adjacent_required_any_axis_ids.minItems, 1);
  assert.equal(schema.$defs.visualGrammarConstraints.properties.adjacent_required_any_axis_ids.uniqueItems, true);
});

test('quiet editorial profile declares the exact ordered axis-to-authoring mapping', () => {
  const constraints = profile.visual_grammar_constraints;
  assert.deepEqual(
    constraints.axis_authoring_fields.map((item) => [item.axis_id, item.authoring_field]),
    EXPECTED_MAPPING,
  );
  assert.equal(constraints.adjacent_min_axis_changes, 3);
  assert.deepEqual(constraints.adjacent_required_any_axis_ids, ['anchor-form', 'motion-cause']);
  assert.deepEqual(validateProfileConstraints(constraints), []);
});

test('invalid or unbound axis ids are rejected by the profile contract', () => {
  const malformed = structuredClone(profile.visual_grammar_constraints);
  malformed.axis_authoring_fields[0].axis_id = 'Density Tier';
  assert(validateProfileConstraints(malformed).includes('invalid_axis_id'));

  const unbound = structuredClone(profile.visual_grammar_constraints);
  unbound.axis_authoring_fields[0].axis_id = 'unknown-axis';
  assert(validateProfileConstraints(unbound).includes('axis_order_or_coverage_mismatch'));
});

test('invalid and duplicate mappings are rejected by the profile contract', () => {
  const unknownField = structuredClone(profile.visual_grammar_constraints);
  unknownField.axis_authoring_fields[0].authoring_field = 'hard_avoids';
  assert(validateProfileConstraints(unknownField).includes('invalid_authoring_field'));

  const duplicateAxis = structuredClone(profile.visual_grammar_constraints);
  duplicateAxis.axis_authoring_fields[1].axis_id = duplicateAxis.axis_authoring_fields[0].axis_id;
  assert(validateProfileConstraints(duplicateAxis).includes('duplicate_axis_id'));

  const duplicateField = structuredClone(profile.visual_grammar_constraints);
  duplicateField.axis_authoring_fields[1].authoring_field = duplicateField.axis_authoring_fields[0].authoring_field;
  assert(validateProfileConstraints(duplicateField).includes('duplicate_authoring_field'));
});

test('non-positive or impossible adjacent minimums are rejected', () => {
  const zero = structuredClone(profile.visual_grammar_constraints);
  zero.adjacent_min_axis_changes = 0;
  assert(validateProfileConstraints(zero).includes('invalid_adjacent_min'));

  const impossible = structuredClone(profile.visual_grammar_constraints);
  impossible.adjacent_min_axis_changes = impossible.axis_authoring_fields.length + 1;
  assert(validateProfileConstraints(impossible).includes('invalid_adjacent_min'));
});

test('empty, duplicate, or unbound required-axis lists are rejected', () => {
  const empty = structuredClone(profile.visual_grammar_constraints);
  empty.adjacent_required_any_axis_ids = [];
  assert(validateProfileConstraints(empty).includes('invalid_required_axis_list'));

  const duplicate = structuredClone(profile.visual_grammar_constraints);
  duplicate.adjacent_required_any_axis_ids = ['anchor-form', 'anchor-form'];
  assert(validateProfileConstraints(duplicate).includes('duplicate_required_axis'));

  const unbound = structuredClone(profile.visual_grammar_constraints);
  unbound.adjacent_required_any_axis_ids = ['unknown-axis'];
  assert(validateProfileConstraints(unbound).includes('unbound_required_axis'));
});
