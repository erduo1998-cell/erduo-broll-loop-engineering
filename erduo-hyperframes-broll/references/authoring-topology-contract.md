# Bounded authoring topology contract

## Identity and scope

The public long-film authoring topology is:

```text
pipeline_contract_version: 2
authoring_topology_id: bounded-authoring-cluster-v1
```

The topology ID changes the semantics inside the existing coarse
`master-build` stage while the pipeline contract version remains 2.

The canonical flow is:

```text
director deterministic facts
→ assets + main asset_fact_review
→ deterministic authoring plan
→ N isolated authoring chunks
→ seven deterministic gates per chunk
→ main static-only style_conformance_review over every current block byte
→ isolated byte-preserving integration
→ main pre-render source_code_review over actual source
→ render
→ technical verify
```

The old fixed four-producer authoring topology is inspection-only for new
builds. Other structurally valid version-2 state, manifest and receipt
artifacts are not invalid merely because they use pipeline contract version 2.

The executable truth is
`scripts/validate-authoring-topology.mjs`, with visual plan/block/style
bridging enforced by `scripts/validate-visual-authoring-chain.mjs`; the base
document shapes are mirrored by
`references/authoring-topology.schema.json`.

The existing deterministic authoring plan remains the sole chunk-boundary
producer. The visual-authoring bridge accepts its exact planned blocks,
reconstructs their SRT/projection/bounds and fails on any changed ID, boundary,
namespace or seam. It binds compact visual contexts but cannot create a second
plan.

## Constants and hashing

The module exports:

```js
PIPELINE_CONTRACT_VERSION === 2
AUTHORING_TOPOLOGY_ID === "bounded-authoring-cluster-v1"
```

Canonical fingerprints are SHA-256 over JSON with recursively sorted object
keys and preserved array order. Numbers must be safe integers. Document hash
fields fingerprint the exact canonical core without their own hash field.

IDs are bounded safe IDs. Shots are canonical `S001…S999`; chunks are
`C001…C999`. Source paths are portable package-relative POSIX paths: no
backslashes, absolute paths, normalization changes or `..` escape.

## API

The public functions are:

```js
createAuthoringPlan(options)
validateAuthoringPlan(document)

createAuthoringChunkManifest(options)
validateAuthoringChunkManifest(document, options)

createAuthoringIntegrationManifest(options)
validateAuthoringIntegrationManifest(document, options)

createSourceCodeReview(options)
validateSourceCodeReview(review, options)
assertSourceReviewBeforeRender(subject, review, options)
```

Create functions attach runtime-only, non-enumerable Maps/documents for direct
validation. They are not schema fields and disappear after JSON
serialization. A caller validating parsed JSON must supply the corresponding
plan, chunk manifests and actual byte Maps explicitly.

## Authoring plan

### Constructor input

`createAuthoringPlan(options)` requires six upstream hashes:

```text
global_rules_sha256
parsed_srt_sha256
plan_sha256
projection_sha256
design_slice_sha256
kit_set_sha256
```

`flat_shot_kit_set_sha256` is accepted as an input alias for
`kit_set_sha256`. It also requires exact rational
`fps { numerator, denominator }` and `shots[]`.

Each input shot is normalized to:

```text
shot_id, start_ms, end_ms, duration_ms
```

`shot_id` must equal its one-based canonical position. The constructor accepts
the window directly or under `srt_window_ms`/`window_ms`. Windows are positive,
strictly ordered and contiguous: every next `start_ms` equals the prior
`end_ms`.

Public defaults are:

```text
max_shots_per_chunk: 8
max_chunk_duration_ms: 45000
oversize_singleton: true
```

`chunk_policy.max_shots` and `chunk_policy.max_duration_ms` are accepted input
aliases. The deterministic greedy partition appends a shot until doing so
would exceed either bound, then closes the preceding non-empty chunk. A single
shot longer than the duration bound therefore remains a one-shot chunk. There
is no serialized `long_singleton` field; the exception is proven by
`shot_count: 1`, the shot duration and
`chunk_policy.oversize_singleton: true`.

### Exact document

An `authoringPlan` contains exactly:

```text
schema_version: 1
pipeline_contract_version: 2
authoring_topology_id: "bounded-authoring-cluster-v1"
global_rules_sha256
parsed_srt_sha256
plan_sha256
projection_sha256
design_slice_sha256
kit_set_sha256
fps { numerator, denominator }
chunk_policy { max_shots, max_duration_ms, oversize_singleton: true }
shot_count
shots[]
chunks[]
authoring_plan_sha256
```

Every chunk spec contains exactly:

```text
chunk_id
shot_start
shot_end
shot_count
start_ms
end_ms
duration_ms
shots[]
chunk_spec_sha256
```

Validation deterministically rebuilds the complete plan and requires exact JSON
equality and matching hashes; a plausible but independently authored plan
fails.

## Authoring chunk manifest

### Constructor input

`createAuthoringChunkManifest(options)` accepts:

```text
plan | authoringPlan
chunk_id | chunkId | chunk.chunk_id
sourceBytes | source_files | sources
validation_gates | gates
attempt
producer_isolation_sha256
```

`sourceBytes` is a non-empty `Map`. Values are raw bytes or descriptors with
`bytes` and optional `relative_path`, `artifact_id`, and `media_type`.
Normalized source records are sorted by `relative_path`; IDs and paths must be
unique. Each actual source is non-empty and at most 64 MiB.

All seven gates are mandatory:

```text
source, font, asset, hyperframes, seek, profile, pixel
```

The create API accepts `true`, `"passed"`, or an exact
`{ status: "passed", receipt_sha256 }` for each gate and normalizes all seven
to receipt objects. Unknown or failed gates are rejected.

`attempt` is exactly `1` or the one allowed replacement `2`. The producer
isolation is a SHA-256 and is later required to be unique across chunks.

### Exact document

A `chunkManifest` contains exactly:

```text
schema_version: 1
pipeline_contract_version: 2
authoring_topology_id: "bounded-authoring-cluster-v1"
stage: "master-build"
kind: "authoring-chunk"
authoring_plan_sha256
global_rules_sha256
chunk_id
chunk_spec_sha256
attempt
producer_isolation_sha256
shot_start
shot_end
shot_count
source_files[]
source_bundle_sha256
validation_gates
manifest_sha256
```

Every `source_files[]` record is exactly:

```text
artifact_id, relative_path, sha256, size_bytes, media_type
```

Every normalized gate is exactly:

```text
status: "passed"
receipt_sha256
```

Validation requires the exact authoring plan, finds the declared chunk, checks
the range/spec/global-rule bindings, recomputes the source-bundle and manifest
hashes, resolves every actual source byte, and revalidates all seven gates.

An attempt-2 replacement is a new manifest for the same planned `chunk_id`.
Passing chunks outside that ID remain reusable.

## Byte-preserving integration

### Constructor input

`createAuthoringIntegrationManifest(options)` accepts:

```text
plan | authoringPlan
chunks | chunkManifests
chunkSourceBytes | sourceBytesByChunk
integrator_isolation_sha256 | integratorIsolationSha256
```

Before calling the integration constructor on the active visual path, the
caller must run `validateStyleIntegrationAuthorization()` against current
VGP/WFR, actual compact directive/recipes, block source, authoritative
capture/facts generations and the main style review. A missing, stale,
revision-required or re-signed authorization stops before assembly. The exact
authorization is a sibling input/receipt in the outer master-build artifact
package; it does not alter the closed base integration-manifest shape below.

All planned chunks must appear exactly once. The constructor reorders supplied
chunks into plan order, revalidates each manifest and actual byte Map, requires
one unique producer isolation per chunk, and requires the integrator isolation
to differ from every author.

Each chunk source is exposed at:

```text
chunks/<chunk_id>/<chunk-relative-path>
```

with unchanged SHA-256, byte count, media type and bytes. The integrator may
generate exactly two deterministic JSON files:

```text
integration-wrapper  -> integration/wrapper.json
integration-map      -> integration/map.json
```

No third generated file is allowed.

### Exact document

An `integrationManifest` contains exactly:

```text
schema_version: 1
pipeline_contract_version: 2
authoring_topology_id: "bounded-authoring-cluster-v1"
stage: "master-build"
kind: "authoring-integration"
authoring_plan_sha256
global_rules_sha256
integrator_isolation_sha256
style_integration_authorization_sha256
style_source_ledger_sha256
style_validator_receipt_sha256
chunk_set_sha256
chunks[]
source_files[]
generated_files[]
source_bundle_sha256
no_rewrite_receipt
source_review_packet
manifest_sha256
```

`source_review_packet` freezes one canonical root record, the exact ordered
page-table records, every source/facts/supplemental page record and one
artifact-set SHA-256. The root is at most 4096 bytes and points to the first
page table plus an ordered page-table-chain hash. Each canonical page table is
at most 1 MiB, carries its ordinal/count and exact next-table reference, and
declares source/facts or supplemental visual/facts pairs. The complete packet
allows at most 256 page tables and 1024 declared pages.

Each `chunks[]` record contains exactly:

```text
chunk_id, shot_start, shot_end, shot_count, manifest_sha256,
source_bundle_sha256, producer_isolation_sha256, attempt
```

Each integrated `source_files[]` record contains exactly:

```text
artifact_id, integrated_path, chunk_id, chunk_artifact_id,
sha256, size_bytes, media_type
```

The two generated-file records use the normal source-file shape. The
`no_rewrite_receipt` contains exactly:

```text
schema_version: 1
pipeline_contract_version: 2
status: "passed"
mode: "byte-identical-chunk-source"
authoring_plan_sha256
style_source_ledger_sha256
style_validator_receipt_sha256
chunk_set_sha256
chunk_count
source_file_count
source_bundle_sha256
wrapper_sha256
integration_map_sha256
receipt_sha256
```

Validation reconstructs expected integrated records and both generated JSON
files, resolves every actual byte, requires exact list order, recomputes all
hashes, checks all author/integrator isolations, and validates the exact
no-rewrite receipt. The manifest cannot be created without the exact
independently revalidated current style authorization, trusted-capture
validator receipt and B↔C source ledger. Current validation reopens that
authorization through the visual-authoring bridge and proves that every
style-approved B source record and byte exactly equals its mapped integration
C source before trusting the manifest. Change, omission, duplication, reorder,
formatting, normalization or metadata-only substitution of chunk source
fails.

## Main pre-render source-code review

### Constructor input

`createSourceCodeReview(options)` accepts:

```text
integrationManifest | integration_manifest | integration
sourceBytes
plan
chunks
chunkSourceBytes
reviewer_isolation_sha256
reviewer_model_id
checks
still_evidence
```

The reviewer isolation must differ from the integrator and every chunk author.
`checks` contains exactly eight booleans, all `true`:

```text
positions
z_order
shot_order
timing
lifecycle
selectors
cross_chunk_seams
errors
```

`still_evidence` normalizes to:

```text
uses[]                 # only "font", "crop", "material-visibility"
animation_approval: false
evidence_sha256
```

The create API also accepts boolean shorthand `font`, `crop`,
`material_visibility`, plus `animation_approval:false`. Any other use or
animation approval fails.

The integration constructor, not the reviewer, deterministically freezes the
source-review root/page tables/pages. It accepts optional
`source_review_supplemental[]`, plus bounded page-size/table-entry controls for
tests and constrained hosts. Every integrated source must be exact UTF-8
HTML/CSS/JavaScript. Source pages contain the exact contiguous raw line bytes;
paired canonical JSON facts bind file identity/path/hash/size/media type,
page ordinal/count and line range. A single source line that cannot fit in a
1 MiB page fails instead of being summarized or split ambiguously.

### Exact review

A `sourceCodeReview` contains exactly:

```text
pipeline_contract_version: 2
authoring_topology_id: "bounded-authoring-cluster-v1"
gate: "source_code_review"
phase: "pre-render"
status: "approved"
subject_manifest_sha256
producer_isolation_sha256
reviewer_role: "erduo-hyperframes-broll-main-agent"
reviewer_model_id
reviewer_isolation_sha256
authority_scope: "source-review"
review_packet_sha256
deterministic_result
visual_decision: null
authoring_plan_sha256
integration_manifest_sha256
source_bundle_sha256
no_rewrite_receipt_sha256
style_integration_authorization_sha256
style_source_ledger_sha256
style_validator_receipt_sha256
whole_film_rules_sha256
chunk_plan_sha256
wrapper_sha256
ordered_block_map_sha256
block_hash_ledger_sha256
integration_gate_sha256
inspected_page_table_sha256s[]
inspected_source_page_sha256s[]
inspected_facts_page_sha256s[]
inspected_supplemental_visual_page_sha256s[]
inspected_supplemental_facts_page_sha256s[]
source_decision
source_checks
still_evidence
approval_sha256
```

`deterministic_result` is exactly:

```text
status: "passed"
facts_sha256: <exact no-rewrite receipt SHA-256>
failure_codes: []
```

`source_decision` uses the exact decision shape in
`main-review-packet-contract.md`: all source, semantic and scope booleans must
have their approving values, `finding_count` is zero, and
`animation_approved_from_stills` is false. `source_checks` and
`still_evidence` remain explicit redundant scope assertions for compact
consumer compatibility; neither can replace the decision or packet arrays.

Validation starts at the bounded root, traverses the exact hash-chained page
tables, checks the descriptor list and artifact-set hash, resolves every page,
and reconstructs each source file from contiguous page line ranges. It then
reopens the raw integrated source bytes and requires byte-for-byte equality.
The five inspection arrays must exactly equal the resolved packet order. A
hash list or outer re-sign without every page and the raw byte Maps is
insufficient.

The validator proves byte binding, authority shape and explicit review claims.
The orchestration/main-agent contract remains responsible for actually reading
all source before setting the eight checks. Static evidence cannot replace
source inspection or approve animation.

## Render prerequisite

`assertSourceReviewBeforeRender(...)` revalidates integration and source review
against actual bytes and returns:

```text
authoring_topology_id
authoring_plan_sha256
integration_manifest_sha256
source_bundle_sha256
no_rewrite_receipt_sha256
style_integration_authorization_sha256
style_source_ledger_sha256
style_validator_receipt_sha256
source_review_approval_sha256
pre_render: true
```

Render, delivery, artifact-run validation, stage preflight and every resume
boundary must call the same complete source-review validator with the
integration manifest, source-review artifact bytes, raw source bytes, plan,
chunks and chunk-source Maps. Render must require this result plus a freshly
recomputed full
`style-lineage-render-preflight-receipt`. The latter binds the fixed style
reviewer role/model/isolation/authority, subject packet/current generation,
style review, validator receipt, block/chunk sets, B↔C source ledger,
integration authorization, integration manifest/source bundle and no-rewrite
receipt. The compact stage receipt stores only bounded cross-check fields; it
is never sufficient without the reopened authorization, integration/source
bytes and complete source review. Post-render work is deterministic technical
verification only; neither `html_preview_review` nor `final_frame_review`
authorizes a current topology render.

The outer render lineage additionally binds the current visual-grammar
program, whole-film rules, director-frozen font package, approved static style
review and independently revalidated style-integration authorization.

## Prohibited scope

This topology does not introduce Scene Kit, layers, matte, depth, clean plate,
alpha decomposition, layered-hero quotas or Codex-specific creative paths.
