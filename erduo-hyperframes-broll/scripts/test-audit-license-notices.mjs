import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { auditLicenseNotices } from './audit-license-notices.mjs';

async function fixture(t, template) { const root = await mkdtemp(path.join(os.tmpdir(), 'broll-license-audit-')); t.after(() => rm(root, { recursive: true, force: true })); await mkdir(path.join(root, 'references/design-library/templates'), { recursive: true }); await mkdir(path.join(root, 'assets/licenses'), { recursive: true }); await writeFile(path.join(root, 'references/design-library/templates/a.json'), JSON.stringify(template)); return root; }
const record = (notice_required = true) => ({ license: notice_required ? { notice_required: true, notice_ref: 'assets/licenses/NOTICE.txt' } : { notice_required: false } });
const sha = (value) => createHash('sha256').update(value).digest('hex');

test('accepts an included readable license notice', async (t) => { const root = await fixture(t, { distribution: { included_license_notices: ['assets/licenses/NOTICE.txt'] }, provenance: { records: [record()] } }); await writeFile(path.join(root, 'assets/licenses/NOTICE.txt'), 'MIT License\n'); assert.deepEqual(await auditLicenseNotices(root), { schema_version: 2, template_count: 1, source_count: 0, font_source_count: 0, notice_count: 1, notices: ['assets/licenses/NOTICE.txt'], findings: [], ok: true }); });
test('rejects a required notice that is not in the package', async (t) => { const root = await fixture(t, { distribution: { included_license_notices: [] }, provenance: { records: [record()] } }); const result = await auditLicenseNotices(root); assert.equal(result.findings[0].code, 'notice_not_declared'); assert.equal(result.ok, false); });

test('audits mapped reference sources and pinned runtime font sources', async (t) => {
  const root = await fixture(t, { distribution: { included_license_notices: [] }, provenance: { records: [record(false)] } });
  const license = 'SIL OPEN FONT LICENSE Version 1.1\n';
  await writeFile(path.join(root, 'assets/licenses/NOTICE.txt'), license);
  await mkdir(path.join(root, 'reference-library/styles'), { recursive: true });
  await mkdir(path.join(root, 'references'), { recursive: true });
  await mkdir(path.join(root, 'assets/fonts'), { recursive: true });
  await writeFile(path.join(root, 'reference-library/styles/source.md'), '# source\n');
  await writeFile(path.join(root, 'references/third-party-notices.md'), '# Third-party notices\n');
  await writeFile(path.join(root, 'reference-library/source-map.json'), JSON.stringify({ schema_version: 1, sources: [{ source_id: 'font-source', repository: 'https://github.com/example/fonts', audited_commit: null, limitations: ['Pinned in the font manifest.'], license_id: 'OFL-1.1', license_path: 'assets/licenses/NOTICE.txt', license_sha256: sha(license), distribution_mode: 'runtime', file_globs: ['assets/fonts/source-manifest.json'], excluded: ['full binaries'] }] }));
  await writeFile(path.join(root, 'assets/fonts/source-manifest.json'), JSON.stringify({ schema_version: 1, policy: { font_binaries_in_public_package: false }, sources: [{ font_id: 'font', commit: 'a'.repeat(64), download_url: `https://example.test/${'a'.repeat(64)}/font.ttf`, bytes: 10, sha256: 'b'.repeat(64), license_path: 'assets/licenses/NOTICE.txt', license_sha256: sha(license) }] }));
  const result = await auditLicenseNotices(root);
  assert.equal(result.ok, true);
  assert.equal(result.source_count, 1);
  assert.equal(result.font_source_count, 1);
});

test('rejects a mapped license hash mismatch and an unlisted bundled font binary', async (t) => {
  const root = await fixture(t, { distribution: { included_license_notices: [] }, provenance: { records: [record(false)] } });
  await writeFile(path.join(root, 'assets/licenses/NOTICE.txt'), 'MIT License\n');
  await mkdir(path.join(root, 'reference-library'), { recursive: true });
  await mkdir(path.join(root, 'references'), { recursive: true });
  await mkdir(path.join(root, 'assets/fonts'), { recursive: true });
  await writeFile(path.join(root, 'references/third-party-notices.md'), '# notices\n');
  await writeFile(path.join(root, 'reference-library/source-map.json'), JSON.stringify({ schema_version: 1, sources: [{ source_id: 'bad', repository: 'https://github.com/example/bad', audited_commit: 'a'.repeat(40), license_id: 'MIT', license_path: 'assets/licenses/NOTICE.txt', license_sha256: 'f'.repeat(64), file_globs: ['assets/fonts/source-manifest.json'], excluded: [] }] }));
  await writeFile(path.join(root, 'assets/fonts/source-manifest.json'), JSON.stringify({ schema_version: 1, policy: { font_binaries_in_public_package: false }, sources: [] }));
  await writeFile(path.join(root, 'assets/fonts/full.ttf'), 'font');
  const result = await auditLicenseNotices(root);
  assert.equal(result.ok, false);
  assert.equal(result.findings.some((item) => item.code === 'source_license_hash_mismatch'), true);
  assert.equal(result.findings.some((item) => item.code === 'public_font_binary'), true);
});

test('rejects banned runtime fonts in production scripts and templates', async (t) => {
  const root = await fixture(t, { distribution: { included_license_notices: [] }, provenance: { records: [record(false)] } });
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await mkdir(path.join(root, 'assets/hyperframes-template'), { recursive: true });
  await writeFile(path.join(root, 'scripts/build-runtime.mjs'), 'export const css = `body { font-family: PingFang SC; }`;\n');
  await writeFile(path.join(root, 'assets/hyperframes-template/index.html'), '<style>body { font-family: "Noto Runtime"; }</style>');
  const result = await auditLicenseNotices(root);
  assert.equal(result.findings.some((item) => item.code === 'runtime_banned_font' && item.file === 'scripts/build-runtime.mjs'), true);
  assert.equal(result.findings.some((item) => item.code === 'runtime_banned_font' && item.file.includes('hyperframes-template')), false);
});
