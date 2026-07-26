#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROFILE = 'structure-only-neutral-v1';
const PIPELINE_CONTRACT_VERSION = 2;
const PINNED_COMMANDS = Object.freeze({
  dev: 'preview',
  check: 'check',
  render: 'render',
  publish: 'publish',
});
const MEDIA_EXTENSION = /\.(?:avif|gif|jpe?g|m4a|mkv|mov|mp3|mp4|ogg|png|svg|wav|webm|webp)$/iu;

export class NeutralScaffoldError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'NeutralScaffoldError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new NeutralScaffoldError(code, message);
};
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const count = (source, pattern) => [...source.matchAll(pattern)].length;
const plainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const safeRelative = (value) => typeof value === 'string'
  && value.length > 0
  && !path.isAbsolute(value)
  && !value.split(/[\\/]/u).includes('..')
  && !/^[a-z][a-z0-9+.-]*:/iu.test(value);

async function readJson(file, code) {
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!plainObject(value)) fail(code, 'Neutral scaffold metadata is invalid.');
    return value;
  } catch (error) {
    if (error instanceof NeutralScaffoldError) throw error;
    fail(code, 'Neutral scaffold metadata is invalid.');
  }
}

async function listFiles(root, directory = root) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    fail('scaffold_unreadable', 'Neutral scaffold cannot be read.');
  }
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.DS_Store' || entry.name === 'node_modules') continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
      fail('unsafe_scaffold_entry', 'Neutral scaffold contains an unsafe filesystem entry.');
    }
    if (entry.isDirectory()) files.push(...await listFiles(root, absolute));
    else files.push({
      absolute,
      relative: path.relative(root, absolute).split(path.sep).join('/'),
    });
  }
  return files.sort((a, b) => a.relative.localeCompare(b.relative));
}

function rootAttributes(source) {
  const matches = [...source.matchAll(/<div\b([^>]*)>/giu)]
    .filter((match) => /\bid\s*=\s*["']root["']/iu.test(match[1]));
  if (matches.length !== 1) fail('invalid_root', 'Neutral scaffold must contain exactly one root.');
  const attributes = Object.fromEntries(
    [...matches[0][1].matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/gsu)]
      .map((match) => [match[1].toLowerCase(), match[3]]),
  );
  return { attributes, raw: matches[0][1] };
}

function cssDeclarations(body) {
  const declarations = {};
  for (const raw of body.split(';').map((value) => value.trim()).filter(Boolean)) {
    const match = raw.match(/^([a-z-]+)\s*:\s*(.+)$/iu);
    if (!match || match[1] in declarations) fail('style_profile_mismatch', 'Neutral scaffold structural CSS is invalid.');
    declarations[match[1].toLowerCase()] = match[2].trim().toLowerCase();
  }
  return declarations;
}

function validateStyleProfile(source) {
  if (/\bstyle\s*=/iu.test(source)) fail('style_profile_mismatch', 'Neutral scaffold cannot include inline styling.');
  const styles = [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/giu)];
  if (styles.length !== 1) fail('style_profile_mismatch', 'Neutral scaffold must contain one structural style block.');
  const css = styles[0][1].replace(/\/\*[\s\S]*?\*\//gu, '');
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)];
  const residue = css.replace(/([^{}]+)\{([^{}]*)\}/gu, '').trim();
  if (residue || blocks.length !== 3) fail('style_profile_mismatch', 'Neutral scaffold structural CSS is invalid.');
  const actual = {};
  for (const block of blocks) {
    const selector = block[1].replace(/\s+/gu, '').toLowerCase();
    if (selector in actual) fail('style_profile_mismatch', 'Neutral scaffold structural CSS is invalid.');
    actual[selector] = cssDeclarations(block[2]);
  }
  const expected = {
    '*': { margin: '0', padding: '0', 'box-sizing': 'border-box' },
    'html,body': { width: '1920px', height: '1080px', overflow: 'hidden', background: 'transparent' },
    '#root': { position: 'relative', width: '1920px', height: '1080px', overflow: 'hidden', background: 'transparent' },
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail('style_profile_mismatch', 'Neutral scaffold structural CSS contains a visual or layout default.');
  }
}

function validateIndex(source) {
  if (!/^<!doctype html>/iu.test(source.trimStart())) fail('invalid_document', 'Neutral scaffold HTML is invalid.');
  if (count(source, /<script\b/giu) !== 0
    || count(source, /<link\b/giu) !== 0
    || /@import\b|(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(|\bimport\s*\(/iu.test(source)) {
    fail('runtime_forbidden', 'Neutral scaffold cannot include a script, remote style, import or network runtime.');
  }
  if (/(?:https?:)?\/\/|data:|blob:/iu.test(source)) {
    fail('remote_reference', 'Neutral scaffold runtime cannot include remote or embedded references.');
  }
  if (/<(?:audio|canvas|embed|iframe|img|object|picture|source|svg|video)\b/iu.test(source)
    || /\burl\s*\(/iu.test(source)) {
    fail('media_forbidden', 'Neutral scaffold cannot include media, embeds or asset URLs.');
  }
  if (/\bclass\s*=/iu.test(source)) fail('sample_component', 'Neutral scaffold cannot include sample component classes.');
  if (/\b(?:aria-label|title|alt|data-copy)\s*=/iu.test(source)) {
    fail('sample_content', 'Neutral scaffold cannot include placeholder labels or readable copy.');
  }
  if (/@font-face|\bfont(?:-family)?\s*:|data-font-role/iu.test(source)) {
    fail('font_forbidden', 'Neutral scaffold cannot include a font or typography default.');
  }
  if (/(?:linear|radial|conic)-gradient|box-shadow|text-shadow|drop-shadow|\bfilter\s*:|border-radius|\b(?:orb|card|hud)\b/iu.test(source)) {
    fail('visual_signature', 'Neutral scaffold cannot include a default visual signature.');
  }
  if (/(?:^|[;{]\s*)display\s*:\s*(?:grid|inline-grid|flex|inline-flex)|place-items|align-items|justify-content|grid-template|grid-area|text-align\s*:\s*center|margin\s*:\s*auto/imu.test(source)) {
    fail('layout_topology', 'Neutral scaffold cannot include a default layout topology.');
  }
  const backgroundValues = [...source.matchAll(/\bbackground\s*:\s*([^;}]+)/giu)]
    .map((match) => match[1].trim().toLowerCase());
  if (/#[0-9a-f]{3,8}\b|rgba?\s*\(|hsla?\s*\(|(?:^|[;{]\s*)(?:color|background-color)\s*:/imu.test(source)
    || backgroundValues.some((value) => value !== 'transparent')) {
    fail('palette_forbidden', 'Neutral scaffold cannot include a palette or opaque canvas treatment.');
  }
  if (/\b(?:scene[-_ ]?kit|layer(?:ed|s)?|matte|depth|clean[-_ ]?plate|alpha[-_ ]?decomposition|hero[-_ ]?shot)\b/iu.test(source)) {
    fail('deferred_capability', 'Neutral scaffold cannot include deferred layered capability.');
  }

  const bodyMatch = source.match(/<body\b[^>]*>([\s\S]*?)<\/body>/iu);
  if (!bodyMatch) fail('invalid_document', 'Neutral scaffold HTML is invalid.');
  const bodyWithoutEmptyRoot = bodyMatch[1].replace(/<div\b[^>]*\bid\s*=\s*["']root["'][^>]*>\s*<\/div>/iu, '');
  if (/<[a-z][^>]*>/iu.test(bodyWithoutEmptyRoot)
    || bodyWithoutEmptyRoot.replace(/<!--[\s\S]*?-->/gu, '').trim()) {
    fail('sample_content', 'Neutral scaffold body must contain only an empty root.');
  }

  validateStyleProfile(source);
  const root = rootAttributes(source);
  const { attributes } = root;
  if (attributes['data-composition-id'] !== 'main'
    || !/\bdata-no-timeline(?:\s|$)/iu.test(root.raw)
    || attributes['data-scaffold-profile'] !== PROFILE
    || attributes['data-pipeline-contract-version'] !== String(PIPELINE_CONTRACT_VERSION)
    || attributes['data-start'] !== '0') {
    fail('root_profile_mismatch', 'Neutral scaffold root profile is invalid.');
  }
  const duration = Number(attributes['data-duration']);
  const width = Number(attributes['data-width']);
  const height = Number(attributes['data-height']);
  if (!Number.isFinite(duration) || duration <= 0
    || !Number.isSafeInteger(width) || width <= 0
    || !Number.isSafeInteger(height) || height <= 0) {
    fail('invalid_placeholder_profile', 'Neutral scaffold placeholder timing or raster is invalid.');
  }
  return {
    composition_id: 'main',
    placeholder_duration_seconds: duration,
    width,
    height,
  };
}

function validatePackage(document) {
  if (document.name !== 'hyperframes-template' || document.private !== true || document.type !== 'module'
    || !plainObject(document.scripts)
    || Object.keys(document.scripts).sort().join(',') !== Object.keys(PINNED_COMMANDS).sort().join(',')) {
    fail('package_profile_mismatch', 'Neutral scaffold package profile is invalid.');
  }
  const versions = new Set();
  for (const [name, command] of Object.entries(PINNED_COMMANDS)) {
    const pattern = new RegExp(`^npx --yes hyperframes@(\\d+\\.\\d+\\.\\d+) ${command}$`, 'u');
    const match = (document.scripts[name] ?? '').match(pattern);
    if (!match) fail('unpinned_cli', 'Neutral scaffold commands must pin the HyperFrames CLI.');
    versions.add(match[1]);
  }
  if (versions.size !== 1) fail('cli_pin_mismatch', 'Neutral scaffold commands must share one HyperFrames CLI pin.');
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    if (field in document) fail('runtime_dependency', 'Neutral scaffold cannot include runtime dependencies.');
  }
}

function validateHyperframesConfig(document) {
  if ('registry' in document || 'plugins' in document || 'scripts' in document) {
    fail('remote_registry', 'Neutral scaffold cannot override a registry or runtime.');
  }
  if (!plainObject(document.paths)
    || !safeRelative(document.paths.blocks)
    || !safeRelative(document.paths.components)
    || !safeRelative(document.paths.assets)
    || document.media?.autoProxy !== true) {
    fail('hyperframes_profile_mismatch', 'Neutral scaffold HyperFrames configuration is invalid.');
  }
}

export async function validateNeutralScaffold(root) {
  if (typeof root !== 'string' || !root) fail('invalid_root_path', 'Neutral scaffold root is invalid.');
  let stat;
  try {
    stat = await fs.lstat(root);
  } catch {
    fail('scaffold_unreadable', 'Neutral scaffold cannot be read.');
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('invalid_root_path', 'Neutral scaffold root is invalid.');

  const files = await listFiles(root);
  const names = new Set(files.map((file) => file.relative));
  for (const required of ['index.html', 'meta.json', 'package.json', 'hyperframes.json']) {
    if (!names.has(required)) fail('required_file_missing', 'Neutral scaffold is missing a required file.');
  }
  if (files.some((file) => MEDIA_EXTENSION.test(file.relative))) {
    fail('bundled_media', 'Neutral scaffold cannot bundle media or font-like visual assets.');
  }

  const [source, meta, packageDocument, hyperframes] = await Promise.all([
    fs.readFile(path.join(root, 'index.html'), 'utf8').catch(() => fail('index_unreadable', 'Neutral scaffold source cannot be read.')),
    readJson(path.join(root, 'meta.json'), 'meta_invalid'),
    readJson(path.join(root, 'package.json'), 'package_invalid'),
    readJson(path.join(root, 'hyperframes.json'), 'hyperframes_invalid'),
  ]);
  const rootProfile = validateIndex(source);
  if (meta.scaffoldProfile !== PROFILE || meta.pipelineContractVersion !== PIPELINE_CONTRACT_VERSION) {
    fail('metadata_profile_mismatch', 'Neutral scaffold metadata does not match its root profile.');
  }
  validatePackage(packageDocument);
  validateHyperframesConfig(hyperframes);

  return {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    scaffold_profile: PROFILE,
    root_profile: rootProfile,
    runtime: {
      script_count: 0,
      style_link_count: 0,
      media_count: 0,
      remote_reference_count: 0,
    },
    file_count: files.length,
    source_sha256: sha256(source),
    ok: true,
  };
}

function usage() {
  return 'Usage: node scripts/validate-neutral-scaffold.mjs <scaffold-root>';
}

async function main(argv) {
  if (argv.length === 1 && argv[0] === '--help') {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (argv.length !== 1) fail('usage', usage());
  process.stdout.write(`${JSON.stringify(await validateNeutralScaffold(argv[0]))}\n`);
}

const mainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (mainModule) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    const known = error instanceof NeutralScaffoldError;
    process.stderr.write(`${JSON.stringify({
      ok: false,
      error: {
        code: known ? error.code : 'neutral_scaffold_failed',
        message: known ? error.message : 'Neutral scaffold validation failed.',
      },
    })}\n`);
    process.exitCode = known && error.code === 'usage' ? 64 : 2;
  }
}
