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

`auto` and `hybrid` have `readiness: planning-required`. They permit cached
common preflight and runtime-neutral Direction, not backend installation. Explicit or
detected `hyperframes`/`remotion` forces the whole film and preserves the 0.4.x
single-route workflow. Existing schema-1 single-backend artifacts are
grandfathered and must not be retroactively replanned.

Only an authorized Remotion diagnostic/repair after failed cached preflight may use `--probe-cli`.
It directly runs the project-local CLI with a minimal sanitized environment.
Selection never downloads a CLI or substitutes a global executable.

## Deterministic planning script

After Director recipes validate, the Parent runs the bundled script directly.
Do not dispatch `broll-runtime-plan` in a normal v1 production:

```text
node <skill-root>/scripts/create-production-profile.mjs \
  --output <broll-production/production-profile.json> \
  --width <width> --height <height> --fps <fps> \
  --audio <silent-or-preserve-source> --master-format h264-mp4
```

Use no optional flags for the 3840×2160, 30 fps, silent default. Do not write
the profile JSON manually. Then run:

```text
node <skill-root>/scripts/plan-runtime.mjs \
  --recipes <shot-recipes> \
  --selection <runtime-selection.json> \
  --narrative-envelope <narrative-envelope.json> \
  --visual-system <visual-system.json> \
  --representative-scenes <representative-scenes.json> \
  --production-profile <broll-production/production-profile.json> \
  --production-root <broll-production>
```

The normal command atomically writes schema-3
`broll-production/01-runtime-plan/runtime-plan.json`, minimal Lead packets, and
minimal production packets under `01-runtime-plan/assignments/`. Omitting the
representative set preserves only the legacy v2 planning path. The complete
production profile is hash-bound into both outputs. Never redirect stdout into
the plan and never edit either output by hand. The script uses only:

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

## Readiness and Builder dispatch

The installer caches stable machine/tool readiness. Common preflight checks
the cache plus run-specific input/output facts; after planning, targeted
preflight selects exactly `requiredBackends`. Missing Pexels does not block
until Assets reaches a real need. Dispatch Onboarding only when preflight
reports missing or changed stable backend evidence; never prepare both blindly.

The Parent dispatches each generated assignment packet to its named backend
Builder only after `gate-builder-assignment.mjs` accepts it. Lead packets may
run before visual lock; production packets require a validated approved or
explicitly skipped `04-visual-lock/visual-lock.json`. Every production Builder returns editable source plus one verified continuous
unit video and `block-media.json`. After all units pass, the Parent runs
`scripts/assemble-frozen-production.mjs preview`, obtains the one moving-preview
decision, and then runs `deliver` after approval. This path is the same for
single-backend and hybrid plans; no Integrator or Render Agent is dispatched.
Generated source is never translated, nested, or executed across the runtime
boundary.

Installed Planner, Integrator, and Render stage Skills are legacy readers for
older production records only. They are not fallback stages for v1.

## Remotion readiness gate

When a plan requires Remotion, require direct declarations and local
installations of matching `remotion` and `@remotion/cli`, plus a successful
project-local `remotion versions` probe. A failed/disabled probe makes targeted
readiness `action-required`; it does not change the planned backend. A backend
failure returns to its owning stage and never triggers silent rerouting.
