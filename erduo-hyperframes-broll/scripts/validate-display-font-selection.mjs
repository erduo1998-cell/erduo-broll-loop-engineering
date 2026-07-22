#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const SHA256 = /^[0-9a-f]{64}$/u;
const ID = /^[a-z0-9][a-z0-9-]*$/u;
const DNA = /^[a-z0-9][a-z0-9-]*$/u;
const FONT_PATH = /^assets\/fonts\/user-display\/[a-z0-9][a-z0-9-]*\.(?:ttf|otf|woff2)$/u;
const hash = (value) => createHash('sha256').update(value).digest('hex');

export class DisplayFontLibraryError extends Error {
  constructor(code, message) { super(message); this.name = 'DisplayFontLibraryError'; this.code = code; }
}
const fail = (code, message) => { throw new DisplayFontLibraryError(code, message); };
const exact = (value, fields, code = 'display_font_library_invalid') => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail(code, 'Display font document has an invalid shape.');
};
const safeRelative = (value) => typeof value === 'string' && FONT_PATH.test(value) && !path.isAbsolute(value) && !value.includes('\\') && !value.split('/').includes('..');
const containedPath = (root, relative) => {
  if (!safeRelative(relative)) fail('display_font_path_invalid', 'Display font path must be a contained user-display font file.');
  const resolved = path.resolve(root, ...relative.split('/'));
  if (path.relative(root, resolved).startsWith(`..${path.sep}`) || path.relative(root, resolved) === '..') fail('display_font_path_invalid', 'Display font path escapes the skill root.');
  return resolved;
};
async function readRegularFont(filePath, missingMessage) {
  let stat;
  try { stat = await fs.lstat(filePath); } catch { fail('display_font_missing', missingMessage); }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('display_font_not_regular', 'Display font must be a regular packaged file.');
  return fs.readFile(filePath);
}

export function validateDisplayFontLibrary(library) {
  exact(library, ['schema_version', 'package_distribution', 'source_status', 'font_count', 'fonts']);
  if (library.schema_version !== 1 || library.package_distribution !== 'included' || library.source_status !== 'user-provided' || !Number.isSafeInteger(library.font_count) || library.font_count !== 19 || !Array.isArray(library.fonts) || library.fonts.length !== library.font_count) fail('display_font_library_invalid', 'Display font library metadata is invalid.');
  const ids = new Set();
  const paths = new Set();
  for (const font of library.fonts) {
    exact(font, ['font_id', 'family', 'relative_path', 'sha256', 'style_tags', 'compatible_visual_dna', 'source_status']);
    if (!ID.test(font.font_id ?? '') || ids.has(font.font_id) || typeof font.family !== 'string' || !font.family.trim() || !safeRelative(font.relative_path) || paths.has(font.relative_path) || !SHA256.test(font.sha256 ?? '') || !Array.isArray(font.style_tags) || !font.style_tags.length || font.style_tags.some((tag) => !DNA.test(tag)) || !Array.isArray(font.compatible_visual_dna) || !font.compatible_visual_dna.length || font.compatible_visual_dna.some((dna) => !DNA.test(dna)) || font.source_status !== 'user-provided') fail('display_font_library_invalid', 'Display font record is invalid.');
    ids.add(font.font_id);
    paths.add(font.relative_path);
  }
  return library;
}

export async function loadDisplayFontLibrary(libraryPath) {
  let parsed;
  try { parsed = JSON.parse(await fs.readFile(libraryPath, 'utf8')); } catch { fail('display_font_library_unreadable', 'Display font library cannot be read.'); }
  return validateDisplayFontLibrary(parsed);
}

function ignoredCodepoint(codepoint) { return codepoint === 0x0a || codepoint === 0x0d || codepoint === 0x09; }
function codepoints(text) { return [...new Set([...text.normalize('NFC')].map((character) => character.codePointAt(0)).filter((value) => !ignoredCodepoint(value)))]; }
function parseCharset(value) {
  const ranges = [];
  for (const token of value.trim().split(/\s+/u).filter(Boolean)) {
    const match = /^([0-9a-f]+)(?:-([0-9a-f]+))?$/iu.exec(token);
    if (!match) fail('display_font_charset_invalid', 'Font coverage inspection returned an invalid charset.');
    const start = Number.parseInt(match[1], 16);
    const end = Number.parseInt(match[2] ?? match[1], 16);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || end > 0x10ffff) fail('display_font_charset_invalid', 'Font coverage inspection returned an invalid charset.');
    ranges.push([start, end]);
  }
  if (!ranges.length) fail('display_font_charset_invalid', 'Font coverage inspection returned no character coverage.');
  return ranges;
}

export async function inspectDisplayGlyphCoverage({ filePath, text }) {
  let stdout;
  try { ({ stdout } = await execFile('fc-scan', ['--format=%{charset}', filePath], { maxBuffer: 4 * 1024 * 1024, timeout: 15000 })); } catch { fail('display_font_coverage_unavailable', 'fc-scan is required to verify display-font glyph coverage.'); }
  const ranges = parseCharset(stdout);
  return { missing_codepoints: codepoints(text).filter((point) => !ranges.some(([start, end]) => point >= start && point <= end)) };
}

export async function validateDisplayFontSelection(selection, { library, skillRoot, glyphCoverage = inspectDisplayGlyphCoverage } = {}) {
  exact(selection, ['schema_version', 'primary_visual_dna', 'display_font_id', 'display_text'], 'display_font_selection_invalid');
  if (selection.schema_version !== 1 || !DNA.test(selection.primary_visual_dna ?? '') || !ID.test(selection.display_font_id ?? '') || typeof selection.display_text !== 'string' || !selection.display_text.trim()) fail('display_font_selection_invalid', 'Display font selection is invalid.');
  if (typeof skillRoot !== 'string' || !skillRoot) fail('display_font_root_invalid', 'Display font skill root is invalid.');
  validateDisplayFontLibrary(library);
  const font = library.fonts.find((entry) => entry.font_id === selection.display_font_id);
  if (!font) fail('display_font_unknown', 'Selected display font is not in the packaged library.');
  if (!font.compatible_visual_dna.includes(selection.primary_visual_dna)) fail('display_font_dna_incompatible', 'Selected display font is incompatible with the primary visual DNA.');
  const filePath = containedPath(skillRoot, font.relative_path);
  const bytes = await readRegularFont(filePath, 'Selected display font file is missing.');
  if (hash(bytes) !== font.sha256) fail('display_font_hash_mismatch', 'Selected display font bytes do not match the library hash.');
  const coverage = await glyphCoverage({ filePath, text: selection.display_text });
  if (!coverage || !Array.isArray(coverage.missing_codepoints)) fail('display_font_coverage_invalid', 'Display font coverage inspection returned an invalid result.');
  if (coverage.missing_codepoints.length) fail('display_font_glyph_missing', `Selected display font does not cover required codepoints: ${coverage.missing_codepoints.map((point) => `U+${point.toString(16).toUpperCase().padStart(4, '0')}`).join(', ')}.`);
  return { ok: true, display_font_id: font.font_id, family: font.family, relative_path: font.relative_path, sha256: font.sha256, primary_visual_dna: selection.primary_visual_dna };
}

async function gitIgnored(skillRoot, relativePath) {
  try { await execFile('git', ['check-ignore', '--quiet', '--no-index', '--', relativePath], { cwd: skillRoot, timeout: 15000 }); return true; } catch (error) { if (error?.code === 1) return false; fail('display_font_ignore_check_failed', 'Git ignore status could not be checked for a packaged display font.'); }
}

async function listFontBinaries(directory, prefix = '') {
  let entries;
  try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { fail('display_font_directory_missing', 'Display font directory is missing.'); }
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFontBinaries(path.join(directory, entry.name), relative));
    else if (entry.isFile() && /\.(?:ttf|otf|woff2)$/iu.test(entry.name)) files.push(relative);
  }
  return files.sort();
}

export async function auditDisplayFontPackage({ skillRoot, libraryPath = path.join(skillRoot ?? '', 'assets', 'fonts', 'display-library.json'), isIgnored = gitIgnored } = {}) {
  if (typeof skillRoot !== 'string' || !skillRoot) fail('display_font_root_invalid', 'Display font skill root is invalid.');
  const library = await loadDisplayFontLibrary(libraryPath);
  const expectedPaths = new Set(library.fonts.map((font) => font.relative_path));
  const actualPaths = (await listFontBinaries(path.join(skillRoot, 'assets', 'fonts', 'user-display'))).map((relative) => `assets/fonts/user-display/${relative}`);
  for (const relativePath of actualPaths) if (!expectedPaths.has(relativePath)) fail('display_font_unlisted', `Display font binary is absent from the library manifest: ${relativePath}.`);
  const files = [];
  for (const font of library.fonts) {
    const filePath = containedPath(skillRoot, font.relative_path);
    const bytes = await readRegularFont(filePath, `Packaged display font is missing: ${font.font_id}.`);
    if (hash(bytes) !== font.sha256) fail('display_font_hash_mismatch', `Packaged display font hash does not match: ${font.font_id}.`);
    if (await isIgnored(skillRoot, font.relative_path)) fail('display_font_ignored', `Packaged display font is ignored by Git: ${font.relative_path}.`);
    files.push({ font_id: font.font_id, relative_path: font.relative_path, sha256: font.sha256 });
  }
  return { ok: true, font_count: files.length, files };
}
