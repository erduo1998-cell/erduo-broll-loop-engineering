#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, validateSchemaValue } from './runtime-schema-validator.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(skillRoot, 'references', 'runtime', 'runtime-plan.schema.json');

export function computeRuntimePlanIdentity(plan) {
  const { identity: _identity, ...identityInput } = plan;
  return createHash('sha256').update(canonicalJson(identityInput)).digest('hex');
}

export async function validateRuntimePlan(plan) {
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const errors = validateSchemaValue(plan, schema, schema);
  if (plan?.identity && computeRuntimePlanIdentity(plan) !== plan.identity) errors.push('#/identity: aggregate does not match plan contents');
  if (plan?.status === 'planned') {
    if (!plan.resultingRoute || !plan.integrationMode || plan.shots.length === 0 || plan.blocks.length === 0) errors.push('#: a planned route requires shots, blocks, and integration mode');
    if (plan.resultingRoute === 'hybrid' && plan.integrationMode !== 'frozen-block-media') errors.push('#/integrationMode: hybrid requires frozen-block-media');
    if (plan.resultingRoute === 'hybrid' && plan.frozenMediaContractVersion !== '1.0.0') errors.push('#/frozenMediaContractVersion: hybrid requires the frozen block contract');
    if (plan.resultingRoute !== 'hybrid' && plan.integrationMode !== 'single-runtime-source') errors.push('#/integrationMode: single runtime route requires single-runtime-source');
    const expectedBackends = [...new Set(plan.shots.map(({ runtime }) => runtime))].sort();
    if (JSON.stringify(expectedBackends) !== JSON.stringify([...plan.requiredBackends].sort())) errors.push('#/requiredBackends: does not match shot assignments');
    const shots = [...plan.shots].sort((a, b) => a.window.startMs - b.window.startMs || a.shotId.localeCompare(b.shotId));
    if (shots[0]?.window.startMs !== 0) errors.push('#/shots: coverage must start at 0');
    for (let index = 0; index < shots.length; index += 1) {
      if (shots[index].window.endMs <= shots[index].window.startMs) errors.push(`#/shots/${index}/window: endMs must be greater than startMs`);
      if (index > 0 && shots[index].window.startMs !== shots[index - 1].window.endMs) errors.push(`#/shots/${index}/window: shots must be contiguous without gaps or overlaps`);
    }
    const flattened = plan.blocks.flatMap(({ shotIds }) => shotIds);
    if (JSON.stringify(flattened) !== JSON.stringify(shots.map(({ shotId }) => shotId))) errors.push('#/blocks: block shot order does not close over shot assignments');
    for (let index = 0; index < plan.blocks.length; index += 1) {
      const block = plan.blocks[index];
      const assigned = block.shotIds.map((id) => shots.find(({ shotId }) => shotId === id));
      if (assigned.some((item) => !item)) errors.push(`#/blocks/${index}: unknown shot`);
      else if (assigned.some(({ runtime }) => runtime !== block.runtime)
        || block.window.startMs !== assigned[0].window.startMs
        || block.window.endMs !== assigned.at(-1).window.endMs) errors.push(`#/blocks/${index}: runtime or window does not match its shots`);
    }
  } else if (plan?.resultingRoute !== null || plan?.requiredBackends?.length || plan?.blocks?.length || plan?.integrationMode !== null) {
    errors.push('#: action-required plan must not dispatch backends or integration');
  }
  if (errors.length) throw new Error(`runtime plan validation failed:\n${errors.join('\n')}`);
  return { status: 'valid', shots: plan.shots.length, blocks: plan.blocks.length, route: plan.resultingRoute };
}

async function main() {
  const [file] = process.argv.slice(2);
  if (!file) throw new Error('usage: node scripts/validate-runtime-plan.mjs <runtime-plan.json>');
  const plan = JSON.parse(await readFile(path.resolve(file), 'utf8'));
  process.stdout.write(`${JSON.stringify(await validateRuntimePlan(plan))}\n`);
}

if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
