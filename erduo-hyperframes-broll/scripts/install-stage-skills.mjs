import { realpathSync } from 'node:fs';
import { lstat, mkdir, realpath, rename, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ACTIVE_SKILL_NAMES = Object.freeze([
  'erduo-hyperframes-broll',
  'broll-director',
  'broll-assets',
  'broll-master-build',
  'broll-master-integrate',
  'broll-render',
  'broll-shot-export',
]);
export class InstallStageSkillsError extends Error { constructor(code, message) { super(message); this.name = 'InstallStageSkillsError'; this.code = code; } }
const fail = (code, message) => { throw new InstallStageSkillsError(code, message); };
const sourceFor = (skillRoot, name) => name === 'erduo-hyperframes-broll' ? skillRoot : path.join(skillRoot, 'stages', name);

async function sourceRecords(skillRoot) {
  let canonicalRoot;
  try {
    canonicalRoot = await realpath(skillRoot);
  } catch {
    fail('source_invalid', 'Source Skill root is unavailable.');
  }
  const records = [];
  for (const name of ACTIVE_SKILL_NAMES) {
    const source = sourceFor(canonicalRoot, name);
    try {
      const sourceStat = await lstat(source);
      if (!sourceStat.isDirectory()) fail('source_invalid', `Source Skill is not a directory: ${name}.`);
      const skillFile = await lstat(path.join(source, 'SKILL.md'));
      if (!skillFile.isFile()) fail('source_invalid', `Source Skill lacks SKILL.md: ${name}.`);
    } catch (error) {
      if (error instanceof InstallStageSkillsError) throw error;
      fail('source_invalid', `Source Skill is unavailable: ${name}.`);
    }
    if (name !== 'erduo-hyperframes-broll' && !source.startsWith(`${canonicalRoot}${path.sep}stages${path.sep}`)) {
      fail('source_invalid', `Stage Skill escapes the canonical source tree: ${name}.`);
    }
    records.push({ name, source });
  }
  return { canonicalRoot, records };
}

async function linkResolvesTo(target, source) {
  try {
    const stat = await lstat(target);
    return stat.isSymbolicLink() && await realpath(target) === source;
  } catch {
    return false;
  }
}

export async function installStageSkills(skillRoot, targetRoot, { backupRoot = null } = {}) {
  if (!skillRoot || !targetRoot) fail('root_required', 'Source and target skill roots are required.');
  const { records } = await sourceRecords(skillRoot);
  await mkdir(targetRoot, { recursive: true });
  if (backupRoot) await mkdir(backupRoot, { recursive: true });
  const installed = [];
  for (const { name, source } of records) {
    const target = path.join(targetRoot, name);
    try {
      await lstat(target);
      if (!(await linkResolvesTo(target, source))) {
        if (!backupRoot) fail('target_occupied', `Refusing to replace existing ${name}.`);
        const backup = path.join(backupRoot, name);
        try {
          await lstat(backup);
          fail('backup_occupied', `Backup target already exists: ${name}.`);
        } catch (error) {
          if (error instanceof InstallStageSkillsError) throw error;
          if (error?.code !== 'ENOENT') throw error;
        }
        await rename(target, backup);
        try {
          await symlink(source, target, 'dir');
        } catch (error) {
          await rename(backup, target);
          throw error;
        }
        installed.push({ name, action: 'backed-up-and-linked', source });
        continue;
      }
      installed.push({ name, action: 'reused', source }); continue;
    } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    await symlink(source, target, 'dir'); installed.push({ name, action: 'linked', source });
  }
  return installed;
}
export async function validateHostSkillLinks(skillRoot, targetRoot) {
  const { canonicalRoot, records } = await sourceRecords(skillRoot);
  const mismatches = [];
  const links = [];
  for (const { name, source } of records) {
    const target = path.resolve(targetRoot, name);
    const ok = await linkResolvesTo(target, source);
    if (!ok) mismatches.push(name);
    links.push({ name, target, source, ok });
  }
  return {
    status: mismatches.length ? 'revision_required' : 'approved',
    active_skill_count: ACTIVE_SKILL_NAMES.length,
    source_skill_root: canonicalRoot,
    links,
    mismatches,
  };
}
const main = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (main) {
  const [targetRoot, option, backupRoot] = process.argv.slice(2);
  if (!targetRoot || (option && option !== '--backup-occupied') || (option === '--backup-occupied' && !backupRoot)
    || process.argv.slice(2).length > (option ? 3 : 1)) {
    fail('usage', 'Usage: node install-stage-skills.mjs <host-skill-root> [--backup-occupied <backup-root>]');
  }
  const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const installed = await installStageSkills(skillRoot, targetRoot, {
    backupRoot: option ? backupRoot : null,
  });
  const validation = await validateHostSkillLinks(skillRoot, targetRoot);
  process.stdout.write(`${JSON.stringify({ installed, validation })}\n`);
}
