import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ACTIVE_SKILL_NAMES, installStageSkills, InstallStageSkillsError, validateHostSkillLinks } from './install-stage-skills.mjs';
const names = ['erduo-hyperframes-broll', 'broll-director', 'broll-assets', 'broll-master-build', 'broll-master-integrate', 'broll-render', 'broll-shot-export'];
test('links one root and the active short-pipeline Skills, remains idempotent, and refuses an occupied target', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'broll-stage-install-')); t.after(() => rm(root, { recursive: true, force: true }));
  const skillRoot = path.join(root, 'skill'); const target = path.join(root, 'host');
  await mkdir(skillRoot, { recursive: true });
  await writeFile(path.join(skillRoot, 'SKILL.md'), 'root');
  for (const name of names.filter((name) => name !== 'erduo-hyperframes-broll')) {
    await mkdir(path.join(skillRoot, 'stages', name), { recursive: true });
    await writeFile(path.join(skillRoot, 'stages', name, 'SKILL.md'), name);
  }
  const first = await installStageSkills(skillRoot, target);
  assert.deepEqual(first.map((entry) => entry.name), names);
  assert.deepEqual(first.map((entry) => entry.action), names.map(() => 'linked'));
  const second = await installStageSkills(skillRoot, target);
  assert.deepEqual(second.map((entry) => entry.name), names);
  assert.deepEqual(second.map((entry) => entry.action), names.map(() => 'reused'));
  const valid = await validateHostSkillLinks(skillRoot, target);
  const canonicalSkillRoot = await realpath(skillRoot);
  assert.equal(valid.status, 'approved');
  assert.equal(valid.active_skill_count, names.length);
  assert.equal(valid.source_skill_root, canonicalSkillRoot);
  assert.deepEqual(valid.links.map((entry) => entry.name), names);
  assert.equal(valid.links.every((entry) => entry.ok && entry.source.startsWith(canonicalSkillRoot)), true);
  assert.deepEqual(valid.mismatches, []);
  await rm(path.join(target, 'broll-master-build')); await symlink(path.join(root, 'other'), path.join(target, 'broll-master-build'));
  assert.deepEqual((await validateHostSkillLinks(skillRoot, target)).mismatches, ['broll-master-build']);
  await assert.rejects(() => installStageSkills(skillRoot, target), (error) => error instanceof InstallStageSkillsError && error.code === 'target_occupied');
});

test('can recoverably back up stale copied Skills before linking one source tree', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'broll-stage-takeover-')); t.after(() => rm(root, { recursive: true, force: true }));
  const skillRoot = path.join(root, 'skill');
  const target = path.join(root, 'host');
  const backup = path.join(root, 'backup');
  await mkdir(skillRoot, { recursive: true });
  await writeFile(path.join(skillRoot, 'SKILL.md'), 'new root');
  for (const name of names.filter((name) => name !== 'erduo-hyperframes-broll')) {
    await mkdir(path.join(skillRoot, 'stages', name), { recursive: true });
    await writeFile(path.join(skillRoot, 'stages', name, 'SKILL.md'), `new ${name}`);
  }
  for (const name of names) {
    await mkdir(path.join(target, name), { recursive: true });
    await writeFile(path.join(target, name, 'SKILL.md'), `old ${name}`);
  }
  const result = await installStageSkills(skillRoot, target, { backupRoot: backup });
  assert.deepEqual(result.map((item) => item.action), names.map(() => 'backed-up-and-linked'));
  const valid = await validateHostSkillLinks(skillRoot, target);
  assert.equal(valid.status, 'approved');
  assert.equal(valid.active_skill_count, names.length);
  assert.deepEqual(valid.mismatches, []);
  assert.equal(await readFile(path.join(backup, 'broll-render', 'SKILL.md'), 'utf8'), 'old broll-render');
});

test('canonicalizes a symlinked checkout and exposes all seven project-truth link targets', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'broll-stage-canonical-')); t.after(() => rm(root, { recursive: true, force: true }));
  const skillRoot = path.join(root, 'project', 'skill');
  const sourceAlias = path.join(root, 'skill-alias');
  const target = path.join(root, 'host');
  await mkdir(skillRoot, { recursive: true });
  await writeFile(path.join(skillRoot, 'SKILL.md'), 'root');
  for (const name of names.slice(1)) {
    await mkdir(path.join(skillRoot, 'stages', name), { recursive: true });
    await writeFile(path.join(skillRoot, 'stages', name, 'SKILL.md'), name);
  }
  await symlink(skillRoot, sourceAlias, 'dir');

  const installed = await installStageSkills(sourceAlias, target);
  const canonicalSkillRoot = await realpath(skillRoot);
  assert.deepEqual(ACTIVE_SKILL_NAMES, names);
  assert.equal(installed.every((entry) => entry.source.startsWith(canonicalSkillRoot)), true);
  for (const entry of installed) {
    assert.equal((await lstat(path.join(target, entry.name))).isSymbolicLink(), true);
    assert.equal(await readlink(path.join(target, entry.name)), entry.source);
  }
  const validation = await validateHostSkillLinks(sourceAlias, target);
  assert.equal(validation.source_skill_root, canonicalSkillRoot);
  assert.equal(validation.links.every((entry) => entry.ok), true);
});

test('preflights the complete seven-Skill source tree before creating host links', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'broll-stage-preflight-')); t.after(() => rm(root, { recursive: true, force: true }));
  const skillRoot = path.join(root, 'skill');
  const target = path.join(root, 'host');
  await mkdir(skillRoot, { recursive: true });
  await writeFile(path.join(skillRoot, 'SKILL.md'), 'root');
  await assert.rejects(
    () => installStageSkills(skillRoot, target),
    (error) => error instanceof InstallStageSkillsError && error.code === 'source_invalid',
  );
  await assert.rejects(() => lstat(path.join(target, names[0])), { code: 'ENOENT' });
});
