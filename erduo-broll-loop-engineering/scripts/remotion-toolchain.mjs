#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  access,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSafeSpawn, sanitizedEnvironment } from './safe-spawn.mjs';

export const HEAVY_SLOT_COUNT = 2;
const EXACT_SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u;
const LOCK_GRACE_MS = 10_000;
const POLL_MS = 100;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function readJson(file, label = path.basename(file)) {
  let value;
  try {
    value = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    const wrapped = new Error(`${label} is not readable JSON: ${error.message}`);
    wrapped.code = error?.code;
    throw wrapped;
  }
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object`);
  return value;
}

function dependenciesFromPackage(packageJson) {
  const runtime = isRecord(packageJson.dependencies) ? packageJson.dependencies : {};
  const development = isRecord(packageJson.devDependencies) ? packageJson.devDependencies : {};
  const dependencies = { ...runtime };
  for (const [name, version] of Object.entries(development)) {
    if (dependencies[name] !== undefined && dependencies[name] !== version) {
      throw new Error(`Dependency ${name} differs between dependencies and devDependencies`);
    }
    dependencies[name] = version;
  }
  for (const [name, version] of Object.entries(dependencies)) {
    if (typeof version !== 'string' || !EXACT_SEMVER.test(version)) {
      throw new Error(`Dependency ${name} must use an exact semver`);
    }
  }
  return { runtime, development, dependencies };
}

function validateLock(packageJson, lock) {
  if (lock.lockfileVersion !== 3 || !isRecord(lock.packages)) {
    throw new Error('package-lock.json must use lockfileVersion 3 with a packages object');
  }
  const { runtime, development, dependencies } = dependenciesFromPackage(packageJson);
  const root = lock.packages[''];
  if (!isRecord(root)) throw new Error('package-lock.json is missing its root package record');
  const lockedRoot = {
    ...(isRecord(root.dependencies) ? root.dependencies : {}),
    ...(isRecord(root.devDependencies) ? root.devDependencies : {}),
  };
  for (const [name, version] of Object.entries(dependencies)) {
    if (lockedRoot[name] !== version) throw new Error(`Lock root mismatch for ${name}`);
    const record = lock.packages[`node_modules/${name}`];
    if (!isRecord(record) || record.version !== version) {
      throw new Error(`Locked package mismatch for ${name}`);
    }
  }
  return { runtime, development, dependencies };
}

export function computeDependencyIdentity(packageJson, lock, {
  platform = process.platform,
  arch = process.arch,
  nodeMajor = process.versions.node.split('.')[0],
} = {}) {
  const { runtime, development } = validateLock(packageJson, lock);
  const lockPackages = Object.fromEntries(
    Object.entries(lock.packages).filter(([name]) => name !== ''),
  );
  return sha256(JSON.stringify(stable({
    schemaVersion: '1.0.0',
    platform,
    arch,
    nodeMajor,
    dependencies: runtime,
    devDependencies: development,
    lockfileVersion: lock.lockfileVersion,
    lockPackages,
    legacyDependencies: isRecord(lock.dependencies) ? lock.dependencies : {},
  })));
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function atomicWriteJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, file);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function lockIsStale(lockPath) {
  let info;
  try {
    info = await stat(lockPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
  if (Date.now() - info.mtimeMs < LOCK_GRACE_MS) return false;
  try {
    const owner = await readJson(path.join(lockPath, 'owner.json'), 'lock owner');
    return !processIsAlive(owner.pid);
  } catch {
    return true;
  }
}

async function acquireDirectoryLock(parent, name, { pollMs = POLL_MS } = {}) {
  await mkdir(parent, { recursive: true });
  const lockPath = path.join(parent, name);
  while (true) {
    try {
      await mkdir(lockPath);
      await writeFile(path.join(lockPath, 'owner.json'), `${JSON.stringify({ pid: process.pid })}\n`);
      return async () => rm(lockPath, { recursive: true, force: true });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (await lockIsStale(lockPath)) {
        await rm(lockPath, { recursive: true, force: true });
        continue;
      }
      await delay(pollMs);
    }
  }
}

export async function withHeavySlot(productionRoot, operation, { pollMs = POLL_MS } = {}) {
  const slotsRoot = path.join(path.resolve(productionRoot), '.remotion-heavy-slots');
  await mkdir(slotsRoot, { recursive: true });
  while (true) {
    for (let slot = 1; slot <= HEAVY_SLOT_COUNT; slot += 1) {
      const lockPath = path.join(slotsRoot, `slot-${slot}`);
      let acquired = false;
      try {
        await mkdir(lockPath);
        acquired = true;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        if (await lockIsStale(lockPath)) await rm(lockPath, { recursive: true, force: true });
      }
      if (!acquired) continue;
      try {
        await writeFile(path.join(lockPath, 'owner.json'), `${JSON.stringify({ pid: process.pid })}\n`);
        return await operation(slot);
      } finally {
        await rm(lockPath, { recursive: true, force: true });
      }
    }
    await delay(pollMs);
  }
}

async function validateInstalledDirectDependencies(toolchain, dependencies) {
  const modules = path.join(toolchain, 'node_modules');
  await access(modules, constants.R_OK);
  for (const [name, expected] of Object.entries(dependencies)) {
    const installed = await readJson(
      path.join(modules, ...name.split('/'), 'package.json'),
      `installed ${name}`,
    );
    if (installed.version !== expected) {
      throw new Error(`Installed ${name} version ${installed.version ?? 'missing'} does not match ${expected}`);
    }
  }
}

function npmEnvironment(cacheDirectory) {
  const env = sanitizedEnvironment(process.env);
  for (const name of Object.keys(env)) {
    if (name.toLowerCase() === 'npm_config_cache') delete env[name];
  }
  env.npm_config_cache = cacheDirectory;
  return env;
}

function defaultInstall({ cwd, cacheDirectory }) {
  const status = runSafeSpawn(['--', 'npm', 'ci', '--no-audit', '--no-fund'], {
    cwd,
    env: npmEnvironment(cacheDirectory),
  });
  if (status !== 0) throw new Error(`npm ci failed with exit code ${status}`);
}

async function ensureSharedLink(project, sharedModules) {
  const link = path.join(project, 'node_modules');
  const expected = await realpath(sharedModules);
  try {
    const info = await lstat(link);
    if (!info.isSymbolicLink()) {
      throw new Error('project/node_modules already exists as a private dependency copy');
    }
    if (await realpath(link) !== expected) {
      throw new Error('project/node_modules points to a different shared toolchain');
    }
    return;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const target = process.platform === 'win32' ? expected : path.relative(project, expected);
  await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
}

export async function prepareSharedToolchain({
  project,
  productionRoot,
  receiptPath,
  install = defaultInstall,
  platform = process.platform,
  arch = process.arch,
  nodeMajor = process.versions.node.split('.')[0],
} = {}) {
  if (!project || !productionRoot || !receiptPath) {
    throw new Error('project, productionRoot, and receiptPath are required');
  }
  const resolvedProduction = path.resolve(productionRoot);
  const resolvedProject = path.resolve(project);
  const resolvedReceipt = path.resolve(receiptPath);
  const receiptRelative = path.relative(resolvedProduction, resolvedReceipt);
  if (receiptRelative === '..' || receiptRelative.startsWith(`..${path.sep}`) || path.isAbsolute(receiptRelative)) {
    throw new Error('project and receipt must stay inside the production root');
  }
  await mkdir(resolvedProduction, { recursive: true });
  const productionReal = await realpath(resolvedProduction);
  const projectReal = await realpath(resolvedProject);
  const receiptReal = path.resolve(productionReal, receiptRelative);
  if (!isInside(productionReal, projectReal)) {
    throw new Error('project and receipt must stay inside the production root');
  }

  const packageFile = path.join(projectReal, 'package.json');
  const lockFile = path.join(projectReal, 'package-lock.json');
  const packageText = await readFile(packageFile, 'utf8');
  const lockText = await readFile(lockFile, 'utf8');
  const packageJson = JSON.parse(packageText);
  const lock = JSON.parse(lockText);
  const { dependencies } = validateLock(packageJson, lock);
  const identity = computeDependencyIdentity(packageJson, lock, { platform, arch, nodeMajor });
  const toolchainsRoot = path.join(productionReal, '.remotion-toolchains');
  const toolchain = path.join(toolchainsRoot, identity);
  const cacheDirectory = path.join(productionReal, '.npm-cache');
  const prepareLocks = path.join(toolchainsRoot, '.prepare-locks');
  await mkdir(toolchainsRoot, { recursive: true });

  let reused = false;
  const release = await acquireDirectoryLock(prepareLocks, identity);
  try {
    try {
      const existing = await readJson(path.join(toolchain, 'receipt.json'), 'toolchain receipt');
      if (existing.dependencyIdentity !== identity) throw new Error('shared toolchain receipt identity changed');
      await validateInstalledDirectDependencies(toolchain, dependencies);
      reused = true;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const temporary = await mkdtemp(path.join(toolchainsRoot, `.tmp-${identity}-`));
      try {
        await copyFile(packageFile, path.join(temporary, 'package.json'));
        await copyFile(lockFile, path.join(temporary, 'package-lock.json'));
        await mkdir(cacheDirectory, { recursive: true });
        await withHeavySlot(productionReal, () => install({ cwd: temporary, cacheDirectory }));
        await validateInstalledDirectDependencies(temporary, dependencies);
        await atomicWriteJson(path.join(temporary, 'receipt.json'), {
          schemaVersion: '1.0.0',
          dependencyIdentity: identity,
          platform,
          arch,
          nodeMajor,
          packageSha256: sha256(packageText),
          packageLockSha256: sha256(lockText),
          directDependencies: stable(dependencies),
          heavyGateLimit: HEAVY_SLOT_COUNT,
        });
        await rename(temporary, toolchain);
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    }
  } finally {
    await release();
  }

  const sharedModules = path.join(toolchain, 'node_modules');
  await ensureSharedLink(projectReal, sharedModules);
  const unitReceipt = {
    schemaVersion: '1.0.0',
    dependencyIdentity: identity,
    platform,
    arch,
    nodeMajor,
    packageSha256: sha256(packageText),
    packageLockSha256: sha256(lockText),
    toolchain: path.relative(productionReal, toolchain),
    nodeModules: path.relative(productionReal, sharedModules),
    heavyGateLimit: HEAVY_SLOT_COUNT,
  };
  await atomicWriteJson(receiptReal, unitReceipt);
  return { status: 'ready', reused, ...unitReceipt };
}

export async function runHeavyCommand({ productionRoot, cwd, command, spawn = spawnSync } = {}) {
  if (!productionRoot || !cwd || !Array.isArray(command) || command.length === 0) {
    throw new Error('productionRoot, cwd, and a command are required');
  }
  return withHeavySlot(productionRoot, () => {
    const status = runSafeSpawn(['--', ...command], { cwd, spawn });
    if (status !== 0) throw new Error(`heavy command failed with exit code ${status}`);
    return status;
  });
}

function parseOptions(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (!name.startsWith('--') || name === '--') throw new Error(`Unexpected argument: ${name}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    values[name.slice(2)] = value;
    index += 1;
  }
  return values;
}

function usage() {
  return `Usage:
  node scripts/remotion-toolchain.mjs prepare --project <dir> --production-root <dir> --receipt <json>
  node scripts/remotion-toolchain.mjs run-heavy --production-root <dir> --cwd <dir> -- <executable> [args...]`;
}

async function main(argv) {
  const [action, ...rest] = argv;
  if (action === 'prepare') {
    const options = parseOptions(rest);
    const result = await prepareSharedToolchain({
      project: options.project,
      productionRoot: options['production-root'],
      receiptPath: options.receipt,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (action === 'run-heavy') {
    const divider = rest.indexOf('--');
    if (divider < 0) throw new Error(usage());
    const options = parseOptions(rest.slice(0, divider));
    await runHeavyCommand({
      productionRoot: options['production-root'],
      cwd: options.cwd,
      command: rest.slice(divider + 1),
    });
    process.stdout.write(`${JSON.stringify({ status: 'passed', heavyGateLimit: HEAVY_SLOT_COUNT })}\n`);
    return;
  }
  throw new Error(usage());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`remotion-toolchain: ${error.message}\n`);
    process.exitCode = 1;
  });
}
