import path from 'node:path';
import { fingerprintArtifactValue } from './artifact-manifest.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const BANNED = /(?:\bInter\b|ui-sans-serif|system-ui|-apple-system|BlinkMacSystemFont|Segoe UI|\bArial\b|\bHelvetica\b|\bRoboto\b|\bPoppins\b|\bMontserrat\b|PingFang|Hiragino|Microsoft YaHei|SF Mono|\bMenlo\b|\bConsolas\b)/iu;
const GENERIC = /^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|math|fangsong)$/iu;
const RUNTIME_BANNED = /(?:PingFang|Hiragino|Microsoft YaHei|微软雅黑|SF Mono|\bMenlo\b|\bConsolas\b|system-ui|ui-sans-serif|-apple-system|BlinkMacSystemFont|Segoe UI|\bArial\b|\bHelvetica\b|\bInter\b)/iu;
const DNA = /^[a-z0-9][a-z0-9-]*$/u;
const DISPLAY_ROLES = new Set(['key-quote', 'chapter-focus', 'core-number', 'emphasis']);

export class FontPackageError extends Error {
  constructor(code, message, role) { super(message); this.name = 'FontPackageError'; this.code = code; if (role) this.role = role; }
}
const fail = (code, message, role) => { throw new FontPackageError(code, message, role); };
const exact = (value, fields, role) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail('font_package_invalid', 'Font package record has an invalid shape.', role);
};
function localFontSource(value, role) {
  if (typeof value !== 'string' || !value.startsWith('./assets/fonts/') || value.includes('\\') || path.posix.normalize(value) !== value.slice(2)
    || value.split('/').includes('..') || !/\.(?:ttf|otf|woff2)$/iu.test(value)) fail('font_face_unbound', 'Font source must be a contained project-local font file.', role);
}

export function scanRuntimeFontText(value) {
  if (typeof value !== 'string') return 'non-text-runtime-source';
  const banned = value.match(RUNTIME_BANNED)?.[0];
  if (banned) return banned;
  for (const match of value.matchAll(/font-family\s*:\s*([^;{}]+)/giu)) {
    for (const family of match[1].split(',').map((item) => item.trim().replace(/^["']|["']$/gu, ''))) if (GENERIC.test(family)) return family;
  }
  return null;
}

export function validateRuntimeFontText(value) {
  const match = scanRuntimeFontText(value);
  if (match) fail('runtime_banned_font', 'Runtime source or template contains a banned/system/generic font reference.');
  return { ok: true };
}

function validateDisplaySelection(value) {
  exact(value, ['schema_version', 'primary_visual_dna', 'display_font_id', 'display_text']);
  if (value.schema_version !== 1 || !DNA.test(value.primary_visual_dna ?? '') || !DNA.test(value.display_font_id ?? '') || typeof value.display_text !== 'string' || !value.display_text.trim()) fail('display_font_selection_invalid', 'Display font selection is invalid.', 'display');
  return value;
}

export function auditDisplayFontRoleBindings(html, document) {
  if (typeof html !== 'string') fail('display_font_runtime_invalid', 'Rendered runtime HTML is invalid.', 'display');
  if (!document || document.schema_version !== 2 || !document.display_selection) fail('display_font_selection_required', 'Rendered display binding requires a selected display font.', 'display');
  const selection = validateDisplaySelection(document.display_selection);
  const display = document.fonts?.find((font) => font.role === 'display');
  if (!display || display.font_id !== selection.display_font_id) fail('display_font_selection_mismatch', 'Display role does not match the selected bundled display font.', 'display');
  const escapedFamily = display.family.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const escapedSource = display.css.src.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  if (!new RegExp(`@font-face\\s*\\{[^}]*font-family:\\s*"${escapedFamily}"[^}]*src:\\s*url\\("${escapedSource}"\\)`, 'u').test(html)) fail('display_font_face_missing', 'Selected display font is not bound through a local @font-face.', 'display');
  if (!new RegExp(`\\[data-font-role\\][^}]*font-family:\\s*"${escapedFamily}"`, 'u').test(html)) fail('display_font_role_css_missing', 'Display role selector is not bound to the selected display family.', 'display');
  const bindings = {};
  for (const role of DISPLAY_ROLES) {
    const count = [...html.matchAll(new RegExp(`<[^>]*data-font-role="${role}"[^>]*data-display-font-id="${selection.display_font_id}"[^>]*>`, 'gu'))].length;
    if (!count) fail('display_font_role_unbound', `Display role ${role} is not explicitly bound to the selected display font.`, role);
    bindings[role] = count;
  }
  if (scanRuntimeFontText(html)) fail('runtime_banned_font', 'Rendered runtime contains a banned/system/generic font reference.', 'display');
  return { ok: true, display_font_id: selection.display_font_id, family: display.family, bindings };
}

export function validateFontPackage(document, { artifactManifest } = {}) {
  const displayPackage = document?.schema_version === 2 && Boolean(document.display_selection);
  exact(document, displayPackage ? ['schema_version', 'display_selection', 'fonts'] : ['schema_version', 'fonts']);
  if (document.schema_version !== 2 || !Array.isArray(document.fonts) || !document.fonts.length) fail('font_package_invalid', 'Font package is invalid.');
  const selection = displayPackage ? validateDisplaySelection(document.display_selection) : null;
  if (!artifactManifest || !SHA256.test(artifactManifest.manifest_sha256 ?? '') || !Array.isArray(artifactManifest.artifacts)) fail('font_artifact_manifest_required', 'Font declarations require a validated artifact manifest.');
  const fontArtifacts = artifactManifest.artifacts.filter((item) => item.kind === 'font');
  const licenseArtifacts = artifactManifest.artifacts.filter((item) => item.kind === 'license');
  const seen = new Set();
  for (const entry of document.fonts) {
    const userDisplay = displayPackage && entry?.role === 'display';
    exact(entry, userDisplay
      ? ['font_id', 'role', 'family', 'weight', 'style', 'file_sha256', 'file_kind', 'official_source', 'source_status', 'cjk_coverage_sha256', 'css']
      : ['font_id', 'role', 'family', 'weight', 'style', 'file_sha256', 'file_kind', 'official_source', 'license_id', 'license_file_sha256', 'commercial_scope', 'cjk_coverage_sha256', 'css'], entry?.role);
    if (typeof entry.font_id !== 'string' || !entry.font_id || typeof entry.role !== 'string' || !entry.role || seen.has(entry.role)
      || typeof entry.family !== 'string' || !entry.family.trim() || typeof entry.style !== 'string' || !entry.style
      || !(typeof entry.weight === 'string' || Number.isSafeInteger(entry.weight)) || !['ttf', 'otf', 'woff2'].includes(entry.file_kind)
      || typeof entry.official_source !== 'string' || !entry.official_source || !SHA256.test(entry.file_sha256 ?? '')
      || !SHA256.test(entry.cjk_coverage_sha256 ?? '')
      || (userDisplay ? (entry.font_id !== selection.display_font_id || entry.official_source !== 'user-provided-display-library' || entry.source_status !== 'user-provided') : (typeof entry.license_id !== 'string' || !entry.license_id || typeof entry.commercial_scope !== 'string' || !entry.commercial_scope || !SHA256.test(entry.license_file_sha256 ?? '')))) fail('font_package_invalid', 'Font role declaration is invalid.', entry?.role);
    seen.add(entry.role);
    if (BANNED.test(entry.family) || GENERIC.test(entry.family.trim())) fail('system_font_fallback', 'System, banned, or generic font family is forbidden.', entry.role);
    const font = fontArtifacts.find((item) => item.sha256 === entry.file_sha256 && item.media_type === `font/${entry.file_kind}`);
    if (!font) fail('font_asset_missing', 'Font bytes are not bound to the validated artifact manifest.', entry.role);
    if (!userDisplay && !licenseArtifacts.find((item) => item.sha256 === entry.license_file_sha256)) fail('font_license_missing', 'Font license bytes are not bound to the validated artifact manifest.', entry.role);
    exact(entry.css, ['font_face', 'src', 'used', 'fallbacks'], entry.role);
    localFontSource(entry.css.src, entry.role);
    if (entry.css.font_face !== true || entry.css.used !== true) fail('font_face_unbound', 'Font is not actively bound through @font-face.', entry.role);
    if (!Array.isArray(entry.css.fallbacks) || entry.css.fallbacks.length) fail('generic_font_fallback', 'Silent or generic font fallback is forbidden.', entry.role);
  }
  if (displayPackage && (!seen.has('display') || document.fonts.filter((entry) => entry.role === 'display').length !== 1)) fail('display_font_selection_mismatch', 'Exactly one selected display font role is required.', 'display');
  return { role_count: document.fonts.length, manifest_sha256: artifactManifest.manifest_sha256, font_package_sha256: fingerprintArtifactValue(document) };
}
