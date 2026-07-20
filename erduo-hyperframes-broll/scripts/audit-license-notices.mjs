#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export class LicenseAuditError extends Error { constructor(code, message) { super(message); this.name = 'LicenseAuditError'; this.code = code; } }
const fail = (code, message) => { throw new LicenseAuditError(code, message); };

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
      if (typeof ref !== 'string' || !ref || path.isAbsolute(ref) || ref.includes('..') || !included.has(ref)) { findings.push({ code: 'notice_not_declared', file: `references/design-library/templates/${filename}` }); continue; }
      try { const text = await fs.readFile(path.join(root, ref), 'utf8'); if (!/license/iu.test(text)) findings.push({ code: 'notice_invalid', file: ref }); else notices.add(ref); } catch { findings.push({ code: 'notice_missing', file: ref }); }
    }
  }
  return { schema_version: 1, template_count: filenames.length, notice_count: notices.size, notices: [...notices].sort(), findings, ok: findings.length === 0 };
}

async function main(argv) { if (argv.length > 1) fail('usage', 'Usage: node scripts/audit-license-notices.mjs [skill-root]'); const root = argv[0] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); process.stdout.write(`${JSON.stringify(await auditLicenseNotices(root))}\n`); }
const mainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (mainModule) { try { await main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${JSON.stringify({ ok: false, error: { code: error instanceof LicenseAuditError ? error.code : 'audit_failed', message: error instanceof LicenseAuditError ? error.message : 'License audit failed.' } })}\n`); process.exitCode = error instanceof LicenseAuditError && error.code === 'usage' ? 64 : 2; } }
