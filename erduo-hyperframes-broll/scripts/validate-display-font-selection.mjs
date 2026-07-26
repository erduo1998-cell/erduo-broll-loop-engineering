#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const ID = /^[a-z0-9][a-z0-9-]*$/u;
const DNA = /^[a-z0-9][a-z0-9-]*$/u;
const FONT_FILE = /\.(?:ttf|otf|woff2)$/iu;
const hash = (value) => createHash('sha256').update(value).digest('hex');

export class UserDisplayFontError extends Error {
  constructor(code, message) { super(message); this.name = 'UserDisplayFontError'; this.code = code; }
}
const fail = (code, message) => { throw new UserDisplayFontError(code, message); };
const exact = (value, fields) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) {
    fail('user_display_font_invalid', 'User display-font selection has an invalid shape.');
  }
};

async function readLocalRegularFile(filePath, code, message) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) fail(code, message);
  let stat;
  try { stat = await fs.lstat(filePath); } catch { fail(code, message); }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(code, message);
  return fs.readFile(filePath);
}

function ignoredCodepoint(codepoint) { return codepoint === 0x0a || codepoint === 0x0d || codepoint === 0x09; }
function codepoints(text) { return [...new Set([...text.normalize('NFC')].map((character) => character.codePointAt(0)).filter((value) => !ignoredCodepoint(value)))]; }
function parseCharset(value) {
  const ranges = [];
  for (const token of value.trim().split(/\s+/u).filter(Boolean)) {
    const match = /^([0-9a-f]+)(?:-([0-9a-f]+))?$/iu.exec(token);
    if (!match) fail('user_display_font_charset_invalid', 'Font coverage inspection returned an invalid charset.');
    const start = Number.parseInt(match[1], 16);
    const end = Number.parseInt(match[2] ?? match[1], 16);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || end > 0x10ffff) fail('user_display_font_charset_invalid', 'Font coverage inspection returned an invalid charset.');
    ranges.push([start, end]);
  }
  if (!ranges.length) fail('user_display_font_charset_invalid', 'Font coverage inspection returned no character coverage.');
  return ranges;
}

export async function inspectDisplayGlyphCoverage({ filePath, text }) {
  let stdout;
  try { ({ stdout } = await execFile('fc-scan', ['--format=%{charset}', filePath], { maxBuffer: 4 * 1024 * 1024, timeout: 15000 })); } catch { fail('user_display_font_coverage_unavailable', 'fc-scan is required to verify user display-font glyph coverage.'); }
  const ranges = parseCharset(stdout);
  return { missing_codepoints: codepoints(text).filter((point) => !ranges.some(([start, end]) => point >= start && point <= end)) };
}

// This input remains local to the user's run. It is never copied into a public
// receipt: only hashes and role metadata enter the generated project package.
export async function validateUserDisplayFontSelection(selection, { glyphCoverage = inspectDisplayGlyphCoverage } = {}) {
  exact(selection, ['schema_version', 'primary_visual_dna', 'display_font_id', 'family', 'file_path', 'license_id', 'license_file_path', 'commercial_scope', 'display_text']);
  if (selection.schema_version !== 1 || !DNA.test(selection.primary_visual_dna ?? '') || !ID.test(selection.display_font_id ?? '')
    || typeof selection.family !== 'string' || !selection.family.trim() || !FONT_FILE.test(selection.file_path ?? '')
    || typeof selection.license_id !== 'string' || !selection.license_id.trim()
    || selection.commercial_scope !== 'user-confirmed-licensed'
    || typeof selection.display_text !== 'string' || !selection.display_text.trim()) {
    fail('user_display_font_invalid', 'User display-font selection is invalid.');
  }
  const [fontBytes, licenseBytes] = await Promise.all([
    readLocalRegularFile(selection.file_path, 'user_display_font_missing', 'User display-font file is unavailable.'),
    readLocalRegularFile(selection.license_file_path, 'user_display_font_license_missing', 'User display-font license file is unavailable.'),
  ]);
  const coverage = await glyphCoverage({ filePath: selection.file_path, text: selection.display_text });
  if (!coverage || !Array.isArray(coverage.missing_codepoints)) fail('user_display_font_coverage_invalid', 'User display-font coverage inspection returned an invalid result.');
  if (coverage.missing_codepoints.length) fail('user_display_font_glyph_missing', 'User display-font does not cover required glyphs.');
  const extension = path.extname(selection.file_path).slice(1).toLowerCase();
  return {
    selection: {
      schema_version: 1,
      primary_visual_dna: selection.primary_visual_dna,
      display_font_id: selection.display_font_id,
      display_text: selection.display_text,
    },
    font: {
      font_id: selection.display_font_id,
      role: 'display',
      family: selection.family,
      weight: '400 900',
      style: 'normal',
      file_sha256: hash(fontBytes),
      file_kind: extension,
      official_source: 'user-provided-local',
      source_status: 'user-provided-local',
      license_id: selection.license_id,
      license_file_sha256: hash(licenseBytes),
      commercial_scope: selection.commercial_scope,
      cjk_coverage_sha256: hash(Buffer.from(selection.display_text.normalize('NFC'), 'utf8')),
    },
    font_bytes: fontBytes,
    license_bytes: licenseBytes,
  };
}
