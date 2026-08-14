#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PARENT_DEFAULT = [
  'erduo-broll-loop-engineering/SKILL.md',
];
export const V070_PARENT_DEFAULT = [
  'erduo-broll-loop-engineering/SKILL.md',
  'erduo-broll-loop-engineering/references/prompt-first-workflow.md',
  'erduo-broll-loop-engineering/references/stage-orchestration.md',
  'erduo-broll-loop-engineering/references/parent-review-checklist.md',
  'erduo-broll-loop-engineering/references/handoff-template.md',
  'erduo-broll-loop-engineering/references/visual-craft.md',
  'erduo-broll-loop-engineering/references/first-run-onboarding.md',
  'erduo-broll-loop-engineering/references/runtime/runtime-selection.md',
  'erduo-broll-loop-engineering/references/runtime/runtime-contract.md',
  'erduo-broll-loop-engineering/references/runtime/capability-matrix.json',
  'erduo-broll-loop-engineering/references/runtime/runtime-plan.schema.json',
  'erduo-broll-loop-engineering/references/runtime/frozen-block.schema.json',
];

const COMMON = [
  'erduo-broll-loop-engineering/stages/broll-director/SKILL.md',
  'erduo-broll-loop-engineering/stages/broll-runtime-plan/SKILL.md',
  'erduo-broll-loop-engineering/stages/broll-assets/SKILL.md',
];

export const ROUTES = {
  hyperframes: [...COMMON,
    'erduo-broll-loop-engineering/stages/broll-master-build/SKILL.md',
    'erduo-broll-loop-engineering/stages/broll-master-integrate/SKILL.md',
    'erduo-broll-loop-engineering/stages/broll-render/SKILL.md'],
  remotion: [...COMMON,
    'erduo-broll-loop-engineering/stages/broll-remotion-build/SKILL.md',
    'erduo-broll-loop-engineering/stages/broll-remotion-integrate/SKILL.md',
    'erduo-broll-loop-engineering/stages/broll-remotion-render/SKILL.md'],
  hybrid: [...COMMON,
    'erduo-broll-loop-engineering/stages/broll-master-build/SKILL.md',
    'erduo-broll-loop-engineering/stages/broll-remotion-build/SKILL.md',
    'erduo-broll-loop-engineering/stages/broll-hybrid-integrate/SKILL.md',
    'erduo-broll-loop-engineering/stages/broll-hybrid-render/SKILL.md'],
};

const SAFETY_MARKERS = [
  /PEXELS_API_KEY/gu,
  /HYPERFRAMES_NO_TELEMETRY/gu,
  /safe-spawn\.mjs/gu,
  /case-insensitive (?:key )?collisions?/giu,
  /without a shell/giu,
];
const ONBOARDING_MARKER = /(?:broll-onboarding|base Onboarding|targeted Onboarding|Onboarding Agent)/giu;
const VISUAL_MARKER = /(?:inspect(?:ion)?[^\n]{0,45}(?:frame|still)|representative[^\n]{0,30}frame|routine[^\n]{0,30}still|stills?[^\n]{0,30}inspection)/giu;

function occurrences(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function pct(before, after) {
  return before === 0 ? null : Number((((before - after) / before) * 100).toFixed(2));
}

export async function gitReader(ref, root = repoRoot) {
  return async (file) => {
    if (ref === 'worktree') return readFile(path.join(root, file), 'utf8');
    const { stdout } = await execFileAsync('git', ['show', `${ref}:${file}`], {
      cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  };
}

export async function measureSnapshot(label, reader, { parentDefault = PARENT_DEFAULT } = {}) {
  const files = [...new Set([...parentDefault, ...Object.values(ROUTES).flat()])];
  const entries = {};
  for (const file of files) {
    const text = await reader(file);
    entries[file] = { text, bytes: Buffer.byteLength(text) };
  }
  const parentBytes = parentDefault.reduce((sum, file) => sum + entries[file].bytes, 0);
  const routePromptBytes = Object.fromEntries(Object.entries(ROUTES).map(([route, routeFiles]) => [
    route,
    parentBytes + routeFiles.reduce((sum, file) => sum + entries[file].bytes, 0),
  ]));
  const corpus = files.map((file) => entries[file].text).join('\n');
  const safetyFiles = files.filter((file) => SAFETY_MARKERS
    .filter((pattern) => occurrences(entries[file].text, pattern) > 0).length >= 2);
  return {
    label,
    measurement: 'deterministic prompt-load proxy; actual host token/I-O requires run trace',
    parent_default_files: parentDefault,
    parent_default_required_bytes: parentBytes,
    route_prompt_bytes: routePromptBytes,
    route_default_agent_count: Object.fromEntries(Object.entries(ROUTES)
      .map(([route, routeFiles]) => [route, routeFiles.length])),
    proxies: {
      safety_implementation_copy_files: safetyFiles,
      safety_implementation_copy_count: safetyFiles.length,
      onboarding_instruction_occurrences: occurrences(corpus, ONBOARDING_MARKER),
      default_visual_frame_instruction_occurrences: occurrences(corpus, VISUAL_MARKER),
    },
  };
}

export function compareSnapshots(baseline, current) {
  return {
    parent_default_reduction_percent: pct(
      baseline.parent_default_required_bytes,
      current.parent_default_required_bytes,
    ),
    route_reduction_percent: Object.fromEntries(Object.keys(ROUTES).map((route) => [
      route, pct(baseline.route_prompt_bytes[route], current.route_prompt_bytes[route]),
    ])),
    safety_implementation_copy_reduction_percent: pct(
      baseline.proxies.safety_implementation_copy_count,
      current.proxies.safety_implementation_copy_count,
    ),
    onboarding_instruction_reduction_percent: pct(
      baseline.proxies.onboarding_instruction_occurrences,
      current.proxies.onboarding_instruction_occurrences,
    ),
    visual_frame_instruction_reduction_percent: pct(
      baseline.proxies.default_visual_frame_instruction_occurrences,
      current.proxies.default_visual_frame_instruction_occurrences,
    ),
  };
}

export async function buildContextMeasurement({
  baselineRef = 'v0.7.0',
  currentRef = 'worktree',
  baselineReader,
  currentReader,
} = {}) {
  const readBaseline = baselineReader ?? await gitReader(baselineRef);
  const readCurrent = currentReader ?? await gitReader(currentRef);
  const baseline = await measureSnapshot(baselineRef, readBaseline, {
    parentDefault: baselineRef === 'v0.7.0' ? V070_PARENT_DEFAULT : PARENT_DEFAULT,
  });
  const current = await measureSnapshot(currentRef, readCurrent);
  const currentArgument = currentRef === 'worktree' ? '' : ` --current ${currentRef}`;
  return {
    schema_version: 1,
    command: `node scripts/measure-context.mjs --baseline ${baselineRef}${currentArgument}`,
    scope: 'Deterministic default prompt-load byte proxy; actual host token and artifact I/O remain end-to-end benchmark facts.',
    baseline,
    current,
    comparison: compareSnapshots(baseline, current),
  };
}

async function main(argv) {
  let baselineRef = 'v0.7.0';
  let currentRef = 'worktree';
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!['--baseline', '--current'].includes(option)
      || !argv[index + 1]
      || argv[index + 1].startsWith('--')) {
      throw new Error('Usage: node scripts/measure-context.mjs [--baseline <git-ref>] [--current <git-ref|worktree>]');
    }
    if (option === '--baseline') baselineRef = argv[index + 1];
    else currentRef = argv[index + 1];
    index += 1;
  }
  process.stdout.write(`${JSON.stringify(await buildContextMeasurement({ baselineRef, currentRef }), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}
