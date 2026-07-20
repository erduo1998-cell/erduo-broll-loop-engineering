#!/usr/bin/env node
/**
 * doctor.mjs — Environment preflight for erduo-hyperframes-broll.
 *
 * Read-only checks plus one reversible write probe.
 * Contract: erduo-hyperframes-broll/references/doctor-contract.md
 *
 * Exports injectable functions so tests can supply fake process, filesystem,
 * and command-runner adapters. No public flag or env var fakes probe results.
 */

import { execFile } from 'node:child_process';
import { promises as fsPromises } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir, platform, arch } from 'node:os';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const SCHEMA_VERSION = 1;

const REQUIRED_UPSTREAM_CHECKS = ['Version', 'Node.js', 'FFmpeg', 'FFprobe', 'Chrome'];

const CREDENTIAL_KEY_PATTERN = /(?:KEY|TOKEN|SECRET|COOKIE|PASSWORD|AUTH)/i;

const EXIT_USAGE = 64;
const EXIT_INTERNAL = 70;
const EXIT_BLOCKED = 2;

// ═══════════════════════════════════════════════════════════════
// Exec runner (injectable)
// ═══════════════════════════════════════════════════════════════

/**
 * Wraps child_process.execFile in a promise. Never enables a shell.
 * @param {Function} execFileImpl - typically node:child_process.execFile
 * @returns {Function} async (file, args, opts?) => {stdout, stderr}
 */
export function createExecFileRunner(execFileImpl) {
  return (file, args, opts = {}) =>
    new Promise((resolvePromise, rejectPromise) => {
      execFileImpl(file, args, {
        ...opts.extra,
        timeout: opts.timeout ?? 30_000,
        maxBuffer: opts.maxBuffer ?? 1024 * 1024,
        windowsHide: true,
        shell: false,
      }, (err, stdout, stderr) => {
        if (err) {
          const wrapped = new Error(err.message);
          wrapped.code = err.code;
          wrapped.killed = Boolean(err.killed || err.signal);
          wrapped.stdout = String(stdout ?? '');
          wrapped.stderr = String(stderr ?? '');
          rejectPromise(wrapped);
          return;
        }
        resolvePromise({
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
        });
      });
    });
}

/**
 * Default exec-file runner using the real child_process.execFile.
 * Provided as a separate export so tests can replace it while still
 * calling the higher-level check functions.
 */
export const defaultExecFileAsync = createExecFileRunner(execFile);

// ═══════════════════════════════════════════════════════════════
// Version extraction
// ═══════════════════════════════════════════════════════════════

/**
 * Extract a normalized version string from the first line of output.
 * Never returns a raw path or full child-process output.
 */
function extractVersion(firstLine) {
  if (!firstLine) return undefined;
  // Common patterns: "ffmpeg version 7.1.1 Copyright...", "v26.4.0"
  const m = firstLine.match(/(?:version\s+)?v?(\d+\.\d+(?:\.\d+)?)/i);
  return m ? m[1] : undefined;
}

// ═══════════════════════════════════════════════════════════════
// Sanitization
// ═══════════════════════════════════════════════════════════════

/**
 * Build a sanitizer that replaces the home directory and work directory
 * with stable tokens. Must be called before any message leaves the process.
 */
export function createSanitizer(homeDir, workDir, env = {}) {
  const replacements = [
    [workDir, '$WORKDIR'],
    [homeDir, '$HOME'],
    ...Object.entries(env)
      .filter(([key, value]) => CREDENTIAL_KEY_PATTERN.test(key) && String(value ?? '').length >= 4)
      .map(([, value]) => [String(value), '[REDACTED]']),
  ]
    .filter(([value]) => value)
    .sort((a, b) => b[0].length - a[0].length);

  return (text) => {
    if (typeof text !== 'string') return text;
    let result = text;
    for (const [value, replacement] of replacements) {
      result = result.replaceAll(value, replacement);
    }
    return result;
  };
}

/**
 * Return a copy of `env` with credential values redacted.
 * Keys matching KEY|TOKEN|SECRET|COOKIE|PASSWORD|AUTH are replaced.
 */
export function filterCredentialEnv(env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    out[k] = CREDENTIAL_KEY_PATTERN.test(k) ? '[REDACTED]' : v;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// Check implementations (each injectable)
// ═══════════════════════════════════════════════════════════════

/**
 * Verify the Node.js runtime version is 22 or newer.
 */
export function checkNode(runtimeVersion) {
  const raw = (runtimeVersion ?? process.version).replace(/^v/, '');
  const major = parseInt(raw.split('.')[0], 10);
  return {
    id: 'node',
    required: true,
    status: major >= 22 ? 'pass' : 'fail',
    version: raw,
    message: major >= 22 ? `Node.js ${raw}` : `Node.js ${major} found, 22+ required`,
  };
}

/**
 * Verify ffmpeg or ffprobe is on PATH and responds to -version.
 * @param {'ffmpeg'|'ffprobe'} name
 * @param {Function} execFileAsync - injected runner
 * @param {string} pf - platform string ('darwin'|'win32'|...)
 */
export async function checkBinary(name, execFileAsync, pf) {
  const bin = pf === 'win32' ? `${name}.exe` : name;
  try {
    const { stdout } = await execFileAsync(bin, ['-version'], { timeout: 15_000 });
    const firstLine = stdout.split('\n')[0]?.trim() ?? '';
    const version = extractVersion(firstLine);
    return {
      id: name,
      required: true,
      status: 'pass',
      version,
      message: version ? `${name} ${version}` : `${name} ok`,
    };
  } catch (err) {
    const reason =
      err.code === 'ENOENT'
        ? `${bin} not found on PATH`
        : err.killed
          ? `${bin} -version timed out`
          : `${bin} -version failed`;
    return {
      id: name,
      required: true,
      status: 'fail',
      message: reason,
    };
  }
}

/**
 * Check HyperFrames CLI via `npx --no-install hyperframes doctor --json`.
 * Uses npx.cmd on Windows, npx elsewhere. No shell.
 */
export async function checkHyperFrames(execFileAsync, pf) {
  const npx = pf === 'win32' ? 'npx.cmd' : 'npx';

  let stdout;
  try {
    const result = await execFileAsync(
      npx,
      ['--no-install', 'hyperframes', 'doctor', '--json'],
      { timeout: 60_000 },
    );
    stdout = result.stdout;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        id: 'hyperframes',
        required: true,
        status: 'fail',
        message: `${npx} not found. Install Node.js 22+ and HyperFrames CLI.`,
      };
    }
    if (err.killed) {
      return {
        id: 'hyperframes',
        required: true,
        status: 'fail',
        message: 'HyperFrames doctor timed out after 60s',
      };
    }
    return {
      id: 'hyperframes',
      required: true,
      status: 'fail',
      message: `HyperFrames doctor failed (exit ${err.code ?? 'error'})`,
    };
  }

  // Parse JSON
  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch {
    return {
      id: 'hyperframes',
      required: true,
      status: 'fail',
      message: 'HyperFrames doctor returned unparseable output',
    };
  }

  // Validate structure
  if (!payload || !Array.isArray(payload.checks)) {
    return {
      id: 'hyperframes',
      required: true,
      status: 'fail',
      message: 'HyperFrames doctor returned malformed JSON (missing checks array)',
    };
  }

  // Gate on required upstream checks
  const checks = payload.checks;
  const checkName = (check) => check.name ?? check.id;
  const checkPassed = (check) =>
    typeof check.ok === 'boolean' ? check.ok : check.status === 'pass';

  const failedRequired = REQUIRED_UPSTREAM_CHECKS.filter((name) => {
    const c = checks.find((ch) => checkName(ch) === name);
    return !c || !checkPassed(c);
  });

  // Collect optional upstream warnings
  const warnings = [];
  for (const c of checks) {
    const name = checkName(c);
    if (name && !REQUIRED_UPSTREAM_CHECKS.includes(name) && !checkPassed(c)) {
      const safeId = `hyperframes_optional_${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')}`;
      warnings.push(safeId);
    }
  }

  if (failedRequired.length > 0) {
    return {
      id: 'hyperframes',
      required: true,
      status: 'fail',
      message: `HyperFrames: missing required check(s) — ${failedRequired.join(', ')}`,
    };
  }

  const versionCheck = checks.find((c) => checkName(c) === 'Version');
  const version = extractVersion(versionCheck?.detail ?? versionCheck?.version);
  return {
    id: 'hyperframes',
    required: true,
    status: 'pass',
    version,
    message: `HyperFrames CLI${version ? ' ' + version : ''}`,
    _warnings: warnings,
  };
}

/**
 * Verify the target work directory exists and is writable via a probe file.
 * Creates a unique probe file, closes it, and removes it. Never overwrites
 * an existing path. Cleanup failure is a check failure.
 */
export async function checkWorkdir(target, fsImpl) {
  const resolvedPath = resolve(target ?? '.');

  // Check existence and type
  let stat;
  try {
    stat = await fsImpl.promises.stat(resolvedPath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        id: 'workdir',
        required: true,
        status: 'fail',
        message: 'Directory not found: $WORKDIR',
      };
    }
    return {
      id: 'workdir',
      required: true,
      status: 'fail',
      message: `Cannot access directory: $WORKDIR (${err.code ?? 'error'})`,
    };
  }

  if (!stat.isDirectory()) {
    return {
      id: 'workdir',
      required: true,
      status: 'fail',
      message: 'Not a directory: $WORKDIR',
    };
  }

  // Write probe + cleanup
  const probeName = `.doctor-probe-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const probePath = join(resolvedPath, probeName);

  let writeErr = null;
  try {
    // wx = write, exclusive — fails if file exists
    await fsImpl.promises.writeFile(probePath, '', { flag: 'wx' });
  } catch (err) {
    writeErr = err;
  }

  // Cleanup: remove the probe file (only if write succeeded, so a file exists)
  let cleanupErr = null;
  if (!writeErr) {
    try {
      await fsImpl.promises.unlink(probePath);
    } catch (err) {
      cleanupErr = err;
    }
  }

  if (writeErr) {
    if (writeErr.code === 'EEXIST') {
      return {
        id: 'workdir',
        required: true,
        status: 'fail',
        message: 'Write probe collision',
      };
    }
    return {
      id: 'workdir',
      required: true,
      status: 'fail',
      message: 'Not writable: $WORKDIR',
    };
  }

  if (cleanupErr) {
    return {
      id: 'workdir',
      required: true,
      status: 'fail',
      message: 'Probe file cleanup failed: $WORKDIR',
    };
  }

  return {
    id: 'workdir',
    required: true,
    status: 'pass',
    message: 'Writable: $WORKDIR',
  };
}

// ═══════════════════════════════════════════════════════════════
// Result assembly
// ═══════════════════════════════════════════════════════════════

/**
 * Compute the final result from a list of check results.
 */
export function computeResult(checks, pf, cpuArch) {
  const allRequiredPassed = checks.every(
    (c) => !c.required || c.status === 'pass',
  );

  // Gather optional warnings from checks
  const warnings = [];
  for (const c of checks) {
    if (c._warnings) {
      for (const w of c._warnings) {
        if (!warnings.includes(w)) warnings.push(w);
      }
    }
  }

  let status, ok;
  if (allRequiredPassed) {
    status = warnings.length > 0 ? 'degraded' : 'ready';
    ok = true;
  } else {
    status = 'blocked';
    ok = false;
  }

  // Strip internal fields before output
  const cleanChecks = checks.map(({ _warnings: _, ...rest }) => rest);

  return {
    schema_version: SCHEMA_VERSION,
    status,
    ok,
    platform: pf ?? platform(),
    arch: cpuArch ?? arch(),
    checks: cleanChecks,
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════
// Full orchestration (injectable for tests)
// ═══════════════════════════════════════════════════════════════

/**
 * Run all checks and return the result object.
 * Every dependency is injectable.
 */
export async function runDoctor(deps = {}) {
  const {
    nodeVersion = process.version,
    execFileAsync = defaultExecFileAsync,
    fsImpl = { promises: fsPromises },
    pf = platform(),
    cpuArch = arch(),
    workdir = '.',
  } = deps;

  const checks = [];

  // 1. node
  checks.push(checkNode(nodeVersion));

  // 2. ffmpeg
  checks.push(await checkBinary('ffmpeg', execFileAsync, pf));

  // 3. ffprobe
  checks.push(await checkBinary('ffprobe', execFileAsync, pf));

  // 4. hyperframes
  checks.push(await checkHyperFrames(execFileAsync, pf));

  // 5. workdir
  checks.push(await checkWorkdir(workdir, fsImpl));

  return computeResult(checks, pf, cpuArch);
}

export function exitCodeForResult(result) {
  return result.ok ? 0 : EXIT_BLOCKED;
}

// ═══════════════════════════════════════════════════════════════
// Human-readable output
// ═══════════════════════════════════════════════════════════════

/**
 * Format a compact human-readable status line plus one line per
 * failed required check and optional warning.
 * Sanitized so no credential or raw path escapes.
 */
export function formatHumanOutput(result, sanitize) {
  const lines = [];

  const statusLabel =
    result.status === 'ready'
      ? '✅ Ready'
      : result.status === 'degraded'
        ? '⚠️  Degraded'
        : '❌ Blocked';

  lines.push(`${statusLabel} — ${result.platform}/${result.arch}`);

  for (const c of result.checks) {
    if (c.status === 'fail') {
      lines.push(`  ✗ ${c.id}: ${sanitize(c.message)}`);
    }
  }

  for (const w of result.warnings) {
    lines.push(`  ⚠ ${w}`);
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// CLI entry point
// ═══════════════════════════════════════════════════════════════

export function parseCliArgs(argv) {
  // Manual --help check (parseArgs in Node 22+ does not auto-handle it)
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }

  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: {
        json: { type: 'boolean', default: false },
        workdir: { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    });

    return { help: false, ...values };
  } catch {
    return { error: true };
  }
}

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));

  // --help
  if (cli.help) {
    process.stdout.write(`Usage: node scripts/doctor.mjs [--json] [--workdir <path>]

Environment preflight for erduo-hyperframes-broll.

Options:
  --json       Write a single JSON document to stdout
  --workdir    Target work directory (default: current directory)
  --help       Show this message

Exit codes:
  0   ready or degraded
  2   blocked (missing required capability)
  64  invalid arguments
  70  internal failure
`);
    process.exit(0);
  }

  // Invalid arguments
  if (cli.error) {
    process.stderr.write('doctor: invalid arguments (use --help)\n');
    process.exit(EXIT_USAGE);
  }

  if (cli.workdir !== undefined && typeof cli.workdir !== 'string') {
    process.stderr.write('doctor: --workdir requires a path value\n');
    process.exit(EXIT_USAGE);
  }

  const workdir = cli.workdir ?? '.';
  const resolvedWorkdir = resolve(workdir);
  const sanitize = createSanitizer(homedir(), resolvedWorkdir, process.env);

  let result;
  try {
    result = await runDoctor({ workdir });
  } catch (err) {
    // Internal failure
    const msg = sanitize(String(err.message));
    if (cli.json) {
      process.stdout.write(
        JSON.stringify({ schema_version: SCHEMA_VERSION, status: 'blocked', ok: false, message: msg }) + '\n',
      );
    } else {
      process.stderr.write(`doctor: internal error: ${msg}\n`);
    }
    process.exit(EXIT_INTERNAL);
  }

  // Sanitize all messages before output
  for (const c of result.checks) {
    c.message = sanitize(c.message);
  }

  if (cli.json) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    process.stdout.write(formatHumanOutput(result, sanitize) + '\n');
  }

  process.exit(exitCodeForResult(result));
}

// Run CLI only when executed directly (not imported for testing)
const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  main().catch((err) => {
    process.stderr.write(`doctor: fatal: ${String(err.message)}\n`);
    process.exit(EXIT_INTERNAL);
  });
}
