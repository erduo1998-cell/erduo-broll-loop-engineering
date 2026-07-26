# Run state and fingerprint contract

`.erduo-hyperframes-broll/run.json` is the private resumability truth. It
contains no absolute/relative source path, filename, subtitle text, credential,
raw error or command output.

Run state uses `schema_version: 2` and `pipeline_contract_version: 2`. The
current long-film build topology is identified separately as:

```text
authoring_topology_id: bounded-authoring-cluster-v1
```

The topology ID belongs to build-stage artifacts/metrics; it is not a new
top-level run-state field and does not change the pipeline contract version.

## Fingerprints and manifest

- `fingerprintFile()` accepts a real regular non-symlink file, streams SHA-256,
  verifies size/mtime did not change during reading, and returns only
  `{ sha256, size_bytes }`.
- `fingerprintValue()` hashes canonical JSON with recursively sorted object
  keys and preserved array order. Reject cycles, unsupported values,
  non-finite numbers and unsafe integers.
- Input slots are `srt`, `control_media`, `narration_media`, `design`, and
  `user_assets`. Values are fingerprint objects, never paths.
- `talking-head` requires `srt` and `control_media`; `faceless` requires `srt`
  and allows `narration_media`.
- Settings are limited to `aspect_ratio`, exact rational `frame_rate`,
  `template_policy_sha256`, `production_library_sha256`, and the trusted
  out-of-band `design_selection_options_sha256`.
- The manifest includes `schema_version`, `mode`, sorted `inputs`, normalized
  settings, and `manifest_sha256` over everything except the hash field.

## Coarse stage graph

The persisted stages remain:

```text
preflight -> directing -> assets -> build -> render -> verify
```

The `build` stage internally expands to:

```text
deterministic authoring plan
→ dynamic N contiguous chunks
→ immediate seven-gate validation per chunk
→ main static-only style_conformance_review over all current block bytes
→ independent byte-preserving integration
→ main pre-render actual-source source_code_review
```

This fan-out/fan-in is stored in topology artifacts validated by
`validate-authoring-topology.mjs`,
`validate-visual-authoring-chain.mjs` and the style validator; it does not add dynamic keys to
`run.json.stages`. `build` may complete only when every planned chunk passed
source/font/asset/HyperFrames/seek/profile/pixel gates, integration passed with
byte-identical source, `style_conformance_review` approved all current block
bytes before integration, the integrator independently revalidated its exact
authorization, and `source_code_review` approved the exact integrated source.
Every block packet must also reconstruct its exact self-contained ordered
design-shot/Flat Shot Kit/asset-binding material set. `render` may start only
after current bytes reproduce the full style-lineage receipt, including the
trusted-capture validator receipt, B↔C source ledger, integration
authorization/no-rewrite chain and complete source review. It then creates one
master; `verify` is post-render technical verification only.

Each coarse stage stores `status` (`pending`, `running`, `complete`, `failed`),
`attempt`, nullable `input_fingerprint`, nullable `output_fingerprint`,
nullable fixed failure and timestamps.

Transitions:

- `pending|failed -> running` when every upstream stage is complete;
- `running -> complete` only with a SHA-256 output fingerprint;
- `running -> failed` only with a stable failure code and retryability;
- completed stages cannot restart until manifest invalidation resets them.

Failure messages come from an internal fixed catalog. Callers cannot store raw
exception text.

Chunk retry is more granular than the coarse state attempt. Each chunk
manifest records `attempt: 1` or its single replacement `attempt: 2`. A failed
chunk does not reset unrelated passing chunk artifacts; the build coordinator
reuses their exact hashes. A second failure for the same chunk stops build.
Integrator isolation differs from every chunk author and it cannot repair a
chunk.

## Invalidation

Compare slot/setting values by canonical equality:

- `srt`, `control_media`, `narration_media`, `mode`, or any unknown field:
  reset from `preflight`.
- `design`, `template_policy_sha256`, `production_library_sha256`, or
  `design_selection_options_sha256`: reset
  from `directing`.
- `user_assets`: reset from `assets`.
- `aspect_ratio` or `frame_rate`: reset from `build`.

Reset the earliest affected stage and every downstream stage to fresh
`pending`; preserve valid upstream completions. Identical manifests change
nothing. Updating a manifest records changed field IDs and the invalidated
stage, never values.

Inside an invalidated `build`, topology reuse is narrower:

- brief, visual grammar, global rules, SRT/plan/projection/design/font changes invalidate the
  authoring plan and all chunks;
- an asset/kit change invalidates every chunk that consumes it;
- any missing, added, reordered, swapped or stale scoped
  design/kit/asset-binding row invalidates that packet and its owning chunk;
- one chunk-source or authoritative style-evidence change invalidates the
  complete style review/authorization, integration, `source_code_review`,
  render and verify, while unrelated current chunks may be reused;
- style packet/review/authorization changes invalidate integration and all
  downstream artifacts;
- wrapper/map, no-rewrite receipt or integrated-source change invalidates
  `source_code_review`, render and verify;
- master change invalidates technical verify and optional shot export.

The earlier fixed four-producer topology lacks
`authoring_topology_id: bounded-authoring-cluster-v1` and is inspection-only
for a new build. This is a topology resume decision, not a declaration that all
`pipeline_contract_version: 2` run states are legacy. A version-2 state remains
structurally current; resuming build additionally requires the current topology
manifests and exact source-review chain.

## Persistence and privacy

- The state path is exactly
  `<project-root>/.erduo-hyperframes-broll/run.json`.
- Reject a symlink project root, state directory or state file.
- Save via a unique sibling file opened exclusively with mode `0600`, rename
  into place, and clean up only that temp file. Apply directory `0700` and file
  `0600` on POSIX.
- Load validates JSON shape, schema/pipeline version, manifest hash, stages,
  transitions and privacy before returning. A corrupt/unknown state is never
  silently replaced.
- Privacy validation rejects credential-like keys, absolute Unix/Windows/UNC/
  file-URL strings and unknown top-level/state/stage fields.

## Test minimum

Cover streaming file hash, real content change, changed-during-read,
symlink/directory/missing file, canonical object order, array order, invalid
canonical values, both modes and required slots, manifest determinism, every
invalidation row, identical-manifest no-op, earliest combined invalidation, all
legal/illegal transitions, upstream gate, output fingerprint requirement,
fixed failure catalog, unknown/corrupt/tampered state, privacy key/path/secret
attempts, atomic save/permissions/field preservation, write/rename/cleanup
failures and Windows path-shaped string rejection.

Topology tests additionally cover deterministic dynamic chunking, the 8-shot/
45,000-ms defaults and oversize singleton, bridge rejection of changed planner
boundaries, unique chunk-author isolations, attempt 1/2, seven gates,
static-style review and current-byte authorization before no-rewrite
integration, actual-source review before render, restricted still authority,
and the distinction between version-2 base state validity and fixed-four-
producer topology legacy status.
