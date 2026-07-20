# User-media routing contract

This stage receives a validated director-brief document and the safe output of `index-user-assets.mjs`. It never walks a user directory, opens an asset, or records an absolute root path. The later runtime resolver may map a selected `asset_id` back to a root-relative path in memory; persisted public/project state records the ID only.

## Inputs

`routeUserMedia(briefs, assetIndex, context)` accepts one global output target (`target_width`, `target_height`) and an optional literal-evidence registry:

```json
{
  "schema_version": 1,
  "briefs_sha256": "<validated brief hash>",
  "target_width": 1920,
  "target_height": 1080,
  "evidence_assets": [{ "source_id": "SOURCE-001", "asset_id": "UA-..." }]
}
```

The context exact-match hash prevents mixing one video’s briefs with another input. `evidence_assets` is the only way a literal-evidence shot may select user media: every source ID declared by the brief must map to an indexed asset. No filename token can substitute for evidence registration.

## Eligibility

For an abstract/non-literal brief, an asset is eligible only when all conditions hold:

1. At least one normalized token from the brief’s concrete representation subjects matches the asset’s filename/path semantic tokens. Generic action/type labels alone cannot make a match.
2. The safe center crop needed for the target aspect preserves at least 55% of the source frame and the cropped source is at least the target width and height; no silent upscale is accepted.
3. A video duration is at least the authoritative shot duration. An image has no duration constraint and may be held by the renderer.

Score only eligible assets by subject-token overlap, then action/relationship overlap, crop retention, pixel headroom, and an image/video suitability tie-break. Sort equal scores by stable `asset_id`. Select at most one asset per shot.

## Evidence and fallback

- Literal evidence (`user-material` or `verified-source`) requires the registry mapping above. Mapped assets must still pass crop/readability/duration checks. Missing, stale, duplicate, or unsuitable mappings produce `evidence_unresolved`, not a fabricated Pexels/image result.
- Abstract and `not-required` briefs with no eligible user asset return `next_route: "pexels"`; they do not force a weak filename match merely to consume user media.
- The result contains only `asset_id`, shot metadata, public reason codes, score/crop metrics, and the next route. It must never include `relative_path`, a source directory, subtitle body, claim text, credentials, or raw probe output.

## Determinism and failure

Validate exact schemas, hashes, stable IDs, token lists, dimensions, duration, asset uniqueness, and evidence mapping before routing. Reject malformed/tampered indexes, context mismatch, duplicate evidence mappings, invalid output target, unknown fields, and unsupported media kinds with stable errors. Test normal matching, deterministic ties, image/video eligibility, crop/downscale/duration rejection, literal evidence success/failure, fallback, multi-shot isolation, and privacy scanning.
