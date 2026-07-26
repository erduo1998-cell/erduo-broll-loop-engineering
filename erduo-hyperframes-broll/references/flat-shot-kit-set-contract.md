# Flat shot kit set contract

## Purpose and scope

The assets producer emits one set index that covers every current director
shot with exactly one ordinary-primary flat shot kit. The set is the only
assets-stage collection boundary consumed by the main `asset_fact_review` and
master-build.

This contract is non-layered. Every primary route is `user-media`,
`image-generation`, or `pexels`. HyperFrames-native elements may be added only
as later auxiliary consumers. The set, kits, review rows and fallbacks must not
contain Scene Kit, hero quota, layer, matte, depth, clean-plate or
decomposition fields.

The machine-readable index shape is
[`flat-shot-kit-set.schema.json`](flat-shot-kit-set.schema.json). Every member
kit conforms to [`flat-shot-kit.schema.json`](flat-shot-kit.schema.json).

## Exact upstream and byte bindings

The index uses:

```json
{
  "schema_version": 1,
  "pipeline_contract_version": 2,
  "director_manifest_sha256": "<director manifest self-hash>",
  "shot_plan_sha256": "<director shot-plan artifact byte hash>",
  "design_slice_sha256": "<raw design-slice artifact byte hash>",
  "target_raster": { "width": 3840, "height": 2160 },
  "shot_count": 2,
  "kits": [
    {
      "shot_id": "S001",
      "artifact_id": "flat-shot-kit-S001",
      "sha256": "<raw kit artifact byte hash>",
      "size_bytes": 4096
    }
  ]
}
```

`scripts/validate-flat-shot-kit-set.mjs` does not trust those summaries. It
validates the actual version-2 director manifest, resolves and parses the
actual design-slice bytes, proves that the director manifest's
`design-slice` artifact record matches those bytes, then resolves every kit
artifact and checks its raw byte length, raw SHA-256 and document contents.

The ordered set must be exactly `S001..SN`, and the actual parsed design slice
must carry the same ordered shot IDs and `shot_plan_sha256`. The director
manifest must contain matching `shot-plan` and `design-slice` artifact records.
Missing, duplicate, extra or reordered kits fail. Every kit must bind the same
actual design-slice byte hash and target raster. Route and media kind are
derived from the resolved kit bytes rather than copied into the set index.

The callable API is:

```js
await validateFlatShotKitSet(index, {
  directorManifest,
  designSliceBytes,
  kitArtifacts: new Map([["flat-shot-kit-S001", kitBytes]])
});
```

The CLI resolves kit files as `<kit-root>/<artifact_id>.json`:

```bash
node scripts/validate-flat-shot-kit-set.mjs \
  private-flat-shot-kit-set.json \
  --director-manifest private-director-manifest.json \
  --design-slice private-design-slice.json \
  --kit-root private-kit-directory
```

Symlinks, non-files, missing kit bytes, byte/hash drift and invalid JSON fail
closed.

## Assets-stage contribution authority

Every member kit has `pipeline_contract_version: 2` and must leave
`contribution_evidence.status` as `pending-master-build` with every evidence
field `null`. Assets cannot promote this status or insert frame, ROI-diff,
changed-pixel or receipt claims. Master-build later writes verified
contribution to its own binding/receipt; it never mutates the frozen kit.

## Required assets artifacts

The version-2 assets manifest uses these stable IDs:

- `flat-shot-kit-set`
- `flat-shot-kit-S001` through `flat-shot-kit-SNN`

The assets contact-sheet packet, paired visual/facts pages, candidate and
rejection evidence, main-agent inspection bindings and all other review
artifacts are defined only by
[`asset-design-packet-contract.md`](asset-design-packet-contract.md). This
collection contract does not define a competing single-sheet or row shape.

## Path-free validator receipt

Success returns only collection facts:

```text
schema_version
pipeline_contract_version
director_manifest_sha256
shot_plan_sha256
design_slice_sha256
target_raster
shot_count
flat_shot_kit_set_sha256
route_counts { user_media, image_generation, pexels }
rights_counts { cleared, conditional }
contribution_status_counts { pending_master_build }
```

The receipt contains no locator, filename, absolute path, URL, asset ID or
private provenance identifier. It proves collection structure and exact byte
bindings, not semantic relevance, composition quality, rights law, media probe
truth or visible pixel contribution.
