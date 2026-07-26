# Block-build and integrated-source packet contract

## Purpose and authority

In pipeline contract version 2 with
`authoring_topology_id: bounded-authoring-cluster-v1`, `broll-master-build`
authors exactly one
bounded contiguous block. It emits deterministic block evidence for
integration, not a complete-film preview and not a main-agent visual-review
packet. Multiple isolated block producers share one immutable whole-film rule
set.

After every block passes, the parent performs `style_conformance_review` over
all current block source/capture/facts bytes. Only an approved review may reach
independent `broll-master-integrate`, which reruns its validator, freezes the
exact style authorization, performs deterministic assembly without rewriting
block source and emits the paginated actual-source packet for main
`source_code_review`.

Fixed-four `pre-master-review-index` and `html_preview_review` artifacts remain
inspection-only.

## Deterministic chunk plan

The canonical current-topology chunk plan is frozen after
`asset_fact_review` and
binds the exact brief, director/assets manifests, shot plan, design slice,
canonical design selection and selected-template content,
`visual_grammar_program`, `whole_film_rules`, display selection, real
director-frozen font package, shared frame projection, complete Flat Shot Kit
set, asset visual-recipe bindings and delivery profile.

Every ordered block record contains:

```text
block_id
shot_ids[]
shot_start / shot_end
start_ms / end_ms
start_frame / end_frame
long_singleton
namespace
preceding_seam / following_seam
allowed_design_shot_sha256s[]
allowed_shot_recipe_sha256s[]
allowed_flat_shot_kit_sha256s[]
allowed_asset_visual_binding_sha256s[]
scoped_materials_sha256
block_authoring_context_sha256
```

Blocks are contiguous, disjoint and exhaustive. A block normally contains at
most 8 shots and spans at most 45,000 ms. Never split a shot. Exactly one shot
whose own duration exceeds 45,000 ms may form a marked long singleton.

The existing deterministic partitioner is the sole producer of these
boundaries. The visual-authoring bridge reconstructs and rejects differences;
it cannot choose another boundary. One block author receives only the compact
shared identity/anti-identity/ten-invariant directive and its exact recipes,
not the complete program, unrelated recipes or provenance.

The exact block packet is self-contained for authoring. In allocated shot
order it embeds every complete validated design-shot record, complete Flat
Shot Kit and complete asset visual-binding row, plus a canonical hash for each
record. `scoped_materials_sha256` also binds the full design-slice, kit-set and
asset-binding identities, exact shot count/order and the closed input policy.
Block authors must not fetch or accept undeclared design, kit or asset records
through another channel. Missing, extra, reordered, swapped, substituted or
stale records fail deterministic reconstruction before source authoring.

## Required block artifacts

Each block manifest contains at least:

- its exact chunk-plan record and whole-film-rule binding;
- block bindings for every allocated shot;
- a local HyperFrames source bundle;
- local dependency, font and ordinary-material artifacts;
- official HyperFrames authoring evidence;
- source, font, asset, HyperFrames, seek, profile and pixel gate receipts;
- actual entry/result/exit and enabled/disabled/ROI-diff evidence required by
  deterministic checks;
- authoritative source-bound style captures and objective pixel-facts
  generation bound to projected frame/timestamp, projection, renderer receipt,
  encoded/decoded hashes and review generation;
- one bounded block result index.

Every source artifact uses the assigned block namespace. Source files may
reference frozen shared runtime interfaces but may not edit shared files,
another block or the future integration wrapper.

Block bindings map every allocated design/kit record to exact source,
selector/ID, position/z-order, absolute and local frame windows, consumer,
font, seam and full five-phase lifecycle:

```text
Entry → Action → Result → Hold → Exit
```

All phases are non-empty and contiguous; Entry begins at block-local shot frame
zero and Exit ends at the exact projected shot duration. Metadata is not proof:
source and four-path seek gates resolve actual behavior.

## Immediate per-block gates

The block author freezes source, then immediately runs:

- source allocation/namespace, selector/ID, position/z-order, exact shot order,
  duration, lifecycle and local dependency checks;
- local font selection/package/runtime checks with no remote/system/generic
  fallback;
- exact kit/asset/consumer/crop/ROI checks;
- current HyperFrames checks;
- `fresh_direct`, `zero_to_t`, `end_to_t` and `random_to_t` seek equivalence;
- exact raster/rational-fps/codec/audio profile checks;
- deterministic black/empty/flat/visibility and enabled/disabled in-ROI
  contribution checks.

Static frames prove only actual font loading/readability, crop and visible
material contribution. They cannot approve animation, motion grammar,
transitions or lifecycle quality.

The block result index binds every required artifact and receipt hash plus
allocated shot IDs/windows. It has no visual decision. Failure produces one
aggregate block-scoped revision packet; the replacement block must rerun every
gate. A second failure is terminal.

## Required integration artifacts

The independent integrator accepts all and only the passing blocks declared by
the chunk plan plus the exact approved current style review/authorization. Its
manifest contains:

- minimal master wrapper;
- ordered block/import map;
- block hash ledger or Merkle root;
- integration gate receipt;
- revalidated style-integration authorization;
- full-film bindings and source-page root index;
- ordered page tables, actual source pages and paired source-facts pages;
- optional supplemental still/facts pages limited to font/crop/material
  visibility.

The integrator-authored file allowlist is closed to wrapper, map, ledger/
manifest, page indexes and deterministic receipts. It may not edit, format,
minify, normalize, parse/re-emit, concatenate through a rewriting compiler or
repair block source.

For every input block source artifact, the ledger records:

```text
block_id
artifact_id
input_sha256 / input_size_bytes
integrated_sha256 / integrated_size_bytes
ordered_position
```

The validator rereads actual input and integrated references and requires
byte-for-byte equality. Matching metadata without resolved bytes is
insufficient. Any mismatch is `integrator_rewrite_detected`.

## Full-film integration gate

Before parent source review, deterministic integration must establish:

- every chunk-plan block is present once, passed and in order;
- complete shot/SRT/frame coverage with no gap, overlap or duplicate;
- identical brief/rules/projection/design/kit/font/profile identities;
- exact visual-grammar, compact directive/recipe, asset recipe-use and approved
  style-authorization identities;
- byte preservation and closed integrator authored-file allowlist;
- global namespace, DOM ID and selector uniqueness;
- exact wrapper/map order and local dependency reachability;
- complete shot lifecycles and compatible preceding/following seam contracts;
- route/native ceiling and ordinary-material contribution;
- adjacent and full-film anti-template signature checks.

A block-owned failure returns to the owning block and consumes that block's one
retry. The integrator cannot repair it. A wrapper/map-only failure may rerun
integration once while preserving every block byte.

## Actual-source packet for main review

The integrated `source-review-index` follows the current
[main-review packet contract](main-review-packet-contract.md). Its root stays
within 4096 bytes by referring to ordered page-table artifacts. Page tables
declare every actual HTML/CSS/JavaScript source page, paired source facts and
optional supplemental still/facts pages.

Source pages preserve exact UTF-8 source and contiguous line ranges for every
file. The parent must resolve, hash-check and read all of them. Facts bind each
source range to block/shot IDs, positions/z-order, exact windows, lifecycle
boundaries, selectors, seams, dependencies and deterministic findings.

`source_code_review` binds the exact integrated manifest, whole-film rules,
chunk plan, wrapper/map, block ledger, independently revalidated style
authorization, B↔C source ledger, trusted-capture validator receipt,
integration receipt and all inspected page hashes. It checks actual
position/z-order, shot order, duration,
five-phase lifecycle, selectors, cross-block seams and errors. It cannot use
stills to approve animation.

## Rejection and invalidation

Reject before render on any missing/failed/stale block, block-bound violation,
integrator rewrite, page omission, source summary substitution, unresolved
dependency, selector/seam conflict, incomplete lifecycle, deterministic gate
failure or sampled source review.

Changing one block or authoritative style-evidence generation invalidates the
complete style review/authorization, integration, source pages,
`source_code_review`, render and verify while leaving unrelated passing blocks
reusable. Changing a style packet/review/authorization or wrapper/map/page
bytes invalidates source review and downstream. Render requires the exact
approved integrated source and style lineage.
