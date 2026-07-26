#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOWED_FRONTMATTER = new Set(['name', 'description', 'license', 'allowed-tools', 'metadata']);
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const LINK = /\[[^\]]+\]\(([^)]+)\)/gu;
const SKILL_NAMES = [
  'erduo-hyperframes-broll',
  'broll-director',
  'broll-assets',
  'broll-master-build',
  'broll-master-integrate',
  'broll-render',
  'broll-shot-export',
];

export class SkillLayoutError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SkillLayoutError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new SkillLayoutError(code, message); };

function parseFrontmatter(contents) {
  const normalized = contents.replaceAll('\r\n', '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/u);
  if (!match) fail('frontmatter_invalid', 'SKILL.md frontmatter is missing or malformed.');
  const value = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/u);
    if (!field) fail('frontmatter_invalid', 'SKILL.md frontmatter must use one-line scalar fields.');
    let text = field[2].trim();
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      text = text.slice(1, -1);
    }
    value[field[1]] = text;
  }
  return { value, body: normalized.slice(match[0].length) };
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function validateOneSkill({ skillRoot, skillDirectory, expectedName }) {
  const skillFile = path.join(skillDirectory, 'SKILL.md');
  let contents;
  try {
    contents = await readFile(skillFile, 'utf8');
  } catch {
    fail('skill_file_missing', `Missing SKILL.md for ${expectedName}.`);
  }
  const { value, body } = parseFrontmatter(contents);
  const unexpected = Object.keys(value).filter((key) => !ALLOWED_FRONTMATTER.has(key));
  if (unexpected.length) fail('frontmatter_invalid', `Unexpected frontmatter field in ${expectedName}: ${unexpected.join(', ')}`);
  if (value.name !== expectedName || !NAME.test(value.name ?? '') || value.name.length > 64) {
    fail('skill_name_invalid', `Skill name does not match its directory: ${expectedName}.`);
  }
  if (typeof value.description !== 'string' || !value.description.trim()
    || value.description.length > 1024 || /[<>]/u.test(value.description)) {
    fail('skill_description_invalid', `Skill description is invalid: ${expectedName}.`);
  }
  for (const match of body.matchAll(LINK)) {
    const raw = match[1].trim();
    if (!raw || raw.startsWith('#') || /^[a-z]+:/iu.test(raw)) continue;
    const withoutFragment = raw.split('#')[0];
    const target = path.resolve(skillDirectory, withoutFragment);
    const resolvedSkillRoot = path.resolve(skillRoot);
    if (target !== resolvedSkillRoot && !target.startsWith(`${resolvedSkillRoot}${path.sep}`)) {
      fail('skill_link_escape', `Skill link escapes the package: ${expectedName} -> ${raw}`);
    }
    if (!(await exists(target))) fail('skill_link_missing', `Skill link target is missing: ${expectedName} -> ${raw}`);
  }
  const agentFile = path.join(skillDirectory, 'agents', 'openai.yaml');
  if (!(await exists(agentFile))) fail('agent_metadata_missing', `agents/openai.yaml is missing: ${expectedName}.`);
  return {
    name: expectedName,
    skill_file: path.relative(skillRoot, skillFile).split(path.sep).join('/'),
    body_lines: body.split('\n').length,
  };
}

export async function validateSkillLayout(skillRoot) {
  const root = path.resolve(skillRoot);
  const results = [];
  for (const name of SKILL_NAMES) {
    const directory = name === 'erduo-hyperframes-broll'
      ? root
      : path.join(root, 'stages', name);
    results.push(await validateOneSkill({
      skillRoot: root,
      skillDirectory: directory,
      expectedName: name,
    }));
  }
  return {
    status: 'passed',
    skill_count: results.length,
    skills: results,
  };
}

async function main(argv) {
  if (argv.length > 1 || argv.includes('--help')) {
    process.stdout.write('Usage: node scripts/validate-skill-layout.mjs [skill-root]\n');
    if (argv.includes('--help')) return;
    process.exitCode = 64;
    return;
  }
  const root = argv[0] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  process.stdout.write(`${JSON.stringify(await validateSkillLayout(root))}\n`);
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (isMain) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    const known = error instanceof SkillLayoutError;
    process.stderr.write(`${JSON.stringify({
      status: 'failed',
      code: known ? error.code : 'skill_layout_failed',
      message: known ? error.message : 'Skill layout validation failed.',
    })}\n`);
    process.exitCode = 2;
  }
}
