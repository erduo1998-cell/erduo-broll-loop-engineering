# Static style-conformance review contract

## Purpose and pipeline position

`style_conformance_review` is an independent main-agent gate for implemented
static visual quality. It is inserted after all block source bytes are frozen,
the existing block deterministic gates pass, and source-bound
`entry/result/exit` stills plus objective pixel facts exist. Integration may
start only after this review validates with `decision.outcome: approved`.

The active identity remains:

```text
pipeline_contract_version: 2
authoring_topology_id: bounded-authoring-cluster-v1
```

The gate does not replace source/font/asset/HyperFrames/seek/profile/pixel
gates. A main review cannot waive any deterministic failure. If the review
requires revision, its findings are aggregated by owning `block_id` and are
returned as the one aggregate block-scoped retry input. Unchanged blocks remain
frozen and reusable. The style packet and review are rebuilt from the resulting
current bytes before integration.

## Authority boundary

The main agent inspects every declared source artifact and every actual
source-bound still. It decides only these static criteria:

- `visual_identity`: the implemented frame expresses the frozen visual
  identity;
- `anti_identity`: prohibited or anti-identity treatments are absent;
- `attention_geometry`: static hierarchy and attention path are intentional;
- `subject_title_relationship`: subject and title geometry reinforce rather
  than obstruct one another;
- `real_html_svg_text_readability`: visible text is readable and is backed by
  actual inspected HTML/SVG text, not producer prose or a rasterized claim;
- `accent_visibility_load`: the frozen emphasis color is perceptible without
  dominating the frame;
- `material_texture_language`: material and texture treatment follows the
  frozen grammar;
- `negative_space_responsibility`: empty areas have a compositional
  responsibility rather than being accidental dead zones;
- `adjacent_result_text_swap`: every adjacent result pair, including a
  cross-block pair, is checked for a repeated composition whose only meaningful
  change is text.

Still frames and pixel facts cannot approve or reject animation quality,
rhythm, transitions, the five-phase
`Entry → Action → Result → Hold → Exit` lifecycle, or seek behavior. Those
remain source/runtime/deterministic-gate responsibilities. The review must
therefore carry:

```json
{
  "static_scope_only": true,
  "animation_approved_from_stills": false,
  "rhythm_approved_from_stills": false,
  "transitions_approved_from_stills": false,
  "five_phase_lifecycle_approved_from_stills": false,
  "seek_behavior_approved_from_stills": false
}
```

`measure-style-pixel-facts.mjs` has
`authority_scope: objective-pixel-facts-only`. Its luma, chroma-area,
edge-area, border-deviation occupancy, alpha, raster, ROI, byte hash and
decoded-pixel hash fields are measurements, not aesthetic thresholds, quality
scores, readability claims, emphasis judgments, approvals or delivery
authorization.

## Required immutable bindings

The validator receives external expected bindings from the current parent
chain. They include:

```text
pipeline_contract_version
authoring_topology_id
visual_grammar_sha256
whole_film_rules_sha256
design_slice_sha256
chunk_plan_sha256
projection_sha256
review_generation
reviewer_isolation_sha256
blocks[]:
  block_id
  block_manifest_sha256
  producer_isolation_sha256
  ordered shot_ids[]
  ordered source_sha256s[]
  block_scope:
    namespace
    start_ms / end_ms
    start_frame / end_frame
    preceding_seam / following_seam
  authoring_context_sha256
  shared_directive_sha256
  ordered shot_recipe_sha256s[]
  renderer:
    tool_id
    tool_version
    entrypoint_artifact_id
    config_sha256
    receipt_sha256
  capture_schedule[]:
    shot_id
    distinct_projected_frames_required: true
    entry/result/exit:
      projected_frame
      timestamp_ms
```

`visual_grammar_sha256` is the SHA-256 supplied by the director chain for the
exact frozen static visual-grammar artifact or canonical static-grammar slice
of `whole_film_rules`. It is not a free-form label invented by the reviewer.
`review_generation` is a positive monotonic generation supplied by the parent
chain. Reusing a renderer receipt, still, evidence page, facts record or review
from another generation is stale evidence even when all other labels happen to
match.

Every scheduled capture coordinate is authoritative. For each shot, entry,
result and exit projected frames and timestamps are strictly increasing. The
validator also proves that the timestamp projects to the declared frame using
the shared projection's nearest-half-up rule and that both coordinates fall
inside that projected shot. A producer cannot choose new coordinates while
assembling the review packet.

The reviewer role is exactly
`erduo-hyperframes-broll-main-agent`. Its isolation SHA-256 is supplied by the
parent, must match the review, and must differ from every block producer.
Producer self-evaluation, a reviewer-child summary, or a re-signed producer
verdict is `style_review_self_attested` or
`style_review_main_agent_identity_invalid`.

## Packet index

The path-free packet index is canonical JSON no larger than 1 MiB:

```json
{
  "schema_version": 1,
  "pipeline_contract_version": 2,
  "authoring_topology_id": "bounded-authoring-cluster-v1",
  "gate": "style_conformance_review",
  "visual_grammar_sha256": "<sha256>",
  "whole_film_rules_sha256": "<sha256>",
  "design_slice_sha256": "<sha256>",
  "chunk_plan_sha256": "<sha256>",
  "projection_sha256": "<sha256>",
  "review_generation": 7,
  "visual_grammar_program": "<application/json artifact ref>",
  "whole_film_rules": "<application/json artifact ref>",
  "frame_projection": "<application/json artifact ref>",
  "design_selection": "<application/json artifact ref>",
  "base_template": "<application/json artifact ref>",
  "design_library": "<application/json artifact ref>",
  "block_count": 2,
  "blocks": [
    {
      "block_id": "B001",
      "block_manifest_sha256": "<sha256>",
      "producer_isolation_sha256": "<sha256>",
      "source_artifacts": ["<ordered artifact refs>"],
      "authoring_context": "<application/json artifact ref>",
      "renderer_config": "<application/json artifact ref>",
      "renderer_receipt": "<application/json artifact ref>",
      "evidence_page": "<application/json artifact ref>"
    }
  ],
  "packet_index_sha256": "<canonical core sha256>"
}
```

An artifact reference is exactly:

```json
{
  "artifact_id": "opaque-id",
  "sha256": "<sha256>",
  "size_bytes": 123,
  "media_type": "application/json"
}
```

Source media types are `text/html`, `text/css`, `text/javascript`,
`application/javascript`, or `image/svg+xml`. A block declares at least one
actual source artifact. Every reference resolves by opaque artifact ID to
actual bytes. Opaque artifact IDs are unique across packet sources, evidence
pages, stills and facts. Source SHA-256 values are deliberately **not**
unique: two different source artifact IDs may contain byte-identical files.
Every ordered source-hash array preserves position, length and repeated values,
so multiplicity is still hash-bound and dropping or reordering an item fails.
Paths never enter the review artifact.

The six actual rule/design artifacts are mandatory. The validator parses and
revalidates the frame projection, VGP and WFR against the actual design
selection, base template and packaged design-library snapshot. It then
revalidates every actual block authoring-context artifact with
`validateWholeFilmBlockContext`. This proves that the compact shared directive
and exact ordered per-shot recipes reconstruct from the current VGP/WFR and
block scope. Matching labels or hashes without these actual values are not
review evidence.

Each block carries its actual renderer-config JSON and one renderer receipt.
The config artifact byte hash must equal the externally expected
`config_sha256`, and `entrypoint_artifact_id` must name one of that block's
actual source artifacts. The submitted receipt is never trusted merely because
its canonical self-hash is valid. It must exactly equal the receipt derived by
the validator from a fresh trusted capture run, as specified below.

## Trusted source-to-capture rerun

`validateStyleConformanceReview` requires a
`trustedCaptureRunner` function. This adapter is a production trust boundary:
the pipeline operator must pin its implementation outside producer control and
wire it to the real deterministic HyperFrames capture path. A producer-supplied
adapter, cached producer receipt, or adapter that simply echoes submitted still
artifacts does not satisfy this contract.

The frozen adapter call is:

```js
await trustedCaptureRunner({
  runner_contract: "style-trusted-capture-runner-v1",
  pipeline_contract_version: 2,
  authoring_topology_id: "bounded-authoring-cluster-v1",
  block_id,
  block_manifest_sha256,
  source_bundle: [
    {
      artifact_id,
      sha256,
      size_bytes,
      media_type,
      bytes // actual frozen source bytes
    }
  ],
  entrypoint_artifact_id,
  projection: {
    manifest, // exact packet artifact ref
    document  // parsed, deterministically revalidated projection
  },
  renderer: {
    tool_id,
    tool_version,
    config_manifest, // exact packet artifact ref
    config           // parsed exact config JSON
  },
  review_generation,
  capture_schedule
})
```

The adapter returns exactly:

```js
{
  runner_contract: "style-trusted-capture-runner-v1",
  outputs: [
    {
      shot_id,
      phase,
      projected_frame,
      timestamp_ms,
      bytes // freshly rendered/reopened PNG or JPEG bytes
    }
  ]
}
```

Outputs are in complete block shot order and, within each shot,
`entry/result/exit` order. Missing, extra, reordered or relabeled outputs fail.
The validator probes and decodes every returned byte buffer itself; the adapter
does not supply trusted hashes or dimensions.

From that exact request and the independently measured outputs, the validator
constructs `trusted-style-capture-run-receipt` with:

- `runner_contract`;
- `input_manifest`, containing block/manifest identity, every ordered source
  artifact reference, entrypoint, projection reference, renderer tool/version,
  renderer-config reference and review generation;
- the complete capture schedule;
- an ordered output manifest containing each shot, phase, projected
  frame/timestamp, encoded SHA/size/type, dimensions and decoded-RGBA hash;
- canonical `receipt_sha256`.

The packet's receipt bytes and externally expected receipt hash must equal this
freshly derived receipt exactly. The validator then byte-compares every trusted
runner output with the corresponding submitted still and compares its encoded
hash, media type, dimensions and decoded RGBA. Thus a valid-looking,
internally re-signed receipt/capture/facts/page/review chain cannot authorize an
arbitrary image.

## Per-block evidence page

There is exactly one evidence page for every expected block and no sampled
page set. Each page binds the block manifest and the ordered source hashes,
covers every allocated shot in order, declares one actual PNG/JPEG for each
`entry`, `result`, and `exit` state, and declares exactly one objective
pixel-facts artifact:

```json
{
  "schema_version": 1,
  "pipeline_contract_version": 2,
  "authoring_topology_id": "bounded-authoring-cluster-v1",
  "gate": "style_conformance_review",
  "block_id": "B001",
  "block_manifest_sha256": "<sha256>",
  "source_sha256s": ["<sha256>"],
  "projection_sha256": "<sha256>",
  "review_generation": 7,
  "authoring_context_sha256": "<sha256>",
  "shared_directive_sha256": "<sha256>",
  "shot_recipe_sha256s": ["<sha256>"],
  "renderer_receipt_sha256": "<sha256>",
  "shot_count": 1,
  "shots": [
    {
      "shot_id": "S001",
      "entry": "<authoritative capture record>",
      "result": "<authoritative capture record>",
      "exit": "<authoritative capture record>"
    }
  ],
  "pixel_facts": "<application/json artifact ref>",
  "page_sha256": "<canonical core sha256>"
}
```

An authoritative capture record contains:

```text
artifact_id
block_manifest_sha256
ordered source_sha256s[]
shot_id
phase
projected_frame
timestamp_ms
projection_sha256
shot_recipe_sha256
renderer_tool_id
renderer_tool_version
renderer_receipt_sha256
review_generation
sha256
size_bytes
media_type
width / height
decoded_rgba_sha256
capture_binding_sha256
```

`capture_binding_sha256` canonically hashes every preceding field. The
validator checks the exact expected shot, phase and scheduled coordinate, the
current block/source/recipe/projection/renderer/generation bindings, the
timestamp-to-frame projection, real raster dimensions, encoded byte hash and
decoded RGBA hash. Relabeling a frame as another phase, duplicating one
projected coordinate when the three phases must be distinct, changing the
frame/time, or presenting a stale renderer receipt fails even after an
attacker renews all outer JSON hashes.

The validator resolves all source, context, receipt, page, still and facts
bytes, checks byte size and SHA-256, checks PNG/JPEG magic, and verifies that
each facts-frame record contains the identical complete capture record.
Encoded bytes may legitimately repeat across phases: byte-identical PNG/JPEG
files are allowed only under distinct opaque artifact IDs and their distinct
authoritative scheduled coordinates. Artifact IDs themselves may never repeat.
Missing or sampled pages fail closed with `style_review_page_missing`,
`style_review_block_coverage_incomplete`,
`style_review_shot_coverage_incomplete`, or
`style_review_adjacent_coverage_incomplete`.

## Objective pixel-facts artifact

`measure-style-pixel-facts.mjs` accepts one block request with frozen
`block_manifest_sha256`, ordered `source_sha256s`, projection hash, positive
review generation, renderer tool/receipt binding, and exactly three ordered
frame locators per shot. Each requested frame also binds its opaque artifact
ID, shot, phase, scheduled projected frame/timestamp, exact shot-recipe hash
and optional ROI. Locators are private-store relative paths.

The measurer resolves a non-symlink root with `realpath`, walks every locator
component with `lstat`, rejects any symlink ancestor or terminal symlink, and
then proves that the final realpath remains beneath the resolved root. Lexical
containment alone is insufficient. Missing states, non-PNG/JPEG data, invalid
rasters and ROI outside the real raster also fail.

The path-free output binds:

- actual encoded bytes: `sha256`, `size_bytes`, `media_type`;
- real probed raster: `width`, `height`;
- actual decoded pixels: `decoded_rgba_sha256`;
- fixed, declared measurement thresholds;
- whole-frame luma mean/stddev, chroma-pixel area, edge-pixel area,
  border-derived pixel-deviation occupancy, non-zero alpha and opaque area;
- the same facts for an optional declared integer ROI.

The measurement thresholds are fixed facts (`chroma_delta: 32`,
`edge_luma_delta: 24`, `border_deviation_delta: 24`). They do not define a
pass/fail or claim what looks good.

Pixel-facts hashes are not trusted as measurement authority. During
`validateStyleConformanceReview`, the consumer passes each bound still's actual
encoded bytes back through the same byte-based probe, RGBA decoder and metric
implementation. It compares the encoded hash/size/type, dimensions, decoded
RGBA hash, thresholds, whole-frame facts, ROI and ROI facts. Therefore forged
metrics fail with `style_pixel_facts_recompute_mismatch` even if an attacker
recomputes the facts self-hash, page hash, packet hash, decision hash and review
hash. Failure to independently decode the actual bound bytes is fail-closed as
`style_pixel_facts_recompute_failed`.

The validator CLI applies the same filesystem rule to `--artifact-root` and
every artifact-map locator: the root and all ancestor components must be real,
non-symlink filesystem objects, and the final artifact realpath must remain
beneath the resolved root. The artifact map contains only opaque ID → portable
relative locator entries; paths never enter signed review artifacts.

## Review artifact

The review must validate against
`style-conformance-review.schema.json`. It binds the packet-index byte SHA-256,
all global grammar/rule/design/plan/projection hashes, the review generation
and independent main-agent identity.

For every block, `reviewed_blocks[]` repeats:

- the block manifest hash;
- every inspected source SHA-256 in packet order;
- the validated authoring-context and shared-directive hashes;
- every exact per-shot recipe hash in shot order;
- the validated renderer-receipt hash;
- the evidence-page byte SHA-256;
- every inspected still SHA-256 in shot and `entry/result/exit` order;
- every inspected capture-binding SHA-256 in the same order;
- the pixel-facts byte SHA-256;
- one eight-criterion boolean checklist for every shot;
- the exact finding IDs affecting that shot.

For the whole ordered shot list, `adjacent_result_reviews[]` contains exactly
one record for every neighboring result pair. The pair binds both result
hashes. Its owning block is the block containing the right-hand shot. If the
pair is only a text swap, `only_text_changed` is true and at least one
`adjacent_result_text_swap_only` finding is owned by that right-hand block.

Every failed shot criterion requires a matching actionable finding; a passing
criterion cannot retain one. Findings contain bounded human-authored summary
and required-change text, current evidence hashes and an owning block. A
non-adjacent finding may reference only shots in its owning block. An adjacent
finding may reference the left neighbor in another block but remains owned by
the right-hand block.

`block_revision_findings[]` is a deterministic grouping of the flat finding
list by expected block order. It contains only blocks with findings and cannot
omit, duplicate or move a finding.

`decision.outcome` is:

- `approved` only when all pages and sources were inspected, every shot
  checklist passes, every adjacent pair is not merely a text swap, and there
  are zero findings;
- `revision_required` when one or more current block-scoped findings exist.

`decision_sha256` is the canonical SHA-256 of:

```text
reviewed_blocks
adjacent_result_reviews
findings
block_revision_findings
decision without decision_sha256
```

`review_sha256` is the canonical SHA-256 of the complete review without
`review_sha256`. Canonical hashing uses recursively sorted object keys, array
order as authored, UTF-8 JSON and safe-integer numbers, matching
`fingerprintArtifactValue`.

## Fail-closed and invalidation rules

The following always invalidate approval:

- changing visual grammar, whole-film rules, design slice or chunk plan;
- changing the shared projection or review generation;
- changing a block manifest, scope, producer isolation, source byte, compact
  authoring context, shared directive, shot recipe, renderer identity,
  entrypoint, renderer config/receipt, scheduled capture coordinate, trusted
  rerun output byte, submitted still byte, evidence page, objective facts byte
  or packet index;
- missing any source, page, shot state, pixel-facts record, shot check or
  adjacent pair;
- a phase relabel, frame/timestamp drift, stale renderer receipt, capture
  binding mismatch, omitted/extra/reordered trusted runner output, trusted
  output versus submitted-still byte mismatch, decoded-RGBA mismatch or
  independently recomputed metric mismatch;
- omission of the trusted capture runner or a runner that fails the frozen
  adapter contract;
- an artifact-map or frame locator that uses a symlink root/component or whose
  final realpath escapes its resolved root;
- reviewer isolation equal to any producer isolation;
- approval with findings, revision without findings, a failed check without a
  finding, or an orphan/mis-scoped finding;
- any positive still-derived animation, rhythm, transition, lifecycle or seek
  approval.

The validator is asynchronous because it reruns capture and independently
probes and decodes actual image bytes. Callers must use:

```js
await validateStyleConformanceReview({
  review,
  packetIndexBytes,
  artifactBytes,
  expected,
  trustedCaptureRunner
})
```

The CLI additionally requires `--artifact-root` and
`--capture-runner <trusted-adapter.mjs>`. That module must export
`captureStyleFrames(request)` with the same adapter contract and must be pinned
by the production operator outside producer control. The validator returns
only a bounded receipt with
projection hash, review generation, status, block/shot/finding counts, revision
block IDs and review SHA-256. It does not reinterpret the main-agent aesthetic
decision.

## Integration hand-off

The integration stage must receive the exact approving review and validated
receipt. Before assembly it reruns this validator against current artifact
bytes and expected block bindings, using the same operator-pinned real
HyperFrames capture adapter and renderer configuration. It must not substitute
a mock adapter, producer-supplied module, submitted receipt, or submitted still
reader in production. The hand-off also constructs an exact ordinal B↔C source
ledger from the style blocks and actual integration chunk manifests/source
maps. Block/chunk manifest identity, producer isolation and every source
artifact ID, relative path, media type, byte count, SHA-256, order and actual
byte must agree; an independently supplied style block set cannot authorize
different integration bytes. Unit tests may use a deterministic trusted mock
adapter only to exercise the contract. `master-integrate` remains a
deterministic assembler: it cannot repair a style finding or rewrite block
bytes. Any block, source-ledger or evidence change invalidates the review and
requires a new packet and new main-agent decision. Existing source-code review,
lifecycle, seam and seek authority remains unchanged after integration.
