# Artifact manifest contract

## Private package

Every stage freezes complete output under a private artifact store. The canonical manifest contains:

```text
schema_version, run_id, stage, package_id, upstream_manifest_sha256,
creative_brief_sha256, producer_isolation_sha256, artifacts[], metrics,
manifest_sha256
```

`schema_version` is `2`. The manifest is deterministic and has no clock, timestamp, random ordering or `created_at` field. `manifest_sha256` fingerprints the canonical core without itself.

Each artifact is exactly `{artifact_id, kind, sha256, size_bytes, media_type, locator_key, required_by}`. `locator_key` is resolved only inside the private store and is never an absolute path. Manifests contain hashes and safe IDs, never credentials, raw private paths or embedded media.

## Parent envelope

The parent receives a schema-version `1` envelope of at most 4096 UTF-8 bytes: `{schema_version, stage, package_id, manifest_sha256, upstream_manifest_sha256, artifact_counts, metrics, producer_isolation_sha256}`. It cannot contain SRT text, plan rows, inventory entries, source, atom bodies, frames, logs or prose explanations.

Limits are byte limits over canonical UTF-8 JSON: manifest `16 * 1024`; parent envelope `4096`; review receipt `8 * 1024`; one structured JSON artifact `8 * 1024 * 1024`; one source bundle `64 * 1024 * 1024`. Media remains a separately hashed artifact and is never embedded in a packet. Reject unsafe, oversized, non-canonical or hash-mismatched packages.

## Chain and resume

Each manifest binds the confirmed brief and one upstream manifest. A reviewer binds one exact manifest. Any byte, schema, rule-version or upstream change creates a new hash and invalidates descendants. A stage summary cannot restore or replace an artifact.
