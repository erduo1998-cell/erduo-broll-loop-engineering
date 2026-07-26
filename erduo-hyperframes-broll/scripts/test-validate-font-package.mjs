import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditDisplayFontRoleBindings, FontPackageError, validateFontPackage, validateRuntimeFontText } from './validate-font-package.mjs';
const sha = (letter) => letter.repeat(64);
const artifactManifest = () => ({ manifest_sha256: sha('f'), artifacts: [{ artifact_id: 'font', kind: 'font', sha256: sha('a'), media_type: 'font/woff2' }, { artifact_id: 'license', kind: 'license', sha256: sha('b'), media_type: 'text/plain' }] });
const fixture = () => ({ schema_version: 2, fonts: [{ font_id: 'display', role: 'display', family: 'Licensed Display CJK', weight: 700, style: 'normal', file_sha256: sha('a'), file_kind: 'woff2', official_source: 'official-project', license_id: 'OFL-1.1', license_file_sha256: sha('b'), commercial_scope: 'commercial-use-allowed', cjk_coverage_sha256: sha('c'), css: { font_face: true, src: './assets/fonts/display.woff2', used: true, fallbacks: [] } }] });
const expect = (doc, options, code) => assert.throws(() => validateFontPackage(doc, options), (error) => error instanceof FontPackageError && error.code === code);
test('requires font/license bytes from an artifact manifest, not self-declared hashes', () => {
  expect(fixture(), {}, 'font_artifact_manifest_required');
  assert.equal(validateFontPackage(fixture(), { artifactManifest: artifactManifest() }).role_count, 1);
  const mismatch = artifactManifest(); mismatch.artifacts[0].sha256 = sha('9'); expect(fixture(), { artifactManifest: mismatch }, 'font_asset_missing');
});
test('rejects complete banned/generic stacks, missing license, path escape, fallback and missing binding', () => {
  for (const family of ['PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'SF Mono', 'Inter', 'Arial', 'system-ui', 'sans-serif']) { const doc = fixture(); doc.fonts[0].family = family; expect(doc, { artifactManifest: artifactManifest() }, 'system_font_fallback'); }
  const missing = artifactManifest(); missing.artifacts.pop(); expect(fixture(), { artifactManifest: missing }, 'font_license_missing');
  const escape = fixture(); escape.fonts[0].css.src = './assets/fonts/../private.woff2'; expect(escape, { artifactManifest: artifactManifest() }, 'font_face_unbound');
  const fallback = fixture(); fallback.fonts[0].css.fallbacks = ['serif']; expect(fallback, { artifactManifest: artifactManifest() }, 'generic_font_fallback');
  const face = fixture(); face.fonts[0].css.used = false; expect(face, { artifactManifest: artifactManifest() }, 'font_face_unbound');
});
test('scans rendered runtime sources and templates for banned or generic font stacks', () => {
  assert.deepEqual(validateRuntimeFontText('@font-face { font-family: "Noto Runtime"; src: url("./assets/fonts/noto.ttf"); } body { font-family: "Noto Runtime"; }'), { ok: true });
  for (const text of ['body { font-family: PingFang SC; }', 'pre { font-family: "SF Mono"; }', 'body { font-family: "Noto Runtime", sans-serif; }']) {
    assert.throws(() => validateRuntimeFontText(text), (error) => error instanceof FontPackageError && error.code === 'runtime_banned_font');
  }
});
test('requires an auditable selected display role and fails when any required DOM role falls back', () => {
  const document = {
    schema_version: 2,
    display_selection: { schema_version: 1, primary_visual_dna: 'deep-current-hud', display_font_id: 'display', display_text: '重点 001' },
    fonts: [{ font_id: 'display', role: 'display', family: 'User Display', weight: 700, style: 'normal', file_sha256: sha('a'), file_kind: 'woff2', official_source: 'user-provided-local', source_status: 'user-provided-local', license_id: 'User-License', license_file_sha256: sha('b'), commercial_scope: 'user-confirmed-licensed', cjk_coverage_sha256: sha('c'), css: { font_face: true, src: './assets/fonts/user-supplied/display.woff2', used: true, fallbacks: [] } }],
  };
  assert.equal(validateFontPackage(document, { artifactManifest: artifactManifest() }).role_count, 1);
  const html = `@font-face { font-family: "User Display"; src: url("./assets/fonts/user-supplied/display.woff2"); } [data-font-role] { font-family: "User Display"; } <p data-font-role="key-quote" data-display-font-id="display">quote</p><p data-font-role="chapter-focus" data-display-font-id="display">chapter</p><p data-font-role="core-number" data-display-font-id="display">42</p><p data-font-role="emphasis" data-display-font-id="display">emphasis</p>`;
  assert.deepEqual(auditDisplayFontRoleBindings(html, document).bindings, { 'key-quote': 1, 'chapter-focus': 1, 'core-number': 1, emphasis: 1 });
  assert.deepEqual(auditDisplayFontRoleBindings(html, document, { requiredRoles: ['key-quote'] }).bindings, { 'key-quote': 1 });
  assert.throws(() => auditDisplayFontRoleBindings(html.replace('>quote</p>', '></p>'), document, { requiredRoles: ['key-quote'] }), (error) => error instanceof FontPackageError && error.code === 'display_font_role_unbound');
  assert.throws(() => auditDisplayFontRoleBindings(html.replace('data-font-role="emphasis" data-display-font-id="display"', 'data-font-role="emphasis" data-display-font-id="wrong"'), document), (error) => error instanceof FontPackageError && error.code === 'display_font_role_unbound');
  const mismatch = structuredClone(document); mismatch.display_selection.display_font_id = 'other';
  expect(mismatch, { artifactManifest: artifactManifest() }, 'font_package_invalid');
});
test('the shipped neutral HyperFrames scaffold has no font or marked display nodes before authoring', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const html = await readFile(path.join(root, 'assets/hyperframes-template/index.html'), 'utf8');
  assert.deepEqual(validateRuntimeFontText(html), { ok: true });
  assert.doesNotMatch(html, /@font-face|font-family|data-font-role|data-display-font-id/u);
  assert.match(html, /data-scaffold-profile="structure-only-neutral-v1"/u);
});
