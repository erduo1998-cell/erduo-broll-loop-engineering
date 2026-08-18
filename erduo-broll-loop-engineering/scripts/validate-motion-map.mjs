#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, validateSchemaValue } from './runtime-schema-validator.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaFile = path.join(skillRoot, 'references', 'runtime', 'motion-map.schema.json');

export function computeMotionMapIdentity(value) {
  const unsigned = structuredClone(value);
  delete unsigned.identity;
  return createHash('sha256').update(canonicalJson(unsigned)).digest('hex');
}

async function readRecipes(directory) {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .toSorted((left, right) => left.name.localeCompare(right.name));
  return Promise.all(entries.map(async (entry) => JSON.parse(await readFile(path.join(directory, entry.name), 'utf8'))));
}

export async function validateMotionMap({ motionMapFile, recipesDirectory, representativeScenesFile } = {}) {
  const [schema, motionMap, recipes, representativeScenes] = await Promise.all([
    readFile(schemaFile, 'utf8').then(JSON.parse),
    readFile(motionMapFile, 'utf8').then(JSON.parse),
    readRecipes(recipesDirectory),
    representativeScenesFile ? readFile(representativeScenesFile, 'utf8').then(JSON.parse) : null,
  ]);
  const errors = validateSchemaValue(motionMap, schema, schema);
  if (motionMap.identity !== computeMotionMapIdentity(motionMap)) errors.push('#/identity: does not match the motion map content');

  const recipeById = new Map(recipes.map((recipe) => [recipe.shotId, recipe]));
  const mapById = new Map();
  for (const [index, shot] of (motionMap.shots ?? []).entries()) {
    if (mapById.has(shot.shotId)) errors.push(`#/shots/${index}/shotId: duplicate shotId`);
    mapById.set(shot.shotId, shot);
    const recipe = recipeById.get(shot.shotId);
    if (!recipe) errors.push(`#/shots/${index}/shotId: does not resolve to a Recipe`);
    else if (shot.compositionFamily !== (recipe.schemaVersion === '4.0.0'
      ? recipe.creativeProposal?.composition
      : recipe.compositionFamily)) {
      errors.push(`#/shots/${index}/compositionFamily: must match the Recipe`);
    }
    if (recipe?.readableHold) {
      const holdMs = recipe.readableHold.endMs - recipe.readableHold.startMs;
      if (shot.settleMs > holdMs) errors.push(`#/shots/${index}/settleMs: exceeds the Recipe readable hold`);
    }
  }
  if (mapById.size !== recipeById.size
    || [...recipeById.keys()].some((shotId) => !mapById.has(shotId))) {
    errors.push('#/shots: must map every Recipe exactly once');
  }

  if (representativeScenes) {
    const selected = representativeScenes.scenes?.map(({ shotId }) => mapById.get(shotId)) ?? [];
    if (selected.some((shot) => !shot)) errors.push('#/representativeScenes: every selection must resolve to the motion map');
    for (const field of ['contentRelation', 'compositionFamily', 'rhythm']) {
      if (new Set(selected.map((shot) => shot?.[field])).size !== 3) {
        errors.push(`#/representativeScenes: selections must cover three distinct ${field} values`);
      }
    }
  }
  if (errors.length > 0) throw new Error(`motion map validation failed:\n${errors.join('\n')}`);
  return { status: 'valid', shots: motionMap.shots.length, identity: motionMap.identity };
}

async function requireDirectorEntry(root, name, kind) {
  const entry = path.join(root, name);
  const info = await lstat(entry);
  const matches = kind === 'directory' ? info.isDirectory() : info.isFile();
  if (!matches || info.isSymbolicLink()) throw new Error(`${name} must be a real ${kind}`);
  return entry;
}

async function readJsonDraft(file, label) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    throw new Error(`${label} is invalid JSON`);
  }
}

async function atomicJsonReplace(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function finalizeDirectorArtifacts({ directorRoot } = {}) {
  if (!directorRoot) throw new Error('directorRoot is required');
  const root = path.resolve(directorRoot);
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error('Director root must be a real directory');
  }
  const canonicalRoot = realpathSync(root);
  const [recipesDirectory, narrativeEnvelopeFile, visualSystemFile, representativeScenesFile, motionMapFile] = await Promise.all([
    requireDirectorEntry(canonicalRoot, 'shot-recipes', 'directory'),
    requireDirectorEntry(canonicalRoot, 'narrative-envelope.json', 'file'),
    requireDirectorEntry(canonicalRoot, 'visual-system.json', 'file'),
    requireDirectorEntry(canonicalRoot, 'representative-scenes.json', 'file'),
    requireDirectorEntry(canonicalRoot, 'motion-map.json', 'file'),
  ]);
  const [
    { validateRecipeDirectory },
    {
      bindRepresentativeScenes,
      bindSharedArtifacts,
      computeRepresentativeScenesIdentity,
    },
  ] = await Promise.all([
    import('./validate-shot-recipes.mjs'),
    import('./validate-runtime-plan.mjs'),
  ]);
  const [recipeResult, representativeDraft, motionDraft] = await Promise.all([
    validateRecipeDirectory(recipesDirectory),
    readJsonDraft(representativeScenesFile, 'representative scenes'),
    readJsonDraft(motionMapFile, 'motion map'),
    bindSharedArtifacts({ narrativeEnvelopeFile, visualSystemFile }),
  ]);
  const representativeScenes = structuredClone(representativeDraft);
  representativeScenes.identity = computeRepresentativeScenesIdentity(representativeScenes);
  const motionMap = structuredClone(motionDraft);
  motionMap.identity = computeMotionMapIdentity(motionMap);

  const verificationRoot = await mkdtemp(path.join(os.tmpdir(), 'erduo-director-finalize-'));
  const verifiedRepresentativeScenesFile = path.join(verificationRoot, 'representative-scenes.json');
  const verifiedMotionMapFile = path.join(verificationRoot, 'motion-map.json');
  try {
    await Promise.all([
      writeFile(verifiedRepresentativeScenesFile, `${JSON.stringify(representativeScenes)}\n`),
      writeFile(verifiedMotionMapFile, `${JSON.stringify(motionMap)}\n`),
    ]);
    await bindRepresentativeScenes(verifiedRepresentativeScenesFile);
    await validateMotionMap({
      motionMapFile: verifiedMotionMapFile,
      recipesDirectory,
      representativeScenesFile: verifiedRepresentativeScenesFile,
    });
  } finally {
    await rm(verificationRoot, { recursive: true, force: true });
  }

  await Promise.all([
    atomicJsonReplace(representativeScenesFile, representativeScenes),
    atomicJsonReplace(motionMapFile, motionMap),
  ]);
  return {
    status: 'finalized',
    recipes: recipeResult.recipes,
    representativeScenesIdentity: representativeScenes.identity,
    motionMapIdentity: motionMap.identity,
  };
}

async function main() {
  const [first, second, third] = process.argv.slice(2);
  if (first === '--finalize') {
    if (!second || third) throw new Error('usage: validate-motion-map.mjs --finalize <01-director-directory>');
    const result = await finalizeDirectorArtifacts({ directorRoot: path.resolve(second) });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const [motionMapFile, recipesDirectory, representativeScenesFile] = [first, second, third];
  if (!motionMapFile || !recipesDirectory) {
    throw new Error('usage: validate-motion-map.mjs <motion-map.json> <recipe-directory> [representative-scenes.json]');
  }
  const result = await validateMotionMap({
    motionMapFile: path.resolve(motionMapFile),
    recipesDirectory: path.resolve(recipesDirectory),
    representativeScenesFile: representativeScenesFile ? path.resolve(representativeScenesFile) : undefined,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]
  && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
