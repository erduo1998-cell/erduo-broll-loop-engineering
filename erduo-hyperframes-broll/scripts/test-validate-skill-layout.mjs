import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  SkillLayoutError,
  validateSkillLayout,
} from './validate-skill-layout.mjs';

const names = [
  'erduo-hyperframes-broll',
  'broll-director',
  'broll-assets',
  'broll-master-build',
  'broll-master-integrate',
  'broll-render',
  'broll-shot-export',
];

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skill-layout-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'references'), { recursive: true });
  await writeFile(path.join(root, 'references', 'contract.md'), '# contract\n');
  for (const name of names) {
    const directory = name === names[0] ? root : path.join(root, 'stages', name);
    await mkdir(path.join(directory, 'agents'), { recursive: true });
    const link = name === names[0] ? 'references/contract.md' : '../../references/contract.md';
    await writeFile(path.join(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: Portable test skill.\n---\n\nRead [contract](${link}).\n`);
    await writeFile(path.join(directory, 'agents', 'openai.yaml'), 'interface: {}\n');
  }
  return root;
}

test('validates all seven portable skill entries and their relative links', async (t) => {
  const root = await fixture(t);
  const result = await validateSkillLayout(root);
  assert.equal(result.status, 'passed');
  assert.deepEqual(result.skills.map((item) => item.name), names);
});

test('rejects a missing relative contract and a mismatched skill name', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'stages', 'broll-render', 'SKILL.md'), '---\nname: wrong-name\ndescription: invalid\n---\n');
  await assert.rejects(
    () => validateSkillLayout(root),
    (error) => error instanceof SkillLayoutError && error.code === 'skill_name_invalid',
  );
});
