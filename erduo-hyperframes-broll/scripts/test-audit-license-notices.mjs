import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { auditLicenseNotices } from './audit-license-notices.mjs';

async function fixture(t, template) { const root = await mkdtemp(path.join(os.tmpdir(), 'broll-license-audit-')); t.after(() => rm(root, { recursive: true, force: true })); await mkdir(path.join(root, 'references/design-library/templates'), { recursive: true }); await mkdir(path.join(root, 'assets/licenses'), { recursive: true }); await writeFile(path.join(root, 'references/design-library/templates/a.json'), JSON.stringify(template)); return root; }
const record = (notice_required = true) => ({ license: notice_required ? { notice_required: true, notice_ref: 'assets/licenses/NOTICE.txt' } : { notice_required: false } });

test('accepts an included readable license notice', async (t) => { const root = await fixture(t, { distribution: { included_license_notices: ['assets/licenses/NOTICE.txt'] }, provenance: { records: [record()] } }); await writeFile(path.join(root, 'assets/licenses/NOTICE.txt'), 'MIT License\n'); assert.deepEqual(await auditLicenseNotices(root), { schema_version: 1, template_count: 1, notice_count: 1, notices: ['assets/licenses/NOTICE.txt'], findings: [], ok: true }); });
test('rejects a required notice that is not in the package', async (t) => { const root = await fixture(t, { distribution: { included_license_notices: [] }, provenance: { records: [record()] } }); const result = await auditLicenseNotices(root); assert.equal(result.findings[0].code, 'notice_not_declared'); assert.equal(result.ok, false); });
