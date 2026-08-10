#!/usr/bin/env node

import {
  cp,
  lstat,
  mkdtemp,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  unlink,
} from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  ActionRequiredError,
  HYPERFRAMES_SKILLS_COMMIT,
  HYPERFRAMES_SKILL_NAMES,
  HYPERFRAMES_VERSION,
  INSTALL_SKILL_NAMES,
  RELEASE_VERSION,
  SKILL_NAMES,
  SKILLS_CLI_VERSION,
  applicationDataDir,
  assertDirectoryChain,
  assertInstallManifestFilesystem,
  atomicWriteJson,
  ensureDirectoryWithoutSymlink,
  ensurePrivateDirectory,
  hostSkillRoots,
  hyperframesCliPath,
  normalizeOfficialDoctor,
  normalizeSkillsCheck,
  officialSkillBundleRoot,
  parseJsonPayload,
  pathExists,
  publicError,
  readJsonIfPresent,
  redactText,
  runFile,
  sanitizedChildEnv,
  skillSourceFor,
  validateInstallManifest,
} from './lib.mjs';

const HYPERFRAMES_REPOSITORY = 'https://github.com/heygen-com/hyperframes.git';
const MINIMUM_NODE_VERSION = Object.freeze([22, 20, 0]);

export function isSupportedNodeVersion(version = process.versions.node) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/u.exec(String(version));
  if (!match) return false;
  const current = match.slice(1).map(Number);
  for (let index = 0; index < MINIMUM_NODE_VERSION.length; index += 1) {
    if (current[index] > MINIMUM_NODE_VERSION[index]) return true;
    if (current[index] < MINIMUM_NODE_VERSION[index]) return false;
  }
  return true;
}

async function validateSources(repoRoot, additionalSources = []) {
  const sources = [];
  for (const name of SKILL_NAMES) {
    const source = skillSourceFor(repoRoot, name);
    try {
      const directory = await lstat(source);
      const skill = await lstat(path.join(source, 'SKILL.md'));
      if (!directory.isDirectory() || !skill.isFile()) throw new Error('invalid');
    } catch {
      throw new ActionRequiredError(
        'skill_source_incomplete',
        `Release package is missing the ${name} Skill.`,
      );
    }
    sources.push({ name, source: await realpath(source) });
  }
  const extraNames = additionalSources.map((entry) => entry?.name).sort();
  const wantedExtraNames = [...HYPERFRAMES_SKILL_NAMES].sort();
  if (additionalSources.length > 0
    && JSON.stringify(extraNames) !== JSON.stringify(wantedExtraNames)) {
    throw new ActionRequiredError(
      'official_skill_source_incomplete',
      'The staged official HyperFrames Skill set is not the exact pinned core set.',
    );
  }
  for (const entry of additionalSources) {
    if (!entry || typeof entry.source !== 'string') {
      throw new ActionRequiredError(
        'official_skill_source_incomplete',
        'A staged official HyperFrames Skill source is invalid.',
      );
    }
    try {
      const directory = await lstat(entry.source);
      const skill = await lstat(path.join(entry.source, 'SKILL.md'));
      if (!directory.isDirectory() || directory.isSymbolicLink()
        || !skill.isFile() || skill.isSymbolicLink()) throw new Error('invalid');
    } catch {
      throw new ActionRequiredError(
        'official_skill_source_incomplete',
        `The staged official ${entry.name} Skill is invalid.`,
      );
    }
    sources.push({ name: entry.name, source: path.resolve(entry.source) });
  }
  return sources;
}

async function sameLink(target, source) {
  try {
    const stat = await lstat(target);
    return stat.isSymbolicLink() && await realpath(target) === source;
  } catch {
    return false;
  }
}

async function rawLinkDestination(target) {
  try {
    const stat = await lstat(target);
    if (!stat.isSymbolicLink()) return null;
    const raw = await readlink(target);
    return {
      raw,
      absolute: path.resolve(path.dirname(target), raw),
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function entryExists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function scanTargets({ sources, homeDir }) {
  const records = [];
  for (const hostRoot of hostSkillRoots({ homeDir })) {
    for (const source of sources) {
      const target = path.join(hostRoot.root, source.name);
      let state = 'empty';
      try {
        await lstat(target);
        state = await sameLink(target, source.source) ? 'current' : 'occupied';
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      records.push({ ...hostRoot, ...source, target, state });
    }
  }
  return records;
}

async function askYes(question, { input = process.stdin, output = process.stdout } = {}) {
  const interface_ = readline.createInterface({ input, output });
  try {
    const answer = (await interface_.question(`${question} [y/N] `)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    interface_.close();
  }
}

export async function installSkillLinks({
  repoRoot,
  appDir,
  homeDir = os.homedir(),
  approveOccupied = false,
  interactive = false,
  confirmer = askYes,
  timestamp = new Date().toISOString().replaceAll(/[:.]/gu, '-'),
  previousManifest = null,
  finalize = async () => {},
  stepHook = async () => {},
  additionalSources = [],
} = {}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(timestamp)) {
    throw new ActionRequiredError('unsafe_backup_name', 'Backup identifier is invalid.');
  }
  await ensurePrivateDirectory(appDir, { trustedRoot: homeDir });
  const sources = await validateSources(repoRoot, additionalSources);
  const targets = await scanTargets({ sources, homeDir });
  let previousByTarget = new Map();
  let previousRecords = [];
  if (previousManifest) {
    const validatedPrevious = validateInstallManifest(previousManifest, {
      repoRoot: previousManifest.repo_root,
      appDir,
      homeDir,
    });
    previousByTarget = validatedPrevious.byTarget;
    previousRecords = validatedPrevious.records;
  }

  const currentTargets = new Set(targets.map((entry) => entry.target));
  const retirements = [];
  for (const record of previousRecords.filter((entry) => !currentTargets.has(entry.target))) {
    let raw = null;
    try {
      const stat = await lstat(record.target);
      if (!stat.isSymbolicLink()) {
        throw new ActionRequiredError(
          'retired_skill_target_changed',
          'A legacy Skill target changed; no rename migration was performed.',
        );
      }
      const link = await rawLinkDestination(record.target);
      if (!link || link.absolute !== record.source) {
        throw new ActionRequiredError(
          'retired_skill_target_changed',
          'A legacy Skill target changed; no rename migration was performed.',
        );
      }
      raw = link.raw;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    if (record.backup && !await entryExists(record.backup)) {
      throw new ActionRequiredError(
        'retired_skill_backup_missing',
        'A legacy Skill backup is missing; no rename migration was performed.',
      );
    }
    retirements.push({ record, raw, removed: false, restored: false });
  }

  for (const entry of targets) {
    const previous = previousByTarget.get(entry.target);
    if (entry.state !== 'occupied' || !previous) continue;
    const link = await rawLinkDestination(entry.target);
    if (link?.absolute === previous.source) entry.state = 'previous-install';
  }

  const occupied = targets.filter((entry) => entry.state === 'occupied');
  if (occupied.length && !approveOccupied) {
    if (!interactive || !await confirmer(
      `发现 ${occupied.length} 个不同的既有 Skill。是否先备份再安装？`,
    )) {
      throw new ActionRequiredError(
        'occupied_skills_need_approval',
        `${occupied.length} existing Skills require one-time backup approval.`,
      );
    }
  }

  const backupRoot = path.join(appDir, 'backups', timestamp);
  const installed = [];
  const undo = [];
  const retiredUndo = [];

  async function removeCurrentOwnedLink(entry) {
    const link = await rawLinkDestination(entry.target);
    if (!link) return;
    if (link.absolute !== entry.source) {
      throw new ActionRequiredError(
        'install_rollback_target_changed',
        'A Skill target changed while installation was rolling back.',
      );
    }
    await unlink(entry.target);
  }

  async function rollback() {
    const failures = [];
    for (const retirement of retiredUndo.toReversed()) {
      try {
        if (retirement.restored) {
          await rename(retirement.record.target, retirement.record.backup);
        }
        if (retirement.removed && retirement.raw !== null) {
          await symlink(retirement.raw, retirement.record.target, 'dir');
        }
      } catch (error) {
        failures.push(error);
      }
    }
    for (const operation of undo.toReversed()) {
      try {
        await removeCurrentOwnedLink(operation.entry);
        if (operation.prior.kind === 'backup') {
          await rename(operation.prior.backup, operation.entry.target);
        } else if (operation.prior.kind === 'link') {
          await symlink(operation.prior.raw, operation.entry.target, 'dir');
        }
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) {
      throw new ActionRequiredError(
        'install_rollback_failed',
        'Installation failed and one or more Skill changes could not be rolled back.',
      );
    }
  }

  try {
    for (const entry of targets) {
      await ensureDirectoryWithoutSymlink(entry.root, { trustedRoot: homeDir });
      const previous = previousByTarget.get(entry.target) ?? null;
      if (entry.state === 'current') {
        installed.push({
          ...entry,
          action: 'reused',
          backup: previous?.backup ?? null,
        });
        await stepHook({ entry, phase: 'reused', installed: installed.length });
        continue;
      }

      let backup = previous?.backup ?? null;
      let prior = { kind: 'empty' };
      if (entry.state === 'previous-install') {
        const link = await rawLinkDestination(entry.target);
        if (!link || link.absolute !== previous.source) {
          throw new ActionRequiredError(
            'previous_install_changed',
            'A previously installed Skill changed during upgrade.',
          );
        }
        await unlink(entry.target);
        prior = { kind: 'link', raw: link.raw };
      } else if (entry.state === 'occupied') {
        if (previous?.backup) {
          throw new ActionRequiredError(
            'occupied_skill_changed',
            'A previously managed Skill was replaced; manual recovery is required.',
          );
        }
        backup = path.join(backupRoot, entry.host, entry.name);
        await ensurePrivateDirectory(path.dirname(backup), { trustedRoot: appDir });
        if (await entryExists(backup)) {
          throw new ActionRequiredError(
            'backup_target_occupied',
            'A generated backup path is already occupied.',
          );
        }
        await rename(entry.target, backup);
        prior = { kind: 'backup', backup };
      }

      undo.push({ entry, prior });
      await symlink(entry.source, entry.target, 'dir');
      installed.push({
        ...entry,
        action: entry.state === 'previous-install'
          ? 'upgraded-owned-link'
          : (backup ? 'backed-up-and-linked' : 'linked'),
        backup,
      });
      await stepHook({ entry, phase: 'linked', installed: installed.length });
    }
    for (const retirement of retirements) {
      retiredUndo.push(retirement);
      if (retirement.raw !== null) {
        await unlink(retirement.record.target);
        retirement.removed = true;
      }
      if (retirement.record.backup) {
        if (await entryExists(retirement.record.target)) {
          throw new ActionRequiredError(
            'retired_skill_restore_target_occupied',
            'A legacy Skill target became occupied during rename migration.',
          );
        }
        await rename(retirement.record.backup, retirement.record.target);
        retirement.restored = true;
      }
      await stepHook({
        entry: retirement.record,
        phase: 'retired-legacy-name',
        installed: installed.length,
      });
    }
    await finalize(installed);
    return installed;
  } catch (error) {
    try {
      await rollback();
    } catch (rollbackError) {
      throw rollbackError;
    }
    throw error;
  }
}

export async function npmCliPath({
  env = process.env,
  execPath = process.execPath,
} = {}) {
  const siblingNpm = path.join(path.dirname(execPath), 'npm');
  let resolvedSiblingNpm = null;
  if (await pathExists(siblingNpm)) {
    resolvedSiblingNpm = await realpath(siblingNpm);
  }
  const candidates = [
    env.npm_execpath,
    resolvedSiblingNpm,
    path.resolve(path.dirname(execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new ActionRequiredError(
    'npm_unavailable',
    'The selected Node.js runtime does not include npm.',
  );
}

function hasOnlyPinnedRuntimeDependencies(value) {
  const dependencies = value?.dependencies;
  if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)
    || Object.keys(dependencies).length !== 2
    || dependencies.hyperframes !== HYPERFRAMES_VERSION
    || dependencies.skills !== SKILLS_CLI_VERSION) {
    return false;
  }
  return [
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
    'bundledDependencies',
    'bundleDependencies',
    'overrides',
    'workspaces',
  ].every((field) => (
    value[field] === undefined
      || (value[field] && typeof value[field] === 'object'
        && Object.keys(value[field]).length === 0)
  ));
}

function isPinnedRegistryPackage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.link === true
    || typeof value.version !== 'string'
    || typeof value.resolved !== 'string'
    || typeof value.integrity !== 'string') {
    return false;
  }
  const integrity = /^sha512-([A-Za-z0-9+/]+={0,2})$/u.exec(value.integrity);
  if (!integrity) return false;
  const digest = Buffer.from(integrity[1], 'base64');
  if (digest.length !== 64 || digest.toString('base64') !== integrity[1]) return false;
  try {
    const resolved = new URL(value.resolved);
    return resolved.protocol === 'https:'
      && resolved.hostname === 'registry.npmjs.org'
      && resolved.port === ''
      && resolved.username === ''
      && resolved.password === ''
      && resolved.hash === ''
      && resolved.search === ''
      && resolved.pathname.endsWith('.tgz');
  } catch {
    return false;
  }
}

function isLockPackagePath(name) {
  if (typeof name !== 'string' || !name.startsWith('node_modules/')
    || name.includes('\\')) return false;
  const segments = name.split('/');
  return segments.every((segment) => segment && segment !== '.' && segment !== '..');
}

export function validateRuntimeLock(packageJson, packageLock) {
  const packages = packageLock?.packages;
  const packageEntries = packages && typeof packages === 'object' && !Array.isArray(packages)
    ? Object.entries(packages).filter(([name]) => name)
    : [];
  const locked = packageLock?.packages?.['node_modules/hyperframes'];
  const lockedSkills = packageLock?.packages?.['node_modules/skills'];
  const invalidPackages = packageEntries
    .filter(([name, value]) => !isLockPackagePath(name) || !isPinnedRegistryPackage(value))
    .map(([name]) => name);
  if (!hasOnlyPinnedRuntimeDependencies(packageJson)
    || packageLock?.lockfileVersion !== 3
    || !packages
    || !hasOnlyPinnedRuntimeDependencies(packages[''])
    || packageLock.dependencies !== undefined
    || locked?.version !== HYPERFRAMES_VERSION
    || lockedSkills?.version !== SKILLS_CLI_VERSION
    || packageEntries.length === 0
    || invalidPackages.length) {
    throw new ActionRequiredError(
      'runtime_lock_invalid',
      'Bundled runtime lock must contain only pinned HyperFrames/Skills CLI roots and integrity-locked npm registry packages.',
    );
  }
}

async function installPinnedHyperFrames({
  repoRoot,
  appDir,
  env,
  runner,
  npmCli: injectedNpmCli = null,
}) {
  const childEnv = sanitizedChildEnv(env);
  const runtime = path.join(appDir, 'runtime');
  const npmCache = path.join(appDir, 'npm-cache');
  await ensurePrivateDirectory(runtime, { trustedRoot: appDir });
  await ensurePrivateDirectory(npmCache, { trustedRoot: appDir });
  const templateRoot = path.join(repoRoot, 'runtime');
  await assertDirectoryChain(templateRoot, { trustedRoot: repoRoot });
  const packageJson = await readJsonIfPresent(path.join(templateRoot, 'package.json'));
  const packageLock = await readJsonIfPresent(path.join(templateRoot, 'package-lock.json'));
  validateRuntimeLock(packageJson, packageLock);
  await atomicWriteJson(
    path.join(runtime, 'package.json'),
    packageJson,
    { trustedRoot: appDir },
  );
  await atomicWriteJson(
    path.join(runtime, 'package-lock.json'),
    packageLock,
    { trustedRoot: appDir },
  );
  const npmCli = injectedNpmCli ?? await npmCliPath();
  const result = await runner(process.execPath, [
    npmCli,
    'ci',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ], {
    cwd: runtime,
    env: { ...childEnv, npm_config_cache: npmCache },
    timeout: 10 * 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const installedPackage = await readJsonIfPresent(
    path.join(runtime, 'node_modules', 'hyperframes', 'package.json'),
  );
  const installedSkillsPackage = await readJsonIfPresent(
    path.join(runtime, 'node_modules', 'skills', 'package.json'),
  );
  if (result.code !== 0
    || installedPackage?.version !== HYPERFRAMES_VERSION
    || installedSkillsPackage?.version !== SKILLS_CLI_VERSION
    || !await pathExists(hyperframesCliPath(appDir))
    || !await pathExists(skillsCliPath(appDir))) {
    throw new ActionRequiredError(
      'hyperframes_install_failed',
      `Could not install the pinned HyperFrames ${HYPERFRAMES_VERSION} / Skills CLI ${SKILLS_CLI_VERSION} runtime.`,
    );
  }
  return hyperframesCliPath(appDir);
}

function skillsCliPath(appDir) {
  return path.join(appDir, 'runtime', 'node_modules', 'skills', 'dist', 'cli.mjs');
}

async function runOfficialJson(cli, args, { env, runner, label, timeout = 180_000 }) {
  const result = await runner(process.execPath, [cli, ...args], {
    env: sanitizedChildEnv(env),
    timeout,
  });
  const payload = parseJsonPayload(result.stdout, label);
  return { result, payload };
}

function isolatedSkillEnvironment(env, { homeDir, appDir }) {
  const childEnv = sanitizedChildEnv(env);
  const isolatedNames = new Set([
    'HOME',
    'XDG_CONFIG_HOME',
    'XDG_STATE_HOME',
    'CODEX_HOME',
    'CLAUDE_CONFIG_DIR',
    'NPM_CONFIG_CACHE',
  ]);
  for (const key of Object.keys(childEnv)) {
    if (isolatedNames.has(key.toUpperCase())) delete childEnv[key];
  }
  return {
    ...childEnv,
    HOME: homeDir,
    XDG_CONFIG_HOME: path.join(homeDir, '.config'),
    XDG_STATE_HOME: path.join(homeDir, '.local', 'state'),
    CODEX_HOME: path.join(homeDir, '.codex'),
    CLAUDE_CONFIG_DIR: path.join(homeDir, '.claude'),
    npm_config_cache: path.join(appDir, 'npm-cache'),
  };
}

async function assertRegularTree(root) {
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new ActionRequiredError(
      'official_skill_bundle_unsafe',
      'The staged official Skill bundle contains an unsafe directory.',
    );
  }
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    const entryStat = await lstat(target);
    if (entryStat.isSymbolicLink()) {
      throw new ActionRequiredError(
        'official_skill_bundle_unsafe',
        'The staged official Skill bundle contains a symbolic link.',
      );
    }
    if (entryStat.isDirectory()) await assertRegularTree(target);
    else if (!entryStat.isFile()) {
      throw new ActionRequiredError(
        'official_skill_bundle_unsafe',
        'The staged official Skill bundle contains a special file.',
      );
    }
  }
}

async function validateOfficialSkillStore(store) {
  await assertRegularTree(store);
  const entries = await readdir(store, { withFileTypes: true });
  const names = entries.map((entry) => entry.name).sort();
  const expected = [...HYPERFRAMES_SKILL_NAMES].sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)
    || entries.some((entry) => !entry.isDirectory() || entry.isSymbolicLink())) {
    throw new ActionRequiredError(
      'official_skill_bundle_incomplete',
      'The staged official Skill bundle is not the exact eight-Skill core set.',
    );
  }
  for (const name of expected) {
    const skill = await lstat(path.join(store, name, 'SKILL.md'));
    if (!skill.isFile() || skill.isSymbolicLink()) {
      throw new ActionRequiredError(
        'official_skill_bundle_incomplete',
        `The staged official ${name} Skill is missing SKILL.md.`,
      );
    }
  }
}

async function validateOfficialBundle(bundle) {
  const bundleStat = await lstat(bundle);
  if (!bundleStat.isDirectory() || bundleStat.isSymbolicLink()) {
    throw new ActionRequiredError(
      'official_skill_bundle_unsafe',
      'The application-owned official Skill bundle is not a regular directory.',
    );
  }
  const names = (await readdir(bundle, { withFileTypes: true }))
    .map((entry) => entry.name)
    .sort();
  if (JSON.stringify(names) !== JSON.stringify(['SOURCE.json', 'skills', 'skills-manifest.json'])) {
    throw new ActionRequiredError(
      'official_skill_bundle_incomplete',
      'The application-owned official Skill bundle has an unexpected top-level entry.',
    );
  }
  for (const name of ['SOURCE.json', 'skills-manifest.json']) {
    const stat = await lstat(path.join(bundle, name));
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new ActionRequiredError(
        'official_skill_bundle_unsafe',
        'The application-owned official Skill bundle contains unsafe metadata.',
      );
    }
  }
  await validateOfficialSkillStore(path.join(bundle, 'skills'));
}

async function runRequired(runner, command, args, options, code, message) {
  const result = await runner(command, args, options);
  if (result.code !== 0) throw new ActionRequiredError(code, message);
  return result;
}

export async function preparePinnedOfficialSkills({
  cli,
  appDir,
  homeDir,
  env,
  runner,
}) {
  const stagingRoot = await mkdtemp(path.join(appDir, '.official-skills-stage-'));
  const source = path.join(stagingRoot, 'source');
  const stagingHome = path.join(stagingRoot, 'home');
  const stagedStore = path.join(stagingHome, '.agents', 'skills');
  const bundle = officialSkillBundleRoot(appDir);
  let created = false;
  const stageEnv = isolatedSkillEnvironment(env, { homeDir: stagingHome, appDir });
  try {
    await ensurePrivateDirectory(stagingHome, { trustedRoot: stagingRoot });
    if (await entryExists(bundle)) {
      await validateOfficialBundle(bundle);
      const sourceRecord = await readJsonIfPresent(path.join(bundle, 'SOURCE.json'));
      if (sourceRecord?.commit !== HYPERFRAMES_SKILLS_COMMIT
        || sourceRecord?.hyperframes_version !== HYPERFRAMES_VERSION
        || sourceRecord?.skills_cli_version !== SKILLS_CLI_VERSION) {
        throw new ActionRequiredError(
          'official_skill_bundle_changed',
          'The existing application-owned official Skill bundle has unexpected provenance.',
        );
      }
      const cachedCheck = await runOfficialJson(
        cli,
        ['skills', 'check', '--dir', path.join(bundle, 'skills'), '--source', bundle, '--json'],
        { env: stageEnv, runner, label: 'hyperframes_skills_check' },
      );
      const cachedSkills = normalizeSkillsCheck(cachedCheck.payload, cachedCheck.result.code);
      if (cachedSkills.status !== 'ok') {
        throw new ActionRequiredError(
          'official_skill_bundle_changed',
          'The existing application-owned official Skill bundle failed verification.',
        );
      }
      return {
        bundle,
        bundle_created: false,
        skills: cachedSkills,
        sources: HYPERFRAMES_SKILL_NAMES.map((name) => ({
          name,
          source: path.join(bundle, 'skills', name),
        })),
      };
    }
    await runRequired(
      runner,
      'git',
      ['init', '--quiet', source],
      { env: stageEnv, timeout: 30_000 },
      'hyperframes_skills_source_failed',
      'Could not initialize the isolated official HyperFrames Skill source.',
    );
    await runRequired(
      runner,
      'git',
      ['-C', source, 'remote', 'add', 'origin', HYPERFRAMES_REPOSITORY],
      { env: stageEnv, timeout: 30_000 },
      'hyperframes_skills_source_failed',
      'Could not bind the official HyperFrames Skill source.',
    );
    await runRequired(
      runner,
      'git',
      ['-C', source, 'sparse-checkout', 'init', '--cone'],
      { env: stageEnv, timeout: 30_000 },
      'hyperframes_skills_source_failed',
      'Could not initialize the isolated sparse checkout.',
    );
    await runRequired(
      runner,
      'git',
      ['-C', source, 'sparse-checkout', 'set', 'skills'],
      { env: stageEnv, timeout: 30_000 },
      'hyperframes_skills_source_failed',
      'Could not scope the isolated checkout to official Skills.',
    );
    let fetched = false;
    for (let attempt = 1; attempt <= 3 && !fetched; attempt += 1) {
      const result = await runner(
        'git',
        ['-C', source, 'fetch', '--depth', '1', 'origin', HYPERFRAMES_SKILLS_COMMIT],
        {
          env: {
            ...stageEnv,
            GIT_TERMINAL_PROMPT: '0',
            GIT_LFS_SKIP_SMUDGE: '1',
            GIT_HTTP_LOW_SPEED_LIMIT: '1024',
            GIT_HTTP_LOW_SPEED_TIME: '60',
          },
          timeout: 5 * 60_000,
        },
      );
      fetched = result.code === 0;
    }
    if (!fetched) {
      throw new ActionRequiredError(
        'hyperframes_skills_source_failed',
        'Could not fetch the pinned official HyperFrames Skill commit after three bounded attempts.',
      );
    }
    await runRequired(
      runner,
      'git',
      ['-C', source, 'checkout', '--detach', 'FETCH_HEAD'],
      { env: stageEnv, timeout: 60_000 },
      'hyperframes_skills_source_failed',
      'Could not check out the pinned official HyperFrames Skill commit.',
    );
    const revision = await runRequired(
      runner,
      'git',
      ['-C', source, 'rev-parse', 'HEAD'],
      { env: stageEnv, timeout: 30_000 },
      'hyperframes_skills_source_failed',
      'Could not verify the pinned official HyperFrames Skill commit.',
    );
    if (revision.stdout.trim() !== HYPERFRAMES_SKILLS_COMMIT) {
      throw new ActionRequiredError(
        'hyperframes_skills_commit_mismatch',
        'The official HyperFrames Skill checkout does not match the pinned commit.',
      );
    }
    const skillArguments = HYPERFRAMES_SKILL_NAMES.flatMap((name) => ['--skill', name]);
    await runRequired(
      runner,
      process.execPath,
      [
        skillsCliPath(appDir),
        'add',
        source,
        ...skillArguments,
        '--global',
        '--agent',
        'universal',
        '--copy',
        '--full-depth',
        '--yes',
      ],
      { env: stageEnv, timeout: 3 * 60_000, maxBuffer: 4 * 1024 * 1024 },
      'hyperframes_skills_stage_failed',
      'Could not install official HyperFrames Skills inside the isolated staging home.',
    );
    await validateOfficialSkillStore(stagedStore);
    const stagedCheck = await runOfficialJson(
      cli,
      ['skills', 'check', '--dir', stagedStore, '--source', source, '--json'],
      { env: stageEnv, runner, label: 'hyperframes_skills_check' },
    );
    const normalizedCheck = normalizeSkillsCheck(stagedCheck.payload, stagedCheck.result.code);
    if (normalizedCheck.status !== 'ok') {
      throw new ActionRequiredError(
        'hyperframes_skills_stale',
        'The isolated official HyperFrames Skill set failed its pinned-source check.',
      );
    }

    if (await entryExists(bundle)) {
      await validateOfficialBundle(bundle);
      const sourceRecord = await readJsonIfPresent(path.join(bundle, 'SOURCE.json'));
      if (sourceRecord?.commit !== HYPERFRAMES_SKILLS_COMMIT
        || sourceRecord?.hyperframes_version !== HYPERFRAMES_VERSION
        || sourceRecord?.skills_cli_version !== SKILLS_CLI_VERSION) {
        throw new ActionRequiredError(
          'official_skill_bundle_changed',
          'The existing application-owned official Skill bundle has unexpected provenance.',
        );
      }
      const existingCheck = await runOfficialJson(
        cli,
        ['skills', 'check', '--dir', path.join(bundle, 'skills'), '--source', source, '--json'],
        { env: stageEnv, runner, label: 'hyperframes_skills_check' },
      );
      if (normalizeSkillsCheck(existingCheck.payload, existingCheck.result.code).status !== 'ok') {
        throw new ActionRequiredError(
          'official_skill_bundle_changed',
          'The existing application-owned official Skill bundle failed verification.',
        );
      }
    } else {
      const pending = path.join(stagingRoot, 'bundle');
      await ensurePrivateDirectory(pending, { trustedRoot: stagingRoot });
      await rename(stagedStore, path.join(pending, 'skills'));
      await cp(
        path.join(source, 'skills-manifest.json'),
        path.join(pending, 'skills-manifest.json'),
      );
      await atomicWriteJson(
        path.join(pending, 'SOURCE.json'),
        {
          schema_version: 1,
          repository: HYPERFRAMES_REPOSITORY,
          commit: HYPERFRAMES_SKILLS_COMMIT,
          hyperframes_version: HYPERFRAMES_VERSION,
          skills_cli_version: SKILLS_CLI_VERSION,
          skills: HYPERFRAMES_SKILL_NAMES,
        },
        { trustedRoot: stagingRoot },
      );
      await ensurePrivateDirectory(path.dirname(bundle), { trustedRoot: appDir });
      await rename(pending, bundle);
      created = true;
    }
    return {
      bundle,
      bundle_created: created,
      skills: normalizedCheck,
      sources: HYPERFRAMES_SKILL_NAMES.map((name) => ({
        name,
        source: path.join(bundle, 'skills', name),
      })),
    };
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

async function prepareOfficialHyperFrames({ cli, appDir, homeDir, env, runner }) {
  const childEnv = sanitizedChildEnv(env);
  let pinned;
  try {
    pinned = await preparePinnedOfficialSkills({
      cli,
      appDir,
      homeDir,
      env,
      runner,
    });
    const browser = await runner(process.execPath, [cli, 'browser', 'ensure'], {
      env: childEnv,
      timeout: 10 * 60_000,
    });
    if (browser.code !== 0) {
      throw new ActionRequiredError(
        'hyperframes_browser_unavailable',
        'Official HyperFrames browser ensure did not succeed.',
      );
    }
    const doctor = await runOfficialJson(cli, ['doctor', '--json'], {
      env,
      runner,
      label: 'hyperframes_doctor',
    });
    return {
      ...pinned,
      doctor: normalizeOfficialDoctor(doctor.payload),
    };
  } catch (error) {
    throw error;
  }
}

function ffmpegMissing(doctor) {
  return doctor.required.some(
    (entry) => ['ffmpeg', 'ffprobe'].includes(entry.id) && entry.status !== 'ok',
  );
}

async function maybeInstallFfmpeg({
  doctor,
  interactive,
  approveHomebrewFfmpeg,
  confirmer,
  env,
  runner,
}) {
  const childEnv = sanitizedChildEnv(env);
  if (!ffmpegMissing(doctor)) return false;
  const brew = await runner('brew', ['--version'], { env: childEnv, timeout: 20_000 });
  if (brew.code !== 0) {
    throw new ActionRequiredError(
      'ffmpeg_missing_no_homebrew',
      'FFmpeg/FFprobe are missing and Homebrew is not available. Install them before production.',
    );
  }
  let approved = approveHomebrewFfmpeg;
  if (!approved && interactive) {
    approved = await confirmer('FFmpeg/FFprobe 缺失。是否允许 Homebrew 安装 ffmpeg？');
  }
  if (!approved) {
    throw new ActionRequiredError(
      'ffmpeg_install_needs_approval',
      'FFmpeg/FFprobe installation requires one-time Homebrew approval.',
    );
  }
  const result = await runner('brew', ['install', 'ffmpeg'], {
    env: childEnv,
    timeout: 20 * 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.code !== 0) {
    throw new ActionRequiredError(
      'ffmpeg_install_failed',
      'Homebrew could not install FFmpeg.',
    );
  }
  return true;
}

export async function runInstall({
  repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  homeDir = os.homedir(),
  env = process.env,
  platform = process.platform,
  appDir = applicationDataDir({ env, homeDir, platform }),
  runner = runFile,
  interactive = false,
  approveOccupied = false,
  approveHomebrewFfmpeg = false,
  confirmer = askYes,
  npmCli = null,
} = {}) {
  if (platform !== 'darwin') {
    throw new ActionRequiredError(
      'platform_unverified',
      'This stable release supports installation only on macOS.',
    );
  }
  if (!isSupportedNodeVersion()) {
    throw new ActionRequiredError(
      'node_version_unsupported',
      'Node.js 22.20.0 or newer is required.',
    );
  }
  const childEnv = sanitizedChildEnv(env);
  await ensurePrivateDirectory(appDir, { trustedRoot: homeDir });
  const manifestFile = path.join(appDir, 'install-manifest.json');
  const previousManifest = await readJsonIfPresent(manifestFile);
  if (previousManifest) {
    const previous = validateInstallManifest(previousManifest, {
      repoRoot: previousManifest.repo_root,
      appDir,
      homeDir,
    });
    await assertInstallManifestFilesystem(previous.records, { appDir, homeDir });
  }
  const cli = await installPinnedHyperFrames({
    repoRoot,
    appDir,
    env: childEnv,
    runner,
    npmCli,
  });
  let official;
  try {
    official = await prepareOfficialHyperFrames({
      cli,
      appDir,
      homeDir,
      env: childEnv,
      runner,
    });
    const installedFfmpeg = await maybeInstallFfmpeg({
      doctor: official.doctor,
      interactive,
      approveHomebrewFfmpeg,
      confirmer,
      env: childEnv,
      runner,
    });
    if (installedFfmpeg) {
      const rerun = await runOfficialJson(cli, ['doctor', '--json'], {
        env: childEnv,
        runner,
        label: 'hyperframes_doctor',
      });
      official = { ...official, doctor: normalizeOfficialDoctor(rerun.payload) };
    }
    if (!official.doctor.selected_local_render_ready) {
      const missing = official.doctor.required
        .filter((entry) => entry.status !== 'ok')
        .map((entry) => entry.id)
        .join(', ');
      throw new ActionRequiredError(
        'hyperframes_doctor_action_required',
        `Official HyperFrames doctor reports required local-render facts needing action: ${missing}.`,
      );
    }

    const canonicalRepoRoot = await realpath(repoRoot);
    let manifest;
    const links = await installSkillLinks({
      repoRoot,
      appDir,
      homeDir,
      approveOccupied,
      interactive,
      confirmer,
      previousManifest,
      additionalSources: official.sources,
      finalize: async (records) => {
        manifest = {
          schema_version: 4,
          product_version: RELEASE_VERSION,
          installed_at: new Date().toISOString(),
          repo_root: canonicalRepoRoot,
          records: records.map((entry) => ({
            host: entry.host,
            name: entry.name,
            source: entry.source,
            target: entry.target,
            backup: entry.backup,
            action: entry.action,
          })),
        };
        const validated = validateInstallManifest(manifest, {
          repoRoot: canonicalRepoRoot,
          appDir,
          homeDir,
        });
        await assertInstallManifestFilesystem(validated.records, { appDir, homeDir });
        await atomicWriteJson(manifestFile, manifest, { trustedRoot: appDir });
      },
    });
    return {
      status: 'installed',
      authority: 'environment-setup-only-no-creative-or-quality-approval',
      product_version: RELEASE_VERSION,
      hyperframes_version: HYPERFRAMES_VERSION,
      official_skills_commit: HYPERFRAMES_SKILLS_COMMIT,
      official_skills: official.skills.status,
      official_doctor_top_level_ok: official.doctor.top_level_ok,
      official_doctor_selected_local_render_ready:
        official.doctor.selected_local_render_ready,
      official_skill_links: HYPERFRAMES_SKILL_NAMES.length * 2,
      custom_skill_links: SKILL_NAMES.length * 2,
      total_skill_links: links.length,
      backed_up: links.filter((entry) => entry.backup).length,
    };
  } catch (error) {
    throw error;
  }
}

async function main(argv) {
  const allowed = new Set(['--interactive', '--yes', '--yes-homebrew-ffmpeg', '--json']);
  if (argv.some((arg) => !allowed.has(arg))) {
    throw new ActionRequiredError(
      'usage',
      'Usage: install.mjs [--interactive] [--yes] [--yes-homebrew-ffmpeg] [--json]',
    );
  }
  const report = await runInstall({
    interactive: argv.includes('--interactive'),
    approveOccupied: argv.includes('--yes'),
    approveHomebrewFfmpeg: argv.includes('--yes-homebrew-ffmpeg'),
  });
  process.stdout.write(argv.includes('--json')
    ? `${JSON.stringify(report)}\n`
    : [
      `Installed erduo-broll-loop-engineering ${report.product_version}.`,
      `HyperFrames ${report.hyperframes_version}: official Skills ${report.official_skills}.`,
      `Official doctor selected local render: ${report.official_doctor_selected_local_render_ready}.`,
      `Skill links: ${report.total_skill_links} total (${report.official_skill_links} official, ${report.custom_skill_links} project); backups: ${report.backed_up}.`,
      'Installer authority: environment setup only; no creative, aesthetic, or quality approval.',
      '',
    ].join('\n'));
}

const isMain = process.argv[1]
  && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${JSON.stringify(publicError(error, { homeDir: os.homedir() }))}\n`);
    process.exitCode = error?.code === 'usage' ? 64 : 2;
  }
}
