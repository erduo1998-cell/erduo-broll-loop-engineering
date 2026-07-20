# Run state and fingerprint contract

`.erduo-hyperframes-broll/run.json` is the private resumability truth. It contains no absolute/relative source path, filename, subtitle text, credential, raw error, or command output.

## Fingerprints and manifest

- `fingerprintFile()` accepts a real regular non-symlink file, streams SHA-256, verifies size/mtime did not change during reading, and returns only `{ sha256, size_bytes }`.
- `fingerprintValue()` hashes canonical JSON with recursively sorted object keys and preserved array order. Reject cycles, unsupported values, non-finite numbers, and unsafe integers.
- Input slots are `srt`, `control_media`, `narration_media`, `design`, and `user_assets`. Values are fingerprint objects, never paths.
- `talking-head` requires `srt` and `control_media`; `faceless` requires `srt` and allows `narration_media`.
- Settings are limited to `aspect_ratio`, exact rational `frame_rate`, `template_policy_sha256`, and `production_library_sha256`.
- The manifest includes `schema_version`, `mode`, sorted `inputs`, normalized settings, and `manifest_sha256` over everything except the hash field.

## Stage graph

Stages are ordered:

```text
preflight -> directing -> assets -> build -> render -> verify
```

Each stage stores `status` (`pending`, `running`, `complete`, `failed`), `attempt`, nullable `input_fingerprint`, nullable `output_fingerprint`, nullable fixed failure, and timestamps.

Transitions:

- `pending|failed -> running` when every upstream stage is complete;
- `running -> complete` only with a SHA-256 output fingerprint;
- `running -> failed` only with a stable failure code and retryability;
- completed stages cannot restart until manifest invalidation resets them.

Failure messages come from an internal fixed catalog. Callers cannot store raw exception text.

## Invalidation

Compare slot/setting values by canonical equality:

- `srt`, `control_media`, `narration_media`, `mode`, or any unknown field: reset from `preflight`.
- `design`, `template_policy_sha256`, or `production_library_sha256`: reset from `directing`.
- `user_assets`: reset from `assets`.
- `aspect_ratio` or `frame_rate`: reset from `build`.

Reset the earliest affected stage and every downstream stage to fresh `pending`; preserve valid upstream completions. Identical manifests change nothing. Updating a manifest records the changed field IDs and invalidated stage, never values.

## Persistence and privacy

- The state path is exactly `<project-root>/.erduo-hyperframes-broll/run.json`.
- Reject a symlink project root, state directory, or state file.
- Save via a unique sibling file opened exclusively with mode `0600`, rename into place, and cleanup only that temp file. Apply directory `0700` and file `0600` on POSIX.
- Load validates JSON shape, schema version, manifest hash, stages, transitions, and privacy before returning. A corrupt/unknown state is never silently replaced.
- Privacy validation rejects credential-like keys, absolute Unix/Windows/UNC/file-URL strings, and unknown top-level/state/stage fields.

## Test minimum

Cover streaming file hash, real content change, changed-during-read, symlink/directory/missing file, canonical object order, array order, invalid canonical values, both modes and required slots, manifest determinism, every invalidation row, identical-manifest no-op, earliest combined invalidation, all legal/illegal transitions, upstream gate, output fingerprint requirement, fixed failure catalog, unknown/corrupt/tampered state, privacy key/path/secret attempts, atomic save/permissions/field preservation, write/rename/cleanup failures, and Windows path-shaped string rejection.
