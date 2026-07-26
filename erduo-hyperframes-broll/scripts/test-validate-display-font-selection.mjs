import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { UserDisplayFontError, validateUserDisplayFontSelection } from './validate-display-font-selection.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'user-display-font-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fontPath = path.join(root, 'licensed-display.ttf');
  const licensePath = path.join(root, 'LICENSE.txt');
  await Promise.all([writeFile(fontPath, 'font-bytes'), writeFile(licensePath, 'User display font license\n')]);
  return { fontPath, licensePath };
}

const selection = (value) => ({
  schema_version: 1,
  primary_visual_dna: 'fixture-dna',
  display_font_id: 'fixture-display',
  family: 'Fixture Display',
  file_path: value.fontPath,
  license_id: 'User-Provided-License',
  license_file_path: value.licensePath,
  commercial_scope: 'user-confirmed-licensed',
  display_text: '重点 2026',
});

test('accepts a rights-confirmed local display font and returns path-free project facts', async (t) => {
  const value = await fixture(t);
  const result = await validateUserDisplayFontSelection(selection(value), { glyphCoverage: async () => ({ missing_codepoints: [] }) });
  assert.equal(result.font.official_source, 'user-provided-local');
  assert.equal(result.font.source_status, 'user-provided-local');
  assert.equal(result.selection.display_font_id, 'fixture-display');
  assert.equal(JSON.stringify(result.selection).includes(value.fontPath), false);
});

test('rejects missing rights evidence and missing glyphs', async (t) => {
  const value = await fixture(t);
  await assert.rejects(
    () => validateUserDisplayFontSelection({ ...selection(value), commercial_scope: 'unknown' }, { glyphCoverage: async () => ({ missing_codepoints: [] }) }),
    (error) => error instanceof UserDisplayFontError && error.code === 'user_display_font_invalid',
  );
  await assert.rejects(
    () => validateUserDisplayFontSelection(selection(value), { glyphCoverage: async () => ({ missing_codepoints: [0x91cd] }) }),
    (error) => error instanceof UserDisplayFontError && error.code === 'user_display_font_glyph_missing',
  );
});
