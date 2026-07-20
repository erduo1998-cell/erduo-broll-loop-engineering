#!/usr/bin/env node

import { promises as fsPromises } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const APP_NAME = 'erduo-hyperframes-broll';
const CONFIG_NAME = 'config.json';
const KEY_FIELD = 'pexels_api_key';
const MAX_STDIN_BYTES = 8192;

const EXIT_MISSING = 2;
const EXIT_CONFIG = 3;
const EXIT_USAGE = 64;
const EXIT_INTERNAL = 70;

export class ConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ConfigError';
    this.code = code;
  }
}

export function normalizePexelsKey(value) {
  if (typeof value !== 'string') {
    throw new ConfigError('invalid_credential', 'Pexels credential must be text.');
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new ConfigError('invalid_credential', 'Pexels credential is empty.');
  }
  if (normalized.length > 4096) {
    throw new ConfigError('invalid_credential', 'Pexels credential is too long.');
  }
  if (/\s|[\x00-\x1f\x7f]/u.test(normalized)) {
    throw new ConfigError('invalid_credential', 'Pexels credential contains unsupported characters.');
  }
  return normalized;
}

export function getConfigPath({
  platform = process.platform,
  env = process.env,
  homeDir = homedir(),
  pathImpl,
} = {}) {
  const paths = pathImpl ?? (platform === 'win32' ? path.win32 : path.posix);
  if (platform === 'win32') {
    const base = env.APPDATA || paths.join(homeDir, 'AppData', 'Roaming');
    return paths.join(base, APP_NAME, CONFIG_NAME);
  }

  const xdg = env.XDG_CONFIG_HOME;
  const base = xdg && paths.isAbsolute(xdg) ? xdg : paths.join(homeDir, '.config');
  return paths.join(base, APP_NAME, CONFIG_NAME);
}

function safeError(code, message, cause) {
  const error = new ConfigError(code, message);
  if (cause) error.cause = cause;
  return error;
}

async function readUserConfig(configPath, fsImpl) {
  let entry;
  try {
    entry = await fsImpl.lstat(configPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw safeError('config_read_failed', 'Unable to read the user configuration.', error);
  }

  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw safeError('config_unsafe', 'The user configuration is not a regular file.');
  }

  let text;
  try {
    text = await fsImpl.readFile(configPath, 'utf8');
  } catch (error) {
    throw safeError('config_read_failed', 'Unable to read the user configuration.', error);
  }

  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw safeError('config_invalid', 'The user configuration is not valid JSON.', error);
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw safeError('config_invalid', 'The user configuration must be a JSON object.');
  }
  return value;
}

export async function loadPexelsApiKey({
  env = process.env,
  platform = process.platform,
  homeDir = homedir(),
  pathImpl,
  fsImpl = fsPromises,
} = {}) {
  if (typeof env.PEXELS_API_KEY === 'string' && env.PEXELS_API_KEY.trim()) {
    return { key: normalizePexelsKey(env.PEXELS_API_KEY), source: 'environment' };
  }

  const configPath = getConfigPath({ platform, env, homeDir, pathImpl });
  const config = await readUserConfig(configPath, fsImpl);
  if (!config || typeof config[KEY_FIELD] !== 'string' || !config[KEY_FIELD].trim()) {
    return null;
  }
  return { key: normalizePexelsKey(config[KEY_FIELD]), source: 'user_config' };
}

export async function getPexelsConfigStatus(options = {}) {
  const credential = await loadPexelsApiKey(options);
  return credential
    ? { configured: true, source: credential.source }
    : { configured: false, source: 'none' };
}

async function chmodUserOnly(target, mode, fsImpl, platform) {
  if (platform === 'win32') return;
  try {
    await fsImpl.chmod(target, mode);
  } catch (error) {
    throw safeError('config_permission_failed', 'Unable to secure the user configuration.', error);
  }
}

export async function savePexelsApiKey(value, {
  env = process.env,
  platform = process.platform,
  homeDir = homedir(),
  pathImpl,
  fsImpl = fsPromises,
  makeId = randomUUID,
} = {}) {
  const key = normalizePexelsKey(value);
  const paths = pathImpl ?? (platform === 'win32' ? path.win32 : path.posix);
  const configPath = getConfigPath({ platform, env, homeDir, pathImpl: paths });
  const configDir = paths.dirname(configPath);
  const tempPath = paths.join(configDir, `.${CONFIG_NAME}.${process.pid}.${makeId()}.tmp`);

  let existing = {};
  let tempCreated = false;
  try {
    try {
      existing = (await readUserConfig(configPath, fsImpl)) ?? {};
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      throw error;
    }

    try {
      await fsImpl.mkdir(configDir, { recursive: true, mode: 0o700 });
      await chmodUserOnly(configDir, 0o700, fsImpl, platform);
    } catch (error) {
      if (error instanceof ConfigError) throw error;
      throw safeError('config_write_failed', 'Unable to create the user configuration directory.', error);
    }

    const next = { ...existing, [KEY_FIELD]: key };
    const serialized = `${JSON.stringify(next, null, 2)}\n`;
    try {
      await fsImpl.writeFile(tempPath, serialized, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      tempCreated = true;
      await chmodUserOnly(tempPath, 0o600, fsImpl, platform);
      await fsImpl.rename(tempPath, configPath);
      tempCreated = false;
      await chmodUserOnly(configPath, 0o600, fsImpl, platform);
    } catch (error) {
      if (error instanceof ConfigError) throw error;
      throw safeError('config_write_failed', 'Unable to save the user configuration.', error);
    }
  } finally {
    if (tempCreated) {
      try {
        await fsImpl.unlink(tempPath);
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          throw safeError('config_cleanup_failed', 'Unable to clean up the temporary configuration file.', error);
        }
      }
    }
  }

  return { configured: true, source: 'user_config' };
}

export async function readBoundedStdin(stream, maxBytes = MAX_STDIN_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      throw safeError('input_too_large', 'Credential input is too large.');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function parseConfigArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const action = argv[0];
  const flags = new Set(argv.slice(1));
  const allowed = new Set(['--json', '--stdin']);
  if (!['status', 'set-pexels-key'].includes(action)) return { error: true };
  if ([...flags].some((flag) => !allowed.has(flag))) return { error: true };
  if (action === 'status' && flags.has('--stdin')) return { error: true };
  if (action === 'set-pexels-key' && !flags.has('--stdin')) return { error: true };
  if (argv.slice(1).length !== flags.size) return { error: true };
  return { action, json: flags.has('--json'), stdin: flags.has('--stdin') };
}

function writeSafe(value, json, stream = process.stdout) {
  stream.write(json ? `${JSON.stringify(value)}\n` : `${value.configured ? 'configured' : 'not configured'} (${value.source})\n`);
}

function usage() {
  return `Usage:
  node scripts/config.mjs status [--json]
  node scripts/config.mjs set-pexels-key --stdin [--json]
`;
}

export async function runConfigCli(argv, adapters = {}) {
  const stdout = adapters.stdout ?? process.stdout;
  const stderr = adapters.stderr ?? process.stderr;
  const stdin = adapters.stdin ?? process.stdin;
  const options = adapters.options ?? {};
  const args = parseConfigArgs(argv);

  if (args.help) {
    stdout.write(usage());
    return 0;
  }
  if (args.error) {
    stderr.write('config: invalid arguments (use --help)\n');
    return EXIT_USAGE;
  }

  try {
    if (args.action === 'status') {
      const status = await getPexelsConfigStatus(options);
      writeSafe(status, args.json, stdout);
      return status.configured ? 0 : EXIT_MISSING;
    }

    const input = await readBoundedStdin(stdin);
    const status = await savePexelsApiKey(input, options);
    writeSafe(status, args.json, stdout);
    return 0;
  } catch (error) {
    if (error instanceof ConfigError) {
      const payload = { ok: false, code: error.code, message: error.message };
      if (args.json) stdout.write(`${JSON.stringify(payload)}\n`);
      else stderr.write(`config: ${error.message}\n`);
      return EXIT_CONFIG;
    }
    if (args.json) stdout.write(`${JSON.stringify({ ok: false, code: 'internal_error', message: 'Unexpected configuration failure.' })}\n`);
    else stderr.write('config: Unexpected configuration failure.\n');
    return EXIT_INTERNAL;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const code = await runConfigCli(process.argv.slice(2));
  process.exit(code);
}
