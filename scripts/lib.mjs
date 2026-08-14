import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  access,
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const APP_NAME = 'erduo-broll-loop-engineering';
export const LEGACY_APP_NAME = 'erduo-hyperframes-broll';
export const RELEASE_VERSION = '0.8.1';
export const HYPERFRAMES_VERSION = '0.7.104';
export const SKILLS_CLI_VERSION = '1.5.22';
export const HYPERFRAMES_SKILLS_COMMIT = 'c96b30c7174984e684620556ce871a285381ec60';
export const HYPERFRAMES_SKILL_NAMES = Object.freeze([
  'hyperframes',
  'hyperframes-animation',
  'hyperframes-cli',
  'hyperframes-core',
  'hyperframes-creative',
  'hyperframes-keyframes',
  'hyperframes-registry',
  'media-use',
]);
export const LEGACY_SKILL_NAMES = Object.freeze([
  LEGACY_APP_NAME,
  'broll-onboarding',
  'broll-director',
  'broll-assets',
  'broll-master-build',
  'broll-master-integrate',
  'broll-render',
  'broll-shot-export',
]);
export const REMOTION_SKILL_NAMES = Object.freeze([
  'broll-remotion-build',
  'broll-remotion-integrate',
  'broll-remotion-render',
]);
export const AUTO_HYBRID_SKILL_NAMES = Object.freeze([
  'broll-runtime-plan',
  'broll-hybrid-integrate',
  'broll-hybrid-render',
]);
export const V3_SKILL_NAMES = Object.freeze([
  ...LEGACY_SKILL_NAMES,
  ...REMOTION_SKILL_NAMES,
]);
export const V4_SKILL_NAMES = Object.freeze([
  APP_NAME,
  ...LEGACY_SKILL_NAMES.slice(1),
  ...REMOTION_SKILL_NAMES,
]);
export const SKILL_NAMES = Object.freeze([
  ...V4_SKILL_NAMES,
  ...AUTO_HYBRID_SKILL_NAMES,
]);
export const INSTALL_SKILL_NAMES = Object.freeze([
  ...HYPERFRAMES_SKILL_NAMES,
  ...SKILL_NAMES,
]);

export function environmentReadinessFile(appDir) {
  return path.join(appDir, 'environment-readiness.json');
}

export function stableHostId({ hostname = os.hostname(), platform = process.platform,
  arch = process.arch } = {}) {
  return createHash('sha256')
    .update(`${platform}\0${arch}\0${hostname}`)
    .digest('hex')
    .slice(0, 16);
}

export function installManifestIdentity(manifest) {
  if (!manifest || !Array.isArray(manifest.records)) return null;
  const stable = {
    schema_version: manifest.schema_version,
    product_version: manifest.product_version,
    repo_root: manifest.repo_root,
    records: manifest.records.map(({ host, name, source, target }) => ({
      host, name, source, target,
    })),
  };
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

const INSTALL_MANIFEST_PROFILE_BY_SCHEMA = Object.freeze(new Map([
  [1, Object.freeze({
    names: LEGACY_SKILL_NAMES,
    parentName: LEGACY_APP_NAME,
    skillRootName: LEGACY_APP_NAME,
  })],
  [2, Object.freeze({
    names: Object.freeze([...HYPERFRAMES_SKILL_NAMES, ...LEGACY_SKILL_NAMES]),
    parentName: LEGACY_APP_NAME,
    skillRootName: LEGACY_APP_NAME,
  })],
  [3, Object.freeze({
    names: Object.freeze([...HYPERFRAMES_SKILL_NAMES, ...V3_SKILL_NAMES]),
    parentName: LEGACY_APP_NAME,
    skillRootName: LEGACY_APP_NAME,
  })],
  [4, Object.freeze({
    names: Object.freeze([...HYPERFRAMES_SKILL_NAMES, ...V4_SKILL_NAMES]),
    parentName: APP_NAME,
    skillRootName: APP_NAME,
  })],
  [5, Object.freeze({
    names: INSTALL_SKILL_NAMES,
    parentName: APP_NAME,
    skillRootName: APP_NAME,
  })],
]));

export class ActionRequiredError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ActionRequiredError';
    this.code = code;
  }
}

export function applicationDataDir({
  platform = process.platform,
  env = process.env,
  homeDir = os.homedir(),
} = {}) {
  // Keep the v0.1-v0.3 private storage locator so upgrades reuse credentials,
  // the pinned runtime, backups, and the ownership manifest. This is not the
  // public repository or Skill identity.
  const directoryName = LEGACY_APP_NAME;
  if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', directoryName);
  }
  if (platform === 'win32') {
    return path.join(env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), directoryName);
  }
  const xdg = typeof env.XDG_CONFIG_HOME === 'string' && path.isAbsolute(env.XDG_CONFIG_HOME)
    ? env.XDG_CONFIG_HOME
    : path.join(homeDir, '.config');
  return path.join(xdg, directoryName);
}

export function hostSkillRoots({ homeDir = os.homedir() } = {}) {
  return Object.freeze([
    { host: 'codex', root: path.join(homeDir, '.codex', 'skills') },
    { host: 'claude-code', root: path.join(homeDir, '.claude', 'skills') },
  ]);
}

export function skillSourceFor(repoRoot, name) {
  return name === APP_NAME
    ? path.join(repoRoot, APP_NAME)
    : path.join(repoRoot, APP_NAME, 'stages', name);
}

function manifestSkillSourceFor(repoRoot, name, profile) {
  const root = path.join(repoRoot, profile.skillRootName);
  return name === profile.parentName ? root : path.join(root, 'stages', name);
}

export function officialSkillBundleRoot(appDir) {
  return path.join(appDir, 'official-skills', HYPERFRAMES_SKILLS_COMMIT);
}

export function officialSkillSourceFor(appDir, name) {
  return path.join(officialSkillBundleRoot(appDir), 'skills', name);
}

function invalidManifest() {
  return new ActionRequiredError(
    'install_manifest_invalid',
    'Install manifest failed strict path and ownership validation.',
  );
}

function validateBackupPath(backup, { appDir, host, name }) {
  if (backup === null) return;
  if (typeof backup !== 'string' || !path.isAbsolute(backup)
    || path.resolve(backup) !== backup) {
    throw invalidManifest();
  }
  const backupRoot = path.join(appDir, 'backups');
  const relative = path.relative(backupRoot, backup);
  if (!relative || path.isAbsolute(relative) || relative === '..'
    || relative.startsWith(`..${path.sep}`)) {
    throw invalidManifest();
  }
  const parts = relative.split(path.sep);
  if (parts.length !== 3
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(parts[0])
    || parts[1] !== host
    || parts[2] !== name) {
    throw invalidManifest();
  }
}

export function validateInstallManifest(manifest, {
  repoRoot,
  appDir,
  homeDir = os.homedir(),
} = {}) {
  const profile = INSTALL_MANIFEST_PROFILE_BY_SCHEMA.get(manifest?.schema_version);
  const manifestSkillNames = profile?.names;
  if (!manifest || !profile || !Array.isArray(manifest.records)
    || typeof manifest.repo_root !== 'string'
    || !path.isAbsolute(manifest.repo_root)
    || path.resolve(manifest.repo_root) !== manifest.repo_root
    || manifest.repo_root !== repoRoot
    || manifest.records.length !== manifestSkillNames.length * 2) {
    throw invalidManifest();
  }

  const expected = new Map();
  for (const { host, root } of hostSkillRoots({ homeDir })) {
    for (const name of manifestSkillNames) {
      const target = path.join(root, name);
      expected.set(`${host}:${name}`, {
        host,
        name,
        target,
        source: HYPERFRAMES_SKILL_NAMES.includes(name)
          ? officialSkillSourceFor(appDir, name)
          : manifestSkillSourceFor(repoRoot, name, profile),
      });
    }
  }

  const records = [];
  const seenPairs = new Set();
  const seenTargets = new Set();
  for (const record of manifest.records) {
    if (!record || typeof record !== 'object'
      || typeof record.host !== 'string'
      || typeof record.name !== 'string'
      || typeof record.target !== 'string'
      || typeof record.source !== 'string'
      || (record.backup !== null && typeof record.backup !== 'string')) {
      throw invalidManifest();
    }
    const pair = `${record.host}:${record.name}`;
    const wanted = expected.get(pair);
    if (!wanted || seenPairs.has(pair) || seenTargets.has(record.target)
      || record.target !== wanted.target
      || record.source !== wanted.source) {
      throw invalidManifest();
    }
    validateBackupPath(record.backup, {
      appDir,
      host: record.host,
      name: record.name,
    });
    seenPairs.add(pair);
    seenTargets.add(record.target);
    records.push(record);
  }
  if (seenPairs.size !== expected.size) throw invalidManifest();
  return {
    records,
    byTarget: new Map(records.map((record) => [record.target, record])),
  };
}

export async function assertInstallManifestFilesystem(records, {
  appDir,
  homeDir = os.homedir(),
} = {}) {
  try {
    await assertDirectoryChain(appDir, { trustedRoot: homeDir });
  } catch {
    throw invalidManifest();
  }

  for (const { root } of hostSkillRoots({ homeDir })) {
    try {
      await assertDirectoryChain(root, { trustedRoot: homeDir });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  const withBackup = records.filter((record) => record.backup !== null);
  if (!withBackup.length) return;
  const backupRoot = path.join(appDir, 'backups');
  try {
    await assertDirectoryChain(backupRoot, { trustedRoot: appDir });
  } catch {
    throw invalidManifest();
  }
  const canonicalRoot = await realpath(backupRoot);
  for (const record of withBackup) {
    try {
      await lstat(record.backup);
    } catch {
      throw invalidManifest();
    }
    const canonicalParent = await realpath(path.dirname(record.backup));
    const relative = path.relative(canonicalRoot, canonicalParent);
    if (path.isAbsolute(relative) || relative === '..'
      || relative.startsWith(`..${path.sep}`)) {
      throw invalidManifest();
    }
  }
}

export function redactText(value, {
  homeDir = os.homedir(),
  secrets = [],
} = {}) {
  let text = String(value ?? '');
  const replacements = [
    [homeDir, '$HOME'],
    ...secrets.filter(Boolean).map((secret) => [String(secret), '[REDACTED]']),
  ].sort((a, b) => b[0].length - a[0].length);
  for (const [needle, replacement] of replacements) {
    if (needle) text = text.split(needle).join(replacement);
  }
  text = text
    .replace(/(?:Bearer|Authorization:?)\s+[A-Za-z0-9._~+/-]+/giu, 'Authorization: [REDACTED]')
    .replace(/(?:api[_-]?key|token|secret|password)=\S+/giu, '$1=[REDACTED]');
  return text;
}

export function sanitizedChildEnv(env = process.env) {
  const childEnv = { ...env };
  for (const key of Object.keys(childEnv)) {
    const folded = key.toUpperCase();
    if (folded === 'PEXELS_API_KEY' || folded === 'HYPERFRAMES_NO_TELEMETRY') {
      delete childEnv[key];
    }
  }
  childEnv.HYPERFRAMES_NO_TELEMETRY = '1';
  return childEnv;
}

export async function runFile(command, args = [], {
  cwd,
  env = process.env,
  input,
  timeout = 120_000,
  maxBuffer = 2 * 1024 * 1024,
} = {}) {
  const childEnv = sanitizedChildEnv(env);
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      env: childEnv,
      input,
      timeout,
      maxBuffer,
      encoding: 'utf8',
      windowsHide: true,
    });
    return {
      code: 0,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  } catch (error) {
    return {
      code: Number.isInteger(error?.code) ? error.code : 127,
      stdout: typeof error?.stdout === 'string' ? error.stdout : '',
      stderr: typeof error?.stderr === 'string' ? error.stderr : '',
      signal: error?.signal ?? null,
      causeCode: typeof error?.code === 'string' ? error.code : null,
    };
  }
}

export function parseJsonPayload(stdout, label) {
  if (typeof stdout !== 'string' || !stdout.trim()) {
    throw new ActionRequiredError(`${label}_payload_missing`, `${label} did not return JSON.`);
  }
  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch {
    throw new ActionRequiredError(`${label}_payload_invalid`, `${label} returned invalid JSON.`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ActionRequiredError(`${label}_payload_invalid`, `${label} returned an invalid payload.`);
  }
  return payload;
}

function normalizedFactStatus(fact) {
  if (fact?.ok === true) return 'ok';
  if (fact?.ok === false) return 'fail';
  const value = String(fact?.status ?? fact?.state ?? '').toLowerCase();
  if (['ok', 'pass', 'passed', 'ready', 'success'].includes(value)) return 'ok';
  if (['warn', 'warning', 'degraded'].includes(value)) return 'warn';
  if (['fail', 'failed', 'error', 'blocked', 'missing'].includes(value)) return 'fail';
  return 'unknown';
}

const OFFICIAL_FACT_IDS = Object.freeze(new Map([
  ['version', 'hyperframes-version'],
  ['node.js', 'node'],
  ['ffmpeg', 'ffmpeg'],
  ['ffprobe', 'ffprobe'],
  ['chrome', 'chrome'],
]));

function safeFactId(fact, index) {
  const supplied = String(fact?.name ?? fact?.id ?? fact?.label ?? '').trim().toLowerCase();
  return OFFICIAL_FACT_IDS.get(supplied) ?? `unknown-${index + 1}`;
}

export function normalizeOfficialDoctor(payload) {
  if (typeof payload?.ok !== 'boolean' || !Array.isArray(payload?.checks)) {
    throw new ActionRequiredError(
      'hyperframes_doctor_payload_invalid',
      'Official HyperFrames doctor payload is missing ok/checks.',
    );
  }
  const checks = payload.checks.map((fact, index) => {
    const id = safeFactId(fact, index);
    const rawStatus = normalizedFactStatus(fact);
    const pinnedUpdateNotice = id === 'hyperframes-version'
      && rawStatus === 'fail'
      && payload?._meta?.version === HYPERFRAMES_VERSION
      && payload?._meta?.updateAvailable === true;
    return {
      id,
      status: pinnedUpdateNotice ? 'ok' : rawStatus,
      ...(pinnedUpdateNotice ? { note: 'newer-version-available-pinned-version-confirmed' } : {}),
    };
  });
  const requiredIds = ['hyperframes-version', 'node', 'ffmpeg', 'ffprobe', 'chrome'];
  const required = requiredIds.map((id) => {
    const matches = checks.filter((entry) => entry.id === id);
    if (matches.length !== 1) {
      throw new ActionRequiredError(
        'hyperframes_doctor_payload_invalid',
        'Official HyperFrames doctor payload must contain each required local-render fact exactly once.',
      );
    }
    return { id, status: matches[0].status };
  });
  return {
    top_level_ok: payload.ok,
    installed_version: typeof payload?._meta?.version === 'string'
      ? payload._meta.version
      : null,
    latest_version: typeof payload?._meta?.latestVersion === 'string'
      ? payload._meta.latestVersion
      : null,
    update_available: payload?._meta?.updateAvailable === true,
    readiness_scope: 'required-local-render-facts-only',
    checks,
    required,
    selected_local_render_ready: required.every((entry) => entry.status === 'ok'),
  };
}

export function normalizeSkillsCheck(payload, exitCode) {
  const status = exitCode === 0 ? 'ok' : 'action-required';
  return {
    status,
    payload_ok: typeof payload.ok === 'boolean' ? payload.ok : null,
    installed_count: Number.isSafeInteger(payload.installed?.length)
      ? payload.installed.length
      : (Array.isArray(payload.installed) ? payload.installed.length : null),
  };
}

export function hyperframesCliPath(appDir) {
  return path.join(appDir, 'runtime', 'node_modules', 'hyperframes', 'dist', 'cli.js');
}

export async function pathExists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function directorySegments(directory, trustedRoot) {
  if (!path.isAbsolute(directory) || !path.isAbsolute(trustedRoot)) {
    throw new ActionRequiredError('unsafe_directory_path', 'Directory paths must be absolute.');
  }
  const relative = path.relative(trustedRoot, directory);
  if (path.isAbsolute(relative) || relative === '..'
    || relative.startsWith(`..${path.sep}`)) {
    throw new ActionRequiredError(
      'unsafe_directory_path',
      'Directory is outside its trusted root.',
    );
  }
  return relative ? relative.split(path.sep) : [];
}

async function assertRegularDirectory(directory) {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new ActionRequiredError(
      'unsafe_directory_path',
      'Refusing a symbolic link or non-directory in a trusted directory chain.',
    );
  }
}

export async function assertDirectoryChain(directory, { trustedRoot = directory } = {}) {
  const segments = directorySegments(directory, trustedRoot);
  await assertRegularDirectory(trustedRoot);
  let current = trustedRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    await assertRegularDirectory(current);
  }
}

export async function ensureDirectoryWithoutSymlink(directory, {
  mode,
  trustedRoot = directory,
} = {}) {
  const segments = directorySegments(directory, trustedRoot);
  await assertRegularDirectory(trustedRoot);
  let current = trustedRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      await assertRegularDirectory(current);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await mkdir(current, { mode: current === directory ? mode : undefined });
      await assertRegularDirectory(current);
    }
  }
  if (mode !== undefined && process.platform !== 'win32') await chmod(directory, mode);
}

export async function ensurePrivateDirectory(directory, options = {}) {
  await ensureDirectoryWithoutSymlink(directory, { ...options, mode: 0o700 });
}

export async function readJsonIfPresent(file) {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new ActionRequiredError('unsafe_config_path', 'Configuration path is not a regular file.');
    }
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    if (error instanceof ActionRequiredError) throw error;
    if (error instanceof SyntaxError) {
      throw new ActionRequiredError('config_json_invalid', 'Configuration JSON is invalid.');
    }
    throw error;
  }
}

export async function atomicWriteJson(file, value, { trustedRoot = path.dirname(file) } = {}) {
  const directory = path.dirname(file);
  await ensurePrivateDirectory(directory, { trustedRoot });
  try {
    const existing = await lstat(file);
    if (!existing.isFile() || existing.isSymbolicLink()) {
      throw new ActionRequiredError('unsafe_config_path', 'Refusing to replace a non-regular configuration path.');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const temp = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await open(temp, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    if (process.platform !== 'win32') await chmod(temp, 0o600);
    await rename(temp, file);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await rm(temp, { force: true }).catch(() => {});
  }
}

export function publicError(error, options = {}) {
  if (error instanceof ActionRequiredError) {
    return {
      status: 'action-required',
      code: error.code,
      message: redactText(error.message, options),
    };
  }
  return {
    status: 'failed',
    code: 'unexpected_error',
    message: 'Unexpected local setup failure.',
  };
}
