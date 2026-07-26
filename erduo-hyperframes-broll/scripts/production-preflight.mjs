#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream, realpathSync } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPexelsConfigStatus } from './config.mjs';
import { runDoctor } from './doctor.mjs';
import { ACTIVE_SKILL_NAMES, validateHostSkillLinks } from './install-stage-skills.mjs';

export const PREFLIGHT_RECEIPT_MAX_BYTES = 4 * 1024;
export const PREFLIGHT_VERSION = 1;

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const INPUT_ROLES = new Set(['srt', 'talking-head-media', 'audio', 'reference-media', 'user-media']);
const BLOCKER_CODES = new Set([
  'preflight_manifest_invalid',
  'confirmed_brief_unavailable',
  'input_artifact_unavailable',
  'srt_required',
  'talking_head_media_required',
  'isolated_stage_context_required',
  'source_skill_mismatch',
  'runtime_capability_unavailable',
  'pexels_configuration_required',
  'pexels_configuration_unavailable',
]);
const SENSITIVE_KEY = /(?:api[_-]?key|authorization|credential|password|secret|token|prompt|stdout|stderr|stack|locator|path|content|image)/iu;
const PRIVATE_PATH = /(?:^|[\s"'])((?:[A-Za-z]:[\\/]|\/|~\/|file:\/\/))/u;

export class ProductionPreflightError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProductionPreflightError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new ProductionPreflightError(code, message); };

function exact(value, fields) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...fields].sort());
}

function canonical(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || seen.has(value)) fail('preflight_receipt_invalid', 'Preflight receipt is invalid.');
  seen.add(value);
  const result = Array.isArray(value)
    ? value.map((item) => canonical(item, seen))
    : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key], seen)]));
  seen.delete(value);
  return result;
}

export function fingerprintPreflightValue(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value)), 'utf8').digest('hex');
}

export async function hashFileSha256(filePath) {
  const digest = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => digest.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return digest.digest('hex');
}

async function defaultRuntimeProbe({ workdir }) {
  const result = await runDoctor({ workdir });
  const check = (id) => result.checks.some((item) => item.id === id && item.status === 'pass');
  return {
    shell: check('node'),
    hyperframes: check('hyperframes'),
  };
}

async function defaultSkillTreeFingerprint(skillRoot) {
  const records = [];
  for (const name of ACTIVE_SKILL_NAMES) {
    const directory = name === 'erduo-hyperframes-broll'
      ? skillRoot
      : path.join(skillRoot, 'stages', name);
    records.push({ name, sha256: await hashFileSha256(path.join(directory, 'SKILL.md')) });
  }
  return fingerprintPreflightValue(records);
}

function validateManifest(value) {
  if (!exact(value, [
    'schema_version',
    'run_id',
    'host',
    'mode',
    'confirmed_brief',
    'input_artifacts',
    'pexels_required',
    'isolated_stage_contexts',
  ])) fail('preflight_manifest_invalid', 'Preflight manifest is invalid.');
  if (
    value.schema_version !== 1
    || !SAFE_RUN_ID.test(value.run_id ?? '')
    || !['claude-code', 'codex'].includes(value.host)
    || !['talking-head', 'faceless'].includes(value.mode)
    || typeof value.pexels_required !== 'boolean'
    || typeof value.isolated_stage_contexts !== 'boolean'
    || !Array.isArray(value.input_artifacts)
  ) fail('preflight_manifest_invalid', 'Preflight manifest is invalid.');
  const brief = value.confirmed_brief;
  if (!exact(brief, ['status', 'artifact', 'user_confirmation_sha256'])
    || brief.status !== 'confirmed'
    || !SHA256.test(brief.user_confirmation_sha256 ?? '')
    || !exact(brief.artifact, ['path', 'sha256'])
    || typeof brief.artifact.path !== 'string'
    || !SHA256.test(brief.artifact.sha256 ?? '')) {
    fail('preflight_manifest_invalid', 'Preflight manifest is invalid.');
  }
  const roles = new Set();
  for (const input of value.input_artifacts) {
    if (!exact(input, ['role', 'path', 'sha256'])
      || !INPUT_ROLES.has(input.role)
      || roles.has(input.role)
      || typeof input.path !== 'string'
      || !SHA256.test(input.sha256 ?? '')) {
      fail('preflight_manifest_invalid', 'Preflight manifest is invalid.');
    }
    roles.add(input.role);
  }
  return value;
}

async function fileMatchesHash(artifact, hashFile = hashFileSha256) {
  try {
    const stat = await lstat(artifact.path);
    if (!stat.isFile()) return false;
    return (await hashFile(artifact.path)) === artifact.sha256;
  } catch {
    return false;
  }
}

function uniqueCodes(values) {
  return [...new Set(values)].sort();
}

function receiptCore({ manifest = null, blockers, inputHashes, skillTreeSha256, runtime, pexels }) {
  const valid = manifest !== null;
  return {
    schema_version: PREFLIGHT_VERSION,
    status: blockers.length ? 'blocked' : 'passed',
    pipeline_contract_version: 3,
    host: valid ? manifest.host : 'unknown',
    run_id: valid ? manifest.run_id : null,
    confirmed_brief_sha256: valid ? manifest.confirmed_brief.artifact.sha256 : null,
    input_hashes: inputHashes,
    skill_tree_sha256: skillTreeSha256,
    capabilities: {
      shell: runtime.shell ? 'available' : 'unavailable',
      hyperframes: runtime.hyperframes ? 'available' : 'unavailable',
      isolated_stage_contexts: valid && manifest.isolated_stage_contexts ? 'available' : 'unavailable',
    },
    pexels: valid && manifest.pexels_required
      ? (pexels.configured ? 'configured' : 'unavailable')
      : 'not-required',
    blocker_codes: uniqueCodes(blockers),
  };
}

function assertNoUnsafeReceipt(value) {
  const visit = (candidate, key = '') => {
    if (SENSITIVE_KEY.test(key)) fail('preflight_receipt_unsafe', 'Preflight receipt includes a private field.');
    if (typeof candidate === 'string' && PRIVATE_PATH.test(candidate)) {
      fail('preflight_receipt_unsafe', 'Preflight receipt includes a private path.');
    }
    if (Array.isArray(candidate)) {
      candidate.forEach((item) => visit(item));
    } else if (candidate && typeof candidate === 'object') {
      Object.entries(candidate).forEach(([childKey, childValue]) => visit(childValue, childKey));
    }
  };
  visit(value);
}

export function validatePreflightReceipt(receipt) {
  if (!exact(receipt, [
    'schema_version',
    'status',
    'pipeline_contract_version',
    'host',
    'run_id',
    'confirmed_brief_sha256',
    'input_hashes',
    'skill_tree_sha256',
    'capabilities',
    'pexels',
    'blocker_codes',
    'receipt_sha256',
  ])) fail('preflight_receipt_invalid', 'Preflight receipt is invalid.');
  if (Buffer.byteLength(JSON.stringify(receipt), 'utf8') > PREFLIGHT_RECEIPT_MAX_BYTES) {
    fail('preflight_receipt_oversize', 'Preflight receipt exceeds its fixed context budget.');
  }
  assertNoUnsafeReceipt(receipt);
  const validCapabilities = exact(receipt.capabilities, ['shell', 'hyperframes', 'isolated_stage_contexts'])
    && Object.values(receipt.capabilities).every((value) => ['available', 'unavailable'].includes(value));
  const validInputHashes = receipt.input_hashes.every((entry) => exact(entry, ['role', 'sha256'])
    && INPUT_ROLES.has(entry.role)
    && SHA256.test(entry.sha256 ?? ''));
  if (
    receipt.schema_version !== PREFLIGHT_VERSION
    || !['passed', 'blocked'].includes(receipt.status)
    || receipt.pipeline_contract_version !== 3
    || !['claude-code', 'codex', 'unknown'].includes(receipt.host)
    || receipt.run_id !== null && !SAFE_RUN_ID.test(receipt.run_id ?? '')
    || receipt.confirmed_brief_sha256 !== null && !SHA256.test(receipt.confirmed_brief_sha256 ?? '')
    || receipt.skill_tree_sha256 !== null && !SHA256.test(receipt.skill_tree_sha256 ?? '')
    || !Array.isArray(receipt.input_hashes)
    || !Array.isArray(receipt.blocker_codes)
    || !validCapabilities
    || !validInputHashes
    || !['configured', 'unavailable', 'not-required'].includes(receipt.pexels)
    || receipt.blocker_codes.some((code) => !BLOCKER_CODES.has(code))
    || receipt.status === 'passed' && receipt.blocker_codes.length !== 0
    || receipt.status === 'blocked' && receipt.blocker_codes.length === 0
  ) fail('preflight_receipt_invalid', 'Preflight receipt is invalid.');
  const { receipt_sha256: ignored, ...core } = receipt;
  if (!SHA256.test(receipt.receipt_sha256 ?? '') || receipt.receipt_sha256 !== fingerprintPreflightValue(core)) {
    fail('preflight_receipt_hash_mismatch', 'Preflight receipt hash is invalid.');
  }
  return receipt;
}

/**
 * Inspect private artifacts without returning their paths, contents, source or logs.
 * The parent receives this fixed, hash-only receipt and nothing else.
 */
export async function runProductionPreflight({
  manifest,
  skillRoot,
  hostSkillRoot,
  workdir = process.cwd(),
  hashFile = hashFileSha256,
  runtimeProbe = defaultRuntimeProbe,
  pexelsStatus = getPexelsConfigStatus,
  hostSkillValidator = validateHostSkillLinks,
  skillTreeFingerprint = defaultSkillTreeFingerprint,
} = {}) {
  const blockers = [];
  let normalized = null;
  let inputHashes = [];
  let skillTreeSha256 = null;
  let runtime = { shell: false, hyperframes: false };
  let pexels = { configured: false };
  try {
    normalized = validateManifest(manifest);
  } catch {
    blockers.push('preflight_manifest_invalid');
  }
  if (normalized) {
    if (!(await fileMatchesHash(normalized.confirmed_brief.artifact, hashFile))) {
      blockers.push('confirmed_brief_unavailable');
    }
    const artifactResults = await Promise.all(normalized.input_artifacts.map(async (artifact) => ({
      artifact,
      matched: await fileMatchesHash(artifact, hashFile),
    })));
    for (const { artifact, matched } of artifactResults) {
      if (!matched) blockers.push('input_artifact_unavailable');
      else inputHashes.push({ role: artifact.role, sha256: artifact.sha256 });
    }
    inputHashes = inputHashes.sort((left, right) => left.role.localeCompare(right.role));
    const roles = new Set(normalized.input_artifacts.map((artifact) => artifact.role));
    if (!roles.has('srt')) blockers.push('srt_required');
    if (normalized.mode === 'talking-head' && !roles.has('talking-head-media')) {
      blockers.push('talking_head_media_required');
    }
    if (!normalized.isolated_stage_contexts) blockers.push('isolated_stage_context_required');
    try {
      const links = await hostSkillValidator(skillRoot, hostSkillRoot);
      if (links.status !== 'approved' || links.mismatches?.length) blockers.push('source_skill_mismatch');
      else skillTreeSha256 = await skillTreeFingerprint(skillRoot);
    } catch {
      blockers.push('source_skill_mismatch');
    }
    try {
      runtime = await runtimeProbe({ workdir });
      if (!runtime?.shell || !runtime?.hyperframes) blockers.push('runtime_capability_unavailable');
    } catch {
      blockers.push('runtime_capability_unavailable');
    }
    if (normalized.pexels_required) {
      try {
        pexels = await pexelsStatus();
        if (!pexels?.configured) blockers.push('pexels_configuration_required');
      } catch {
        blockers.push('pexels_configuration_unavailable');
      }
    }
  }
  const core = receiptCore({
    manifest: normalized,
    blockers,
    inputHashes,
    skillTreeSha256,
    runtime,
    pexels,
  });
  const receipt = { ...core, receipt_sha256: fingerprintPreflightValue(core) };
  return validatePreflightReceipt(receipt);
}

function parseArgs(argv) {
  if (argv.includes('--help')) return { help: true };
  if (argv.length !== 4 || argv[0] !== '--manifest' || argv[2] !== '--host-skill-root') return null;
  return { manifestPath: argv[1], hostSkillRoot: argv[3] };
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args?.help) {
    process.stdout.write('Usage: node scripts/production-preflight.mjs --manifest <private-preflight.json> --host-skill-root <active-host-skill-root>\n');
    return 0;
  }
  if (!args) return 64;
  let manifest;
  try {
    manifest = JSON.parse(await readFile(args.manifestPath, 'utf8'));
  } catch {
    manifest = null;
  }
  const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const receipt = await runProductionPreflight({
    manifest,
    skillRoot,
    hostSkillRoot: args.hostSkillRoot,
    workdir: path.dirname(args.manifestPath),
  });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  return receipt.status === 'passed' ? 0 : 2;
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
  const code = await main(process.argv.slice(2));
  process.exitCode = code;
}
