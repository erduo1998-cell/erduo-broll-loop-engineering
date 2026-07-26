# Artifact manifest contract

## Contract identity

Canonical artifact manifests use `schema_version: 3` and
`pipeline_contract_version: 2`. Parent envelopes use `schema_version: 2` and
the same pipeline contract version.

The bounded long-film authoring graph does not increment the pipeline contract
version. Its additional identity is:

```text
authoring_topology_id: bounded-authoring-cluster-v1
```

The earlier fixed four-producer graph is inspection-only for new authoring, but
that does not make unrelated version-2 manifests, state, receipts or envelopes
legacy. Resume requires both a valid version-2 base chain and, once the build
stage is reached, the current authoring-topology artifacts.

## Private stage package

Every coarse product stage freezes complete output under the private artifact
store. The canonical manifest contains exactly:

```text
schema_version
pipeline_contract_version
run_id
stage
package_id
upstream_manifest_sha256
creative_brief_sha256
producer_isolation_sha256
artifacts[]
metrics
manifest_sha256
```

The manifest is deterministic and has no clock, timestamp, random ordering or
`created_at`. `manifest_sha256` fingerprints canonical JSON of the core
without itself. Object keys are sorted recursively; array order is preserved;
numbers must be safe integers.

Allowed stage IDs remain `preflight`, `director`, `assets`, `master-build`,
`render`, `verify`, and `shot-export`. Dynamic chunk authors and the
byte-preserving integrator are sub-topology artifacts inside the coarse
`master-build` stage, not extra top-level stage IDs.

Each artifact is exactly:

```text
artifact_id, kind, sha256, size_bytes, media_type, locator_key, required_by[]
```

IDs are bounded safe IDs. `locator_key` is a portable POSIX package-relative
key, never an absolute path, backslash path, `.` or escaping `..`. IDs and
locators are unique. Manifests contain hashes and safe IDs, never credentials,
raw private paths or embedded media.

Metrics contain at most 16 bounded scalar entries and 2048 canonical JSON
bytes. A current master-build envelope exposes bounded topology facts such as
`authoring_topology_id`, chunk counts, visual-grammar/rules/font,
style-review/authorization, authoring/integration/source/no-rewrite hashes and
seven-gate booleans; complete recipe/context/chunk/source/style documents
remain hashed artifacts.

A current director package also freezes actual `director-briefs`,
`design-selection-context`, selection, complete runtime design library,
effective base and the deterministic selection-replay receipt. Its bounded
metrics expose `design_selection_replay_sha256`; assets and authoring must
reopen and revalidate the actual artifacts instead of trusting that scalar.

## Authoring cluster artifacts

The master-build package binds the exact artifacts validated by
`validate-authoring-topology.mjs`:

- one `authoringPlan` from the sole deterministic chunk planner;
- one exact visual-authoring binding and one progressive-disclosure packet/
  context per planned block;
- one `chunkManifest` per dynamic contiguous chunk;
- one authoritative style packet/facts generation, the main
  `styleConformanceReview` and independently revalidated
  `styleIntegrationAuthorization`;
- one `integrationManifest`;
- one integration-frozen bounded source-review root, its hash-chained page
  tables, every exact source/facts page and optional supplemental visual/facts
  pair;
- the main pre-render `sourceCodeReview`.

All use `pipeline_contract_version: 2` and
`authoring_topology_id: bounded-authoring-cluster-v1`. Chunk manifests bind
actual source-file bytes and all seven deterministic gates. Style review binds
every current block source/still/facts generation before integration.
Integration independently revalidates that approval, preserves all block bytes
and may generate only the deterministic wrapper/map plus closed receipts,
manifests and bounded source-review evidence. `sourceCodeReview` binds the
exact integration, root/page-table chain, every source/facts/supplemental page
and reopened raw source bytes before render.

These topology documents have their own schema-version-1 shapes and hashes;
they do not replace or alter the outer schema-version-3 artifact manifest.

## Parent envelope and limits

The parent receives a schema-version-2 envelope of at most 4096 UTF-8 bytes:

```text
schema_version
pipeline_contract_version
stage
package_id
manifest_sha256
upstream_manifest_sha256
artifact_counts
metrics
producer_isolation_sha256
```

It cannot contain SRT text, plan rows, inventory entries, source, frames, logs
or prose explanations. Actual source stays private but must be resolved and
read by the main agent for `source_code_review`.

The current master-build receipt remains under 4096 bytes by storing bounded
style/source review cross-check summaries. The style summary freezes reviewer
role/model/isolation/authority, subject packet/generation, style review,
trusted-capture validator receipt, B↔C source ledger, integration
authorization and full-lineage receipt hashes. The source summary freezes its
reviewer/approval plus plan, integration, source bundle, no-rewrite,
authorization, ledger and validator hashes. These summaries are not render
authority: render must reopen current artifacts, rerun both complete
validators and require every cross-check field to agree.

The aggregate artifact-run validator follows the same rule. Its current
validation and inspection APIs are asynchronous and require the actual style
authorization/review packet and artifacts, block/chunk and source bytes,
trusted capture runner, integration manifest, authoring plan and source review.
They recompute style/integration/source lineage internally; a caller-fabricated
or re-signed lineage receipt cannot replace that evidence.

Limits are canonical UTF-8 byte limits: manifest `16 * 1024`; parent envelope
`4096`; one structured JSON artifact `8 * 1024 * 1024`; one source bundle
`64 * 1024 * 1024`. A manifest has at most 256 artifact records. Media remains
a separately hashed artifact and is never embedded in an envelope.

## Validation, chain and resume

Validation rebuilds the canonical manifest, checks the exact schema/version/
hashes and, when a package root is supplied, resolves every locator as a regular
non-symlink file and rechecks actual byte size and SHA-256.

Each coarse stage manifest binds the confirmed brief and one upstream
manifest. Inside master-build, the authoring plan fans out to chunk manifests
and the integration manifest deterministically fans them back in. Any changed
brief/visual-grammar/rule/plan/projection/design/font/kit byte invalidates the
visual authoring binding and all consuming chunks. A changed chunk or
authoritative style-evidence byte invalidates style review/authorization,
integration, source review and render, while unchanged passing chunks remain
reusable. A changed style packet/review/authorization, wrapper/map, integration
receipt or source byte invalidates source review and render.

A summary, envelope, stage receipt or no-rewrite claim cannot replace reopening
actual manifest/source bytes. Unsafe, oversized, stale, missing, symlinked or
hash-mismatched artifacts fail closed.
