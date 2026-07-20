import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installStageSkills, InstallStageSkillsError } from './install-stage-skills.mjs';
const names = ['broll-preflight', 'broll-director', 'broll-assets', 'broll-render', 'broll-verify'];
test('links all stage skills and is idempotent without replacing occupied targets', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'broll-stage-install-')); t.after(() => rm(root, { recursive: true, force: true }));
  const skillRoot = path.join(root, 'skill'); const target = path.join(root, 'host');
  for (const name of names) await mkdir(path.join(skillRoot, 'stages', name), { recursive: true });
  assert.deepEqual((await installStageSkills(skillRoot, target)).map((entry) => entry.action), ['linked', 'linked', 'linked', 'linked', 'linked']);
  assert.deepEqual((await installStageSkills(skillRoot, target)).map((entry) => entry.action), ['reused', 'reused', 'reused', 'reused', 'reused']);
  await rm(path.join(target, 'broll-assets')); await symlink(path.join(root, 'other'), path.join(target, 'broll-assets'));
  await assert.rejects(() => installStageSkills(skillRoot, target), (error) => error instanceof InstallStageSkillsError && error.code === 'target_occupied');
});
