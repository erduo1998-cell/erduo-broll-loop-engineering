#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { probeMedia, MediaProbeError } from './probe-media.mjs';

const CANDIDATE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif',
  '.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.mpeg', '.mpg',
]);
const SKIP_DIRECTORIES = new Set(['node_modules', 'deliverables', '.erduo-hyperframes-broll']);
const DEFAULT_LIMITS = {
  maxCandidates: 5000,
  maxFileBytes: 10 * 1024 * 1024 * 1024,
  maxDepth: 20,
  concurrency: 4,
};
const EXIT_INPUT = 2;
const EXIT_USAGE = 64;
const EXIT_INTERNAL = 70;

export class AssetIndexError extends Error {
  constructor(code, stage, message) {
    super(message);
    this.name = 'AssetIndexError';
    this.code = code;
    this.stage = stage;
  }
}

function fail(code, message) {
  throw new AssetIndexError(code, 'input', message);
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function toPosixRelative(value) {
  return value.replaceAll('\\', '/').split('/').filter((segment) => segment && segment !== '.').join('/');
}

function assertContained(relativePath, pathImpl = path) {
  const posix = toPosixRelative(relativePath);
  if (!posix || pathImpl.isAbsolute(relativePath) || posix.split('/').includes('..')) {
    fail('path_escape', 'A discovered asset path escapes the user asset root.');
  }
  return posix;
}

function isCandidate(name, pathImpl = path) {
  return CANDIDATE_EXTENSIONS.has(pathImpl.extname(name).toLowerCase());
}

export function stableAssetId(relativePath) {
  return `UA-${createHash('sha256').update(relativePath, 'utf8').digest('hex').slice(0, 16)}`;
}

export function semanticTokens(relativePath) {
  const withoutExtension = relativePath.replace(/\.[^./\\]+$/u, '');
  const prepared = withoutExtension
    .normalize('NFC')
    .replaceAll('\\', '/')
    .replace(/([\p{Lu}]+)([\p{Lu}][\p{Ll}])/gu, '$1 $2')
    .replace(/([\p{Ll}])([\p{Lu}])/gu, '$1 $2')
    .replace(/([\p{L}])(\p{N})|(\p{N})([\p{L}])/gu, '$1$3 $2$4');
  const parts = prepared.match(/[\p{Script=Han}]+|[\p{L}\p{N}]+/gu) ?? [];
  const tokens = new Set();
  for (const part of parts) {
    if (/^[\p{Script=Han}]+$/u.test(part)) {
      tokens.add(part);
      const characters = [...part];
      if (characters.length === 1) tokens.add(characters[0]);
      for (let index = 0; index + 1 < characters.length; index += 1) {
        tokens.add(`${characters[index]}${characters[index + 1]}`);
      }
    } else {
      const token = part.toLocaleLowerCase('en-US');
      if (token.length >= 2 || /^\d+$/u.test(token)) tokens.add(token);
    }
  }
  return [...tokens].sort(compareText).slice(0, 64);
}

export function orientationFor(width, height) {
  if (width === height) return 'square';
  return width > height ? 'landscape' : 'portrait';
}

export async function mapLimit(items, limit, mapper) {
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError('limit must be a positive integer');
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function validateRoot(root, fsImpl, resolvePath) {
  if (typeof root !== 'string' || !root) fail('invalid_root', 'A user asset directory is required.');
  const resolved = resolvePath(root);
  let stat;
  try {
    stat = await fsImpl.lstat(resolved);
  } catch (error) {
    if (error?.code === 'ENOENT') fail('root_not_found', 'The user asset directory was not found.');
    fail('root_unreadable', 'The user asset directory cannot be inspected.');
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('invalid_root', 'The user asset root must be a real directory.');
  return resolved;
}

export async function collectAssetCandidates(root, {
  fsImpl = fs,
  pathImpl = path,
  resolvePath = path.resolve,
  limits = {},
} = {}) {
  const effective = { ...DEFAULT_LIMITS, ...limits };
  const rootPath = await validateRoot(root, fsImpl, resolvePath);
  const candidates = [];
  const rejected = [];

  async function walk(directory, depth) {
    let entries;
    try {
      entries = await fsImpl.readdir(directory, { withFileTypes: true });
    } catch {
      fail('traversal_failed', 'The user asset directory could not be read completely.');
    }
    entries.sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const absolute = pathImpl.join(directory, entry.name);
      const relative = assertContained(pathImpl.relative(rootPath, absolute), pathImpl);
      let stat;
      try {
        stat = await fsImpl.lstat(absolute);
      } catch {
        if (isCandidate(entry.name, pathImpl)) {
          candidates.push({ absolute, relative, rejected: { relative_path: relative, code: 'asset_unreadable', stage: 'input', message: 'Asset candidate cannot be inspected.' } });
          if (candidates.length > effective.maxCandidates) fail('candidate_limit', 'The user asset candidate limit was exceeded.');
          continue;
        }
        fail('traversal_failed', 'The user asset directory could not be read completely.');
      }

      if (stat.isSymbolicLink()) {
        if (isCandidate(entry.name, pathImpl)) {
          candidates.push({ absolute, relative, rejected: { relative_path: relative, code: 'symlink_skipped', stage: 'input', message: 'Symlink asset candidates are not followed.' } });
          if (candidates.length > effective.maxCandidates) fail('candidate_limit', 'The user asset candidate limit was exceeded.');
        }
        continue;
      }
      if (stat.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        if (depth >= effective.maxDepth) fail('depth_limit', 'The user asset directory depth limit was exceeded.');
        await walk(absolute, depth + 1);
        continue;
      }
      if (!isCandidate(entry.name, pathImpl)) continue;
      if (!stat.isFile()) {
        candidates.push({ absolute, relative, rejected: { relative_path: relative, code: 'not_regular_file', stage: 'input', message: 'Asset candidate is not a regular file.' } });
      } else if (!Number.isSafeInteger(stat.size) || stat.size <= 0) {
        candidates.push({ absolute, relative, rejected: { relative_path: relative, code: 'asset_empty', stage: 'input', message: 'Asset candidate is empty.' } });
      } else if (stat.size > effective.maxFileBytes) {
        candidates.push({ absolute, relative, rejected: { relative_path: relative, code: 'asset_too_large', stage: 'input', message: 'Asset candidate exceeds the file-size limit.' } });
      } else {
        candidates.push({ absolute, relative });
      }
      if (candidates.length > effective.maxCandidates) fail('candidate_limit', 'The user asset candidate limit was exceeded.');
    }
  }

  await walk(rootPath, 0);
  for (const candidate of candidates) if (candidate.rejected) rejected.push(candidate.rejected);
  return { rootPath, candidates, rejected, limits: effective };
}

function safeRejected(candidate, error) {
  if (error instanceof MediaProbeError || error instanceof AssetIndexError) {
    return { relative_path: candidate.relative, code: error.code, stage: error.stage, message: error.message };
  }
  return { relative_path: candidate.relative, code: 'probe_failed', stage: 'probe', message: 'Asset candidate probe failed.' };
}

function assetFromProbe(candidate, probe) {
  if (!probe?.video?.primary) {
    throw new AssetIndexError('not_visual', 'normalize', 'Asset candidate has no visual stream.');
  }
  const primary = probe.video.primary;
  const mediaKind = probe.duration_ms === null && probe.audio?.count === 0 ? 'image' : 'video';
  return {
    asset_id: stableAssetId(candidate.relative),
    relative_path: candidate.relative,
    media_kind: mediaKind,
    size_bytes: probe.size_bytes,
    duration_ms: probe.duration_ms,
    width: primary.display_width,
    height: primary.display_height,
    orientation: orientationFor(primary.display_width, primary.display_height),
    codec: primary.codec,
    semantic_tokens: semanticTokens(candidate.relative),
  };
}

export async function indexUserAssets(root, {
  fsImpl = fs,
  pathImpl = path,
  resolvePath = path.resolve,
  limits = {},
  probe = probeMedia,
  probeOptions = {},
} = {}) {
  const collected = await collectAssetCandidates(root, { fsImpl, pathImpl, resolvePath, limits });
  const toProbe = collected.candidates.filter((candidate) => !candidate.rejected);
  const outcomes = await mapLimit(toProbe, collected.limits.concurrency, async (candidate) => {
    try {
      return { asset: assetFromProbe(candidate, await probe(candidate.absolute, probeOptions)) };
    } catch (error) {
      return { rejected: safeRejected(candidate, error) };
    }
  });
  const assets = outcomes.flatMap((outcome) => outcome.asset ? [outcome.asset] : []).sort((a, b) => compareText(a.relative_path, b.relative_path));
  const rejected = [
    ...collected.rejected,
    ...outcomes.flatMap((outcome) => outcome.rejected ? [outcome.rejected] : []),
  ].sort((a, b) => compareText(a.relative_path, b.relative_path));
  return {
    schema_version: 1,
    candidate_count: collected.candidates.length,
    indexed_count: assets.length,
    rejected_count: rejected.length,
    assets,
    rejected,
  };
}

export function parseIndexArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const prettyCount = argv.filter((value) => value === '--pretty').length;
  const unknown = argv.filter((value) => value.startsWith('-') && value !== '--pretty');
  const positionals = argv.filter((value) => !value.startsWith('-'));
  if (unknown.length || prettyCount > 1 || positionals.length !== 1 || argv.length !== positionals.length + prettyCount) return { error: true };
  return { root: positionals[0], pretty: prettyCount === 1 };
}

export async function runIndexCli(argv, adapters = {}) {
  const stdout = adapters.stdout ?? process.stdout;
  const stderr = adapters.stderr ?? process.stderr;
  const args = parseIndexArgs(argv);
  if (args.help) {
    stdout.write('Usage: node scripts/index-user-assets.mjs <user-assets-directory> [--pretty]\n');
    return 0;
  }
  if (args.error) {
    stderr.write('index-user-assets: invalid arguments (use --help)\n');
    return EXIT_USAGE;
  }
  try {
    const result = await indexUserAssets(args.root, adapters.indexOptions ?? {});
    stdout.write(`${JSON.stringify(result, null, args.pretty ? 2 : 0)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof AssetIndexError) {
      stderr.write(`${JSON.stringify({ ok: false, error: { code: error.code, stage: error.stage, message: error.message } })}\n`);
      return EXIT_INPUT;
    }
    stderr.write(`${JSON.stringify({ ok: false, error: { code: 'internal_error', stage: 'input', message: 'Unexpected asset index failure.' } })}\n`);
    return EXIT_INTERNAL;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) process.exit(await runIndexCli(process.argv.slice(2)));
