# Asset design and main-review packet contract

## Purpose and authority

The assets producer turns the exact deterministically validated director chain into one
ordinary, flat image/video primary for every shot. This contract defines the
private kit set and the bounded evidence the main agent must actually inspect
before master-build. It does not add a reviewer stage, permit producer
self-approval or authorize redesign.

The contract is valid only with `pipeline_contract_version: 2`. Assets reopens
the exact director manifest, parsed SRT, shot plan, `design_slice`, canonical
selection/template content, display selection, real font package, shared
projection, `visual_grammar_program`, `whole_film_rules`, deterministic facts
packet and every page byte. Missing, invalid or changed input stops before
material routing. The validated design and per-shot recipes are immutable;
material selection must satisfy them or return to director. A legacy
`shot_plan_review` is not an active prerequisite.

Scene Kit, layered hero quotas, layer, matte, depth, clean-plate,
alpha-decomposition and host-specific creative branches are outside this
contract. HyperFrames-native output is auxiliary only and cannot satisfy a
primary, fallback or kit-count requirement.

## Route-neutral candidate and selection rules

Every shot evaluates ordinary primary material in this order:

```text
user-media -> image-generation -> pexels
```

A route is skipped only with a frozen unavailable, ineligible or unsuitable
reason. Assets cannot bypass an available suitable generated result to reach
Pexels. Literal user/verified evidence that cannot be resolved is a hard
failure, not permission to fabricate or search for a lookalike.

The selected item from all three routes satisfies the same
[Flat Shot Kit contract](flat-shot-kit-contract.md):

- local frozen bytes, real media probe and hash-bound integrity receipt;
- route-specific provenance plus auditable rights evidence and limitations;
- target-raster subject, focal point, output crop, type-safe and protected
  regions;
- title/material relationship, palette/contrast, source/treatment motion and
  result ROI;
- a visible, fully opaque, type-correct primary consumer and shot-relative
  window;
- one full target-raster preview capture;
- candidate count, concrete rejection reasons, selected reason and an optional
  ordinary-route fallback;
- contribution status `pending-master-build`.

The route changes provenance/rights basis, not composition or consumer
quality. User media uses registered ownership evidence; generation uses the
frozen prompt/source record and generator-terms evidence; Pexels uses the
frozen Pexels source/attribution record and license evidence. Unknown or
blocked rights cannot be selected. A rejected contact-sheet candidate still
shows its route, provenance/rights verdict and visual-fit reason; it does not
become a valid kit merely by appearing on a page.

## Private assets artifacts

One version-2 assets manifest contains at least:

- the exact validated director manifest and deterministic facts-packet binding;
- route attempt/selection records and local integrity receipts;
- one validated `flat_shot_kit` per director shot;
- one deterministic `flat_shot_kit_set` index;
- one validated `asset-visual-grammar-bindings` artifact covering each
  recipe/kit crop, title and material application;
- target-raster candidate/selected preview artifacts;
- one contact-sheet packet index and deterministic visual/fact pages;
- validator receipts for chain, kit set, individual kits and packet coverage.

The kit-set machine shape and byte-resolution rules are owned by the
[Flat Shot Kit set contract](flat-shot-kit-set-contract.md). Its canonical
index contains exactly:

```text
schema_version: 1
pipeline_contract_version: 2
director_manifest_sha256
shot_plan_sha256
design_slice_sha256
target_raster
shot_count
kits[]
```

Each ordered kit entry is exactly
`{shot_id, artifact_id, sha256, size_bytes}`. Route and media kind are read
from the resolved kit instead of copied into the set. Shot IDs cover the
director plan exactly once in order, every kit binds the same design-slice
hash and target raster, and `flat_shot_kit_set_sha256` is the external
fingerprint of the canonical index bytes rather than a self-hash field.
Missing one kit is an assets failure that invalidates the chain from director;
native auxiliary cannot fill the gap.

Every kit must retain one ordinary image/video primary from `user-media`,
`image-generation` or `pexels`. Pure CSS, SVG or type-led authoring may support
typography, structure and auxiliary texture, but cannot satisfy the primary
route or kit requirement.

All artifacts use opaque IDs and private locator keys under the artifact
manifest contract. Parent-facing records contain no path, URL, raw SRT,
credential, prompt body or private source text.

## Contact-sheet packet

The path-free packet index is canonical JSON within the existing 8 KiB review
limit:

```text
schema_version: 1
pipeline_contract_version: 2
director_manifest_sha256
shot_plan_sha256
design_slice_sha256
visual_grammar_program_sha256
whole_film_rules_sha256
flat_shot_kit_set_sha256
asset_visual_bindings_sha256
target_raster
shot_count
route_counts
native_primary_count: 0
packet_sha256
pages[]
```

The packet cannot contain the assets manifest hash because it is itself an
artifact hashed by that manifest. The parent review provides the non-circular
binding through `subject_manifest_sha256`.

Each ordered page entry identifies both:

- a visual contact-sheet page
  `visual: {artifact_id, sha256, size_bytes}`; and
- its canonical facts page
  `facts: {artifact_id, sha256, size_bytes, shot_start, shot_end}`.

Page ranges are non-overlapping and cover every shot exactly once. The parent
must resolve and hash-check both parts of every page.

## Required all-shot visual row

Every shot row compares the considered candidates with the selected result.
Each candidate panel is captured from its target-raster placement, not shown
as an uncomposed source thumbnail. A deterministic downscale is allowed only
for page assembly; the full-raster preview remains a separately hashed
artifact. The visual and facts page together show:

Each canonical facts row contains a bounded `candidates[]`. Every candidate
has exactly:

```text
candidate_id
route
media_kind
status
preview_artifact_id
preview_sha256
rights_status
rights_evidence_artifact_id
rights_evidence_sha256
decision_code
decision_reason
```

`candidate_id`, `preview_artifact_id` and `rights_evidence_artifact_id` are
opaque IDs using the artifact-manifest safe-ID grammar; paths and overlong
strings are invalid. Both preview and rights evidence are resolved by exact
artifact ID and hash. Each shot has exactly one selected candidate, whose
route, media kind, preview and rights fields equal its flat kit. Rejected
candidate count and rejection-code aggregation equal the kit selection
record.

- shot ID, route, media kind, candidate/selected state and preview hash;
- primary subject box and focal point;
- visible output crop;
- type-safe regions and protected subject/face/product/logo regions;
- planned title box and its relationship/clearance to material;
- source/treatment motion, palette/contrast and result ROI;
- rights status plus evidence hash and any limitation;
- a concrete selected reason for the winner;
- a concrete rejection code and explanation for every rejected candidate;
- the bounded ordinary fallback or explicit absence;
- `native_primary_count: 0`;
- contribution state `pending-master-build`.

A source thumbnail, filename, media probe, route count or prose summary without
the target-raster overlays cannot satisfy the contact sheet. Candidate panels
must be legible enough for the main agent to judge subject loss, unsafe crop,
title collision, weak contrast and material-as-wallpaper treatment.

## Deterministic validation boundary

Before freezing the assets manifest, deterministic validation must reject:

- anything other than the exact approved version-2 director chain;
- an attempted edit or substitution of the approved design slice;
- a missing/stale recipe, canonical selection/template, font package, visual
  grammar, rules or recipe-to-kit crop/title/material binding;
- missing, duplicate, reordered or cross-raster kits;
- skipped route order without a frozen reason;
- native primary/fallback or any deferred layered field;
- CSS/SVG/type-led structure used as the primary instead of one ordinary
  image/video material;
- missing local bytes, invalid hash/probe, path-like locator or wrong consumer
  type;
- unknown/blocked or unauditable rights/provenance;
- out-of-raster crop, subject, safe/protected, title or result-ROI geometry;
- a preview at the wrong raster or outside the visible consumer window;
- page coverage gaps, hash mismatch or a facts/visual row disagreement;
- any assets-stage contribution status other than
  `pending-master-build`.

These checks prove structure and chain integrity only. They do not approve
semantic relevance, crop quality, title/material integration or visual taste.

## Main `asset_fact_review`

The qualified main agent resolves and actually views every visual page, checks
its paired facts page and inspects every shot before deciding. An approving
`asset_fact_review` binds:

```text
subject_manifest_sha256
director_manifest_sha256
shot_plan_sha256
design_slice_sha256
visual_grammar_program_sha256
whole_film_rules_sha256
flat_shot_kit_set_sha256
asset_visual_bindings_sha256
inspected_packet_sha256
inspected_visual_page_sha256s
inspected_facts_page_sha256s
```

It rejects irrelevant or generic material, subject loss, unsafe crop,
title/protected-region collision, weak rights evidence, dim wallpaper use,
unreadable contrast, unexplained route skipping and rejection reasons that do
not match the pixels. A producer statement, successful download, checksum,
validator receipt, selected keyframe hash or sampled page cannot replace this
all-shot visual inspection.

The producer cannot create or sign this review. Rejection returns one aggregate
revision packet to the assets producer; a second failure stops the run at
assets. No reviewer context is created.

## Contribution authority

Assets only freezes the intended `result_roi` and a pending contribution
record. `asset_fact_review` does not convert that record to verified. After
source construction, master-build must perform byte-resolved enabled/disabled
pixel ablation inside the frozen ROI and emit derived verification evidence
without mutating the approved kit. Until that deterministic gate reports a
positive in-ROI contribution, the primary remains unverified for render.
