# Candidate coverage contract

Run candidate coverage after the normalized shot plan and director briefs pass their own validators. Coverage is a deterministic build gate, not a creative score.

## Modes

- `talking-head` may use `fullscreen`, `hard-alpha-over-source`, or `native-base-with-overlay` as a shot's primary coverage.
- `faceless` may use `fullscreen` or `native-base-with-overlay`. It must not use `hard-alpha-over-source`, because no talking-head source exists beneath the Alpha layer.
- A black-background light pass is supplementary and is never accepted as primary coverage.

## Complete coverage

The normalized plan is the only time source. The first window starts at `timeline.start_ms`, every window ends exactly where the next starts, and the last ends at `timeline.end_ms`. Every shot has exactly one matching validated brief, its duration matches the plan, and its independent silent review still says `pass`.

The report exposes integer `covered_ms`, `total_ms`, `uncovered_ms`, and `coverage_basis_points`. Complete coverage is exactly 10,000 basis points; it is never inferred from a rounded percentage. Any gap, overlap, missing brief, altered hash, duration mismatch, failed silent review, or mode/compositing conflict stops the build.

## Command

```sh
node scripts/check-coverage.mjs talking-head normalized-plan.json validated-briefs.json
node scripts/check-coverage.mjs faceless normalized-plan.json validated-briefs.json --pretty
```

The JSON report contains no source paths or subtitle text.
