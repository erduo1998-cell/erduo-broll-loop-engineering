# Skill 2.0 non-layered migration contract

> Topology notice: DEC-057 supersedes this document's fixed four-producer,
> `shot_plan_review`, single `master-build`, `html_preview_review` and
> `final_frame_review` sequencing. The active execution contract is
> [authoring topology](authoring-topology-contract.md): dynamic validated
> authoring chunks, byte-preserving integration, pre-render actual-source
> `source_code_review`, and post-render technical verification only. The
> non-layered design/asset/bindings requirements below remain active where they
> do not conflict with that topology.

## Status and authority

This document is the ARC-003 migration blueprint. It freezes interfaces,
invalidation and acceptance evidence for the next implementation tasks. It does
not claim that the interfaces are implemented, that F01–F09/G01–G10 are a
production author standard, or that the current Skill can pass the failed
225-second regression.

The public pipeline contract introduced by this migration is:

```json
{ "pipeline_contract_version": 2 }
```

All new resumable runs, artifact packages, stage receipts and run-graph
validation must bind that exact value. A `schema_version` describes one
document's shape; `pipeline_contract_version` identifies the cross-document
pipeline. They are not interchangeable.

The authority order remains the project `AGENTS.md`, `DESIGN.md`, accepted
decisions and this task blueprint. The Pexels Key remains a startup hard gate.
The upstream time truth remains integer SRT milliseconds.

## Scope

Version 2 implements only a non-layered path:

- director-owned Style DNA relationships, composition topology, explicit
  typography, motion lifecycle and anti-template signatures;
- ordinary image/video material from `user-media`, `image-generation` or
  `pexels`;
- a flat, target-raster Shot Kit for each ordinary primary asset;
- optional HyperFrames-native auxiliary text, relationship, information,
  emphasis, transition and local structure;
- source, pixel and main-agent visual gates inside the existing four-producer
  path.

The following are deferred and must not appear as hidden fields, experimental
defaults, fallback branches or host-specific shortcuts:

- Scene Kit, Scene Kit Planner, generator or validator;
- a quota of 3–5 layered hero shots;
- layers, matte, depth, clean plate, alpha-separated delivery or decomposition
  prompts;
- Codex-only generation, review or rendering behavior.

An ordinary image or video may still be cropped, treated, animated and combined
with native auxiliary information. That is one flat composition and is not a
layered Scene Kit.

## Current gaps this migration closes

| Current interface | Gap | Version-2 replacement |
| --- | --- | --- |
| director plan plus style prose | Relationship, topology, type geometry, motion and repetition are not one required artifact | `design_slice` bound to the accepted shot plan |
| parent `shot_plan_review` binds only a packet hash | A hash can be approved without proving the parent inspected all shot decisions | One bounded, resolvable all-shot design review packet |
| assets inventory and Pexels-only composition facts | User/generated material lacks the same fit, rights and contribution contract | One `flat_shot_kit` per ordinary-primary shot |
| master bindings schema 2 | Native can be primary and only Pexels carries composition/contribution fields | Master bindings schema 3, bound to design slice and the approved kit set |
| template/scaffold contains visual defaults | A scaffold can impose a dark gradient, centered grid, orb or card signature | Neutral structure-only scaffold |
| state and artifact chains predate the new artifacts | A legacy run could skip the new director/assets work on resume | `pipeline_contract_version: 2` plus conservative migration invalidation |
| deterministic reports and review references | They can prove structure but not that a qualified main agent viewed pixels | Four existing main reviews consume specified bounded packets; no new reviewer |

## Canonical artifact graph

The producer count and parent review count do not change:

```text
deterministic preflight
  -> director
  -> main shot_plan_review
  -> assets
  -> main asset_fact_review
  -> master-build
  -> main html_preview_review
  -> render
  -> main final_frame_review
  -> delivery
```

The version-2 artifact dependencies are:

```text
confirmed brief + parsed SRT(ms)
  -> shot_plan
  -> design_slice
  -> flat_shot_kit_set
  -> master_bindings_v3 + source + source/pixel evidence
  -> reviewed render + deterministic verify
```

The plan and design slice are both director artifacts in one director manifest.
The kit set is an assets artifact in one assets manifest. Master-build consumes
only the exact main-approved director and assets manifests. It cannot recompute
the Style DNA, select another material, move a protected region, change an
explicit line break or substitute a motion grammar.

The render producer receives the exact approved master-build manifest and
source hash. It binds and renders those bytes; it cannot alter HTML, CSS,
JavaScript, fonts, assets, timing or design decisions.

## Time truth and frame projection

SRT windows use half-open integer millisecond intervals:

```text
[start_ms, end_ms)
```

They remain the only upstream editable time truth. Shot plans and design slices
must bind the parsed SRT hash and the shot's SRT millisecond window.

After the brief freezes an exact rational frame rate
`fps_numerator/fps_denominator`, one shared projector derives half-open frame
windows. The projector must use integer/rational arithmetic, define boundary
rounding once, preserve order, prevent overlap/gaps caused by independent
rounding and bind its rule version and input hash. No producer may hand-author
`start_frame` or `duration_frames`.

Therefore the initial `design-slice.schema.json` and validator are not ready for
DIR-006 until they:

- add the shot's authoritative `srt_window_ms`;
- add a `frame_projection` record with rational fps, rule version and projector
  receipt hash;
- verify that `start_frame` and `duration_frames` equal that projection;
- reject a frame edit that does not derive from the same millisecond window.

Frames are used for seek, lifecycle phases, capture and count verification.
When a frame result conflicts with an SRT window, the fix belongs in the one
projector or its boundary rule, never in a second timeline.

## Director output and `shot_plan_review`

### Required private artifacts

The director manifest must include:

- parsed-SRT binding and shot plan;
- `design_slice` conforming to the final design-slice schema;
- validated display-font selection;
- the capability-registry version and candidate-evidence status;
- an all-shot design review packet or packet pages.

The design slice must express Style DNA as relationships, not as a palette skin.
Each shot binds its semantic claim, SRT millisecond window, derived frame
projection, composition topology, reading path, negative-space responsibility,
protected regions, explicit text lines, local font files, one motion lifecycle,
readable result and anti-template signatures.

F01–F09 and G01–G10 are candidate vocabulary distilled from REPORT-002. A valid
ID is not promotion evidence and does not authorize a fixed DOM or visual skin.
The registry must keep its evidence/status explicit. Real render promotion is a
separate future decision.

### Bounded main-review packet

`shot_plan_review` must be based on one path-free packet no larger than the
existing review-packet limit. The packet binds the director manifest,
shot-plan hash, design-slice hash and display-selection hash, and identifies a
privately resolvable all-shot review artifact by opaque artifact ID and SHA-256.

The resolved review artifact must let the parent inspect every shot, not a
sample. For each shot it shows:

- semantic claim and intended readable result;
- SRT millisecond window and derived frame window;
- composition family plus a simple geometry thumbnail;
- primary/focus/reading/protected/negative-space relationships;
- explicit title lines, hierarchy and selected local fonts;
- ordinary-material role, motion grammar and result hold;
- composition/action/focus/geometry signatures and novelty basis.

The parent must actually resolve and inspect this bounded packet before
issuing `shot_plan_review`. Merely receiving a manifest hash, producer prose,
validator success or route count is insufficient. The parent rejects content-
free novelty, repeated topology, automatic title wrapping, generic/system
fonts, unowned negative space, weak result states and any deferred layered
field.

## Assets output and `asset_fact_review`

### Required private artifacts

Assets consumes the exact approved `design_slice` and emits exactly one
`flat_shot_kit` for every shot whose primary material is an ordinary image or
video. All kits bind the same design-slice hash and target raster.

Each selected primary route is one of:

```text
user-media | image-generation | pexels
```

Native material cannot fill the flat kit's primary asset or primary fallback.
It remains an auxiliary build concern and cannot satisfy the ordinary-material
kit count.

Each kit freezes:

- local bytes, hash, media probe and opaque artifact locator;
- provenance, auditable rights evidence and limitations;
- subject/focus, crop, protected regions, safe type space and result ROI;
- source/treatment motion, palette/contrast and title relationship;
- a visible type-correct primary consumer plan;
- one full-target-raster preview;
- rejected candidates, selection reason and bounded ordinary fallback;
- `pending-master-build` pixel-ablation fields.

Assets cannot self-verify contribution. It supplies the ROI and pending record;
master-build measures the enabled/disabled result.

### Bounded main-review packet

`asset_fact_review` consumes one packet bound to the assets manifest,
design-slice hash and complete kit-set hash. It identifies a resolvable
candidate/selected contact sheet and contains one compact row per shot:

- route and media kind;
- selected keyframe hash;
- subject/crop/safe/protected geometry;
- title/material relationship;
- rights state and evidence hash;
- rejected/fallback reason;
- native-primary count, which must be zero for kit-backed primary material.

The parent must actually view the candidate/selected contact sheet and inspect
selection reasons. Checksums, successful downloads and producer claims do not
approve semantic relevance or visual integration.

## Master-build output, bindings schema 3 and `html_preview_review`

Master-build consumes only the main-approved shot plan, design slice, display
selection and flat kit set. It uses official HyperFrames authoring skills to
solve implementation within those frozen relationships. It cannot redesign the
plan or assets.

### Master bindings schema 3

The final master binding document must contain:

```text
schema_version: 3
pipeline_contract_version: 2
shot_plan_sha256
design_slice_sha256
flat_shot_kit_set_sha256
frame_projection_receipt_sha256
shots[]
ordinary_assets[]
primary_consumers[]
auxiliary_consumers[]
```

For every shot, schema 3 binds:

- the exact design-slice shot and kit hash;
- one ordinary primary asset and one visible type-correct primary consumer;
- source bytes, composition-fit record, consumer rectangle/window and result
  ROI from the kit without semantic substitution;
- derived frame window and motion lifecycle;
- source element/selector identity used by the source gate;
- verified enabled/disabled target-raster ROI-ablation evidence.

`ordinary_assets` permits only user, generated and Pexels image/video material.
Optional native auxiliary consumers are recorded separately, cannot be primary
and cannot satisfy an absent kit. Composition and contribution validation
applies to all three ordinary routes, not only Pexels.

The kit artifact remains immutable with a pending contribution record.
Master-build emits the final schema-3 binding and a derived contribution
receipt after resolving and comparing enabled/disabled bytes. Hash differences
without resolved pixels and a positive changed-pixel count inside the frozen
ROI do not pass.

### Source and pixel output

Master-build freezes:

- neutral-scaffold HyperFrames source and all local dependencies;
- official-authoring evidence;
- master bindings schema 3;
- source/font/asset/timing/seek reports;
- target-raster entry/result/exit frames for every shot;
- ROI-ablation artifacts for every ordinary primary;
- one all-shot pre-master contact sheet and bounded pixel report.

The source gate verifies exact plan/design/kit/binding hashes, local fonts,
explicit line breaks, consumer types, selector uniqueness, projected windows
and absence of deferred fields. The pixel gate remains a deterministic
rejector. It cannot approve composition quality.

`html_preview_review` binds the master-build manifest and the bounded pre-master
packet. The qualified parent must view every shot at target-raster scale through
the contact sheet/pages and reject dead zones, weak hierarchy, generic cards,
material-as-wallpaper, text-only adjacent change, unreadable CJK, wrong font
character, broken action/result causality and repeated motion/composition.

## Render output and `final_frame_review`

Render accepts only:

- a version-2 master-build manifest;
- passing source/pixel/font/asset/seek reports bound to that manifest;
- a main `html_preview_review` bound to the same manifest;
- the exact source and dependency hashes.

It may run checks and render exactly one final master. It must not change design
or source. Its manifest binds the reviewed source, pre-master evidence, master
bytes, SRT coverage, profile, decode/audio facts and contribution receipts.

`final_frame_review` consumes a final-result contact sheet plus media facts. The
qualified parent views the real final pixels and verifies that rendering did
not introduce missing media, font fallback, blank ranges, timing errors,
repetition or visual regressions. This is the fourth existing main review, not
a fifth reviewer stage.

## Versioning, legacy reads and invalidation

The minimum version migration is:

| Document | New document shape | Required cross-pipeline field |
| --- | --- | --- |
| private run state | bump local state schema | `pipeline_contract_version: 2` |
| artifact manifest | bump manifest schema | `pipeline_contract_version: 2` |
| parent envelope | bump envelope schema | `pipeline_contract_version: 2` |
| stage receipt | bump receipt schema | `pipeline_contract_version: 2` |
| artifact run graph | bump run schema | `pipeline_contract_version: 2` |
| design slice | retain/bump its own schema as implementation requires | `pipeline_contract_version: 2` |
| flat shot kit | retain/bump its own schema as implementation requires | `pipeline_contract_version: 2` |
| master bindings | `schema_version: 3` | `pipeline_contract_version: 2` |

A legacy run without `pipeline_contract_version: 2` remains readable only by a
diagnostic/inspection path. The reader may report its stage, hashes and safe
failure state, but must return `resume_eligible: false` with stable code
`pipeline_upgrade_required`. It must not silently inject the new value, reuse a
legacy approval or present the old run as a version-2 continuation.

Starting version 2 from the same user inputs creates a new manifest/artifact
chain. Content-addressed source media may be revalidated and reused as bytes,
but old creative approvals are not reused.

Conservative invalidation is mandatory:

- missing or changed version-2 `design_slice` invalidates from `director`;
- missing, incomplete or changed `flat_shot_kit_set` also invalidates from
  `director`, because the legacy director plan did not freeze the relationships
  required to reconstruct a kit safely;
- changed display selection or design capability registry invalidates from
  `director`;
- changed selected asset bytes, rights/provenance, composition fit or target
  preview invalidates from `assets`;
- changed source, master bindings, font bytes, projection rule or any
  pixel-affecting dependency invalidates from `master-build`;
- changed reviewed master bytes invalidates render verification and
  `final_frame_review`.

No legacy receipt, artifact manifest, successful probe, old HTML preview review
or final review can waive this invalidation.

## B/C/D/E implementation sequence

ARC-003 is phase A: contract freeze only. Implementation proceeds in this
dependency order and does not skip ahead:

### B — DIR-006: director contract and pipeline identity

Required work:

1. Add version-2 identity and legacy read-only behavior.
2. Correct the design-slice time binding to SRT milliseconds plus one derived
   frame projector.
3. Require design slice and all-shot bounded review evidence in the director
   artifact.
4. Validate relationship completeness, explicit typography, lifecycle and
   anti-template geometry/signatures.

Minimum files:

- `references/design-capability-registry.json`
- `references/design-slice-contract.md`
- `references/design-slice.schema.json`
- `references/director-method-contract.md`
- `references/state-contract.md`
- `references/artifact-manifest-contract.md`
- `references/workflow.md`
- `references/stage-orchestration.md`
- `stages/broll-director/SKILL.md`
- `scripts/state.mjs`
- `scripts/artifact-manifest.mjs`
- `scripts/validate-design-slice.mjs`
- `scripts/validate-shot-plan.mjs`
- `scripts/stage-receipt.mjs`
- `scripts/validate-artifact-run.mjs`
- the matching `test-*.mjs` files

B is complete only when an old run is inspectable but non-resumable, and a
director package without a valid design slice cannot reach assets.

### C — AST-006: flat ordinary-material Shot Kits

Dependency: B accepted.

Required work:

1. Finalize the flat Shot Kit schema and validator with version-2 identity.
2. Make assets emit one complete kit per ordinary-primary shot.
3. Freeze contact-sheet evidence and the bounded `asset_fact_review` packet.
4. Require local bytes, provenance/rights, geometry, type-correct consumer and
   pending contribution for all ordinary routes.

Minimum files:

- `references/flat-shot-kit-contract.md`
- `references/flat-shot-kit.schema.json`
- `references/asset-integrity-contract.md`
- `references/image-generation-contract.md`
- `references/pexels-contract.md`
- `stages/broll-assets/SKILL.md`
- `scripts/validate-flat-shot-kit.mjs`
- applicable asset routing/integrity scripts
- artifact/run validators from B
- matching asset/kit/stage tests

C is complete only when missing one kit invalidates from director and native,
unknown rights, path-like locators, invalid crop, wrong consumer type or a
non-target-raster preview all fail.

### D — HYP-010: neutral build, bindings schema 3 and projection

Dependencies: B and C accepted.

Required work:

1. Replace the visually opinionated scaffold with a neutral structure-only
   scaffold.
2. Implement the one shared millisecond-to-frame projector.
3. Add master bindings schema 3 and enforce exact design/kit consumption.
4. Add enabled/disabled resolved-pixel ROI contribution for every ordinary
   primary.
5. Produce source/pixel/seek evidence and the all-shot pre-master packet.

Minimum files:

- `references/master-bindings-v3-contract.md` (new)
- `references/hyperframes-template-contract.md`
- `references/pre-master-visual-preflight-contract.md`
- `references/visual-evidence-contract.md`
- `assets/hyperframes-template/index.html`
- `stages/broll-master-build/SKILL.md`
- `stages/broll-render/SKILL.md`
- `scripts/build-hyperframes-timeline.mjs`
- `scripts/validate-master-bindings.mjs`
- `scripts/validate-render-source.mjs`
- `scripts/visual-preflight-pixels.mjs`
- `scripts/orchestrate-stages.mjs`
- one deterministic ROI-ablation implementation and its tests
- matching timeline/binding/source/pixel/orchestration tests

D is complete only when render cannot start from bindings schema 2, a pending
contribution, a source that diverges from its kit, or a main preview approval
bound to another manifest.

### E — QAR-009: authority split and failed-sample regression

Dependency: D accepted.

Required work:

1. Validate all four bounded main-review packets without adding reviewer
   contexts.
2. Separate deterministic failure receipts from main-agent visual decisions.
3. Exercise seek equivalence, delivery profile, contribution, repetition and
   legacy-resume failures.
4. Run the registered failed visual samples and require qualified main-agent
   review of actual pre-master and final pixels.

Minimum files:

- `references/main-review-packet-contract.md` (new)
- `references/visual-evidence-contract.md`
- `references/workflow.md`
- `references/stage-orchestration.md`
- root `SKILL.md`
- all four active stage `SKILL.md` files
- `scripts/stage-receipt.mjs`
- `scripts/validate-artifact-run.mjs`
- `scripts/visual-preflight-pixels.mjs`
- seek/profile/contribution/signature validators and matching tests
- the M20 private regression fixture/record, without private media in the
  public package

E is complete only when deterministic tests and qualified visual review both
pass. One cannot substitute for the other.

Only after E may VAL-008 rerun the same real input in Claude Code and Codex.

## Required failure and acceptance evidence

### Deterministic rejects

The test suite must include at least:

- missing/wrong `pipeline_contract_version`;
- legacy run inspected safely but refused for resume;
- completed director manifest missing `design_slice`;
- assets manifest missing one kit, with invalidation from director;
- design slice not bound to the current plan/SRT/display selection;
- hand-edited frame timing that disagrees with the shared millisecond
  projection;
- missing Style DNA relationship, unowned negative space or absent readable
  result;
- system/generic/fallback font, automatic title wrap or factual generated text;
- adjacent same composition/action/focus signatures;
- adjacent geometry unchanged while only text changes;
- more than two consecutive uses of one family without a content-driven
  continuity exception;
- Scene Kit, layer, matte, depth, clean-plate or alpha-decomposition field;
- native primary/fallback in a flat kit;
- missing/blocked rights, path-like locator, hash mismatch or wrong media
  consumer;
- target preview with the wrong raster or timestamp;
- schema-2 bindings offered to the version-2 build/render path;
- source consumer geometry/window/hash diverging from its approved kit;
- equal enabled/disabled frames, hash-only contribution, zero changed pixels
  or a difference outside the frozen ROI;
- direct, preview, capture and final-render seek paths disagreeing at frozen
  timestamps;
- render profile described only as “4K” without exact raster/fps/audio/codec
  facts;
- producer attempting to issue a main review or render redesigning approved
  source.

### Main-agent visual rejects

The private regression set must retain the ART-086/096/098 evidence and the
latest 225-second 4K failure. A qualified main agent must reject at least:

- one repeated dark/HUD/title-card composition with only wording changed;
- a frame with a large unowned dead zone or tiny isolated information;
- material used as a dim background strip rather than a compositional subject;
- title/component overlap with the material's protected subject;
- generic AI-template hierarchy, decorative glow/gradient/orb/card defaults or
  weak font character;
- repeated fade/float/scale motion that does not change information state;
- a technically decodable, hash-valid master whose actual pixels remain weak.

### Passing evidence

M20 passes only when:

- all normal, boundary and failure tests for B/C/D/E pass;
- public privacy/license audits remain clean;
- the neutral scaffold contains no default visual signature;
- every shot has a plan-bound design slice and every ordinary primary has a
  kit and verified build contribution;
- source, pre-master, render and final review hashes form one version-2 chain;
- the qualified main agent actually views and approves all four required
  packets at their intended gates;
- the same real input no longer reproduces the registered dead-zone,
  repetition, weak-material and AI-template failures in both supported hosts.

Until those conditions are met, ARC-003 is only a migration design, M20 is not
accepted, VAL-008 remains blocked and Skill 2.0 must not be reported as
implemented or production-ready.
