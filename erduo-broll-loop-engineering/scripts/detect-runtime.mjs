#!/usr/bin/env node

import { spawn } from 'node:child_process';
import {
  access,
  lstat,
  readFile,
  readdir,
  realpath,
} from 'node:fs/promises';
import path from 'node:path';
import { constants as fsConstants, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { computeDependencyIdentity } from './remotion-toolchain.mjs';

const RUNTIMES = new Set(['auto', 'hyperframes', 'hybrid', 'remotion']);
const SOURCE_EXTENSIONS = new Set(['.cjs', '.html', '.htm', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.github',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'docs',
  'examples',
  'fixtures',
  'node_modules',
  'out',
  'references',
  'test',
  'tests',
]);
const MAX_DEPTH = 6;
const MAX_FILES = 2_000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_PACKAGE_BYTES = 1024 * 1024;
const CLI_TIMEOUT_MS = 10_000;
const CLI_OUTPUT_LIMIT = 16 * 1024;
const EXACT_SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const CLI_ENV_ALLOWLIST = new Set([
  'comspec', 'home', 'lang', 'lc_all', 'lc_ctype', 'path', 'systemroot',
  'temp', 'term', 'tmp', 'tmpdir',
]);

function runtimeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function relativeLocator(root, candidate) {
  return path.relative(root, candidate).split(path.sep).join('/');
}

function sanitizeChildEnvironment(source) {
  const output = {};
  const seen = new Set();

  for (const [key, value] of Object.entries(source ?? {})) {
    const folded = key.toLowerCase();
    if (folded === 'pexels_api_key' || folded === 'hyperframes_no_telemetry') continue;
    if (seen.has(folded)) {
      throw runtimeError('environment-key-collision', `Environment contains an ASCII case-insensitive collision for ${key}.`);
    }
    seen.add(folded);
    if (CLI_ENV_ALLOWLIST.has(folded) && typeof value === 'string') output[key] = value;
  }

  output.HYPERFRAMES_NO_TELEMETRY = '1';
  return output;
}

async function readBoundedRegularFile(file, root, maxBytes) {
  let metadata;
  try {
    metadata = await lstat(file);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  if (!metadata.isFile() || metadata.size > maxBytes) return null;
  const canonical = await realpath(file);
  if (!isInside(root, canonical)) return null;
  return readFile(canonical, 'utf8');
}

async function resolveDependencyRoot(projectRoot, packageJson) {
  const lexical = path.join(projectRoot, 'node_modules');
  try {
    const canonical = await realpath(lexical);
    if (isInside(lexical, canonical)) return canonical;
    const toolchain = path.dirname(canonical);
    const toolchainsRoot = path.dirname(toolchain);
    const productionRoot = path.dirname(toolchainsRoot);
    if (path.basename(canonical) !== 'node_modules'
      || path.basename(toolchainsRoot) !== '.remotion-toolchains'
      || !isInside(productionRoot, projectRoot)) return null;
    const lockContent = await readBoundedRegularFile(
      path.join(projectRoot, 'package-lock.json'),
      projectRoot,
      MAX_PACKAGE_BYTES,
    );
    if (lockContent === null) return null;
    const identity = computeDependencyIdentity(packageJson, JSON.parse(lockContent));
    const receiptContent = await readFile(path.join(toolchain, 'receipt.json'), 'utf8');
    if (Buffer.byteLength(receiptContent) > MAX_PACKAGE_BYTES) return null;
    const receipt = JSON.parse(receiptContent);
    if (receipt.dependencyIdentity !== identity
      || path.basename(toolchain) !== identity
      || receipt.platform !== process.platform
      || receipt.arch !== process.arch
      || String(receipt.nodeMajor) !== process.versions.node.split('.')[0]) return null;
    return canonical;
  } catch {
    return null;
  }
}

async function collectSourceFiles(root) {
  const files = [];
  let visited = 0;

  async function visit(directory, depth) {
    if (depth > MAX_DEPTH || visited >= MAX_FILES) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      if (visited >= MAX_FILES) return;
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (!isInside(root, absolute)) continue;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) await visit(absolute, depth + 1);
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      visited += 1;
      files.push(absolute);
    }
  }

  await visit(root, 0);
  return files;
}

function dependencyNames(packageJson) {
  return new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
  ]);
}

function directDependencyVersions(packageJson) {
  return {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };
}

function commandContains(command, executable) {
  if (typeof command !== 'string') return false;
  const escaped = executable.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`(^|[\\s;&|])(?:npx\\s+)?${escaped}(?=$|\\s)`, 'u').test(command);
}

function addSignal(target, kind, locator, detail) {
  if (target.some((signal) => signal.kind === kind && signal.locator === locator)) return;
  target.push({ kind, locator, detail });
}

async function inspectInstalledPackage(projectRoot, dependencyRoot, packageName) {
  const packageFile = path.join(projectRoot, 'node_modules', ...packageName.split('/'), 'package.json');
  if (dependencyRoot === null) return { installed: false, version: null, locator: null };
  const content = await readBoundedRegularFile(packageFile, dependencyRoot, MAX_PACKAGE_BYTES);
  if (content === null) return { installed: false, version: null, locator: null };
  try {
    const parsed = JSON.parse(content);
    return {
      installed: parsed.name === packageName && typeof parsed.version === 'string',
      version: parsed.name === packageName && typeof parsed.version === 'string' ? parsed.version : null,
      locator: relativeLocator(projectRoot, packageFile),
    };
  } catch {
    return { installed: false, version: null, locator: relativeLocator(projectRoot, packageFile) };
  }
}

async function probeLocalRemotionCli(projectRoot, dependencyRoot, env) {
  const binary = path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'remotion.cmd' : 'remotion');
  let canonical;
  try {
    canonical = await realpath(binary);
    if (dependencyRoot === null || !isInside(dependencyRoot, canonical)) {
      return { attempted: false, available: false, passed: false, reason: 'local-cli-escapes-project' };
    }
    await access(binary, fsConstants.X_OK);
  } catch {
    return { attempted: false, available: false, passed: false, reason: 'local-cli-missing' };
  }

  const childEnvironment = sanitizeChildEnvironment(env);
  return new Promise((resolve) => {
    const child = spawn(binary, ['versions'], {
      cwd: projectRoot,
      env: childEnvironment,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const append = (current, chunk) => `${current}${chunk.toString('utf8')}`.slice(0, CLI_OUTPUT_LIMIT);
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
    child.once('error', (error) => finish({
      attempted: true,
      available: true,
      passed: false,
      reason: 'local-cli-spawn-failed',
      errorCode: error?.code ?? 'unknown',
    }));
    child.once('close', (code, signal) => {
      const versionText = `${stdout}\n${stderr}`
        .replaceAll(/\u001B\[[0-?]*[ -/]*[@-~]/gu, '')
        .trim();
      const version = versionText.match(/\bOn version:\s*v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/u)?.[1] ?? null;
      const packagesAligned = /\bAll packages have the correct version\./u.test(versionText);
      const passed = code === 0 && packagesAligned && version !== null;
      finish({
        attempted: true,
        available: true,
        passed,
        exitCode: code,
        signal,
        version,
        reason: passed ? 'local-cli-versions-confirmed' : 'local-cli-versions-failed',
      });
    });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish({ attempted: true, available: true, passed: false, reason: 'local-cli-timeout' });
    }, CLI_TIMEOUT_MS);
  });
}

export async function detectRuntime({
  projectRoot = process.cwd(),
  explicitRuntime = null,
  probeCli = false,
  env = process.env,
} = {}) {
  if (explicitRuntime !== null && !RUNTIMES.has(explicitRuntime)) {
    throw runtimeError('invalid-runtime', 'Runtime must be hyperframes or remotion.');
  }

  const canonicalRoot = await realpath(path.resolve(projectRoot)).catch(() => {
    throw runtimeError('project-root-unavailable', 'Project root must be an existing readable directory.');
  });
  const rootMetadata = await lstat(canonicalRoot);
  if (!rootMetadata.isDirectory()) {
    throw runtimeError('project-root-not-directory', 'Project root must be a directory.');
  }

  const remotionSignals = [];
  const hyperframesSignals = [];
  const packageFile = path.join(canonicalRoot, 'package.json');
  const packageContent = await readBoundedRegularFile(packageFile, canonicalRoot, MAX_PACKAGE_BYTES);
  let packageJson = null;
  let packagePresent = packageContent !== null;
  if (packageContent !== null) {
    try {
      packageJson = JSON.parse(packageContent);
    } catch {
      throw runtimeError('package-json-invalid', 'The project package.json is not valid JSON.');
    }
    const dependencies = dependencyNames(packageJson);
    if (dependencies.has('remotion')) addSignal(remotionSignals, 'dependency', 'package.json', 'remotion');
    if (dependencies.has('@remotion/cli')) addSignal(remotionSignals, 'dependency', 'package.json', '@remotion/cli');
    if (dependencies.has('hyperframes')) addSignal(hyperframesSignals, 'dependency', 'package.json', 'hyperframes');
    for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
      if (commandContains(command, 'remotion')) addSignal(remotionSignals, 'script', 'package.json', name);
      if (commandContains(command, 'hyperframes')) addSignal(hyperframesSignals, 'script', 'package.json', name);
    }
  }

  for (const configName of ['remotion.config.js', 'remotion.config.ts', 'remotion.config.mjs', 'remotion.config.cjs']) {
    if (await readBoundedRegularFile(path.join(canonicalRoot, configName), canonicalRoot, MAX_FILE_BYTES) !== null) {
      addSignal(remotionSignals, 'config', configName, configName);
    }
  }
  if (await readBoundedRegularFile(path.join(canonicalRoot, 'hyperframes.json'), canonicalRoot, MAX_FILE_BYTES) !== null) {
    addSignal(hyperframesSignals, 'config', 'hyperframes.json', 'hyperframes.json');
  }

  const sourceFiles = await collectSourceFiles(canonicalRoot);
  for (const file of sourceFiles) {
    const content = await readBoundedRegularFile(file, canonicalRoot, MAX_FILE_BYTES);
    if (content === null) continue;
    const locator = relativeLocator(canonicalRoot, file);
    const importsRemotion = /(?:from\s*['"]remotion['"]|require\(\s*['"]remotion['"]\s*\))/u.test(content);
    if (importsRemotion && (/<Composition\b/u.test(content) || /\bregisterRoot\s*\(/u.test(content))) {
      addSignal(remotionSignals, 'composition-source', locator, 'Remotion import with Composition/registerRoot');
    }
    if (/\bdata-composition-id\s*=/u.test(content) && /\bdata-(?:duration|start)\s*=/u.test(content)) {
      addSignal(hyperframesSignals, 'composition-source', locator, 'HyperFrames composition data attributes');
    }
  }

  const remotionDetected = remotionSignals.length > 0;
  const hyperframesDetected = hyperframesSignals.length > 0;
  const projectKind = packagePresent || remotionDetected || hyperframesDetected ? 'existing' : 'new';
  let selectedRuntime = null;
  let selectionSource = null;
  let status = 'selected';
  const reasonCodes = [];

  if (explicitRuntime !== null) {
    selectedRuntime = explicitRuntime;
    selectionSource = 'explicit';
    reasonCodes.push('explicit-runtime-selected');
  } else if (remotionDetected && hyperframesDetected) {
    status = 'action-required';
    reasonCodes.push('mixed-runtime-evidence');
  } else if (remotionDetected) {
    selectedRuntime = 'remotion';
    selectionSource = 'detected';
    reasonCodes.push('remotion-evidence-detected');
  } else if (hyperframesDetected) {
    selectedRuntime = 'hyperframes';
    selectionSource = 'detected';
    reasonCodes.push('hyperframes-evidence-detected');
  } else if (projectKind === 'new') {
    selectedRuntime = 'auto';
    selectionSource = 'default';
    reasonCodes.push('new-project-default-auto');
  } else {
    status = 'action-required';
    reasonCodes.push('runtime-evidence-missing');
  }

  const dependencies = packageJson ? dependencyNames(packageJson) : new Set();
  const directVersions = packageJson ? directDependencyVersions(packageJson) : {};
  const dependencyRoot = packageJson ? await resolveDependencyRoot(canonicalRoot, packageJson) : null;
  const remotionPackage = await inspectInstalledPackage(canonicalRoot, dependencyRoot, 'remotion');
  const remotionCliPackage = await inspectInstalledPackage(canonicalRoot, dependencyRoot, '@remotion/cli');
  const cliEvidence = selectedRuntime === 'remotion' && probeCli
    ? await probeLocalRemotionCli(canonicalRoot, dependencyRoot, env)
    : { attempted: false, available: false, passed: false, reason: selectedRuntime === 'remotion' ? 'cli-probe-disabled' : 'not-selected' };
  const remotionDependencyEvidence = {
    declaredRemotion: dependencies.has('remotion'),
    declaredCli: dependencies.has('@remotion/cli'),
    declaredRemotionVersion: directVersions.remotion ?? null,
    declaredCliVersion: directVersions['@remotion/cli'] ?? null,
    exactAlignedDeclarations: EXACT_SEMVER.test(directVersions.remotion ?? '')
      && directVersions.remotion === directVersions['@remotion/cli'],
    installedRemotion: remotionPackage,
    installedCli: remotionCliPackage,
  };
  const remotionReady = remotionDependencyEvidence.declaredRemotion
    && remotionDependencyEvidence.declaredCli
    && remotionDependencyEvidence.exactAlignedDeclarations
    && remotionPackage.installed
    && remotionCliPackage.installed
    && remotionPackage.version === directVersions.remotion
    && remotionPackage.version === remotionCliPackage.version
    && cliEvidence.passed
    && cliEvidence.version === remotionCliPackage.version;

  const planningRequired = status === 'selected'
    && (selectedRuntime === 'auto' || selectedRuntime === 'hybrid');
  let readiness = status === 'selected'
    ? (planningRequired ? 'planning-required' : 'ready')
    : 'action-required';
  if (selectedRuntime === 'remotion' && !remotionReady) {
    readiness = 'action-required';
    reasonCodes.push('remotion-local-evidence-incomplete');
  }

  return {
    schemaVersion: '2.0.0',
    status,
    selectedRuntime,
    selectionSource,
    projectKind,
    productionRouteAvailable: selectedRuntime !== null,
    readiness,
    planningRequired,
    reasonCodes,
    evidence: {
      remotion: {
        signals: remotionSignals,
        dependencyEvidence: remotionDependencyEvidence,
        cliEvidence,
      },
      hyperframes: {
        signals: hyperframesSignals,
      },
    },
    safety: {
      readOnlyDetection: !cliEvidence.attempted,
      localCliExecuted: cliEvidence.attempted,
      followedSymlinksDuringScan: false,
      shellUsed: false,
      directoryNameHeuristicUsed: false,
      scannedFileCount: sourceFiles.length,
      scanLimits: { maxDepth: MAX_DEPTH, maxFiles: MAX_FILES, maxFileBytes: MAX_FILE_BYTES },
    },
  };
}

export function parseArgs(argv) {
  const options = { projectRoot: process.cwd(), explicitRuntime: null, probeCli: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--project') {
      const value = argv[index + 1];
      if (!value) throw runtimeError('missing-project-argument', '--project requires a directory.');
      options.projectRoot = value;
      index += 1;
    } else if (argument === '--runtime') {
      const value = argv[index + 1];
      if (!value) throw runtimeError('missing-runtime-argument', '--runtime requires auto, hyperframes, hybrid, or remotion.');
      options.explicitRuntime = value;
      index += 1;
    } else if (argument === '--probe-cli') {
      options.probeCli = true;
    } else if (argument === '--no-cli-probe') {
      options.probeCli = false;
    } else if (argument !== '--json') {
      throw runtimeError('unknown-argument', 'An unsupported command argument was provided.');
    }
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const result = await detectRuntime(parseArgs(argv));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.status === 'selected' ? 0 : 2;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: '2.0.0',
      status: 'error',
      error: { code: error?.code ?? 'runtime-detection-failed', message: error?.message ?? String(error) },
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

const isEntryPoint = process.argv[1]
  && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
if (isEntryPoint) await main();
