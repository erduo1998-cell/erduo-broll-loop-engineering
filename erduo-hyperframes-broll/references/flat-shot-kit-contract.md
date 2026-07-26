# Flat shot kit contract

## Purpose

The asset producer emits one flat shot kit for every selected ordinary image or
video. The same contract covers user media, generated media, and Pexels media.
It records a frozen primary asset, target-raster composition decisions, the
actual consumer plan, a target-raster preview reference, rejected candidates,
and a bounded fallback.

This is an asset-to-build handoff, not a visual decomposition format. The
primary asset is always one ordinary image or video. HyperFrames-native visuals
may be added later only as supporting information, relationship, emphasis, or
transition elements; they cannot occupy `primary_asset`, a primary fallback, or
the primary consumer role.

The machine-readable shape is
[`flat-shot-kit.schema.json`](flat-shot-kit.schema.json). Run:

```bash
node scripts/validate-flat-shot-kit.mjs private-flat-shot-kit.json
```

The validator prints a path-free structural receipt. A successful receipt does
not prove that referenced artifacts exist or that the pixels match the claims.
Private artifact resolvers and the existing asset-integrity gate remain
authoritative for bytes, hashes, media metadata, provenance evidence, and
rights evidence.

## Required records

### Design binding and target

- `design_slice_sha256` binds this choice to the exact upstream visual decision
  slice. A different slice invalidates the kit.
- `target_raster` is the canvas used by every rectangle and point in
  `composition_fit`.
- Coordinates are integer target-raster pixels with an origin at the top-left.
  Rectangles use `{x, y, width, height}` and must remain within the canvas.

### Primary asset

`primary_asset.route` is one of `user-media`, `image-generation`, or `pexels`.
Its `media_kind` is the probed truth (`image` or `video`), not an extension
guess.

The `frozen` record contains a private artifact locator ID, actual byte hash,
size, an opaque asset-integrity receipt artifact ID, its hash, and
`verified_local: true`. Locator and receipt IDs are opaque identifiers: URLs,
filesystem paths, and path separators are rejected. The validator checks the
record shape; the assets chain must resolve the frozen bytes and named receipt,
then rerun the existing asset-integrity gate rather than trusting either hash.

`provenance` identifies the source record and binds that record by hash.
`rights` must be `cleared` or `conditional`, use a route-compatible basis, and
bind an auditable private evidence artifact. Conditional use must list at least
one limitation. Unknown or blocked rights cannot be selected.

### Composition fit

The asset producer must decide, in target-raster coordinates:

- the primary subject rectangle and focal point;
- the visible output crop;
- one or more text-safe regions;
- protected subject, face, product, or logo regions;
- source and treatment motion;
- a compact palette observation;
- how an optional title relates to the safe and protected regions;
- the result ROI in which the primary material is expected to make a visible
  contribution.

A title rectangle cannot overlap a protected region. `inside-text-safe-region`
must be contained by the referenced safe region. `none` carries no title
rectangle. The focal point must lie inside the primary subject rectangle. The
declared `min_clearance_px` is measured as the shortest Euclidean edge distance
from the title rectangle to every protected rectangle and cannot exceed the
actual minimum. The result ROI must be inside the consumer rectangle.

These fields are explicit decisions, not proof of correct pixels. The
target-raster preview and later review remain required.

### Consumer and preview

`consumer_plan.role` is always `primary`. The element must match the probed
media kind: an image uses `img` or `background-image`; a video uses `video`.
The consumer must be visible, fully opaque, have a positive relative shot
window, use the frozen source hash, and occupy the same rectangle as the
declared output crop.

`target_preview` binds one full-raster captured frame plus an opaque capture
receipt artifact ID and receipt hash. Its dimensions must equal
`target_raster`, and its relative timestamp must fall inside the consumer
window. The assets chain resolves and validates that named receipt; fields
inside the kit are not media evidence by themselves. Artifact IDs are private
opaque IDs, never paths.

### Selection and fallback

`selection_record` states how many candidates were considered and rejected,
summarizes rejection codes, and gives a concrete selected reason. A fallback
may use only the three ordinary material routes. `none` has no route or reason.
Rejected counts must leave exactly one selected candidate.

## Contribution evidence

The asset producer does not measure pixel contribution. It emits
`contribution_evidence.status: pending-master-build` with every evidence field
set to `null`.

After source construction, a deterministic master-build gate must render the
same target-raster timestamp twice with the primary consumer enabled and
disabled, resolve the actual frame bytes, measure changed pixels inside
`result_roi`, and freeze:

- enabled and disabled frame artifact IDs and distinct byte hashes;
- an ROI-difference artifact ID and byte hash;
- ROI pixel count and positive changed-pixel count;
- a receipt hash from `master-build-deterministic-roi-gate-v1`.

Only master-build's separate binding/receipt may carry `verified`. The flat kit
remains immutable at `pending-master-build`; this validator rejects any
assets-stage attempt to add frame, diff, pixel-count or gate-receipt claims.
Frame hashes by themselves, a DOM claim, metadata, a preview filename, or the
asset's own source hash cannot establish contribution.
