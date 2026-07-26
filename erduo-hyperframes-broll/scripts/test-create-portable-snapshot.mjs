import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  createPortableSnapshot,
  PortableSnapshotError,
  verifyPortableSnapshot,
} from './create-portable-snapshot.mjs';

const execFileAsync = promisify(execFile);

test('creates and verifies a portable archive with dirty files and Git metadata', async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'portable-snapshot-test-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const project = path.join(temporary, 'project');
  await mkdir(path.join(project, 'erduo-hyperframes-broll'), { recursive: true });
  await writeFile(path.join(project, 'README.md'), '# portable\n');
  await writeFile(path.join(project, 'erduo-hyperframes-broll', 'SKILL.md'), '---\nname: erduo-hyperframes-broll\ndescription: test\n---\n');
  await mkdir(path.join(project, '.tmp-hf-fixture'), { recursive: true });
  await writeFile(path.join(project, '.tmp-hf-fixture', 'ignored.txt'), 'ignored');
  await execFileAsync('git', ['init', '-q'], { cwd: project });
  await execFileAsync('git', ['add', 'README.md'], { cwd: project });
  await execFileAsync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-qm', 'fixture'], { cwd: project });
  await writeFile(path.join(project, 'untracked.txt'), 'working state');

  const archive = path.join(temporary, 'snapshot.tar.gz');
  const created = await createPortableSnapshot({
    projectRoot: project,
    outputPath: archive,
    now: () => new Date('2026-07-23T00:00:00.000Z'),
  });
  assert.equal(created.status, 'created');
  assert.equal(created.includes_git_history, true);
  assert.equal(created.git.untracked_count, 3);

  const extracted = path.join(temporary, 'extracted');
  await mkdir(extracted);
  await execFileAsync('tar', ['-xzf', archive, '-C', extracted]);
  const restored = path.join(extracted, 'project');
  const verified = await verifyPortableSnapshot(restored);
  assert.equal(verified.status, 'verified');
  assert.equal(verified.includes_git_history, true);
  await assert.rejects(
    () => readFile(path.join(restored, '.tmp-hf-fixture', 'ignored.txt')),
    (error) => error.code === 'ENOENT',
  );

  await writeFile(path.join(restored, 'untracked.txt'), 'tampered');
  await assert.rejects(
    () => verifyPortableSnapshot(restored),
    (error) => error instanceof PortableSnapshotError && error.code === 'snapshot_hash_mismatch',
  );
});

test('refuses overwrite and output paths inside the project', async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'portable-snapshot-boundary-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const project = path.join(temporary, 'project');
  await mkdir(project);
  await writeFile(path.join(project, 'file.txt'), 'x');
  await assert.rejects(
    () => createPortableSnapshot({ projectRoot: project, outputPath: path.join(project, 'snapshot.tar.gz') }),
    (error) => error.code === 'output_inside_project',
  );
  const existing = path.join(temporary, 'existing.tar.gz');
  await writeFile(existing, 'do not replace');
  await assert.rejects(
    () => createPortableSnapshot({ projectRoot: project, outputPath: existing }),
    (error) => error.code === 'output_exists',
  );
});

test('snapshot CLI remains executable through a symlinked path', async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'portable-snapshot-cli-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const alias = path.join(temporary, 'snapshot-cli.mjs');
  await symlink(fileURLToPath(new URL('./create-portable-snapshot.mjs', import.meta.url)), alias);
  const { stdout } = await execFileAsync(process.execPath, [alias, '--help']);
  assert.match(stdout, /create <project-root>/u);
  assert.match(stdout, /verify <extracted-project-root>/u);
});
