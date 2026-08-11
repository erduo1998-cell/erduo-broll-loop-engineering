#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream, realpathSync } from 'node:fs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, validateSchemaValue } from './runtime-schema-validator.mjs';
import { validateRuntimePlan } from './validate-runtime-plan.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(skillRoot, 'references', 'runtime', 'frozen-block.schema.json');

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
}

async function hashFile(file) {
  const digest = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on('data', (chunk) => digest.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return digest.digest('hex');
}

export async function validateFrozenBlocks(plan, contractFiles) {
  await validateRuntimePlan(plan);
  if (plan.status !== 'planned' || plan.resultingRoute !== 'hybrid' || plan.integrationMode !== 'frozen-block-media') {
    throw new Error('frozen block validation requires a planned hybrid runtime plan');
  }
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const contracts = [];
  const errors = [];
  for (const file of contractFiles) {
    let contract;
    try { contract = JSON.parse(await readFile(file, 'utf8')); } catch { errors.push(`${file}: invalid JSON`); continue; }
    validateSchemaValue(contract, schema, schema, file, errors);
    if (!contract?.media?.path || path.isAbsolute(contract.media.path)) {
      errors.push(`${file}: media.path must be relative to its contract directory`);
    } else {
      const contractDirectory = await realpath(path.dirname(file));
      const mediaCandidate = path.resolve(contractDirectory, contract.media.path);
      try {
        const mediaCanonical = await realpath(mediaCandidate);
        const info = await lstat(mediaCandidate);
        if (!inside(contractDirectory, mediaCanonical) || !info.isFile() || info.isSymbolicLink()) errors.push(`${file}: media file must be a regular non-symlink inside the block directory`);
        else if (await hashFile(mediaCanonical) !== contract.media.sha256) errors.push(`${file}: media SHA-256 mismatch`);
      } catch { errors.push(`${file}: media file is missing or unreadable`); }
    }
    contracts.push(contract);
  }
  const byBlock = new Map();
  for (const contract of contracts) {
    if (byBlock.has(contract.blockId)) errors.push(`${contract.blockId}: duplicate frozen block contract`);
    byBlock.set(contract.blockId, contract);
  }
  if (contracts.length !== plan.blocks.length) errors.push('frozen block count does not match runtime plan');
  let referenceProfile = null;
  let referenceAudio = null;
  for (const block of plan.blocks) {
    const contract = byBlock.get(block.blockId);
    if (!contract) { errors.push(`${block.blockId}: frozen contract is missing`); continue; }
    if (contract.runtime !== block.runtime
      || contract.window.startMs !== block.window.startMs
      || contract.window.endMs !== block.window.endMs
      || JSON.stringify(contract.shotIds) !== JSON.stringify(block.shotIds)) errors.push(`${block.blockId}: runtime, window, or shots differ from runtime plan`);
    const timelineDuration = block.window.endMs - block.window.startMs;
    const frameDurationMs = Math.ceil(1000 * contract.profile.fpsDenominator / contract.profile.fpsNumerator);
    if (Math.abs(contract.media.durationMs - timelineDuration) > frameDurationMs) errors.push(`${block.blockId}: media duration differs from timeline by more than one frame`);
    if (contract.audioPolicy === 'silent' && contract.media.audioStreams !== 0) errors.push(`${block.blockId}: silent block contains audio streams`);
    const profileKey = canonicalJson(contract.profile);
    if (referenceProfile === null) referenceProfile = profileKey;
    else if (profileKey !== referenceProfile) errors.push(`${block.blockId}: frozen media profile differs across blocks`);
    if (referenceAudio === null) referenceAudio = contract.audioPolicy;
    else if (contract.audioPolicy !== referenceAudio) errors.push(`${block.blockId}: audio policy differs across blocks`);
  }
  if (errors.length) throw new Error(`frozen block validation failed:\n${errors.join('\n')}`);
  const ordered = plan.blocks.map(({ blockId }) => byBlock.get(blockId));
  const aggregateIdentity = createHash('sha256').update(canonicalJson({ planIdentity: plan.identity, contracts: ordered })).digest('hex');
  return { status: 'valid', blocks: ordered.length, startMs: ordered[0].window.startMs, endMs: ordered.at(-1).window.endMs, aggregateIdentity };
}

async function main() {
  const [planFile, ...contractFiles] = process.argv.slice(2);
  if (!planFile || contractFiles.length === 0) throw new Error('usage: node scripts/validate-frozen-blocks.mjs <runtime-plan.json> <block-media.json>...');
  const plan = JSON.parse(await readFile(path.resolve(planFile), 'utf8'));
  const result = await validateFrozenBlocks(plan, contractFiles.map((file) => path.resolve(file)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
