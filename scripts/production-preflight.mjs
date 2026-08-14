#!/usr/bin/env node

import { constants as fsConstants, realpathSync } from 'node:fs';
import { access, lstat, readFile, realpath, statfs } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ActionRequiredError,
  HYPERFRAMES_SKILLS_COMMIT,
  HYPERFRAMES_VERSION,
  INSTALL_SKILL_NAMES,
  RELEASE_VERSION,
  applicationDataDir,
  environmentReadinessFile,
  installManifestIdentity,
  publicError,
  readJsonIfPresent,
  stableHostId,
} from './lib.mjs';
import { computeDependencyIdentity } from '../erduo-broll-loop-engineering/scripts/remotion-toolchain.mjs';

const RUNTIMES = new Set(['hyperframes', 'remotion']);
const MIN_FREE_BYTES = 512 * 1024 * 1024;

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function regularReadable(file) {
  try {
    const metadata = await lstat(file);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return false;
    await access(file, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function nearestExistingDirectory(target) {
  let current = path.dirname(path.resolve(target));
  while (true) {
    try {
      const metadata = await lstat(current);
      if (metadata.isDirectory() && !metadata.isSymbolicLink()) return current;
      return null;
    } catch (error) {
      if (error?.code !== 'ENOENT') return null;
      const parent = path.dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }
}

async function installReceiptIssues(manifest) {
  if (!manifest || manifest.schema_version !== 5
    || manifest.product_version !== RELEASE_VERSION
    || !Array.isArray(manifest.records)
    || manifest.records.length !== INSTALL_SKILL_NAMES.length * 2) {
    return ['install-receipt-incomplete'];
  }
  const pairs = new Set();
  for (const record of manifest.records) {
    if (typeof record?.source !== 'string' || typeof record?.target !== 'string'
      || !path.isAbsolute(record.source) || !path.isAbsolute(record.target)) {
      return ['install-receipt-invalid'];
    }
    const pair = `${record.host}\0${record.name}`;
    if (pairs.has(pair)) return ['install-receipt-invalid'];
    pairs.add(pair);
    try {
      const metadata = await lstat(record.target);
      if (!metadata.isSymbolicLink()
        || await realpath(record.target) !== await realpath(record.source)) {
        return ['installed-skill-link-changed'];
      }
    } catch {
      return ['installed-skill-link-changed'];
    }
  }
  return [];
}

function cacheIssues(cache, { platform, arch, hostname, nodeVersion, runtime, manifestIdentity }) {
  if (!cache) return ['readiness-cache-missing'];
  const nodeMajor = Number(String(nodeVersion).split('.')[0]);
  const expected = {
    schema_version: 1,
    product_version: RELEASE_VERSION,
    host_id: stableHostId({ hostname, platform, arch }),
    platform,
    arch,
    node_major: nodeMajor,
  };
  const issues = [];
  for (const [key, value] of Object.entries(expected)) {
    if (cache[key] !== value) issues.push(`cache-${key.replaceAll('_', '-')}-changed`);
  }
  if (nodeMajor < 22) issues.push('node-version-unsupported');
  if (cache.install?.expected_skill_links !== INSTALL_SKILL_NAMES.length * 2
    || cache.install?.ready_skill_links !== cache.install?.expected_skill_links) {
    issues.push('installed-skill-set-changed');
  }
  if (!manifestIdentity || cache.install?.manifest_identity !== manifestIdentity) {
    issues.push('install-manifest-changed');
  }
  if (cache.hyperframes?.expected_version !== HYPERFRAMES_VERSION
    || cache.hyperframes?.official_skills_commit !== HYPERFRAMES_SKILLS_COMMIT) {
    issues.push('pinned-hyperframes-identity-changed');
  }
  if (runtime === 'hyperframes' && !cache.ready_backends?.includes(runtime)) {
    issues.push(`backend-${runtime}-not-cached-ready`);
  }
  return [...new Set(issues)];
}

function parseSrtTimestamp(value) {
  const match = /^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})$/u.exec(value);
  if (!match) return null;
  const [, hours, minutes, seconds, milliseconds] = match.map(Number);
  if (minutes > 59 || seconds > 59) return null;
  return (((hours * 60) + minutes) * 60 + seconds) * 1000 + milliseconds;
}

async function validateSrt(file) {
  if (!await regularReadable(file)) return 'srt-unreadable';
  let text;
  try {
    const metadata = await lstat(file);
    if (metadata.size > 8 * 1024 * 1024) return 'srt-too-large';
    text = await readFile(file, 'utf8');
  } catch {
    return 'srt-unreadable';
  }
  const windows = [];
  for (const line of text.replaceAll('\r\n', '\n').split('\n')) {
    if (!line.includes('-->')) continue;
    const match = /^\s*(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/u.exec(line);
    if (!match) return 'srt-timing-invalid';
    const startMs = parseSrtTimestamp(match[1]);
    const endMs = parseSrtTimestamp(match[2]);
    if (startMs === null || endMs === null || endMs <= startMs) return 'srt-timing-invalid';
    windows.push({ startMs, endMs });
  }
  if (windows.length === 0) return 'srt-timing-missing';
  for (let index = 1; index < windows.length; index += 1) {
    if (windows[index].startMs < windows[index - 1].endMs) return 'srt-timing-overlap';
  }
  return null;
}

function exactVersion(value) {
  return typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value)
    ? value : null;
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function remotionProjectReadiness(projectRoot, { platform, arch, nodeVersion }) {
  let project;
  try {
    project = await realpath(path.resolve(projectRoot));
  } catch {
    return { issue: 'remotion-project-unavailable' };
  }
  const [pkg, lock, installedCore, installedCli] = await Promise.all([
    readJson(path.join(project, 'package.json')),
    readJson(path.join(project, 'package-lock.json')),
    readJson(path.join(project, 'node_modules', 'remotion', 'package.json')),
    readJson(path.join(project, 'node_modules', '@remotion', 'cli', 'package.json')),
  ]);
  const declared = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const coreVersion = exactVersion(declared.remotion);
  const cliVersion = exactVersion(declared['@remotion/cli']);
  if (!coreVersion || coreVersion !== cliVersion) return { issue: 'remotion-exact-declarations-missing' };
  if (lock?.lockfileVersion !== 3
    || lock?.packages?.['node_modules/remotion']?.version !== coreVersion
    || lock?.packages?.['node_modules/@remotion/cli']?.version !== coreVersion) {
    return { issue: 'remotion-lock-identity-mismatch' };
  }
  if (installedCore?.version !== coreVersion || installedCli?.version !== coreVersion) {
    return { issue: 'remotion-installed-identity-mismatch' };
  }
  let dependencyIdentity;
  try {
    dependencyIdentity = computeDependencyIdentity(pkg, lock, {
      platform,
      arch,
      nodeMajor: String(nodeVersion).split('.')[0],
    });
  } catch {
    return { issue: 'remotion-lock-identity-mismatch' };
  }
  const binary = path.join(project, 'node_modules', '.bin', platform === 'win32'
    ? 'remotion.cmd' : 'remotion');
  try {
    const canonical = await realpath(binary);
    const modules = await realpath(path.join(project, 'node_modules'));
    if (!isInside(modules, canonical)) {
      return { issue: 'remotion-local-cli-escapes-project' };
    }
    const modulesMetadata = await lstat(path.join(project, 'node_modules'));
    if (modulesMetadata.isSymbolicLink()) {
      const toolchain = path.dirname(modules);
      const toolchainsRoot = path.dirname(toolchain);
      const productionRoot = path.dirname(toolchainsRoot);
      const receipt = await readJson(path.join(toolchain, 'receipt.json'));
      if (path.basename(modules) !== 'node_modules'
        || path.basename(toolchainsRoot) !== '.remotion-toolchains'
        || !isInside(productionRoot, project)
        || path.basename(toolchain) !== dependencyIdentity
        || receipt?.dependencyIdentity !== dependencyIdentity
        || receipt?.platform !== platform
        || receipt?.arch !== arch
        || String(receipt?.nodeMajor) !== String(nodeVersion).split('.')[0]) {
        return { issue: 'remotion-shared-toolchain-identity-mismatch' };
      }
    }
    await access(binary, fsConstants.X_OK);
  } catch {
    return { issue: 'remotion-local-cli-unavailable' };
  }
  return {
    identity: dependencyIdentity,
    version: coreVersion,
  };
}

export async function productionPreflight({
  srt,
  output,
  project,
  runtime = null,
  appDir = applicationDataDir(),
  platform = process.platform,
  arch = process.arch,
  hostname = os.hostname(),
  nodeVersion = process.versions.node,
} = {}) {
  if (!srt || !output || !project) {
    throw new ActionRequiredError('usage', 'SRT, output, and project are required.');
  }
  if (runtime !== null && !RUNTIMES.has(runtime)) {
    throw new ActionRequiredError('usage', 'Runtime must be hyperframes or remotion.');
  }

  const cache = await readJsonIfPresent(environmentReadinessFile(appDir));
  const installManifest = await readJsonIfPresent(path.join(appDir, 'install-manifest.json'));
  const environment = cacheIssues(cache, {
    platform, arch, hostname, nodeVersion, runtime,
    manifestIdentity: installManifestIdentity(installManifest),
  });
  environment.push(...await installReceiptIssues(installManifest));
  const input = [];
  const srtIssue = await validateSrt(path.resolve(srt));
  if (srtIssue) input.push(srtIssue);
  let projectAvailable = true;
  try {
    if (!(await lstat(path.resolve(project))).isDirectory()) projectAvailable = false;
  } catch {
    projectAvailable = false;
  }
  if (!projectAvailable) input.push('project-unavailable');
  const runtimeIssues = [];
  let runtimeIdentity = null;
  if (runtime === 'remotion' && projectAvailable) {
    const readiness = await remotionProjectReadiness(project, { platform, arch, nodeVersion });
    if (readiness.issue) runtimeIssues.push(readiness.issue);
    else runtimeIdentity = readiness.identity;
  }
  try {
    await lstat(path.resolve(output));
    input.push('output-already-exists');
  } catch (error) {
    if (error?.code !== 'ENOENT') input.push('output-unavailable');
  }
  const outputParent = await nearestExistingDirectory(output);
  if (!outputParent) {
    input.push('output-parent-unavailable');
  } else {
    try {
      await access(outputParent, fsConstants.W_OK);
      const free = await statfs(outputParent);
      if (Number(free.bavail) * Number(free.bsize) < MIN_FREE_BYTES) input.push('output-space-low');
    } catch {
      input.push('output-parent-unwritable');
    }
  }

  const status = environment.length === 0 && input.length === 0 && runtimeIssues.length === 0
    ? 'ready' : 'action-required';
  return {
    schema_version: 1,
    status,
    next: environment.length > 0
      ? 'run-onboarding-diagnostic'
      : runtimeIssues.length > 0 ? 'fix-project-runtime'
        : input.length > 0 ? 'fix-production-input' : 'continue',
    environment_issues: environment,
    production_issues: input,
    runtime_issues: runtimeIssues,
    runtime: runtime ?? 'common',
    ...(runtimeIdentity ? { runtime_identity: runtimeIdentity } : {}),
  };
}

function parseArgs(argv) {
  const result = { json: false, runtime: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') result.json = true;
    else if (['--srt', '--output', '--project', '--runtime'].includes(arg)) {
      const value = argv[index + 1];
      if (!value) throw new ActionRequiredError('usage', `Missing value for ${arg}.`);
      result[arg.slice(2)] = value;
      index += 1;
    } else throw new ActionRequiredError('usage', `Unknown option: ${arg}`);
  }
  return result;
}

async function main(argv) {
  const args = parseArgs(argv);
  const report = await productionPreflight(args);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (report.status !== 'ready') process.exitCode = 2;
}

const isMain = process.argv[1]
  && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${JSON.stringify(publicError(error))}\n`);
    process.exitCode = error?.code === 'usage' ? 64 : 2;
  });
}
