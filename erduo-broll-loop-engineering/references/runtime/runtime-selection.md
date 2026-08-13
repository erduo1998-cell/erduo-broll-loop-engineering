# Runtime selection and post-Director planning

Runtime routing has two distinct decisions. The initial selector records user
intent or existing-project ownership. The post-Director planner assigns each
validated Shot Recipe to a backend from declared capability and exact pattern
evidence, then merges adjacent same-backend shots into contiguous blocks and
partitions focused whole-shot authoring units within them.

## Initial selector

Decision order:

1. Honor explicit `auto`, `hybrid`, `hyperframes`, or `remotion`.
2. Otherwise inspect exact existing-project package, config, and composition
   source signals.
3. Unambiguous existing-project evidence selects that single backend.
4. Mixed evidence or an existing package project with no runtime evidence is
   `action-required`; do not infer ownership from counts or names.
5. A genuinely new project defaults to `auto`.

Run:

```text
node <skill-root>/scripts/detect-runtime.mjs --project <project-root> --json
```

Add `--runtime <choice>` only for an explicit choice. Preserve stdout as
`broll-production/00-onboarding/runtime-selection.json` and validate it against
`runtime-selection.schema.json`. Default detection is bounded, read-only,
skips symlinks/dependencies/build outputs, never uses a shell, and never runs
project-local code.

`auto` and `hybrid` have `readiness: planning-required`. They permit base
Onboarding and runtime-neutral Direction, not backend installation. Explicit or
detected `hyperframes`/`remotion` forces the whole film and preserves the 0.4.x
single-route workflow. Existing schema-1 single-backend artifacts are
grandfathered and must not be retroactively replanned.

Only an authorized targeted Remotion Onboarding repair may use `--probe-cli`.
It directly runs the project-local CLI with a minimal sanitized environment.
Selection never downloads a CLI or substitutes a global executable.

## Deterministic planner

After Director recipes validate, a fresh Runtime Planner runs:

```text
node <skill-root>/scripts/plan-runtime.mjs \
  --recipes <shot-recipes> \
  --selection <runtime-selection.json> \
  --json
```

Preserve stdout as `broll-production/01-runtime-plan/runtime-plan.json` and
validate it with `scripts/validate-runtime-plan.mjs`. The planner uses only:

- exact `requiredCapabilities` and their matrix classification/preference;
- exact selected `patternRef` and the pinned backend source index;
- explicit or existing-project single-runtime force;
- the matrix portable default after stronger evidence is exhausted.

It never scans semantic prose for keywords. Native capability requirements
outrank preferences. Capability preferences outrank exact pattern reference
sources, and both outrank the portable default. Equal-priority conflicting
evidence is `action-required`.

A pinned Shotcraft Remotion TSX locator is native reference-source evidence,
not a component or render witness. The plan records it under
`unverifiedPreferences`. Operator-confirmed production observations support a
preference but do not claim controlled comparison or visual parity.

Planning occurs per shot, then adjacent same-backend shots merge into
contiguous blocks and bounded authoring units. `auto` may resolve to
HyperFrames, Remotion, or hybrid.
Explicit `hybrid` must naturally produce both backends; do not split work
artificially when evidence resolves to one.

## Readiness and fork

Base Onboarding checks only shared Node, FFmpeg/FFprobe, paths, storage,
recorded Pexels state, and Skill discovery. Missing Pexels does not block until
the validated material plan actually needs that route. After planning,
targeted Onboarding prepares
exactly `requiredBackends`. Never install both blindly.

Single-backend plans use the existing native Builder → Integrator → Render
chain. Plans dispatch each authoring unit to its assigned Builder. Hybrid
handoffs preserve the unit-to-block closure. Each Builder
then freezes a verified block mezzanine and `block-media.json`. Only the
runtime-neutral Hybrid Integrator and Hybrid Render may consume those frozen
artifacts. Generated source is never translated, nested, or executed across
the runtime boundary.

## Remotion readiness gate

When a plan requires Remotion, require direct declarations and local
installations of matching `remotion` and `@remotion/cli`, plus a successful
project-local `remotion versions` probe. A failed/disabled probe makes targeted
readiness `action-required`; it does not change the planned backend. A backend
failure returns to its owning stage and never triggers silent rerouting.
