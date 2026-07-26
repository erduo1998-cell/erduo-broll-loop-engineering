#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MANIFEST_NAME = '.portable-snapshot.json';
const EXCLUDED_NAMES = new Set([
  '.DS_Store',
  '.tmp-hf-fixture',
  '.erduo-hyperframes-broll',
  'node_modules',
  'renders',
]);

export class PortableSnapshotError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PortableSnapshotError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new PortableSnapshotError(code, message); };
const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const portableRelative = (root, target) => path.relative(root, target).split(path.sep).join('/');

function excluded(relative, outputPath) {
  const parts = relative.split('/');
  if (parts.some((part) => EXCLUDED_NAMES.has(part))) return true;
  if (relative === MANIFEST_NAME) return true;
  return outputPath && path.resolve(outputPath) === path.resolve(relative);
}

async function walkRegularFiles(root, {
  outputPath = null,
  relative = '',
} = {}) {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const childRelative = relative
      ? `${relative.split(path.sep).join('/')}/${entry.name}`
      : entry.name;
    if (excluded(childRelative, outputPath)) continue;
    const absolute = path.join(root, ...childRelative.split('/'));
    if (entry.isSymbolicLink()) fail('source_symlink_forbidden', `Portable source contains a symlink: ${childRelative}`);
    if (entry.isDirectory()) {
      files.push(...await walkRegularFiles(root, { outputPath, relative: childRelative }));
    } else if (entry.isFile()) {
      files.push({ absolute, relative: childRelative });
    } else {
      fail('source_entry_unsupported', `Portable source contains an unsupported entry: ${childRelative}`);
    }
  }
  return files.sort((a, b) => a.relative.localeCompare(b.relative));
}

async function gitFacts(projectRoot) {
  try {
    const [{ stdout: head }, { stdout: statusOutput }] = await Promise.all([
      execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, timeout: 15_000 }),
      execFileAsync('git', ['status', '--porcelain=v1', '-z'], { cwd: projectRoot, timeout: 15_000 }),
    ]);
    const statusRows = statusOutput.split('\0').filter(Boolean);
    return {
      head: head.trim(),
      tracked_change_count: statusRows.filter((row) => !row.startsWith('??')).length,
      untracked_count: statusRows.filter((row) => row.startsWith('??')).length,
    };
  } catch {
    return {
      head: null,
      tracked_change_count: null,
      untracked_count: null,
    };
  }
}

async function copyAndFingerprint(files, sourceRoot, targetRoot) {
  const records = [];
  for (const file of files) {
    const target = path.join(targetRoot, ...file.relative.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(file.absolute, target);
    const [bytes, sourceStat] = await Promise.all([readFile(file.absolute), stat(file.absolute)]);
    await chmod(target, sourceStat.mode & 0o777);
    records.push({
      path: file.relative,
      size_bytes: bytes.length,
      sha256: hashBytes(bytes),
    });
  }
  return records;
}

export async function createPortableSnapshot({ projectRoot, outputPath, now = () => new Date() }) {
  if (typeof projectRoot !== 'string' || !projectRoot || typeof outputPath !== 'string' || !outputPath) {
    fail('snapshot_arguments_invalid', 'Project root and output path are required.');
  }
  const root = path.resolve(projectRoot);
  const output = path.resolve(outputPath);
  let rootStat;
  try {
    rootStat = await stat(root);
  } catch {
    fail('project_root_unreadable', 'Project root cannot be read.');
  }
  if (!rootStat.isDirectory()) fail('project_root_unreadable', 'Project root must be a directory.');
  if (output === root || output.startsWith(`${root}${path.sep}`)) {
    fail('output_inside_project', 'Portable snapshot output must be outside the project root.');
  }
  try {
    await lstat(output);
    fail('output_exists', 'Portable snapshot output already exists.');
  } catch (error) {
    if (error instanceof PortableSnapshotError) throw error;
    if (error?.code !== 'ENOENT') fail('output_unreadable', 'Portable snapshot output cannot be inspected.');
  }

  const temporary = await mkdtemp(path.join(os.tmpdir(), 'erduo-broll-portable-'));
  const projectName = path.basename(root);
  const stagedRoot = path.join(temporary, projectName);
  try {
    const files = await walkRegularFiles(root);
    await mkdir(stagedRoot, { recursive: true });
    const records = await copyAndFingerprint(files, root, stagedRoot);
    const manifest = {
      schema_version: 1,
      project_name: projectName,
      created_at: now().toISOString(),
      includes_git_history: records.some((record) => record.path.startsWith('.git/')),
      git: await gitFacts(root),
      exclusions: [...EXCLUDED_NAMES].sort(),
      file_count: records.length,
      byte_count: records.reduce((sum, record) => sum + record.size_bytes, 0),
      files: records,
    };
    await writeFile(path.join(stagedRoot, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    await mkdir(path.dirname(output), { recursive: true });
    try {
      await execFileAsync('tar', ['-czf', output, '-C', temporary, projectName], {
        timeout: 5 * 60_000,
        maxBuffer: 1024 * 1024,
      });
    } catch {
      await rm(output, { force: true });
      fail('archive_failed', 'tar failed to create the portable snapshot.');
    }
    return {
      status: 'created',
      archive_name: path.basename(output),
      project_name: projectName,
      file_count: manifest.file_count,
      byte_count: manifest.byte_count,
      includes_git_history: manifest.includes_git_history,
      git: manifest.git,
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function verifyPortableSnapshot(projectRoot) {
  const root = path.resolve(projectRoot);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(root, MANIFEST_NAME), 'utf8'));
  } catch {
    fail('snapshot_manifest_unreadable', 'Portable snapshot manifest cannot be read.');
  }
  if (manifest?.schema_version !== 1 || !Array.isArray(manifest.files)
    || !Number.isSafeInteger(manifest.file_count) || manifest.file_count !== manifest.files.length) {
    fail('snapshot_manifest_invalid', 'Portable snapshot manifest is invalid.');
  }
  const expectedPaths = new Set();
  let byteCount = 0;
  for (const record of manifest.files) {
    if (typeof record?.path !== 'string' || !record.path || path.posix.isAbsolute(record.path)
      || record.path.includes('\\') || path.posix.normalize(record.path) !== record.path
      || !Number.isSafeInteger(record.size_bytes) || record.size_bytes < 0
      || !/^[0-9a-f]{64}$/u.test(record.sha256 ?? '')) {
      fail('snapshot_manifest_invalid', 'Portable snapshot file record is invalid.');
    }
    if (expectedPaths.has(record.path)) fail('snapshot_manifest_invalid', 'Portable snapshot paths are duplicated.');
    expectedPaths.add(record.path);
    const target = path.resolve(root, ...record.path.split('/'));
    if (!target.startsWith(`${root}${path.sep}`)) fail('snapshot_path_escape', 'Portable snapshot record escapes its root.');
    let targetStat;
    try {
      targetStat = await lstat(target);
    } catch {
      fail('snapshot_file_missing', `Portable snapshot file is missing: ${record.path}`);
    }
    if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
      fail('snapshot_file_invalid', `Portable snapshot file is not regular: ${record.path}`);
    }
    const bytes = await readFile(target);
    if (bytes.length !== record.size_bytes || hashBytes(bytes) !== record.sha256) {
      fail('snapshot_hash_mismatch', `Portable snapshot file changed: ${record.path}`);
    }
    byteCount += bytes.length;
  }
  const actualPaths = new Set((await walkRegularFiles(root)).map((file) => portableRelative(root, file.absolute)));
  if (actualPaths.size !== expectedPaths.size
    || [...actualPaths].some((relative) => !expectedPaths.has(relative))) {
    fail('snapshot_file_set_mismatch', 'Portable snapshot contains unregistered files.');
  }
  if (byteCount !== manifest.byte_count) fail('snapshot_manifest_invalid', 'Portable snapshot byte count is invalid.');
  return {
    status: 'verified',
    project_name: manifest.project_name,
    file_count: manifest.file_count,
    byte_count: manifest.byte_count,
    includes_git_history: manifest.includes_git_history === true,
    git: manifest.git,
  };
}

function usage() {
  return 'Usage:\n'
    + '  node scripts/create-portable-snapshot.mjs create <project-root> <output.tar.gz>\n'
    + '  node scripts/create-portable-snapshot.mjs verify <extracted-project-root>\n';
}

async function main(argv) {
  if (argv.includes('--help')) {
    process.stdout.write(usage());
    return;
  }
  const [command, ...rest] = argv;
  if (command === 'create' && rest.length === 2) {
    process.stdout.write(`${JSON.stringify(await createPortableSnapshot({
      projectRoot: rest[0],
      outputPath: rest[1],
    }))}\n`);
    return;
  }
  if (command === 'verify' && rest.length === 1) {
    process.stdout.write(`${JSON.stringify(await verifyPortableSnapshot(rest[0]))}\n`);
    return;
  }
  fail('usage', usage().trim());
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
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    const known = error instanceof PortableSnapshotError;
    process.stderr.write(`${JSON.stringify({
      status: 'failed',
      code: known ? error.code : 'snapshot_failed',
      message: known ? error.message : 'Portable snapshot operation failed.',
    })}\n`);
    process.exitCode = known && error.code === 'usage' ? 64 : 2;
  }
}
