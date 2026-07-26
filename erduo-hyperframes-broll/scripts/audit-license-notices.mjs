#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanRuntimeFontText } from './validate-font-package.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const GIT_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const FONT_BINARY = /\.(?:ttf|otf|woff2?)$/iu;

export class LicenseAuditError extends Error { constructor(code, message) { super(message); this.name = 'LicenseAuditError'; this.code = code; } }
const fail = (code, message) => { throw new LicenseAuditError(code, message); };
const safeRelative = (value) => typeof value === 'string' && value && !path.isAbsolute(value) && !value.split(/[\\/]/u).includes('..');
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
const exists = async (file) => { try { await fs.access(file); return true; } catch { return false; } };
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

async function listFiles(root, directory = root) {
  const output = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.DS_Store' || entry.name === 'node_modules') continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await listFiles(root, absolute));
    else if (entry.isFile()) output.push(path.relative(root, absolute).split(path.sep).join('/'));
  }
  return output.sort();
}

function globRegex(glob) {
  const marker = '\u0000';
  const escaped = glob.replace(/[.+^${}()|[\]\\]/gu, '\\$&').replaceAll('**', marker).replaceAll('*', '[^/]*').replaceAll(marker, '.*');
  return new RegExp(`^${escaped}$`, 'u');
}

export async function auditLicenseNotices(root) {
  if (typeof root !== 'string' || !root) fail('invalid_root', 'License audit root is invalid.');
  const templatesDir = path.join(root, 'references', 'design-library', 'templates');
  let filenames; try { filenames = (await fs.readdir(templatesDir)).filter((name) => name.endsWith('.json')).sort(); } catch { fail('templates_unreadable', 'Template license records cannot be read.'); }
  const findings = [];
  const notices = new Set();

  for (const filename of filenames) {
    let template; try { template = JSON.parse(await fs.readFile(path.join(templatesDir, filename), 'utf8')); } catch { findings.push({ code: 'template_unreadable', file: `references/design-library/templates/${filename}` }); continue; }
    const included = new Set(template.distribution?.included_license_notices ?? []);
    for (const record of template.provenance?.records ?? []) {
      const license = record.license;
      if (license?.notice_required !== true) continue;
      const ref = license.notice_ref;
      if (!safeRelative(ref) || !included.has(ref)) { findings.push({ code: 'notice_not_declared', file: `references/design-library/templates/${filename}` }); continue; }
      try { const text = await fs.readFile(path.join(root, ref), 'utf8'); if (!/license/iu.test(text)) findings.push({ code: 'notice_invalid', file: ref }); else notices.add(ref); } catch { findings.push({ code: 'notice_missing', file: ref }); }
    }
  }

  const sourceMapPath = path.join(root, 'reference-library', 'source-map.json');
  let sourceCount = 0;
  let fontSourceCount = 0;
  if (await exists(path.dirname(sourceMapPath))) {
    let sourceMap;
    try { sourceMap = await readJson(sourceMapPath); } catch { findings.push({ code: 'source_map_unreadable', file: 'reference-library/source-map.json' }); }
    if (!sourceMap || sourceMap.schema_version !== 1 || !Array.isArray(sourceMap.sources) || !sourceMap.sources.length) {
      findings.push({ code: 'source_map_invalid', file: 'reference-library/source-map.json' });
    } else {
      sourceCount = sourceMap.sources.length;
      const files = await listFiles(root);
      const ids = new Set();
      const mappedFiles = new Set();
      for (const source of sourceMap.sources) {
        const label = source?.source_id || 'unknown';
        const commitEvidence = GIT_COMMIT.test(source?.audited_commit ?? '') || (source?.audited_commit === null && Array.isArray(source?.limitations) && source.limitations.length > 0);
        if (typeof source?.source_id !== 'string' || !source.source_id || ids.has(source.source_id) || !/^https:\/\/github\.com\//u.test(source.repository ?? '') || !commitEvidence || typeof source.license_id !== 'string' || !safeRelative(source.license_path) || !SHA256.test(source.license_sha256 ?? '') || !Array.isArray(source.file_globs) || !source.file_globs.length || !Array.isArray(source.excluded)) {
          findings.push({ code: 'source_record_invalid', source: label });
          continue;
        }
        ids.add(source.source_id);
        try {
          const contents = await fs.readFile(path.join(root, source.license_path));
          if (hash(contents) !== source.license_sha256) findings.push({ code: 'source_license_hash_mismatch', source: label, file: source.license_path });
          else notices.add(source.license_path);
        } catch { findings.push({ code: 'source_license_missing', source: label, file: source.license_path }); }
        for (const glob of source.file_globs) {
          const matches = typeof glob === 'string' ? files.filter((file) => globRegex(glob).test(file)) : [];
          if (!matches.length) findings.push({ code: 'source_scope_empty', source: label, glob });
          for (const file of matches) mappedFiles.add(file);
        }
      }
      for (const file of files.filter((entry) => /\/vsc-[^/]+\.md$/u.test(entry))) if (!mappedFiles.has(file)) findings.push({ code: 'reference_source_unmapped', file });
      if (!(await exists(path.join(root, 'references', 'third-party-notices.md')))) findings.push({ code: 'third_party_notices_missing', file: 'references/third-party-notices.md' });
    }

    const fontDir = path.join(root, 'assets', 'fonts');
    if (await exists(fontDir)) {
      const fontFiles = await listFiles(root, fontDir);
      const displayLibraryPath = path.join(fontDir, 'display-library.json');
      const displayDirectory = path.join(fontDir, 'user-display');
      if (await exists(displayLibraryPath)) findings.push({ code: 'bundled_display_font_catalog', file: 'assets/fonts/display-library.json' });
      if (await exists(displayDirectory)) findings.push({ code: 'bundled_display_font_directory', file: 'assets/fonts/user-display' });
      for (const file of fontFiles.filter((entry) => FONT_BINARY.test(entry))) findings.push({ code: 'public_font_binary', file });
      const manifestPath = path.join(fontDir, 'source-manifest.json');
      try {
        const manifest = await readJson(manifestPath);
        if (manifest.schema_version !== 1 || manifest.policy?.font_binaries_in_public_package !== false || !Array.isArray(manifest.sources) || !manifest.sources.length) findings.push({ code: 'font_source_manifest_invalid', file: 'assets/fonts/source-manifest.json' });
        else {
          fontSourceCount = manifest.sources.length;
          for (const source of manifest.sources) {
            if (!SHA256.test(source.sha256 ?? '') || !GIT_COMMIT.test(source.commit ?? '') || !Number.isSafeInteger(source.bytes) || source.bytes <= 0 || !safeRelative(source.license_path) || !SHA256.test(source.license_sha256 ?? '') || !String(source.download_url ?? '').includes(source.commit)) findings.push({ code: 'font_source_invalid', font_id: source?.font_id || 'unknown' });
            try { if (hash(await fs.readFile(path.join(root, source.license_path))) !== source.license_sha256) findings.push({ code: 'font_license_hash_mismatch', font_id: source?.font_id || 'unknown' }); } catch { findings.push({ code: 'font_license_missing', font_id: source?.font_id || 'unknown' }); }
          }
        }
      } catch { findings.push({ code: 'font_source_manifest_missing', file: 'assets/fonts/source-manifest.json' }); }
    }
  }

  const runtimeFiles = (await listFiles(root)).filter((file) => file.startsWith('assets/hyperframes-template/') || /^scripts\/build-.*\.mjs$/u.test(file));
  for (const file of runtimeFiles) {
    const match = scanRuntimeFontText(await fs.readFile(path.join(root, file), 'utf8'));
    if (match) findings.push({ code: 'runtime_banned_font', file });
  }

  return { schema_version: 2, template_count: filenames.length, source_count: sourceCount, font_source_count: fontSourceCount, notice_count: notices.size, notices: [...notices].sort(), findings, ok: findings.length === 0 };
}

async function main(argv) { if (argv.length > 1) fail('usage', 'Usage: node scripts/audit-license-notices.mjs [skill-root]'); const root = argv[0] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); process.stdout.write(`${JSON.stringify(await auditLicenseNotices(root))}\n`); }
const mainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (mainModule) { try { await main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${JSON.stringify({ ok: false, error: { code: error instanceof LicenseAuditError ? error.code : 'audit_failed', message: error instanceof LicenseAuditError ? error.message : 'Public package audit failed.' } })}\n`); process.exitCode = error instanceof LicenseAuditError && error.code === 'usage' ? 64 : 2; } }
