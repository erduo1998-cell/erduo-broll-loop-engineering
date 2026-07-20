# Cache contract

The project cache lives only under `.erduo-hyperframes-broll/cache/`. It prevents duplicate search, download, and render work; it is not a source of truth and may always be rebuilt.

## Keys and namespaces

- Namespaces are exactly `search`, `download`, and `render`.
- A key is SHA-256 over canonical `{ schema_version:1, namespace, request }` using `state.mjs` canonicalization.
- Requests contain semantic/config/content fingerprints, never credentials, absolute paths, raw subtitle text, or unstable timestamps.
- Reject credential-like keys and absolute Unix/Windows/UNC/file-URL values before hashing.

## Entry types

- `search` stores a privacy-checked canonical JSON value inline in `entry.json` with content hash and byte size.
- `download` and `render` producers receive an exclusive staging file path inside the cache. They may not return an arbitrary source path. Commit only a non-empty regular non-symlink artifact plus `entry.json` recording relative artifact name, SHA-256, and size.
- A hit revalidates entry schema, key/namespace, JSON hash or artifact regular-file/hash/size. Invalid entries are never reused.
- Return values may contain the internal absolute artifact path for the pipeline, but manifests, logs, state, and user reports use only namespace/key/relative artifact metadata.

## Single writer and failure behavior

- Acquire `<namespace>/.locks/<key>.lock` with exclusive creation and `0600`; never use a shell.
- After acquiring, recheck for a hit before producing.
- A waiter polls with bounded delay. A lock older than the configured stale window may be removed only after re-stat; timeout yields a safe `cache_lock_timeout`.
- Producer failure, empty artifact, invalid JSON, write failure, or commit failure creates no valid entry. Cleanup only the current staging directory and lock in `finally`.
- If an entry exists but fails validation, atomically move that exact key directory under `<namespace>/.invalid/` before rebuilding. Never delete or rename anything outside the validated namespace/key path.

## LRU bounds

- Defaults: 500 valid entries and 20 GiB per namespace.
- Touch `last_accessed_at` on a validated hit using atomic manifest replacement.
- After a commit, enumerate only 64-hex entry directories with valid manifests, order by `last_accessed_at`, and evict oldest registered entries until count/bytes fit.
- Never evict `.locks`, `.staging`, `.invalid`, state, user input, deliverables, or an unregistered directory.

## Test minimum

Cover deterministic keys/object order, namespace/privacy rejection, JSON miss/hit, artifact miss/hit, concurrent same-key single producer, different keys independent, producer failure retry, empty/symlink artifact, hash/size tamper miss, malformed/tampered manifest, stale lock recovery, live lock wait/timeout, path traversal/extension rejection, staging/lock cleanup, invalid-entry quarantine, LRU count/byte eviction, safe errors, POSIX modes, Windows path-shaped request rejection, and a real artifact hit followed by byte tamper and rebuild.
