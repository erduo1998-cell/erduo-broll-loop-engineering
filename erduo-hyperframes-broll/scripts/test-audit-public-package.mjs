import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { auditPublicPackage } from './audit-public-package.mjs';

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL('./audit-public-package.mjs', import.meta.url));

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

test('rejects ReachSurge or positive-calibration artifacts and JSON payloads from the public package', async (t) => {
  const root = await fixture(t, {
    'references/reachsurge-private/manifest.json': '{"fixture":"negative-only"}',
    'references/profile.json': '{"private_calibration_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',
  });
  const result = await auditPublicPackage(root);
  assert.deepEqual(result.findings, [
    {
      code: 'private_calibration_payload',
      file: 'references/profile.json',
    },
    {
      code: 'private_calibration_artifact',
      file: 'references/reachsurge-private/manifest.json',
    },
  ]);
  assert.equal(result.ok, false);
});

test('rejects an opinionated or remote HyperFrames scaffold in a public package', async (t) => {
  const root = await fixture(t, {
    'assets/hyperframes-template/index.html': '<!doctype html><html><body><div id="root" data-scaffold-profile="structure-only-neutral-v1" style="background:radial-gradient(circle,#fff,#000)">sample</div></body></html>',
    'assets/hyperframes-template/meta.json': '{"scaffoldProfile":"structure-only-neutral-v1","pipelineContractVersion":2}',
    'assets/hyperframes-template/package.json': '{"name":"hyperframes-template","private":true,"type":"module","scripts":{}}',
    'assets/hyperframes-template/hyperframes.json': '{"paths":{"blocks":"compositions","components":"compositions/components","assets":"assets"},"media":{"autoProxy":true}}',
  });
  const result = await auditPublicPackage(root);
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.find((item) => item.code === 'neutral_scaffold_invalid'), {
    code: 'neutral_scaffold_invalid',
    reason: 'visual_signature',
  });
});

test('CLI exits zero for a clean audit and non-zero while preserving structured findings', async (t) => {
  const clean = await fixture(t, { 'SKILL.md': '# public\n' });
  const cleanRun = await execFileAsync(process.execPath, [CLI, clean]);
  assert.deepEqual(JSON.parse(cleanRun.stdout), {
    schema_version: 1,
    file_count: 1,
    byte_count: 9,
    findings: [],
    ok: true,
  });

  const rejected = await fixture(t, {
    'references/reachsurge-private/manifest.json': '{"fixture":"negative-only"}',
  });
  await assert.rejects(
    () => execFileAsync(process.execPath, [CLI, rejected]),
    (error) => {
      assert.equal(error.code, 2);
      assert.equal(error.stderr, '');
      assert.deepEqual(JSON.parse(error.stdout), {
        schema_version: 1,
        file_count: 1,
        byte_count: 27,
        findings: [{
          code: 'private_calibration_artifact',
          file: 'references/reachsurge-private/manifest.json',
        }],
        ok: false,
      });
      return true;
    },
  );
});
