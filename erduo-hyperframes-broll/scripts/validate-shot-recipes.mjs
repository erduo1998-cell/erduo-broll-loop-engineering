#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.join(skillRoot, 'references', 'runtime');
const shotcraftRoot = path.join(skillRoot, 'references', 'shotcraft');

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

function validateSchema(value, rule, rootSchema, pointer, errors) {
  const resolved = rule.$ref ? resolveLocalRef(rootSchema, rule.$ref) : rule;
  const actualType = valueType(value);

  if (resolved.type) {
    const typeMatches = resolved.type === 'number'
      ? typeof value === 'number' && Number.isFinite(value)
      : actualType === resolved.type;
    if (!typeMatches) {
      errors.push(`${pointer}: expected ${resolved.type}, received ${actualType}`);
      return;
    }
  }

  if ('const' in resolved && value !== resolved.const) {
    errors.push(`${pointer}: must equal ${JSON.stringify(resolved.const)}`);
  }
  if (resolved.enum && !resolved.enum.includes(value)) {
    errors.push(`${pointer}: value is outside the allowed enum`);
  }
  if (typeof value === 'number' && 'minimum' in resolved && value < resolved.minimum) {
    errors.push(`${pointer}: must be at least ${resolved.minimum}`);
  }
  if (typeof value === 'string') {
    if ('minLength' in resolved && value.length < resolved.minLength) {
      errors.push(`${pointer}: must contain at least ${resolved.minLength} character(s)`);
    }
    if (resolved.pattern && !(new RegExp(resolved.pattern, 'u')).test(value)) {
      errors.push(`${pointer}: does not match the required pattern`);
    }
  }

  if (Array.isArray(value)) {
    if ('minItems' in resolved && value.length < resolved.minItems) {
      errors.push(`${pointer}: must contain at least ${resolved.minItems} item(s)`);
    }
    if (resolved.uniqueItems) {
      const encoded = value.map((item) => JSON.stringify(item));
      if (new Set(encoded).size !== encoded.length) errors.push(`${pointer}: items must be unique`);
    }
    if (resolved.items) {
      value.forEach((item, index) => {
        validateSchema(item, resolved.items, rootSchema, `${pointer}/${index}`, errors);
      });
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const properties = resolved.properties ?? {};
    for (const key of resolved.required ?? []) {
      if (!(key in value)) errors.push(`${pointer}/${key}: required property is missing`);
    }
    if (resolved.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) errors.push(`${pointer}/${key}: additional property is not allowed`);
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (key in properties) {
        validateSchema(child, properties[key], rootSchema, `${pointer}/${key}`, errors);
      }
    }
  }
}

function validateSemanticInvariants(
  recipe,
  capabilityIds,
  unsupportedIds,
  shotcraftCards,
  shotcraftRevision,
  fileName,
  errors,
) {
  const { startMs, endMs } = recipe.window ?? {};
  if (Number.isInteger(startMs) && Number.isInteger(endMs) && endMs <= startMs) {
    errors.push('#/window: endMs must be greater than startMs');
  }

  for (const [index, phase] of (recipe.motion?.phases ?? []).entries()) {
    if (Number.isInteger(phase.startMs) && Number.isInteger(phase.endMs)) {
      if (phase.endMs <= phase.startMs) {
        errors.push(`#/motion/phases/${index}: endMs must be greater than startMs`);
      }
      if (Number.isInteger(startMs) && Number.isInteger(endMs)
        && (phase.startMs < startMs || phase.endMs > endMs)) {
        errors.push(`#/motion/phases/${index}: phase must stay inside the shot window`);
      }
    }
  }

  const holdStartMs = recipe.readability?.holdStartMs;
  const holdEndMs = recipe.readability?.holdEndMs;
  if (Number.isInteger(holdStartMs) && Number.isInteger(holdEndMs)) {
    if (holdEndMs <= holdStartMs) {
      errors.push('#/readability: holdEndMs must be greater than holdStartMs');
    }
    if (Number.isInteger(startMs) && Number.isInteger(endMs)
      && (holdStartMs < startMs || holdEndMs > endMs)) {
      errors.push('#/readability: hold window must stay inside the shot window');
    }
  }

  if (recipe.shotId && `${recipe.shotId}.json` !== fileName) {
    errors.push('#/shotId: must match the recipe filename');
  }
  for (const capabilityId of recipe.requiredCapabilities ?? []) {
    if (!capabilityIds.has(capabilityId)) {
      errors.push(`#/requiredCapabilities: unknown capability ${capabilityId}`);
    } else if (unsupportedIds.has(capabilityId)) {
      errors.push(`#/requiredCapabilities: unsupported capability ${capabilityId}`);
    }
  }

  if (recipe.patternRef) {
    const card = shotcraftCards.get(recipe.patternRef.cardId);
    if (!card) {
      errors.push(`#/patternRef/cardId: unknown Shotcraft card ${recipe.patternRef.cardId}`);
    } else if (!card.styles.some(({ key }) => key === recipe.patternRef.styleKey)) {
      errors.push(
        `#/patternRef/styleKey: style ${recipe.patternRef.styleKey} does not belong to card ${card.name}`,
      );
    }
    if (recipe.patternRef.sourceRevision !== shotcraftRevision) {
      errors.push(
        `#/patternRef/sourceRevision: must equal bundled Shotcraft revision ${shotcraftRevision}`,
      );
    }
  }
}

export async function validateRecipeDirectory(directory) {
  const [schema, matrix, shotcraft] = await Promise.all([
    readFile(path.join(runtimeRoot, 'shot-recipe.schema.json'), 'utf8').then(JSON.parse),
    readFile(path.join(runtimeRoot, 'capability-matrix.json'), 'utf8').then(JSON.parse),
    readFile(path.join(shotcraftRoot, 'catalog.json'), 'utf8').then(JSON.parse),
  ]);
  const capabilityIds = new Set(matrix.capabilities.map(({ id }) => id));
  const unsupportedIds = new Set(
    matrix.capabilities
      .filter(({ classification }) => classification === 'unsupported')
      .map(({ id }) => id),
  );
  const shotcraftCards = new Map(shotcraft.cards.map((card) => [card.name, card]));
  const shotcraftRevision = shotcraft.upstream.commit;
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length === 0) throw new Error('recipe directory is empty');

  const failures = [];
  const shotIds = new Set();
  let recipeCount = 0;
  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') {
      failures.push(`${entry.name}: only JSON recipe files are allowed`);
      continue;
    }
    recipeCount += 1;
    const errors = [];
    let recipe;
    try {
      recipe = JSON.parse(await readFile(path.join(directory, entry.name), 'utf8'));
    } catch {
      failures.push(`${entry.name}: invalid JSON`);
      continue;
    }
    validateSchema(recipe, schema, schema, '#', errors);
    validateSemanticInvariants(
      recipe,
      capabilityIds,
      unsupportedIds,
      shotcraftCards,
      shotcraftRevision,
      entry.name,
      errors,
    );
    if (recipe?.shotId) {
      if (shotIds.has(recipe.shotId)) errors.push('#/shotId: duplicate shot ID');
      shotIds.add(recipe.shotId);
    }
    failures.push(...errors.map((error) => `${entry.name}: ${error}`));
  }

  if (failures.length > 0) throw new Error(`shot recipe validation failed:\n${failures.join('\n')}`);
  return { status: 'valid', recipes: recipeCount };
}

async function main() {
  const [directory] = process.argv.slice(2);
  if (!directory) throw new Error('usage: node scripts/validate-shot-recipes.mjs <recipe-directory>');
  const result = await validateRecipeDirectory(path.resolve(directory));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]
  && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
