---
name: broll-remotion-render
description: Typecheck, still-test, preview, formally render, and technically verify one identity-bound Remotion master. Use as a fresh isolated Render and Delivery Agent after Remotion integration.
---

# B-roll Remotion Render and Delivery

Act only as Render and Delivery owner for the selected Remotion backend. Do
not redesign shots, repair source, collect material, change Composition timing,
or export individual shots.

## Backend contract and inputs

Read `../../references/remotion-backend.md`, the runtime contract, capability
matrix, Remotion project schema, and a validated runtime plan whose resulting
route is single-backend Remotion. Require:

- the integrated `project/`, master manifest, identity, notes, and handoff;
- Director film/shot plan and Recipe set;
- output profile, unique delivery directory, unused final target, and audio
  policy;
- ready Remotion Onboarding evidence and the user's recorded confirmation of
  the official Remotion licensing terms;
- optional explicit preview approval bound to this exact identity; it is
  absent on the first pass.

Reject HyperFrames, hybrid, or mixed-runtime source. Use only the project's exact local
Remotion installation and direct Node entry points. Never use global Remotion,
`npx` download fallback, an unpinned package, or a different Composition.

Before every non-Pexels process, create an explicit child map,
remove every key whose ASCII case-folded name equals `PEXELS_API_KEY`, reject
case-insensitive key collisions, and set `HYPERFRAMES_NO_TELEMETRY=1`. Pass the
map directly to the executable without a shell. If the host cannot inject and
attest that map, use the parent Skill's bundled `scripts/safe-spawn.mjs`. If
neither route is available, stop before spawn as `action-required`.

## Same-environment preflight

In the exact environment that will render, verify Node/npm, disk space,
writable output directories, unique unused attempt/final targets, FFmpeg and
FFprobe, browser launch, package-lock integrity, and applicable Remotion
license confirmation. Use the parent safe child environment for every
non-Pexels process.

Run the bundled verifier with `--expect master --identity`, then clean
`npm ci --ignore-scripts`, report the actual local CLI/package versions, and
run `node node_modules/typescript/bin/tsc --noEmit`. Render and inspect real
stills at the opening, every semantic result/readable hold, every seam, and
the final safe frame. A path, hash set, aggregate identity, Composition ID,
version, typecheck, or still failure blocks preview and render.
Use these stills only for concrete layout, missing-resource, runtime, seam, or
boundary defects; do not create an independent aesthetic review or score.

When the identity declares `runtimeFeatures.htmlInCanvas`, repeat the support
and real-still canary in this exact render environment. Confirm the exact
Remotion version is at least 4.0.455, nested capture remains false, the Studio
browser supports HTML-in-canvas, and WebGL2 uses the identity-bound `angle` or
`swangle` value from `remotion.config.ts`. Inspect one frame during each
effect and one frame in each following readable hold. Any blank/stale capture,
wrong orientation, resolution loss, or GL drift blocks preview and render.

## Preview and approval pass

When valid approval is absent, actually launch the project-local Remotion CLI
`studio` command with the manifest entry point in a host-managed process.
Confirm the reported URL responds and opens the exact Composition. Record the
locator, Composition ID, aggregate identity SHA-256, typecheck result, and
still evidence in an `action-required` handoff, then stop without formal
render. Studio availability and technical preview evidence are not user
approval.

The Parent obtains explicit approval. Dispatch a different fresh Render Agent
for the approved pass. It must repeat all same-environment checks and compare
the full identity again. Any project-file, manifest, dependency-lock, asset,
font, Recipe binding, Composition, or render-profile change invalidates
approval and requires reintegration plus a new preview.

## Formal render and verification

Before invocation, record explicit local CLI arguments naming the manifest
entry point, exact Composition ID, requested codec/profile, and a new unused
attempt path. Default to H.264 MP4, 3840×2160, 30 fps, and high quality unless
the user requested another profile. Confirm the Composition metadata matches
those facts; do not silently scale or retime it.

Invoke the project-local `render` command exactly once in this Agent. Never
overwrite a prior attempt or final target. If rendering fails, preserve the
partial attempt and bounded error evidence, stop this Agent, and return a
retry to a different fresh Render Agent with another unused path.
When the agreed audio policy is silent, the explicit render arguments must
include `--muted`; the verified result must contain zero audio streams and its
container duration must equal `durationInFrames / fps`. The absence of an
`Audio` component is not proof of a silent or frame-exact file.
Write all stills, caches, logs, attempts, and delivery files outside the
identity-bound `project/`. If any unexpected non-dependency file appears in
that project, verification must fail rather than ignore it by directory name.

After a successful render:

- confirm the attempt exists and is non-empty;
- use FFprobe to record duration, raster, frame rate, codec, pixel format, and
  audio streams;
- compare frame-derived duration with the manifest and final SRT boundary;
- perform a complete FFmpeg decode from start to finish;
- inspect representative extracted frames for blank, missing-font, missing-
  asset, seam, and final-frame defects;
- finalize exactly one master at the unused delivery path using a host-native
  exclusive-create copy or equivalent no-overwrite operation;
- verify the final SHA-256 equals the verified attempt and probe/decode the
  delivered file again.

Do not claim aesthetic approval, Remotion/HyperFrames parity, or a successful
master from an exit code, partial file, preview, or unverified attempt.
The user's identity-bound final composition preview approval remains the only
default aesthetic decision.

## Deliverables

Write only under:

`broll-production/05-remotion-delivery/`

On the preview pass, deliver only `preflight-report.md`, preview locator and
evidence, and an `action-required` `handoff.md`; do not list a master.

On the approved pass, deliver exactly one final master plus:

- `preflight-report.md` with exact local versions and identity result;
- `technical-verification.md` with render arguments, frame mapping,
  FFprobe/decode facts, frame inspection, and SHA-256;
- `handoff.md` with the final path, Composition ID, approval identity,
  objective media facts, and honest residual risks.

## Completion and stop

Complete only after unchanged identity verification, exact local dependency
installation, typecheck, real stills, explicit identity-bound approval, one
successful formal render, exclusive no-overwrite finalization, matching hash,
FFprobe facts, complete decode, and frame inspection.

Stop before render for missing or stale approval, unconfirmed licensing,
unsafe output paths, insufficient space, identity drift, wrong runtime or
Composition, non-local/unpinned packages, unresolved type errors, browser or
still failure, ambiguous arguments, or missing FFprobe/decode capability.
Stop the current Agent after any formal-render failure; never overwrite or
silently retry in place.
