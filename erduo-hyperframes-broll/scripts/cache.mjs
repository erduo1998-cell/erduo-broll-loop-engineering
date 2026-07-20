import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { canonicalize } from './state.mjs';

const NAMESPACES = new Set(['search', 'download', 'render']);
const KEY_PATTERN = /^[0-9a-f]{64}$/u;
const EXTENSION_PATTERN = /^\.[a-z0-9]{1,10}$/u;
const PRIVATE_KEY = /(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|cookie|password|authorization|credential)/iu;
const PRIVATE_PATH = /^(?:\/|[A-Za-z]:[\\/]|\\\\|file:)/u;
const PATH_TRAVERSAL = /(?:^|[\\/])\.\.(?:[\\/]|$)/u;
const DEFAULTS = {
  pollMs: 50,
  lockTimeoutMs: 30_000,
  staleLockMs: 5 * 60_000,
  maxEntries: 500,
  maxBytes: 20 * 1024 * 1024 * 1024,
};

export class CacheError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CacheError';
    this.code = code;
  }
}

export function assertCachePrivacy(value) {
  const seen = new Set();
  function visit(current) {
    if (current === null || typeof current === 'number' || typeof current === 'boolean') return;
    if (typeof current === 'string') {
      if (PRIVATE_PATH.test(current) || PATH_TRAVERSAL.test(current)) cacheFail('cache_privacy_violation', 'Cache data contains a private path-like value.');
      return;
    }
    if (typeof current !== 'object' || seen.has(current)) return;
    seen.add(current);
    for (const [key, item] of Object.entries(current)) {
      if (PRIVATE_KEY.test(key)) cacheFail('cache_privacy_violation', 'Cache data contains a credential-like field.');
      visit(item);
    }
    seen.delete(current);
  }
  visit(value);
  return true;
}

function cacheFail(code, message) {
  throw new CacheError(code, message);
}

function nowIso(now) {
  const value = typeof now === 'function' ? now() : now;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) cacheFail('invalid_time', 'Cache timestamp is invalid.');
  return date.toISOString();
}

export function cacheKey(namespace, request) {
  if (!NAMESPACES.has(namespace)) cacheFail('invalid_namespace', 'Cache namespace is invalid.');
  assertCachePrivacy(request);
  const canonical = canonicalize({ schema_version: 1, namespace, request });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

async function hashFile(file, { fsImpl, streamFactory }) {
  const stat = await fsImpl.lstat(file);
  if (stat.isSymbolicLink() || !stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size <= 0) cacheFail('invalid_artifact', 'Cache artifact is not a non-empty regular file.');
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of streamFactory(file)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    hash.update(buffer);
  }
  if (bytes !== stat.size) cacheFail('invalid_artifact', 'Cache artifact changed while it was read.');
  return { sha256: hash.digest('hex'), size_bytes: bytes };
}

function cachePaths(projectRoot, namespace, key, pathImpl) {
  if (!NAMESPACES.has(namespace) || !KEY_PATTERN.test(key)) cacheFail('invalid_cache_path', 'Cache path identity is invalid.');
  const root = pathImpl.resolve(projectRoot);
  const ns = pathImpl.join(root, '.erduo-hyperframes-broll', 'cache', namespace);
  return {
    root,
    ns,
    entry: pathImpl.join(ns, key),
    manifest: pathImpl.join(ns, key, 'entry.json'),
    locks: pathImpl.join(ns, '.locks'),
    lock: pathImpl.join(ns, '.locks', `${key}.lock`),
    staging: pathImpl.join(ns, '.staging'),
    invalid: pathImpl.join(ns, '.invalid'),
  };
}

function validateManifestShape(manifest, namespace, key) {
  const allowed = ['schema_version', 'namespace', 'key', 'kind', 'created_at', 'last_accessed_at', 'content_sha256', 'size_bytes', 'relative_artifact', 'value'];
  if (!manifest || manifest.schema_version !== 1 || manifest.namespace !== namespace || manifest.key !== key || !['json', 'artifact'].includes(manifest.kind) || Object.keys(manifest).some((field) => !allowed.includes(field)) || !KEY_PATTERN.test(manifest.content_sha256) || !Number.isSafeInteger(manifest.size_bytes) || manifest.size_bytes < 0) return false;
  if (Number.isNaN(Date.parse(manifest.created_at)) || Number.isNaN(Date.parse(manifest.last_accessed_at))) return false;
  if (manifest.kind === 'json') return 'value' in manifest && manifest.relative_artifact === null;
  return !('value' in manifest) && typeof manifest.relative_artifact === 'string' && /^artifact\.[a-z0-9]{1,10}$/u.test(manifest.relative_artifact);
}

async function atomicWriteJson(file, value, { fsImpl, pathImpl, makeId, platform }) {
  const temp = pathImpl.join(pathImpl.dirname(file), `.entry.json.${process.pid}.${makeId()}.tmp`);
  let created = false;
  try {
    await fsImpl.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    created = true;
    if (platform !== 'win32') await fsImpl.chmod(temp, 0o600);
    await fsImpl.rename(temp, file);
    created = false;
    if (platform !== 'win32') await fsImpl.chmod(file, 0o600);
  } finally {
    if (created) {
      try { await fsImpl.unlink(temp); } catch (error) { if (error?.code !== 'ENOENT') cacheFail('cache_cleanup_failed', 'Temporary cache metadata could not be removed.'); }
    }
  }
}

async function readEntry(paths, namespace, key, deps, { touch = true } = {}) {
  let text;
  try { text = await deps.fsImpl.readFile(paths.manifest, 'utf8'); } catch { return null; }
  let manifest;
  try { manifest = JSON.parse(text); } catch { return null; }
  if (!validateManifestShape(manifest, namespace, key)) return null;
  try {
    if (manifest.kind === 'json') {
      assertCachePrivacy(manifest.value);
      const serialized = canonicalize(manifest.value);
      if (Buffer.byteLength(serialized) !== manifest.size_bytes || createHash('sha256').update(serialized).digest('hex') !== manifest.content_sha256) return null;
    } else {
      const artifact = deps.pathImpl.join(paths.entry, manifest.relative_artifact);
      const actual = await hashFile(artifact, deps);
      if (actual.sha256 !== manifest.content_sha256 || actual.size_bytes !== manifest.size_bytes) return null;
    }
  } catch { return null; }
  if (touch) {
    manifest.last_accessed_at = nowIso(deps.now);
    try { await atomicWriteJson(paths.manifest, manifest, deps); } catch { return null; }
  }
  return manifest.kind === 'json'
    ? { hit: true, value: manifest.value, manifest }
    : { hit: true, artifact_path: deps.pathImpl.join(paths.entry, manifest.relative_artifact), manifest };
}

async function prepareNamespace(paths, deps) {
  let rootStat;
  try { rootStat = await deps.fsImpl.lstat(paths.root); } catch { cacheFail('invalid_project_root', 'Cache project root cannot be inspected.'); }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) cacheFail('invalid_project_root', 'Cache project root must be a real directory.');
  const cacheRoot = deps.pathImpl.dirname(paths.ns);
  const stateRoot = deps.pathImpl.dirname(cacheRoot);
  const directories = [stateRoot, cacheRoot, paths.ns, paths.locks, paths.staging, paths.invalid];
  for (const directory of directories) {
    await deps.fsImpl.mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await deps.fsImpl.lstat(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) cacheFail('invalid_cache_path', 'Cache directory path is unsafe.');
    if (deps.platform !== 'win32') await deps.fsImpl.chmod(directory, 0o700);
  }
}

async function acquireLock(paths, deps) {
  const started = deps.clock();
  while (true) {
    try {
      const handle = await deps.fsImpl.open(paths.lock, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify({ schema_version: 1, created_at: nowIso(deps.now) }));
      } catch {
        try { await handle.close(); } catch {}
        try { await deps.fsImpl.unlink(paths.lock); } catch {}
        cacheFail('cache_lock_failed', 'Cache lock could not be initialized.');
      }
      await handle.close();
      return;
    } catch (error) {
      if (error?.code !== 'EEXIST') cacheFail('cache_lock_failed', 'Cache lock could not be created.');
    }
    try {
      const stat = await deps.fsImpl.lstat(paths.lock);
      if (!stat.isSymbolicLink() && stat.isFile() && deps.clock() - stat.mtimeMs > deps.options.staleLockMs) {
        const confirmed = await deps.fsImpl.lstat(paths.lock);
        if (!confirmed.isSymbolicLink() && confirmed.isFile() && confirmed.mtimeMs === stat.mtimeMs && deps.clock() - confirmed.mtimeMs > deps.options.staleLockMs) {
          await deps.fsImpl.unlink(paths.lock);
          continue;
        }
      }
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
    }
    if (deps.clock() - started >= deps.options.lockTimeoutMs) cacheFail('cache_lock_timeout', 'Cache lock wait timed out.');
    await deps.sleep(deps.options.pollMs);
  }
}

async function releaseLock(paths, deps) {
  try { await deps.fsImpl.unlink(paths.lock); } catch (error) {
    if (error?.code !== 'ENOENT') cacheFail('cache_lock_cleanup_failed', 'Cache lock could not be removed.');
  }
}

async function quarantineInvalid(paths, key, deps) {
  try {
    const stat = await deps.fsImpl.lstat(paths.entry);
    if (stat.isSymbolicLink() || !stat.isDirectory()) cacheFail('invalid_cache_entry', 'Cache entry path is unsafe.');
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    if (error instanceof CacheError) throw error;
    return;
  }
  const target = deps.pathImpl.join(paths.invalid, `${key}-${deps.makeId()}`);
  await deps.fsImpl.rename(paths.entry, target);
}

function createDeps(options = {}) {
  return {
    fsImpl: options.fsImpl ?? fs,
    pathImpl: options.pathImpl ?? path,
    streamFactory: options.streamFactory ?? createReadStream,
    makeId: options.makeId ?? randomUUID,
    platform: options.platform ?? process.platform,
    now: options.now ?? (() => new Date()),
    clock: options.clock ?? Date.now,
    sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    options: { ...DEFAULTS, ...(options.limits ?? {}) },
  };
}

async function commitJson(paths, namespace, key, value, deps) {
  assertCachePrivacy(value);
  const serialized = canonicalize(value);
  const timestamp = nowIso(deps.now);
  const staging = deps.pathImpl.join(paths.staging, `${key}-${deps.makeId()}`);
  await deps.fsImpl.mkdir(staging, { mode: 0o700 });
  if (deps.platform !== 'win32') await deps.fsImpl.chmod(staging, 0o700);
  const manifest = {
    schema_version: 1, namespace, key, kind: 'json', created_at: timestamp, last_accessed_at: timestamp,
    content_sha256: createHash('sha256').update(serialized).digest('hex'), size_bytes: Buffer.byteLength(serialized),
    relative_artifact: null, value,
  };
  await atomicWriteJson(deps.pathImpl.join(staging, 'entry.json'), manifest, deps);
  await quarantineInvalid(paths, key, deps);
  await deps.fsImpl.rename(staging, paths.entry);
  return { hit: false, value, manifest };
}

async function commitArtifact(paths, namespace, key, extension, producer, deps) {
  if (!EXTENSION_PATTERN.test(extension)) cacheFail('invalid_extension', 'Cache artifact extension is invalid.');
  const timestamp = nowIso(deps.now);
  const staging = deps.pathImpl.join(paths.staging, `${key}-${deps.makeId()}`);
  await deps.fsImpl.mkdir(staging, { mode: 0o700 });
  if (deps.platform !== 'win32') await deps.fsImpl.chmod(staging, 0o700);
  const artifactName = `artifact${extension}`;
  const artifact = deps.pathImpl.join(staging, artifactName);
  try { await producer(artifact); } catch { cacheFail('cache_producer_failed', 'Cache artifact producer failed.'); }
  let fingerprint;
  try { fingerprint = await hashFile(artifact, deps); } catch (error) {
    if (error instanceof CacheError) throw error;
    cacheFail('invalid_artifact', 'Cache artifact could not be validated.');
  }
  const manifest = {
    schema_version: 1, namespace, key, kind: 'artifact', created_at: timestamp, last_accessed_at: timestamp,
    content_sha256: fingerprint.sha256, size_bytes: fingerprint.size_bytes, relative_artifact: artifactName,
  };
  await atomicWriteJson(deps.pathImpl.join(staging, 'entry.json'), manifest, deps);
  await quarantineInvalid(paths, key, deps);
  await deps.fsImpl.rename(staging, paths.entry);
  return { hit: false, artifact_path: deps.pathImpl.join(paths.entry, artifactName), manifest };
}

async function cleanupStaging(paths, key, deps) {
  let entries;
  try { entries = await deps.fsImpl.readdir(paths.staging); } catch { return; }
  for (const name of entries) {
    if (name.startsWith(`${key}-`)) await deps.fsImpl.rm(deps.pathImpl.join(paths.staging, name), { recursive: true, force: true });
  }
}

async function useCache(projectRoot, namespace, request, producer, { kind, extension, ...options }) {
  if (kind === 'json' && namespace !== 'search') cacheFail('invalid_namespace_kind', 'JSON cache is only valid for search.');
  if (kind === 'artifact' && !['download', 'render'].includes(namespace)) cacheFail('invalid_namespace_kind', 'Artifact cache is only valid for download/render.');
  const key = cacheKey(namespace, request);
  const deps = createDeps(options);
  const paths = cachePaths(projectRoot, namespace, key, deps.pathImpl);
  await prepareNamespace(paths, deps);
  const initial = await readEntry(paths, namespace, key, deps);
  if (initial) return initial;
  await acquireLock(paths, deps);
  try {
    const afterLock = await readEntry(paths, namespace, key, deps);
    if (afterLock) return afterLock;
    let result;
    if (kind === 'json') {
      let value;
      try { value = await producer(); } catch { cacheFail('cache_producer_failed', 'Cache JSON producer failed.'); }
      result = await commitJson(paths, namespace, key, value, deps);
    } else {
      result = await commitArtifact(paths, namespace, key, extension, producer, deps);
    }
    await enforceCacheLimits(projectRoot, namespace, options);
    return result;
  } finally {
    await cleanupStaging(paths, key, deps);
    await releaseLock(paths, deps);
  }
}

export function withJsonCache(projectRoot, request, producer, options = {}) {
  return useCache(projectRoot, 'search', request, producer, { ...options, kind: 'json' });
}

export function withArtifactCache(projectRoot, namespace, request, extension, producer, options = {}) {
  return useCache(projectRoot, namespace, request, producer, { ...options, kind: 'artifact', extension });
}

export async function enforceCacheLimits(projectRoot, namespace, options = {}) {
  const deps = createDeps(options);
  const dummyKey = '0'.repeat(64);
  const paths = cachePaths(projectRoot, namespace, dummyKey, deps.pathImpl);
  let names;
  try { names = await deps.fsImpl.readdir(paths.ns); } catch { return { evicted: [] }; }
  const entries = [];
  for (const name of names.filter((value) => KEY_PATTERN.test(value))) {
    const entryPaths = cachePaths(projectRoot, namespace, name, deps.pathImpl);
    const hit = await readEntry(entryPaths, namespace, name, deps, { touch: false });
    if (hit) entries.push({ key: name, bytes: hit.manifest.size_bytes, at: Date.parse(hit.manifest.last_accessed_at), path: entryPaths.entry });
  }
  entries.sort((a, b) => a.at - b.at || (a.key < b.key ? -1 : 1));
  let count = entries.length;
  let bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  const evicted = [];
  for (const entry of entries) {
    if (count <= deps.options.maxEntries && bytes <= deps.options.maxBytes) break;
    await deps.fsImpl.rm(entry.path, { recursive: true, force: true });
    count -= 1;
    bytes -= entry.bytes;
    evicted.push(entry.key);
  }
  return { evicted };
}
