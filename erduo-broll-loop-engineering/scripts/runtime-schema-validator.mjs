function resolveLocalRef(rootSchema, reference) {
  if (!reference.startsWith('#/')) throw new Error(`unsupported schema reference: ${reference}`);
  return reference.slice(2).split('/').reduce((value, segment) => {
    const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
    if (!value || typeof value !== 'object' || !(key in value)) {
      throw new Error(`unresolved schema reference: ${reference}`);
    }
    return value[key];
  }, rootSchema);
}

function valueType(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

export function validateSchemaValue(value, rule, rootSchema, pointer = '#', errors = []) {
  const resolved = rule.$ref ? resolveLocalRef(rootSchema, rule.$ref) : rule;
  const actualType = valueType(value);
  if (resolved.type) {
    const expected = Array.isArray(resolved.type) ? resolved.type : [resolved.type];
    const typeMatches = expected.some((type) => (
      type === 'number' ? typeof value === 'number' && Number.isFinite(value) : actualType === type
    ));
    if (!typeMatches) {
      errors.push(`${pointer}: expected ${expected.join(' or ')}, received ${actualType}`);
      return errors;
    }
  }
  if ('const' in resolved && value !== resolved.const) errors.push(`${pointer}: must equal ${JSON.stringify(resolved.const)}`);
  if (resolved.enum && !resolved.enum.includes(value)) errors.push(`${pointer}: value is outside the allowed enum`);
  if (typeof value === 'number' && 'minimum' in resolved && value < resolved.minimum) errors.push(`${pointer}: must be at least ${resolved.minimum}`);
  if (typeof value === 'number' && 'maximum' in resolved && value > resolved.maximum) errors.push(`${pointer}: must be at most ${resolved.maximum}`);
  if (typeof value === 'number' && 'exclusiveMinimum' in resolved && value <= resolved.exclusiveMinimum) errors.push(`${pointer}: must be greater than ${resolved.exclusiveMinimum}`);
  if (typeof value === 'number' && 'exclusiveMaximum' in resolved && value >= resolved.exclusiveMaximum) errors.push(`${pointer}: must be less than ${resolved.exclusiveMaximum}`);
  if (typeof value === 'string') {
    if ('minLength' in resolved && value.length < resolved.minLength) errors.push(`${pointer}: is too short`);
    if (resolved.pattern && !(new RegExp(resolved.pattern, 'u')).test(value)) errors.push(`${pointer}: does not match the required pattern`);
  }
  if (Array.isArray(value)) {
    if ('minItems' in resolved && value.length < resolved.minItems) errors.push(`${pointer}: has too few items`);
    if ('maxItems' in resolved && value.length > resolved.maxItems) errors.push(`${pointer}: has too many items`);
    if (resolved.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${pointer}: items must be unique`);
    if (resolved.items) value.forEach((item, index) => validateSchemaValue(item, resolved.items, rootSchema, `${pointer}/${index}`, errors));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const properties = resolved.properties ?? {};
    for (const key of resolved.required ?? []) if (!(key in value)) errors.push(`${pointer}/${key}: required property is missing`);
    if (resolved.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!(key in properties)) errors.push(`${pointer}/${key}: additional property is not allowed`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key in properties) validateSchemaValue(child, properties[key], rootSchema, `${pointer}/${key}`, errors);
    }
  }
  for (const branch of resolved.allOf ?? []) {
    if (branch.if) {
      const conditionErrors = validateSchemaValue(value, branch.if, rootSchema, pointer, []);
      const selected = conditionErrors.length === 0 ? branch.then : branch.else;
      if (selected) validateSchemaValue(value, selected, rootSchema, pointer, errors);
    } else {
      validateSchemaValue(value, branch, rootSchema, pointer, errors);
    }
  }
  return errors;
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
