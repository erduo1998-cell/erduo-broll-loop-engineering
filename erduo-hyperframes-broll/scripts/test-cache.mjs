import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  CacheError,
  assertCachePrivacy,
  cacheKey,
  enforceCacheLimits,
  withArtifactCache,
  withJsonCache,
} from './cache.mjs';

async function makeProject(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'broll-cache-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  return root;
}

function entryPath(root, namespace, key) {
  return path.join(root, '.erduo-hyperframes-broll', 'cache', namespace, key);
}

test('cache keys are canonical and namespace-separated', () => {
  assert.equal(cacheKey('search', { b: 2, a: 1 }), cacheKey('search', { a: 1, b: 2 }));
  assert.notEqual(cacheKey('search', { a: 1 }), cacheKey('download', { a: 1 }));
  assert.match(cacheKey('render', { semantic_tokens: ['hero'] }), /^[0-9a-f]{64}$/u);
  assert.throws(() => cacheKey('other', {}), (error) => error.code === 'invalid_namespace');
});

test('cache privacy allows semantic tokens and HTTPS but rejects credentials and local paths', () => {
  assert.equal(assertCachePrivacy({ semantic_tokens: ['hero'], url: 'https://example.com/image.jpg' }), true);
  for (const value of [
    { api_key: 'x' },
    { access_token: 'x' },
    { path: '/Users/alice/file' },
    { path: 'C:\\Users\\Alice\\file' },
    { path: '\\\\server\\share' },
    { path: 'file:///private/file' },
  ]) assert.throws(() => assertCachePrivacy(value), (error) => error.code === 'cache_privacy_violation');
});

test('JSON cache miss then hit invokes producer once and applies POSIX modes', async (t) => {
  const root = await makeProject(t);
  let calls = 0;
  const request = { query: 'ocean current', page: 1 };
  const first = await withJsonCache(root, request, async () => { calls += 1; return { results: [{ id: 1 }] }; }, { platform: 'linux' });
  const second = await withJsonCache(root, request, async () => { calls += 1; return { wrong: true }; }, { platform: 'linux' });
  assert.equal(first.hit, false);
  assert.equal(second.hit, true);
  assert.deepEqual(second.value, { results: [{ id: 1 }] });
  assert.equal(calls, 1);
  const dir = entryPath(root, 'search', cacheKey('search', request));
  assert.equal((await fs.stat(dir)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(path.join(dir, 'entry.json'))).mode & 0o777, 0o600);
});

test('artifact cache miss then validated hit invokes producer once', async (t) => {
  const root = await makeProject(t);
  let calls = 0;
  const request = { source_sha256: 'a'.repeat(64) };
  const producer = async (target) => { calls += 1; await fs.writeFile(target, 'artifact-bytes'); };
  const first = await withArtifactCache(root, 'download', request, '.mp4', producer);
  const second = await withArtifactCache(root, 'download', request, '.mp4', producer);
  assert.equal(first.hit, false);
  assert.equal(second.hit, true);
  assert.equal(calls, 1);
  assert.equal(await fs.readFile(second.artifact_path, 'utf8'), 'artifact-bytes');
  assert.equal(second.manifest.relative_artifact, 'artifact.mp4');
});

test('same-key concurrency has one producer while different keys remain independent', async (t) => {
  const root = await makeProject(t);
  let sameCalls = 0;
  const producer = async () => {
    sameCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { value: 1 };
  };
  const results = await Promise.all(Array.from({ length: 5 }, () => withJsonCache(root, { same: true }, producer, { limits: { pollMs: 2 } })));
  assert.equal(sameCalls, 1);
  assert.equal(results.filter((result) => result.hit === false).length, 1);

  let different = 0;
  await Promise.all([1, 2, 3].map((id) => withJsonCache(root, { id }, async () => { different += 1; return { id }; })));
  assert.equal(different, 3);
});

test('producer failure is not cached and retry can commit', async (t) => {
  const root = await makeProject(t);
  const request = { query: 'retry' };
  await assert.rejects(
    withJsonCache(root, request, async () => { throw new Error('/private secret'); }),
    (error) => error instanceof CacheError && error.code === 'cache_producer_failed' && !error.message.includes('/private'),
  );
  const result = await withJsonCache(root, request, async () => ({ ok: true }));
  assert.equal(result.hit, false);
  const ns = path.join(root, '.erduo-hyperframes-broll', 'cache', 'search');
  assert.deepEqual(await fs.readdir(path.join(ns, '.locks')), []);
  assert.deepEqual(await fs.readdir(path.join(ns, '.staging')), []);
});

test('empty and symlink artifact are rejected and leave no hit', async (t) => {
  const root = await makeProject(t);
  const outside = path.join(root, 'outside');
  await fs.writeFile(outside, 'outside');
  await assert.rejects(
    withArtifactCache(root, 'render', { id: 1 }, '.mp4', async (target) => fs.writeFile(target, '')),
    (error) => error.code === 'invalid_artifact',
  );
  await assert.rejects(
    withArtifactCache(root, 'render', { id: 2 }, '.mp4', async (target) => fs.symlink(outside, target)),
    (error) => error.code === 'invalid_artifact',
  );
});

test('artifact byte tamper becomes miss, quarantines old entry, and rebuilds', async (t) => {
  const root = await makeProject(t);
  const request = { render: 'shot-1' };
  let calls = 0;
  const produce = async (target) => { calls += 1; await fs.writeFile(target, calls === 1 ? 'original' : 'rebuilt'); };
  const first = await withArtifactCache(root, 'render', request, '.mp4', produce);
  await fs.writeFile(first.artifact_path, 'tampered');
  const second = await withArtifactCache(root, 'render', request, '.mp4', produce);
  assert.equal(second.hit, false);
  assert.equal(calls, 2);
  assert.equal(await fs.readFile(second.artifact_path, 'utf8'), 'rebuilt');
  const invalid = path.join(root, '.erduo-hyperframes-broll', 'cache', 'render', '.invalid');
  assert.equal((await fs.readdir(invalid)).length, 1);
});

test('malformed and key-tampered JSON manifests are quarantined before rebuild', async (t) => {
  const root = await makeProject(t);
  const request = { query: 'manifest' };
  const key = cacheKey('search', request);
  await withJsonCache(root, request, async () => ({ version: 1 }));
  const manifest = path.join(entryPath(root, 'search', key), 'entry.json');
  await fs.writeFile(manifest, 'not-json');
  const rebuilt = await withJsonCache(root, request, async () => ({ version: 2 }));
  assert.equal(rebuilt.hit, false);
  assert.deepEqual(rebuilt.value, { version: 2 });
  assert.equal((await fs.readdir(path.join(root, '.erduo-hyperframes-broll', 'cache', 'search', '.invalid'))).length, 1);
});

test('stale lock is recovered while a live lock times out safely', async (t) => {
  const root = await makeProject(t);
  const staleRequest = { lock: 'stale' };
  const staleKey = cacheKey('search', staleRequest);
  const lockDir = path.join(root, '.erduo-hyperframes-broll', 'cache', 'search', '.locks');
  await fs.mkdir(lockDir, { recursive: true });
  const staleLock = path.join(lockDir, `${staleKey}.lock`);
  await fs.writeFile(staleLock, '{}');
  await fs.utimes(staleLock, new Date(0), new Date(0));
  const recovered = await withJsonCache(root, staleRequest, async () => ({ ok: true }), { limits: { staleLockMs: 1, pollMs: 1 } });
  assert.equal(recovered.hit, false);

  const liveRequest = { lock: 'live' };
  const liveKey = cacheKey('search', liveRequest);
  const liveLock = path.join(lockDir, `${liveKey}.lock`);
  await fs.writeFile(liveLock, '{}');
  const base = Date.now();
  let clock = base;
  await assert.rejects(
    withJsonCache(root, liveRequest, async () => ({ never: true }), {
      clock: () => clock,
      sleep: async (ms) => { clock += ms; },
      limits: { staleLockMs: 100000, lockTimeoutMs: 10, pollMs: 5 },
    }),
    (error) => error.code === 'cache_lock_timeout',
  );
});

test('invalid extension, namespace-kind, request traversal, and symlink root are rejected', async (t) => {
  const root = await makeProject(t);
  await assert.rejects(withArtifactCache(root, 'render', { id: 1 }, '../mp4', async () => {}), (error) => error.code === 'invalid_extension');
  await assert.rejects(withArtifactCache(root, 'search', { id: 1 }, '.mp4', async () => {}), (error) => error.code === 'invalid_namespace_kind');
  await assert.rejects(withJsonCache(root, { path: '../relative-is-data' }, async () => ({})), (error) => error.code === 'cache_privacy_violation');
  const link = `${root}-link`;
  t.after(async () => fs.rm(link, { force: true }));
  await fs.symlink(root, link);
  await assert.rejects(withJsonCache(link, { id: 1 }, async () => ({})), (error) => error.code === 'invalid_project_root');
});

test('LRU count and byte limits evict only registered key directories', async (t) => {
  const root = await makeProject(t);
  const times = [0, 1000, 2000].map((ms) => new Date(`2026-07-20T00:00:0${ms / 1000}.000Z`));
  for (let id = 0; id < 3; id += 1) {
    await withJsonCache(root, { id }, async () => ({ payload: 'x'.repeat(20), id }), {
      now: () => times[id],
      limits: { maxEntries: 10, maxBytes: 100000 },
    });
  }
  const unregistered = path.join(root, '.erduo-hyperframes-broll', 'cache', 'search', 'do-not-delete');
  await fs.mkdir(unregistered);
  const countResult = await enforceCacheLimits(root, 'search', { limits: { maxEntries: 2, maxBytes: 100000 } });
  assert.equal(countResult.evicted.length, 1);
  assert.equal((await fs.stat(unregistered)).isDirectory(), true);
  const byteResult = await enforceCacheLimits(root, 'search', { limits: { maxEntries: 10, maxBytes: 1 } });
  assert.equal(byteResult.evicted.length, 2);
  assert.equal((await fs.stat(unregistered)).isDirectory(), true);
});
