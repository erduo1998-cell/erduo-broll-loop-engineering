import { lstat, mkdir, readlink, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const names = ['broll-preflight', 'broll-director', 'broll-assets', 'broll-render', 'broll-verify'];
export class InstallStageSkillsError extends Error { constructor(code, message) { super(message); this.name = 'InstallStageSkillsError'; this.code = code; } }
const fail = (code, message) => { throw new InstallStageSkillsError(code, message); };
export async function installStageSkills(skillRoot, targetRoot) {
  if (!skillRoot || !targetRoot) fail('root_required', 'Source and target skill roots are required.');
  await mkdir(targetRoot, { recursive: true });
  const installed = [];
  for (const name of names) {
    const source = path.join(skillRoot, 'stages', name); const target = path.join(targetRoot, name);
    try {
      const stat = await lstat(target);
      if (!stat.isSymbolicLink() || path.resolve(path.dirname(target), await readlink(target)) !== path.resolve(source)) fail('target_occupied', `Refusing to replace existing ${name}.`);
      installed.push({ name, action: 'reused' }); continue;
    } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    await symlink(source, target, 'dir'); installed.push({ name, action: 'linked' });
  }
  return installed;
}
const main = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (main) { const targetRoot = process.argv[2]; if (!targetRoot) fail('usage', 'Usage: node install-stage-skills.mjs <host-skill-root>'); process.stdout.write(`${JSON.stringify(await installStageSkills(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), targetRoot))}\n`); }
