#!/usr/bin/env node

import {
  lstat,
  readlink,
  realpath,
  rename,
  symlink,
  unlink,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  ActionRequiredError,
  HYPERFRAMES_VERSION,
  RELEASE_VERSION,
  SKILL_NAMES,
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

async function validateSources(repoRoot) {
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
} = {}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(timestamp)) {
    throw new ActionRequiredError('unsafe_backup_name', 'Backup identifier is invalid.');
  }
  await ensurePrivateDirectory(appDir, { trustedRoot: homeDir });
  const sources = await validateSources(repoRoot);
  const targets = await scanTargets({ sources, homeDir });
  let previousByTarget = new Map();
  if (previousManifest) {
    previousByTarget = validateInstallManifest(previousManifest, {
      repoRoot: previousManifest.repo_root,
      appDir,
      homeDir,
    }).byTarget;
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

async function npmCliPath() {
  const candidates = [
    process.env.npm_execpath,
    path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new ActionRequiredError(
    'npm_unavailable',
    'The selected Node.js runtime does not include npm.',
  );
}

function hasOnlyPinnedHyperFramesDependency(value) {
  const dependencies = value?.dependencies;
  if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)
    || Object.keys(dependencies).length !== 1
    || dependencies.hyperframes !== HYPERFRAMES_VERSION) {
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
  const invalidPackages = packageEntries
    .filter(([name, value]) => !isLockPackagePath(name) || !isPinnedRegistryPackage(value))
    .map(([name]) => name);
  if (!hasOnlyPinnedHyperFramesDependency(packageJson)
    || packageLock?.lockfileVersion !== 3
    || !packages
    || !hasOnlyPinnedHyperFramesDependency(packages[''])
    || packageLock.dependencies !== undefined
    || locked?.version !== HYPERFRAMES_VERSION
    || packageEntries.length === 0
    || invalidPackages.length) {
    throw new ActionRequiredError(
      'runtime_lock_invalid',
      'Bundled HyperFrames runtime lock must contain only the pinned root dependency and integrity-locked npm registry packages.',
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
    '--prefix',
    runtime,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ], {
    env: { ...childEnv, npm_config_cache: npmCache },
    timeout: 10 * 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const installedPackage = await readJsonIfPresent(
    path.join(runtime, 'node_modules', 'hyperframes', 'package.json'),
  );
  if (result.code !== 0
    || installedPackage?.version !== HYPERFRAMES_VERSION
    || !await pathExists(hyperframesCliPath(appDir))) {
    throw new ActionRequiredError(
      'hyperframes_install_failed',
      `Could not install hyperframes@${HYPERFRAMES_VERSION} in the user application directory.`,
    );
  }
  return hyperframesCliPath(appDir);
}

async function runOfficialJson(cli, args, { env, runner, label, timeout = 180_000 }) {
  const result = await runner(process.execPath, [cli, ...args], {
    env: sanitizedChildEnv(env),
    timeout,
  });
  const payload = parseJsonPayload(result.stdout, label);
  return { result, payload };
}

async function prepareOfficialHyperFrames({ cli, env, runner }) {
  const childEnv = sanitizedChildEnv(env);
  const update = await runner(process.execPath, [cli, 'skills', 'update'], {
    env: childEnv,
    timeout: 5 * 60_000,
  });
  if (update.code !== 0) {
    throw new ActionRequiredError(
      'hyperframes_skills_update_failed',
      'Official HyperFrames Skills update did not succeed.',
    );
  }
  const check = await runOfficialJson(cli, ['skills', 'check', '--json'], {
    env,
    runner,
    label: 'hyperframes_skills_check',
  });
  const normalizedCheck = normalizeSkillsCheck(check.payload, check.result.code);
  if (normalizedCheck.status !== 'ok') {
    throw new ActionRequiredError(
      'hyperframes_skills_stale',
      'Official HyperFrames Skills check requires action after update.',
    );
  }
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
    skills: normalizedCheck,
    doctor: normalizeOfficialDoctor(doctor.payload),
  };
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
      'This release candidate is verified only for macOS.',
    );
  }
  if (Number(process.versions.node.split('.')[0]) < 22) {
    throw new ActionRequiredError('node_version_unsupported', 'Node.js 22 or newer is required.');
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
  let official = await prepareOfficialHyperFrames({ cli, env: childEnv, runner });
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
    finalize: async (records) => {
      manifest = {
        schema_version: 1,
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
    official_skills: official.skills.status,
    official_doctor_top_level_ok: official.doctor.top_level_ok,
    official_doctor_selected_local_render_ready:
      official.doctor.selected_local_render_ready,
    custom_skill_links: links.length,
    backed_up: links.filter((entry) => entry.backup).length,
  };
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
      `Installed erduo-hyperframes-broll ${report.product_version}.`,
      `HyperFrames ${report.hyperframes_version}: official Skills ${report.official_skills}.`,
      `Official doctor selected local render: ${report.official_doctor_selected_local_render_ready}.`,
      `Custom Skill links: ${report.custom_skill_links}; backups: ${report.backed_up}.`,
      'Installer authority: environment setup only; no creative, aesthetic, or quality approval.',
      '',
    ].join('\n'));
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${JSON.stringify(publicError(error, { homeDir: os.homedir() }))}\n`);
    process.exitCode = error?.code === 'usage' ? 64 : 2;
  }
}
