#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadDisplayFontLibrary, validateDisplayFontSelection } from './validate-display-font-selection.mjs';

const execFile = promisify(execFileCallback);
const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const ROLE = /^[a-z][a-z0-9-]*$/u;
const FONT_ID = /^[a-z0-9][a-z0-9.-]*$/u;
const GIT_BLOB_SHA = /^[0-9a-f]{40}$/u;
const MAX_FONT_BYTES = 64 * 1024 * 1024;
const MAX_METADATA_BYTES = 1024 * 1024;
const MAX_BLOB_RESPONSE_BYTES = 96 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20000;

export class PrepareFontAssetsError extends Error {
  constructor(code, message, role) { super(message); this.name = 'PrepareFontAssetsError'; this.code = code; if (role) this.role = role; }
}
const fail = (code, message, role) => { throw new PrepareFontAssetsError(code, message, role); };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const safeRelative = (value) => typeof value === 'string' && value && !path.isAbsolute(value) && !value.includes('\\') && !value.split('/').includes('..');

function extension(source) {
  const ext = path.posix.extname(source.source_path ?? '').slice(1).toLowerCase();
  if (!['ttf', 'otf', 'woff2'].includes(ext)) fail('font_source_invalid', 'Pinned font source format is unsupported.');
  return ext;
}

function validateManifest(manifest) {
  if (!manifest || manifest.schema_version !== 1 || !Array.isArray(manifest.sources) || !manifest.sources.length) fail('font_manifest_invalid', 'Font source manifest is invalid.');
  const ids = new Set();
  for (const source of manifest.sources) {
    if (!source || !FONT_ID.test(source.font_id ?? '') || ids.has(source.font_id) || typeof source.family !== 'string' || !/^Noto\s/u.test(source.family)
      || !Array.isArray(source.roles) || !source.roles.length || source.roles.some((role) => !ROLE.test(role))
      || typeof source.version !== 'string' || !source.version || typeof source.repository !== 'string' || !source.repository.startsWith('https://github.com/notofonts/')
      || !COMMIT.test(source.commit ?? '') || typeof source.download_url !== 'string' || !source.download_url.startsWith('https://') || !source.download_url.includes(source.commit)
      || !Number.isSafeInteger(source.bytes) || source.bytes <= 0 || source.bytes > MAX_FONT_BYTES || !SHA256.test(source.sha256 ?? '') || source.license_id !== 'OFL-1.1'
      || !safeRelative(source.license_path) || !SHA256.test(source.license_sha256 ?? '') || source.commercial_use !== true || source.redistribution !== true) {
      fail('font_source_invalid', 'Pinned Noto font source metadata is invalid.');
    }
    extension(source);
    const { owner, repository } = githubCoordinates(source);
    const encodedPath = source.source_path.split('/').map(encodeURIComponent).join('/');
    if (source.download_url !== `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/${source.commit}/${encodedPath}`) fail('font_source_invalid', 'Pinned raw font URL does not bind the GitHub repository, commit, and source path.');
    ids.add(source.font_id);
  }
  return manifest;
}

async function readRegular(file, code, message) {
  let stat;
  try { stat = await fs.lstat(file); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(code, message);
  return fs.readFile(file);
}

function verifyPinnedBytes(bytes, source) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== source.bytes || hash(bytes) !== source.sha256) fail('font_source_integrity', 'Font source bytes do not match the pinned size and SHA-256.');
  return bytes;
}

function githubCoordinates(source) {
  let repository;
  try { repository = new URL(source.repository); } catch { fail('font_github_source_invalid', 'Pinned GitHub repository metadata is invalid.'); }
  const segments = repository.pathname.split('/').filter(Boolean);
  if (repository.protocol !== 'https:' || repository.hostname !== 'github.com' || repository.search || repository.hash || segments.length !== 2) fail('font_github_source_invalid', 'Pinned GitHub repository metadata is invalid.');
  return { owner: segments[0], repository: segments[1] };
}

function contentLength(response) {
  const raw = response?.headers?.get?.('content-length');
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

async function fetchWithTimeout(fetchFn, url, options = {}, consume = async (response) => response) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  timeout.unref?.();
  try { return await consume(await fetchFn(url, { ...options, signal: controller.signal })); } finally { clearTimeout(timeout); }
}

async function readJsonResponse(response, maximumBytes) {
  const declared = contentLength(response);
  if (declared !== null && declared > maximumBytes) fail('font_github_response_oversize', 'GitHub API response exceeds the bounded size limit.');
  let value;
  if (typeof response?.text === 'function') {
    const body = await response.text();
    if (Buffer.byteLength(body, 'utf8') > maximumBytes) fail('font_github_response_oversize', 'GitHub API response exceeds the bounded size limit.');
    try { value = JSON.parse(body); } catch { fail('font_github_response_invalid', 'GitHub API returned malformed JSON.'); }
  } else if (typeof response?.json === 'function') {
    try { value = await response.json(); } catch { fail('font_github_response_invalid', 'GitHub API returned malformed JSON.'); }
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > maximumBytes) fail('font_github_response_oversize', 'GitHub API response exceeds the bounded size limit.');
  } else fail('font_github_response_invalid', 'GitHub API response body is unavailable.');
  return value;
}

function decodeBase64(value) {
  if (typeof value !== 'string') fail('font_github_base64_invalid', 'GitHub blob content is not valid base64.');
  const compact = value.replace(/\s+/gu, '');
  if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(compact)) fail('font_github_base64_invalid', 'GitHub blob content is not valid base64.');
  const bytes = Buffer.from(compact, 'base64');
  if (bytes.toString('base64') !== compact) fail('font_github_base64_invalid', 'GitHub blob content is not canonical base64.');
  if (bytes.length > MAX_FONT_BYTES) fail('font_github_response_oversize', 'GitHub blob exceeds the bounded font size limit.');
  return bytes;
}

async function acquireFromGitHubApi(source, fetchFn) {
  const { owner, repository } = githubCoordinates(source);
  const apiRoot = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
  const encodedPath = source.source_path.split('/').map(encodeURIComponent).join('/');
  const contentsUrl = `${apiRoot}/contents/${encodedPath}?ref=${encodeURIComponent(source.commit)}`;
  const requestOptions = { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'erduo-hyperframes-broll', 'X-GitHub-Api-Version': '2022-11-28' } };
  let contents;
  try {
    contents = await fetchWithTimeout(fetchFn, contentsUrl, requestOptions, async (response) => {
      if (!response?.ok) fail('font_github_api_failed', 'GitHub Contents API request failed.');
      return readJsonResponse(response, MAX_METADATA_BYTES);
    });
  } catch (error) { if (error instanceof PrepareFontAssetsError) throw error; fail('font_github_api_failed', 'GitHub Contents API request failed.'); }
  const expectedHtmlUrl = `https://github.com/${owner}/${repository}/blob/${source.commit}/${encodedPath}`;
  if (!contents || contents.type !== 'file' || contents.path !== source.source_path || contents.size !== source.bytes || !GIT_BLOB_SHA.test(contents.sha ?? '')
    || contents.url !== contentsUrl || contents.html_url !== expectedHtmlUrl || contents.git_url !== `${apiRoot}/git/blobs/${contents.sha}`) fail('font_github_metadata_invalid', 'GitHub Contents metadata does not bind the pinned commit and path.');

  const blobUrl = `${apiRoot}/git/blobs/${contents.sha}`;
  let blob;
  try {
    blob = await fetchWithTimeout(fetchFn, blobUrl, requestOptions, async (response) => {
      if (!response?.ok) fail('font_github_api_failed', 'GitHub Blob API request failed.');
      return readJsonResponse(response, MAX_BLOB_RESPONSE_BYTES);
    });
  } catch (error) { if (error instanceof PrepareFontAssetsError) throw error; fail('font_github_api_failed', 'GitHub Blob API request failed.'); }
  if (!blob || blob.sha !== contents.sha || blob.url !== blobUrl || blob.encoding !== 'base64' || blob.size !== source.bytes) fail('font_github_metadata_invalid', 'GitHub Blob metadata does not bind the selected file.');
  return verifyPinnedBytes(decodeBase64(blob.content), source);
}

async function acquireFromRaw(source, fetchFn) {
  try {
    return await fetchWithTimeout(fetchFn, source.download_url, {}, async (response) => {
      if (!response?.ok || typeof response.arrayBuffer !== 'function') return null;
      const declared = contentLength(response);
      if (declared !== null && declared > MAX_FONT_BYTES) fail('font_source_integrity', 'Raw font response exceeds the bounded size limit.');
      return verifyPinnedBytes(Buffer.from(await response.arrayBuffer()), source);
    });
  } catch (error) {
    if (error instanceof PrepareFontAssetsError) throw error;
    return null;
  }
}

async function acquireSource(source, cacheDir, fetchFn) {
  const cacheFile = path.join(cacheDir, `${source.font_id}.${extension(source)}`);
  const cached = await readRegular(cacheFile, 'font_cache_invalid', 'Font cache entry must be a regular file.');
  if (cached) return { bytes: verifyPinnedBytes(cached, source), mode: 'cache' };
  if (typeof fetchFn !== 'function') fail('font_source_unavailable', 'Pinned font is absent from cache and no downloader is available.');
  const rawBytes = await acquireFromRaw(source, fetchFn);
  const bytes = rawBytes ?? await acquireFromGitHubApi(source, fetchFn);
  const mode = rawBytes ? 'download' : 'github-api';
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cacheFile, bytes, { flag: 'wx' }).catch(async (error) => {
    if (error?.code !== 'EEXIST') throw error;
    verifyPinnedBytes(await readRegular(cacheFile, 'font_cache_invalid', 'Font cache entry must be a regular file.'), source);
  });
  return { bytes, mode };
}

async function detectFonttoolsSubsetter() {
  try { await execFile('pyftsubset', ['--version'], { timeout: 5000 }); } catch { return null; }
  return async ({ fontBytes, codepoints, extension: ext }) => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'erduo-font-subset-'));
    try {
      const input = path.join(temporary, `input.${ext}`);
      const output = path.join(temporary, `output.${ext}`);
      const textFile = path.join(temporary, 'glyphs.txt');
      await Promise.all([fs.writeFile(input, fontBytes), fs.writeFile(textFile, codepoints, 'utf8')]);
      await execFile('pyftsubset', [input, `--output-file=${output}`, `--text-file=${textFile}`, '--layout-features=*', '--glyph-names', '--symbol-cmap', '--legacy-cmap', '--notdef-glyph', '--notdef-outline', '--recommended-glyphs', '--name-IDs=*', '--name-legacy', '--name-languages=*', '--drop-tables+=DSIG', '--no-recalc-timestamp'], { timeout: 120000, maxBuffer: 1024 * 1024 });
      return fs.readFile(output);
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  };
}

function uniqueCodepoints(value) {
  return [...new Set(String(value ?? ''))].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('');
}

export async function prepareFontAssets({ manifestPath, projectDir, cacheDir, roles, visibleText = '', sourceRoot, fetchFn = globalThis.fetch, subsetter, displaySelection: requestedDisplaySelection, displayLibrary, displaySkillRoot, displayGlyphCoverage } = {}) {
  if (typeof manifestPath !== 'string' || !manifestPath || typeof projectDir !== 'string' || !projectDir || typeof cacheDir !== 'string' || !cacheDir
    || !Array.isArray(roles) || !roles.length || roles.some((role) => !ROLE.test(role)) || new Set(roles).size !== roles.length) fail('font_prepare_invalid', 'Font preparation arguments are invalid.');
  const manifest = validateManifest(JSON.parse(await fs.readFile(manifestPath, 'utf8')));
  const root = sourceRoot ?? path.resolve(path.dirname(manifestPath), '..', '..');
  const codepoints = uniqueCodepoints(visibleText);
  const subset = subsetter === undefined ? await detectFonttoolsSubsetter() : subsetter;
  if (subset !== null && subset !== false && typeof subset !== 'function') fail('font_subsetter_invalid', 'Font subsetter must be a function when supplied.');
  const fontDir = path.join(projectDir, 'assets', 'fonts');
  const licenseDir = path.join(projectDir, 'assets', 'licenses');
  await Promise.all([fs.mkdir(fontDir, { recursive: true }), fs.mkdir(licenseDir, { recursive: true })]);

  const wantsDisplay = roles.includes('display');
  const sourceResults = new Map();
  const licenses = new Map();
  const fonts = [];
  for (const role of roles.filter((candidate) => candidate !== 'display')) {
    const source = manifest.sources.find((candidate) => candidate.roles.includes(role));
    if (!source) fail('font_role_unavailable', 'No pinned Noto source supports the requested role.', role);
    if (!sourceResults.has(source.font_id)) {
      const acquired = await acquireSource(source, cacheDir, fetchFn);
      const ext = extension(source);
      let outputBytes = acquired.bytes;
      let subsetMode = 'full-verified-copy';
      if (typeof subset === 'function' && codepoints) {
        outputBytes = Buffer.from(await subset({ fontBytes: acquired.bytes, codepoints, source, extension: ext }));
        if (!outputBytes.length) fail('font_subset_invalid', 'Font subsetter returned empty bytes.');
        subsetMode = 'deterministic-subset';
      }
      const relative = `assets/fonts/${source.font_id}.${ext}`;
      await fs.writeFile(path.join(projectDir, ...relative.split('/')), outputBytes);
      sourceResults.set(source.font_id, { relative, bytes: outputBytes, acquired: acquired.mode, subset_mode: subsetMode });
    }
    if (!licenses.has(source.license_sha256)) {
      const licenseSource = path.join(root, ...source.license_path.split('/'));
      const licenseBytes = await readRegular(licenseSource, 'font_license_missing', 'Pinned OFL license file is missing.');
      if (!licenseBytes || hash(licenseBytes) !== source.license_sha256) fail('font_license_integrity', 'Pinned OFL license hash does not match.');
      const relative = `assets/licenses/${path.posix.basename(source.license_path)}`;
      await fs.writeFile(path.join(projectDir, ...relative.split('/')), licenseBytes);
      licenses.set(source.license_sha256, relative);
    }
    const prepared = sourceResults.get(source.font_id);
    const family = `${source.family} Runtime ${role}`;
    fonts.push({
      font_id: source.font_id,
      role,
      family,
      weight: '100 900',
      style: 'normal',
      file_sha256: hash(prepared.bytes),
      file_kind: extension(source),
      official_source: `${source.repository}@${source.commit}`,
      license_id: source.license_id,
      license_file_sha256: source.license_sha256,
      commercial_scope: 'commercial-use-and-redistribution-allowed',
      cjk_coverage_sha256: hash(Buffer.from(codepoints || 'full-pinned-source', 'utf8')),
      css: { font_face: true, src: `./${prepared.relative}`, used: true, fallbacks: [] },
    });
  }
  let displaySelection;
  if (wantsDisplay) {
    const requested = requestedDisplaySelection;
    if (!requested) fail('display_font_selection_required', 'A selected bundled display font is required for the display role.', 'display');
    const library = displayLibrary ?? await loadDisplayFontLibrary(path.join(root, 'assets', 'fonts', 'display-library.json'));
    let selected;
    try {
      selected = await validateDisplayFontSelection(requested, { library, skillRoot: displaySkillRoot ?? root, ...(displayGlyphCoverage ? { glyphCoverage: displayGlyphCoverage } : {}) });
    } catch (error) {
      fail(error?.code ?? 'display_font_selection_invalid', 'Bundled display font selection is invalid.', 'display');
    }
    const extension = path.posix.extname(selected.relative_path).slice(1).toLowerCase();
    const relative = `assets/fonts/user-display/${path.posix.basename(selected.relative_path)}`;
    const source = path.join(displaySkillRoot ?? root, ...selected.relative_path.split('/'));
    const bytes = await readRegular(source, 'display_font_missing', 'Selected bundled display font is missing.');
    if (!bytes || hash(bytes) !== selected.sha256) fail('display_font_hash_mismatch', 'Selected bundled display font bytes do not match the catalog.', 'display');
    await fs.mkdir(path.join(projectDir, 'assets', 'fonts', 'user-display'), { recursive: true });
    await fs.writeFile(path.join(projectDir, ...relative.split('/')), bytes);
    sourceResults.set(`display:${selected.display_font_id}`, { relative, bytes, acquired: 'bundled-display-library', subset_mode: 'full-verified-copy' });
    displaySelection = requested;
    fonts.push({
      font_id: selected.display_font_id,
      role: 'display',
      family: selected.family,
      weight: '400 900',
      style: 'normal',
      file_sha256: selected.sha256,
      file_kind: extension,
      official_source: 'user-provided-display-library',
      source_status: 'user-provided',
      cjk_coverage_sha256: hash(Buffer.from(requested.display_text.normalize('NFC'), 'utf8')),
      css: { font_face: true, src: `./${relative}`, used: true, fallbacks: [] },
    });
  }
  return {
    schema_version: 1,
    font_package: wantsDisplay ? { schema_version: 2, display_selection: displaySelection, fonts } : { schema_version: 2, fonts },
    prepared_files: [...sourceResults.values()].map((item) => ({ path: item.relative, sha256: hash(item.bytes), bytes: item.bytes.length, acquisition: item.acquired, subset_mode: item.subset_mode })),
    license_files: [...licenses.entries()].map(([sha256, relative]) => ({ path: relative, sha256 })),
  };
}

async function main(argv) {
  if (argv.length < 4 || argv.length > 7) fail('usage', 'Usage: node scripts/prepare-font-assets.mjs <source-manifest.json> <cache-dir> <project-dir> <roles-csv> [visible-text-file] [display-selection.json] [display-library.json]');
  const visibleText = argv[4] ? await fs.readFile(argv[4], 'utf8') : '';
  const displaySelection = argv[5] ? JSON.parse(await fs.readFile(argv[5], 'utf8')) : undefined;
  const displayLibrary = argv[6] ? JSON.parse(await fs.readFile(argv[6], 'utf8')) : undefined;
  process.stdout.write(`${JSON.stringify(await prepareFontAssets({ manifestPath: argv[0], cacheDir: argv[1], projectDir: argv[2], roles: argv[3].split(','), visibleText, displaySelection, displayLibrary }))}\n`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) { try { await main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${JSON.stringify({ ok: false, error: { code: error instanceof PrepareFontAssetsError ? error.code : 'font_prepare_failed', message: error instanceof PrepareFontAssetsError ? error.message : 'Font preparation failed.' } })}\n`); process.exitCode = error instanceof PrepareFontAssetsError && error.code === 'usage' ? 64 : 2; } }
