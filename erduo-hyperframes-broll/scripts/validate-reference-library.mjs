#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_REGISTRY_PATH = path.join(PROJECT_ROOT, 'reference-library', 'registry.json');
const EXIT_OK = 0;
const EXIT_USAGE = 64;
const EXIT_READ = 3;
const EXIT_INVALID = 2;

const ALLOWED_CATEGORIES = new Set(['styles', 'scene-logic', 'components', 'motion', 'compositing', 'quality-gates']);
const CATEGORY_PREFIX = {
  styles: 'STY',
  'scene-logic': 'SCN',
  components: 'CPT',
  motion: 'MOT',
  compositing: 'CPS',
  'quality-gates': 'QLT',
};
const ENTRY_KEYS = new Set(['id', 'category', 'tags', 'capabilities', 'summary', 'source_boundary', 'dependencies', 'validation_status', 'relative_path']);
const SOURCE_BOUNDARY_KEYS = new Set(['user_reference_priority', 'usage_mode', 'provenance', 'content_handling']);
const ENTRY_STATUS_BLOCKLIST = new Set(['production']);
const PRIVATE_SOURCE_PATTERNS = [
  /\/Users\//u,
  /^([A-Za-z]:\\|\\Users\\|\\Desktop\\|\\private\\|\\var\\)/u,
  /\bDesktop\b/u,
  /\b工作文件\b/u,
  /耳朵的ip/u,
  /jianying|剪映/u,
  /\/Volumes\//u,
];

export class ReferenceLibraryError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'ReferenceLibraryError';
    this.code = code;
    if (detail.id !== undefined) this.id = detail.id;
    if (detail.category !== undefined) this.category = detail.category;
    if (detail.path !== undefined) this.path = detail.path;
  }
}

function fail(code, message, detail = {}) {
  throw new ReferenceLibraryError(code, message, detail);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ensureArray(value, code, detail = {}) {
  if (!Array.isArray(value)) fail(code, 'Value must be an array.', detail);
  return value;
}

function ensureString(value, code, detail = {}, max = 240) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    fail(code, 'Invalid string field.', detail);
  }
  return value.trim();
}

function ensureStableId(id, category) {
  const prefix = CATEGORY_PREFIX[category];
  if (!prefix) fail('invalid_category', 'Category is not supported.', { category });
  if (!new RegExp(`^${prefix}-[0-9]{3}$`, 'u').test(id)) {
    fail('invalid_id', 'Reference atom id is not stable for its category.', { id, category });
  }
}

function ensureRelativePath(value, category, detail, libraryRoot) {
  if (value.includes('..')) fail('invalid_relative_path', 'relative_path must not contain parent traversal.', detail);
  if (path.isAbsolute(value)) fail('invalid_relative_path', 'relative_path must be project-relative.', detail);
  if (/^([A-Za-z]:\\|~[\\/])/.test(value)) fail('invalid_relative_path', 'relative_path must not be absolute or home-path based.', detail);
  if (value.startsWith('/')) fail('invalid_relative_path', 'relative_path must be relative.', detail);
  if (/\/{2,}/.test(value)) {
    fail('invalid_relative_path', 'relative_path contains invalid separators.', detail);
  }

  const firstPart = value.split(/[\\/]/u)[0];
  if (firstPart !== category) fail('invalid_relative_path', 'relative_path must be inside matching category folder.', detail);

  const absolutePath = path.resolve(libraryRoot, value);
  const base = path.resolve(libraryRoot) + path.sep;
  if (!absolutePath.startsWith(base)) fail('invalid_relative_path', 'relative_path escapes registry root.', detail);
}

function scanPrivateLeak(value, code, detail) {
  if (typeof value !== 'string') return;
  for (const pattern of PRIVATE_SOURCE_PATTERNS) {
    if (pattern.test(value)) fail(code, 'Private source or absolute path leakage detected.', detail);
  }
}

function validateSourceBoundary(sourceBoundary, id) {
  const detail = { id };
  if (!isPlainObject(sourceBoundary)) fail('invalid_source_boundary', 'source_boundary must be an object.', detail);
  const sourceKeys = Object.keys(sourceBoundary).sort();
  if (sourceKeys.join(',') !== [...SOURCE_BOUNDARY_KEYS].sort().join(',')) {
    fail('invalid_source_boundary', 'source_boundary must contain exactly the boundary contract keys.', detail);
  }
  if (sourceBoundary.user_reference_priority !== true) fail('invalid_source_boundary', 'user_reference_priority must be true.', detail);
  if (sourceBoundary.usage_mode !== 'advisory') fail('invalid_source_boundary', 'usage_mode must be advisory.', detail);
  if (sourceBoundary.provenance !== 'sanitized-abstract') fail('invalid_source_boundary', 'provenance must be sanitized-abstract.', detail);
  if (sourceBoundary.content_handling !== 'non-literal-only') fail('invalid_source_boundary', 'content_handling must be non-literal-only.', detail);
}

function validateStringArray(items, code, detail = {}) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 16) fail(code, 'Array is invalid.', detail);
  const normalized = [];
  const seen = new Set();
  for (const item of items) {
    const value = ensureString(item, code, detail, 80);
    if (seen.has(value)) fail(code, 'Duplicate values are not allowed.', detail);
    scanPrivateLeak(value, code, detail);
    normalized.push(value);
    seen.add(value);
  }
  return normalized;
}

function validateDependencies(deps, detail = {}) {
  if (!Array.isArray(deps)) fail('invalid_dependencies', 'dependencies must be an array.', detail);
  const normalized = [];
  const seen = new Set();
  for (const dep of deps) {
    if (typeof dep !== 'string' || !/^[A-Z]{3}-[0-9]{3}$/u.test(dep)) fail('invalid_dependencies', 'dependency id is malformed.', detail);
    if (seen.has(dep)) fail('invalid_dependencies', 'Duplicate dependency IDs are not allowed.', detail);
    normalized.push(dep);
    seen.add(dep);
  }
  return normalized;
}

function validateValidationStatus(value, id) {
  const status = ensureString(value, 'invalid_validation_status', { id }, 40);
  if (!/^[a-z0-9-]+$/u.test(status)) fail('invalid_validation_status', 'validation_status must be lowercase dashed token.', { id });
  if (ENTRY_STATUS_BLOCKLIST.has(status)) fail('forbidden_validation_status', 'production status is forbidden here.', { id });
}

function validateEntry(entry, entryIndex, idSet, libraryRoot) {
  if (!isPlainObject(entry)) fail('invalid_entry', 'Registry entry must be an object.', { entryIndex });
  const keys = Object.keys(entry).sort();
  if (keys.join(',') !== [...ENTRY_KEYS].sort().join(',')) fail('invalid_entry', 'Registry entry carries extra or missing fields.', { entryIndex });

  const id = ensureString(entry.id, 'invalid_entry', { entryIndex }, 20);
  const category = ensureString(entry.category, 'invalid_entry', { entryIndex }, 32);
  if (!ALLOWED_CATEGORIES.has(category)) fail('invalid_entry', 'category is unsupported.', { entryIndex, category });
  ensureStableId(id, category);
  if (idSet.has(id)) fail('invalid_entry', 'Duplicate atom id.', { id });
  idSet.add(id);

  const tags = validateStringArray(entry.tags, 'invalid_tags', { id });
  const capabilities = validateStringArray(entry.capabilities, 'invalid_capabilities', { id });
  const summary = ensureString(entry.summary, 'invalid_summary', { id }, 260);
  validateSourceBoundary(entry.source_boundary, id);
  const dependencies = validateDependencies(entry.dependencies, { id });
  validateValidationStatus(entry.validation_status, id);
  if (typeof entry.relative_path !== 'string' || !entry.relative_path.trim()) fail('invalid_relative_path', 'relative_path is invalid.', { id });
  const relativePath = entry.relative_path.trim();
  ensureRelativePath(relativePath, category, { id }, libraryRoot);
  scanPrivateLeak(relativePath, 'private_source_leak', { id });
  scanPrivateLeak(id, 'private_source_leak', { id });
  scanPrivateLeak(category, 'private_source_leak', { id });
  scanPrivateLeak(summary, 'private_source_leak', { id });
  for (const tag of tags) scanPrivateLeak(tag, 'private_source_leak', { id });
  for (const cap of capabilities) scanPrivateLeak(cap, 'private_source_leak', { id });
  for (const dep of dependencies) scanPrivateLeak(dep, 'private_source_leak', { id });
}

async function validateFile(registryPath, adapter = {}) {
  const readFile = adapter.readFile ?? fs.readFile;
  const stat = adapter.stat ?? fs.stat;
  const registryDir = path.dirname(path.resolve(registryPath));
  let registryRaw;
  try {
    registryRaw = JSON.parse(await readFile(registryPath, 'utf8'));
  } catch (error) {
    throw new ReferenceLibraryError('read_failed', 'registry.json could not be read or parsed.', { path: registryPath }, error);
  }
  const registry = ensureArray(registryRaw, 'invalid_registry');
  if (registry.length === 0) fail('invalid_registry', 'registry.json cannot be empty.');

  const idSet = new Set();
  const countsByCategory = {};
  for (const category of ALLOWED_CATEGORIES) countsByCategory[category] = 0;
  for (let index = 0; index < registry.length; index += 1) {
    const entry = registry[index];
    validateEntry(entry, index + 1, idSet, registryDir);
    countsByCategory[entry.category] += 1;
    const entryPath = path.resolve(registryDir, entry.relative_path);
    try {
      await stat(entryPath);
    } catch (error) {
      fail('missing_entry_file', 'Referenced reference atom file is missing.', { id: entry.id, path: entry.relative_path });
    }
  }

  for (const [category, count] of Object.entries(countsByCategory)) {
    if (count < 1) fail('empty_category', 'Each category must contain at least one atom.', { category });
    if (count > 64) fail('too_many_atoms', 'Each category must stay small enough for deterministic recall.', { category, count });
  }

  for (const entry of registry) {
    for (const dep of entry.dependencies) {
      if (!idSet.has(dep)) fail('missing_dependency', 'Dependency id is not found in registry.', { id: entry.id, dependency: dep });
    }
  }

  return { entry_count: registry.length, categories: countsByCategory };
}

export function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const unknown = argv.filter((item) => item.startsWith('-'));
  const positional = argv.filter((item) => !item.startsWith('-'));
  if (unknown.length || positional.length > 1) return { error: true };
  return { registry_path: positional[0] ?? DEFAULT_REGISTRY_PATH };
}

export async function runValidateReferenceLibrary(argv, adapter = {}) {
  const output = adapter.stdout ?? process.stdout;
  const errorOut = adapter.stderr ?? process.stderr;
  const readFile = adapter.readFile ?? fs.readFile;
  const stat = adapter.stat ?? fs.stat;
  const args = parseArgs(argv);
  if (args.help) {
    output.write('Usage: node scripts/validate-reference-library.mjs [reference-library/registry.json]\\n');
    return EXIT_OK;
  }
  if (args.error) {
    errorOut.write('validate-reference-library: invalid arguments (use --help)\\n');
    return EXIT_USAGE;
  }

  try {
    const result = await validateFile(args.registry_path, { readFile, stat });
    output.write(`${JSON.stringify({ ok: true, ...result })}\\n`);
    return EXIT_OK;
  } catch (error) {
    if (error instanceof ReferenceLibraryError) {
      errorOut.write(`${JSON.stringify({ ok: false, error: { code: error.code, id: error.id, category: error.category } })}\\n`);
      if (error.code === 'read_failed') return EXIT_READ;
      return EXIT_INVALID;
    }
    errorOut.write(`${JSON.stringify({ ok: false, error: { code: 'internal_error' } })}\\n`);
    return 70;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) process.exit(await runValidateReferenceLibrary(process.argv.slice(2)));

export { validateFile, PROJECT_ROOT };
