#!/usr/bin/env node

import { lstat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ActionRequiredError,
  applicationDataDir,
  assertDirectoryChain,
  atomicWriteJson,
  publicError,
  readJsonIfPresent,
} from './lib.mjs';

const KEY_FIELD = 'pexels_api_key';
const MAX_KEY_BYTES = 4096;

function configPath(options = {}) {
  return path.join(applicationDataDir(options), 'config.json');
}

async function readConfigIfPresent({ env, platform, homeDir }) {
  const file = configPath({ env, platform, homeDir });
  try {
    await assertDirectoryChain(path.dirname(file), { trustedRoot: homeDir });
  } catch (error) {
    if (error?.code === 'ENOENT') return { file, value: null };
    throw error;
  }
  return { file, value: await readJsonIfPresent(file) };
}

export function normalizePexelsKey(value) {
  if (typeof value !== 'string') {
    throw new ActionRequiredError('pexels_key_invalid', 'Pexels Key is invalid.');
  }
  const normalized = value.trim();
  if (!normalized || Buffer.byteLength(normalized, 'utf8') > MAX_KEY_BYTES
    || /[\u0000-\u0020\u007f]/u.test(normalized)) {
    throw new ActionRequiredError('pexels_key_invalid', 'Pexels Key is empty or contains invalid characters.');
  }
  return normalized;
}

export async function loadPexelsCredential({
  env = process.env,
  platform = process.platform,
  homeDir = os.homedir(),
} = {}) {
  if (typeof env.PEXELS_API_KEY === 'string' && env.PEXELS_API_KEY.trim()) {
    return { key: normalizePexelsKey(env.PEXELS_API_KEY), source: 'environment' };
  }
  const { value } = await readConfigIfPresent({ env, platform, homeDir });
  if (!value) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ActionRequiredError('config_json_invalid', 'Configuration JSON must be an object.');
  }
  if (typeof value[KEY_FIELD] !== 'string' || !value[KEY_FIELD].trim()) return null;
  return { key: normalizePexelsKey(value[KEY_FIELD]), source: 'user-config' };
}

export async function pexelsStatus({
  validate = false,
  fetchImpl = globalThis.fetch,
  endpoint,
  ...credentialOptions
} = {}) {
  const credential = await loadPexelsCredential(credentialOptions);
  if (!credential) {
    return { configured: false, validated: false, source: 'none' };
  }
  if (!validate) {
    return { configured: true, validated: false, source: credential.source };
  }
  try {
    await validatePexelsKey(credential.key, { fetchImpl, endpoint });
    return { configured: true, validated: true, source: credential.source };
  } catch (error) {
    if (!(error instanceof ActionRequiredError)) throw error;
    return {
      configured: true,
      validated: false,
      source: credential.source,
      reason: error.code,
    };
  }
}

export async function validatePexelsKey(key, {
  fetchImpl = globalThis.fetch,
  endpoint = 'https://api.pexels.com/v1/search?query=sky&per_page=1',
} = {}) {
  const normalized = normalizePexelsKey(key);
  if (typeof fetchImpl !== 'function') {
    throw new ActionRequiredError('pexels_validation_unavailable', 'Pexels validation is unavailable.');
  }
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: { Authorization: normalized },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ActionRequiredError(
      'pexels_validation_unavailable',
      'Could not reach Pexels for credential validation.',
    );
  }
  if (!response?.ok) {
    throw new ActionRequiredError(
      response?.status === 401 || response?.status === 403
        ? 'pexels_key_rejected'
        : 'pexels_validation_failed',
      response?.status === 401 || response?.status === 403
        ? 'Pexels rejected the supplied credential.'
        : 'Pexels validation did not succeed.',
    );
  }
  return { valid: true };
}

export async function savePexelsKey(key, {
  env = process.env,
  platform = process.platform,
  homeDir = os.homedir(),
  fetchImpl = globalThis.fetch,
  endpoint,
} = {}) {
  const normalized = normalizePexelsKey(key);
  const { file, value: existing } = await readConfigIfPresent({
    env,
    platform,
    homeDir,
  });
  if (existing !== null && (typeof existing !== 'object' || Array.isArray(existing))) {
    throw new ActionRequiredError('config_json_invalid', 'Configuration JSON must be an object.');
  }
  await validatePexelsKey(normalized, { fetchImpl, endpoint });
  await atomicWriteJson(
    file,
    { ...(existing ?? {}), [KEY_FIELD]: normalized },
    { trustedRoot: homeDir },
  );
  const stat = await lstat(file);
  return {
    configured: true,
    source: 'user-config',
    private_mode: process.platform === 'win32' ? 'platform-managed' : (stat.mode & 0o777).toString(8),
    validated: true,
  };
}

async function readBoundedStdin(stream = process.stdin) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    bytes += chunk.length;
    if (bytes > MAX_KEY_BYTES + 2) {
      throw new ActionRequiredError('pexels_key_invalid', 'Pexels Key input is too large.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main(argv) {
  const json = argv.includes('--json');
  const args = argv.filter((entry) => entry !== '--json');
  if (args.length === 1 && args[0] === 'status') {
    const status = await pexelsStatus({ validate: true });
    process.stdout.write(json ? `${JSON.stringify(status)}\n`
      : `Pexels: ${status.configured && status.validated
        ? `configured and validated (${status.source})`
        : 'action-required'}\n`);
    if (!status.configured || !status.validated) process.exitCode = 2;
    return;
  }
  if (args.length === 2 && args[0] === 'set-pexels-key' && args[1] === '--stdin') {
    if (process.stdin.isTTY) {
      throw new ActionRequiredError(
        'stdin_required',
        'Pipe the Pexels Key through stdin or use the hidden installer prompt.',
      );
    }
    const status = await savePexelsKey(await readBoundedStdin());
    process.stdout.write(json ? `${JSON.stringify(status)}\n`
      : 'Pexels: configured, validated, and stored privately.\n');
    return;
  }
  throw new ActionRequiredError(
    'usage',
    'Usage: config.mjs status [--json] | set-pexels-key --stdin [--json]',
  );
}

const isMain = process.argv[1] && path.basename(process.argv[1]) === 'config.mjs';
if (isMain) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    const value = publicError(error);
    process.stderr.write(`${JSON.stringify(value)}\n`);
    process.exitCode = error?.code === 'usage' ? 64 : 2;
  }
}
