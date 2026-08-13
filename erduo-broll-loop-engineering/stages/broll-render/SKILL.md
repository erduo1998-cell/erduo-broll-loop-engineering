---
name: broll-render
description: Check, preview, render, and technically verify one final SRT-anchored HyperFrames B-roll master. Use as a fresh isolated Render and Delivery Agent after integration is complete.
---

# B-roll Render and Delivery

Act only as the Render and Delivery owner. Do not redesign shots, collect
material, repair Builder source, or export individual shots.

## Runtime route

Read `../../references/runtime/runtime-contract.md` and
`../../references/runtime/capability-matrix.json`. Formal delivery in this
release accepts only an integrated project bound to the production-ready
`hyperframes` runtime and a validated runtime plan whose resulting route is
single-backend HyperFrames. Verify that the Integrator handoff and project retain
one runtime binding and complete Shot Recipe-to-runtime traceability.

Do not run a Remotion or hybrid preview here. Hybrid delivery belongs to
`broll-hybrid-render`, which consumes frozen block media only. Stop as
`unsupported` if a non-HyperFrames project reaches this stage.

## Official HyperFrames requirement

Before doctor, check, preview, or render, use the host's native Skill mechanism
to load the release-pinned official `hyperframes` Skill and official CLI guidance.

A handoff statement or a CLI invocation alone does not replace the real Skill
load. Retain the available host-native trace reference. Stop before work if the
official Skill cannot be loaded.

Run every command through `../../references/safe-execution.md` and consume only
the compact executor result. Executor success does not replace result review.

## Inputs

- integrated HyperFrames project and Integrator handoff
- Director film and shot plans
- output profile, delivery directory, and audio policy
- cached HyperFrames readiness and targeted production-preflight result
- optional prior approval evidence bound to this exact integrated composition;
  it is absent on the preview pass
- selected runtime and capability-matrix decision

## Preflight in the formal-render environment

Run the lightweight targeted production preflight in the formal-render
environment and confirm the cached HyperFrames identity. Run the full official
doctor only when preflight reports a changed stable fact or an actual command
fails with an environment dependency. Process completion alone is never proof
of a successful command.

Supplement doctor with real delivery facts:

- output directory is writable;
- target filesystem has sufficient free space;
- target filename is unique and unused;
- the command environment for formal render uses the same Node, HyperFrames,
  Chrome, FFmpeg, and FFprobe that were inspected.
- the integrated project, readiness cache, and runtime-capability decision
  all bind the same production-ready `hyperframes` runtime.
- selected Shotcraft references remain traceable through Recipe, Builder, and
  Integrator records without being described as preverified components or
  cross-runtime witnesses.

Prepare a missing dependency only through scoped diagnostic Onboarding and an
authorized repair. Refresh the cache after repair. Do not call render as a diagnostic.
Do not delete output or user files to make room.

## Check, preview, and approval

Run the official standard HyperFrames `check`. It blocks on errors by default.
Warnings require investigation but block automatically only when the user or
an explicit project requirement asks for strict behavior. Inspect relevant
browser evidence only for concrete defects implicated by warnings. Do not run
an independent aesthetic review or create any gate beyond the final
composition preview approval below.

Require the Integrator's identity-bound motion/layout lint result. Do not
recapture geometry, rerun lint, or create routine stills when the composition
identity is unchanged. Preserve honestly recorded unmeasured adapter coverage
for the final moving preview.

After check succeeds, inspect whether valid approval evidence already binds
this exact integrated composition and check result. Recompute and compare the
Integrator's `composition-identity.json`; a path-set, file-hash, or aggregate
digest difference is a project change. When valid approval does not exist,
open the
official final composition preview, write an `action-required` handoff with the
preview locator and composition identity, and stop without rendering. The
Parent obtains explicit user approval and dispatches a different fresh
Render/Delivery Agent with that approval evidence. The new Agent compares the
unchanged identity and runs only delivery-local target/media checks; any project
change invalidates approval and requires reintegration plus a new preview. The
preview is not a second master.

Confirm the final render arguments explicitly name:

- H.264 MP4 at 3840×2160 and 30 fps unless the user requested another profile;
- high delivery quality;
- the agreed faceless or talking-head audio policy;
- one unique unused attempt target and the agreed unused final master path.

## Render and verify

Invoke a formal render only after environment, check, preview approval, and
final arguments are complete. “One final master” means one successfully
verified delivered master, not one permitted attempt.

Every attempt must use a new unused target. Never overwrite an earlier target.
After a successful attempt passes technical verification, finalize exactly one
file at the agreed master path without overwriting an existing file.

After success:

- confirm the output exists and is non-empty;
- use FFprobe to record duration, raster, frame rate, codec, and audio streams;
- perform a complete decode from start to finish;
- compare duration and audio behavior with the SRT and production mode;
- report objective media facts without claiming aesthetic approval.

If a formal render fails, preserve the environment findings, check result,
exact arguments, output state, partial file, and error context. Report the
attempt as failed and return ownership to a different fresh Render/Delivery
Agent. The fresh Agent reuses unchanged identity evidence and uses another
unused attempt target. Do not treat a partial file as a master and do not
overwrite it.

## Deliverables

Write only under:

`broll-production/05-delivery/`

On a preview pass, deliver only the official preview locator plus an
`action-required` handoff bound to the composition identity; do not claim or
list a final master. On an approved render pass, deliver:

- one final master;
- `preflight-report.md`;
- `technical-verification.md`;
- `handoff.md`.

Do not include credentials, private environment dumps, or unnecessary raw
logs.

## Completion

Complete when the targeted cached preflight and delivery supplements are
verified, official check succeeds, required preview
approval is present, a formal attempt succeeds, exactly one final master is
delivered without overwrite, FFprobe facts match the request, and complete
decode finishes without error. The delivered project must retain complete
Shot Recipe-to-runtime traceability.

## Stop

Stop before render when the official Skill cannot be loaded, doctor did not
actually run, a path-required doctor finding remains unresolved, output facts
are unsafe, check retains a real error, preview approval is missing, or the
final arguments are ambiguous. Also stop when the selected runtime is not the
production-ready `hyperframes` route, runtime bindings disagree, or Recipe
traceability is incomplete.

Stop the current Agent after a failed formal render and report the attempt
honestly so the Parent can dispatch a fresh Render/Delivery Agent. Technical
success never decides visual taste; the user's identity-bound final composition
preview approval is the only default aesthetic decision.
