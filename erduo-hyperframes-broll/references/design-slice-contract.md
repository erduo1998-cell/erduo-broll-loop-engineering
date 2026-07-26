# Design slice contract

This contract compiles a confirmed visual direction into per-shot composition, typography and motion decisions that can be reviewed before asset routing or HyperFrames authoring. It supplements the existing director and display-font contracts; it does not replace the SRT time truth, asset route order, official HyperFrames authoring requirement or main-agent pixel review.

## Evidence and scope

`design-capability-registry.json` records F01–F09 and G01–G10 from the 2026-07-23 user-provided synthesis. Every entry remains distilled candidate/pattern evidence. None is a production author standard or a default-selectable template until author calibration and real render promotion evidence exist.

This slice is deliberately flat. It does not define or authorize Scene Kits, a hero-shot quota, clean plates, mattes, depth maps, alpha layer generation or any other layered-hero workflow. Media stays under the existing user-media → image-generation → Pexels → native-auxiliary contracts.

## Document identity

A design slice uses `schema_version: 1` and
`pipeline_contract_version: 2`, binds the parsed-SRT content hash, current
shot-plan hash, exact version-2 shared frame-projection artifact and registry
version, freezes one primary style DNA and references one already validated
display-font selection. A missing or wrong pipeline contract version fails
closed as `pipeline_upgrade_required`. `display_font_selection` must point to:

- `scripts/validate-display-font-selection.mjs#user-local-v1`
- `user-provided-local`
- the same `primary_visual_dna` as `style_dna.dna_id`
- exactly the four existing display roles: `key-quote`, `chapter-focus`, `core-number`, `emphasis`

The display selection reference is not font proof by itself. The existing display-font validator still owns catalog membership, binary hash, DNA compatibility and glyph coverage.

## SRT time truth and one derived frame projection

Half-open integer-millisecond SRT windows remain the only upstream editable
time truth. Every shot carries one authoritative
`srt_window_ms: {start_ms, end_ms}` copied from the normalized shot plan.
`start_frame` and `duration_frames` are mirrors derived by
`scripts/compile-frame-projection.mjs`; producers cannot author or repair them.

The projector accepts only `pipeline_contract_version: 2`, a path-free
artifact ID, parsed-SRT SHA-256, plan SHA-256, contiguous shot millisecond
windows and an exact reduced rational `fps: {numerator, denominator}`. Its
artifact and embedded receipt also carry version 2; a legacy or missing value
fails closed. It uses BigInt integer arithmetic and the fixed rule
`absolute-ms-nearest-half-up-shared-boundary-v1`:

```text
frame(t_ms) = floor(t_ms * fps_numerator / (1000 * fps_denominator) + 1/2)
```

The same absolute boundary function is used for every start and end. A shared
millisecond boundary therefore maps to one shared frame; independent rounding
cannot introduce a gap or overlap. A non-empty SRT shot that maps to zero
frames fails instead of being stretched by a producer.

The top-level `frame_projection` reference binds:

- path-free `artifact_id`;
- `pipeline_contract_version: 2`;
- projector contract and fixed rule version;
- projection SHA-256 receipt;
- parsed-SRT and plan SHA-256;
- exact rational fps.

`scripts/validate-design-slice.mjs` requires the corresponding projection JSON
through `--projection`. It parses and revalidates that object, then checks every
shot's millisecond and frame mirrors. Matching self-reported hashes without the
projection artifact never pass.

## Style DNA is a relationship system

`style_dna` freezes executable relationships, not a color skin:

- visual invariants
- subject-to-title relationship
- material relationship
- negative-space policy
- type-contrast relationship
- edge-bleed relationship
- prohibited directions

Every shot states how it applies all five relationships. A family ID or style paragraph alone is not sufficient.

## Per-shot composition

Every shot has one authoritative half-open SRT-millisecond window, its exact
shared-projector frame mirror and one F01–F09 composition family. It also
freezes a content-specific `selection_reason` and the registry entry's exact
`evidence_status`; an ID without those two fields is invalid. All bboxes are
normalized `{x, y, width, height}` values inside `0..1`, with positive
width/height and no overflow. The shot freezes:

- composition and focus bboxes
- an ordered reading path with named roles and bboxes
- negative-space regions with one responsibility: `focus`, `reading`, `emotion`, `material` or `transition`
- protected regions and their reason

The family ID describes topology, not a reusable skin. Reusing one family for more than two consecutive shots is invalid.

## Typography

Each shot's typography block carries a content-specific `selection_reason`
explaining its hierarchy, explicit line breaks, role assignment and any
special-mode choice. A generic style adjective is not a decision record.

Every readable element uses explicit `content_lines`; individual lines cannot contain line breaks and `wrap_mode` is always `explicit-only`. The browser must not invent final title wrapping.

Each element binds a local `font_id`, one concrete `font_family`, an empty `fallback_families` list, one role (`display`, `body`, `meta`, `mono`), weight, renderer and bbox. Display-role elements must use the frozen `display_font_id`. System and generic families are forbidden.

Allowed special modes are:

- `none`
- `brush-vector`
- `projective-plane`
- `materialized-glyph`
- `oversized-editorial`
- `microtext-texture`

A shot may use at most one non-`none` special mode. Final readable text is authored by HTML or SVG. Image generation cannot carry factual text; it also cannot be used as the final renderer for other readable copy.

## Motion

Each shot freezes one G01–G10 grammar, a content-specific `selection_reason`, the registry entry's exact `evidence_status`, and a complete half-open local-frame lifecycle:

`Entry → Action → Result → Hold → Exit`

Each phase has `{start_frame, end_frame, behavior}`. Entry starts at local frame zero, every phase is non-empty and contiguous, and Exit ends exactly at `duration_frames`. The lifecycle is a design contract, not proof of seek safety; deterministic seek-equivalence remains a separate render gate.

## Anti-template signatures

Every shot declares:

- composition signature
- primary-action signature
- focus signature
- geometry signature
- a content-specific novelty basis
- an optional content-driven continuity exception

The validator rejects adjacent shots whose composition, action and focus signatures are all identical. The only exception is an explicit `{content_driven: true, reason, semantic_link}` continuity record. The same record may also mark a later recurrence of an earlier complete composition/action/focus/geometry signature; `validate-anti-template-signatures.mjs` then applies the full-film frequency, uniqueness and surface-variant limits. It also independently rejects:

- more than two consecutive uses of one composition family
- adjacent geometry that is actually unchanged while only readable text changes

Signatures are review aids, not trusted geometry evidence. The validator recomputes a geometry fingerprint from bboxes, reading-path roles, protected/negative-space regions and typography geometry before applying the text-only-change gate.

## Validator boundary

`scripts/validate-design-slice.mjs` is a deterministic rejector. It verifies
shape, hashes, IDs, the actual shared projection object, normalized geometry,
font references, explicit wrapping, motion windows and anti-template
repetition. It does not promote F/G entries, approve visual quality, verify the
referenced font bytes, prove seek safety or replace target-raster main-agent
review.
