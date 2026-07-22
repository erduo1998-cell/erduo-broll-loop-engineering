import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DisplayFontLibraryError, auditDisplayFontPackage, validateDisplayFontSelection } from './validate-display-font-selection.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const fixtureFont = (bytes = Buffer.from('font-bytes')) => ({ font_id: 'fixture-display', family: 'Fixture Display', relative_path: 'assets/fonts/user-display/fixture-display.ttf', sha256: hash(bytes), style_tags: ['bold'], compatible_visual_dna: ['fixture-dna'], source_status: 'user-provided' });
const library = (font = fixtureFont()) => ({ schema_version: 1, package_distribution: 'included', source_status: 'user-provided', font_count: 19, fonts: Array.from({ length: 19 }, (_, index) => index ? { ...font, font_id: `fixture-display-${index}`, relative_path: `assets/fonts/user-display/fixture-display-${index}.ttf` } : font) });

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'display-font-selection-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bytes = Buffer.from('font-bytes');
  const document = library(fixtureFont(bytes));
  await mkdir(path.join(root, 'assets/fonts/user-display'), { recursive: true });
  for (const font of document.fonts) await writeFile(path.join(root, font.relative_path), bytes);
  await writeFile(path.join(root, 'assets/fonts/display-library.json'), JSON.stringify(document));
  return { root, bytes, document };
}

const selection = () => ({ schema_version: 1, primary_visual_dna: 'fixture-dna', display_font_id: 'fixture-display', display_text: '重点 2026' });
const coverage = async () => ({ missing_codepoints: [] });

test('selection requires exactly one compatible local font with matching bytes and complete glyph coverage', async (t) => {
  const value = await fixture(t);
  const result = await validateDisplayFontSelection(selection(), { library: value.document, skillRoot: value.root, glyphCoverage: coverage });
  assert.equal(result.ok, true);
  await assert.rejects(() => validateDisplayFontSelection({ ...selection(), primary_visual_dna: 'other-dna' }, { library: value.document, skillRoot: value.root, glyphCoverage: coverage }), (error) => error instanceof DisplayFontLibraryError && error.code === 'display_font_dna_incompatible');
  await assert.rejects(() => validateDisplayFontSelection(selection(), { library: value.document, skillRoot: value.root, glyphCoverage: async () => ({ missing_codepoints: [0x91cd] }) }), (error) => error.code === 'display_font_glyph_missing');
  await writeFile(path.join(value.root, 'assets/fonts/user-display/fixture-display.ttf'), 'tampered');
  await assert.rejects(() => validateDisplayFontSelection(selection(), { library: value.document, skillRoot: value.root, glyphCoverage: coverage }), (error) => error.code === 'display_font_hash_mismatch');
});

test('package audit verifies all nineteen manifest paths, hashes, and ignore status', async (t) => {
  const value = await fixture(t);
  const pass = await auditDisplayFontPackage({ skillRoot: value.root, isIgnored: async () => false });
  assert.equal(pass.font_count, 19);
  await assert.rejects(() => auditDisplayFontPackage({ skillRoot: value.root, isIgnored: async (_root, relative) => relative.endsWith('fixture-display.ttf') }), (error) => error.code === 'display_font_ignored');
  await writeFile(path.join(value.root, 'assets/fonts/user-display/unlisted.ttf'), 'unlisted');
  await assert.rejects(() => auditDisplayFontPackage({ skillRoot: value.root, isIgnored: async () => false }), (error) => error.code === 'display_font_unlisted');
  await rm(path.join(value.root, 'assets/fonts/user-display/unlisted.ttf'));
  await writeFile(path.join(value.root, 'assets/fonts/user-display/fixture-display-7.ttf'), 'tampered');
  await assert.rejects(() => auditDisplayFontPackage({ skillRoot: value.root, isIgnored: async () => false }), (error) => error.code === 'display_font_hash_mismatch');
});
