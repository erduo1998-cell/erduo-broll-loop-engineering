# Master bindings schema 3 and deterministic material contribution

## Purpose and authority

Master-build emits one schema-3 binding document after it consumes the exact
main-approved director and assets artifacts. The document is a version-2
pipeline artifact:

```json
{
  "schema_version": 3,
  "pipeline_contract_version": 2
}
```

It does not redesign the shot, select another asset, repair timing, or mutate a
flat Shot Kit. Schema 2 is legacy inspection input only. It always reports
`resume_eligible: false` and `pipeline_upgrade_required`; it cannot enter
master-build or render.

Inspection without resolved artifacts never authorizes resume. A version-3
shape inspected without the byte options below returns
`resume_eligible: false` and `validation_required`. Only inspection supplied
with the complete options, and therefore a passing `validateMasterBindings`
receipt, may report `resume_eligible: true`.

The machine-readable shape is
[`master-bindings-v3.schema.json`](master-bindings-v3.schema.json). The
deterministic implementation is:

```js
validateMasterBindings(document, {
  designSliceBytes,
  frameProjectionBytes,
  flatShotKitSetBytes,
  kitArtifacts,
  sourceArtifacts,
  contributionArtifacts,
})
```

The material gate exposes
`buildMaterialContributionReceipt({...actual captures...})`, which derives the
full-raster P6 diff, positive in-ROI count and canonical receipt, plus
`verifyMaterialContribution(receipt, {artifacts})` for independent
revalidation.

Every `*Bytes` value and every `Map` member is an actual resolved byte buffer.
Paths, filenames, metadata-only records and self-reported hashes cannot replace
those bytes. Structured JSON inputs are independently bounded at 16 MiB.
Ordinary source media is not subjected to that JSON limit; the in-memory
validator permits up to 2 GiB and still requires the kit-declared exact length
and SHA-256. PPM evidence has its own 128 MiB decoded-input ceiling.

## Upstream identity

The top-level document binds:

- the approved shot-plan SHA-256;
- the actual design-slice byte SHA-256;
- the actual flat-kit-set byte SHA-256;
- the canonical SHA-256 of the actual shared frame-projection receipt;
- one target raster shared by the kit set, consumers, and ablation captures.

The validator parses and revalidates the actual frame-projection artifact. It
then verifies that the design slice, projection, kit set, every kit and every
schema-3 shot refer to one plan, parsed SRT, design-slice hash, shot order,
rational projection, target raster and frame window.

Every kit is resolved from the kit set by opaque artifact ID. Its actual byte
hash and byte length must match the set member record, and
`validate-flat-shot-kit.mjs` must still return
`contribution_status: pending-master-build`. Master-build never rewrites the
kit to `verified`; verified proof exists only in schema 3.

## Per-shot bindings

Each ordered `shots[]` member binds:

- the canonical fingerprint of the exact design-slice shot. This dedicated
  JSON-design canonicalizer sorts object keys, preserves finite 0..1 geometry
  floats exactly, and rejects `NaN`, infinities, negative zero, unsafe numeric
  magnitudes and non-JSON values. It does not relax the artifact-manifest
  canonicalizer's safe-integer-only rule;
- the exact flat-kit artifact ID, byte hash and ordinary asset;
- the SRT millisecond window and shared derived frame window;
- the exact five-phase design lifecycle;
- one ordinary asset, one visible primary consumer, and one result ROI;
- one verified deterministic contribution receipt captured during the
  lifecycle's absolute result-frame interval.

`ordinary_assets[]` has exactly one record per shot. Its route is
`user-media`, `image-generation`, or `pexels`, and its probed kind is `image`
or `video`. Master-build resolves the actual source bytes and checks their
length and hash against the immutable kit. No route has a weaker composition
or contribution contract.

`primary_consumers[]` has exactly one record per shot. It must:

- use `video` for video, and `img` or `background-image` for image;
- be visible at full opacity and retain the kit's element and fit;
- bind one unique `source_element_id`, exact `#id` selector, selector
  fingerprint and source-byte hash;
- copy the complete kit `composition_fit` record without substitution,
  including subject, focal point, output crop, safe/protected regions, motion,
  palette, title relation and result ROI;
- copy the kit's relative millisecond window and the design/projection frame
  window.

On the current 100%-coverage non-layered path, the approved kit and schema-3
consumer relative window must be exactly
`[0, shot.srt_window_ms.end_ms - shot.srt_window_ms.start_ms)`. A delayed,
shortened, or early-ending primary cannot pass merely because it has positive
ROI pixels at one result frame.

Optional `auxiliary_consumers[]` may use HyperFrames-native HTML, SVG, or
canvas only with `role: auxiliary`. They cannot be an ordinary asset, a primary
consumer, or a substitute for a missing kit.

Scene Kit, layers, layered heroes, matte, depth, clean plate and alpha
decomposition fields fail at every nesting level.

## Resolved-pixel ROI ablation

Every ordinary primary is captured twice at the same absolute result frame and
target raster:

1. enabled — the approved primary consumer is active;
2. disabled — that consumer alone is disabled while the rest of the source
   stays unchanged.

Both captures are normalized to the same real P6 or P3 PPM format with
8-bit RGB and `max_value: 255`. PPM is the public deterministic interchange
format. A production capture may be converted to PPM by FFmpeg or the
HyperFrames capture path before validation. The validator does not pretend to
decode PNG, JPEG, or video containers.

The receipt contains:

```text
schema_version: 1
pipeline_contract_version: 2
status: verified
producer: master-build-deterministic-roi-gate-v1
verification_mode: byte-resolved-pixel-ablation
capture_frame
target_raster
result_roi
capture_format: P6 | P3
enabled_frame: {artifact_id, sha256, size_bytes}
disabled_frame: {artifact_id, sha256, size_bytes}
roi_diff: {artifact_id, sha256, size_bytes}
roi_pixel_count
changed_pixel_count
gate_receipt_sha256
```

The validator resolves all three artifacts, parses their pixels, verifies
target dimensions and equal enabled/disabled format, and recomputes a
full-raster absolute RGB difference. The resolved diff pixels must equal that
recomputed result. `roi_pixel_count` equals the frozen ROI area, and
`changed_pixel_count` equals the number of ROI pixels with at least one changed
channel.

Pass requires a positive in-ROI changed-pixel count. The following fail:

- a missing, non-byte, wrong-size or hash-mismatched artifact;
- equal enabled/disabled artifacts;
- different file bytes or hashes whose resolved RGB pixels are equal;
- a wrong raster, malformed PPM, changed ROI, wrong count, or false diff;
- changes only outside the frozen ROI;
- a capture outside the exact design result phase;
- a gate hash that does not bind the complete deterministic receipt.

This is a material-contribution rejector, not an aesthetic score. Positive
pixels do not prove semantic relevance, strong composition, readability or
visual quality; the existing qualified main-agent target-raster review remains
mandatory.
