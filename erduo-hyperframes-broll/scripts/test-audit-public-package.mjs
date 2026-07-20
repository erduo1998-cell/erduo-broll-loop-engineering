import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { auditPublicPackage } from './audit-public-package.mjs';

async function fixture(t, files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'broll-public-audit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [relative, contents] of Object.entries(files)) { await mkdir(path.dirname(path.join(root, relative)), { recursive: true }); await writeFile(path.join(root, relative), contents); }
  return root;
}

test('accepts public text-only package files and permits path-redaction test literals', async (t) => {
  const root = await fixture(t, { 'SKILL.md': '# public\n', 'scripts/test-safe.mjs': "const example = '/private/example';\n", 'references/contract.md': 'No credential value.\n' });
  assert.deepEqual(await auditPublicPackage(root), { schema_version: 1, file_count: 3, byte_count: 66, findings: [], ok: true });
});

test('rejects production private paths, secret-shaped values, and embedded media', async (t) => {
  const root = await fixture(t, { 'scripts/live.mjs': "const path = '/Users/alice/private.mp4';\n", 'references/key.md': 'ghp_12345678901234567890', 'assets/sample.mp4': 'not-real-video' });
  const result = await auditPublicPackage(root);
  assert.deepEqual(result.findings.map((finding) => finding.code).sort(), ['embedded_media', 'private_path', 'secret_value']);
  assert.equal(result.ok, false);
});
