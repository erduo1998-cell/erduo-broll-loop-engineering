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
`hyperframes` runtime. Verify that the Integrator handoff and project retain
one runtime binding and complete Shot Recipe-to-runtime traceability.

`remotion` remains an experimental adapter target. Do not run a Remotion
preview or render, substitute another command, or describe experimental
witness output as the master. Stop as `unsupported` if a non-HyperFrames
project reaches this stage.

## Official HyperFrames requirement

Before doctor, check, preview, or render, use the host's native Skill mechanism
to load the current official `hyperframes` Skill and official CLI guidance.

A handoff statement or a CLI invocation alone does not replace the real Skill
load. Retain the available host-native trace reference. Stop before work if the
official Skill cannot be loaded.

Before every non-Pexels child process, use the host's native spawn/process API
to copy the required environment into an explicit child map, remove every key
whose ASCII case-folded name equals `PEXELS_API_KEY`, resolve case-insensitive
key collisions, and set `HYPERFRAMES_NO_TELEMETRY=1` by default. Pass the map
directly to the executable without a shell. This includes doctor, check,
preview, browser descendants, render, FFmpeg, and FFprobe. Telemetry opt-in may
change only the telemetry value; Pexels-key removal remains mandatory. Do not
use shell-inline assignments or `env -u` as the contract. If the host cannot
prove the sanitized map was passed, stop before spawn as `action-required`.
This setting does not prove Skill loading or replace result inspection.

## Inputs

- integrated HyperFrames project and Integrator handoff
- Director film and shot plans
- output profile, delivery directory, and audio policy
- ready onboarding handoff
- optional prior approval evidence bound to this exact integrated composition;
  it is absent on the preview pass
- selected runtime and capability-matrix decision

## Preflight in the formal-render environment

Run official HyperFrames doctor with JSON output in the exact environment that
will invoke formal rendering. Inspect the top-level result and every individual
finding. Process completion is not success because official doctor always
exits successfully.

Judge each finding against the selected local render path and actual output
mode. A missing capability required by that path, or one whose relevance
cannot be proved, must be repaired and doctor rerun. A capability proved
outside the selected path may be recorded as unavailable but unused. Do not
maintain a standing exemption list.

Supplement doctor with real delivery facts:

- output directory is writable;
- target filesystem has sufficient free space;
- target filename is unique and unused;
- the command environment for formal render uses the same Node, HyperFrames,
  Chrome, FFmpeg, and FFprobe that were inspected.
- the integrated project, Onboarding evidence, and runtime-capability decision
  all bind the same production-ready `hyperframes` runtime.

Prepare a missing dependency only through safe, authorized, delivery-local or
official repair. Rerun doctor after repair. Do not call render as a diagnostic.
Do not delete output or user files to make room.

## Check, preview, and approval

Run the official standard HyperFrames `check`. It blocks on errors by default.
Warnings require investigation but block automatically only when the user or
an explicit project requirement asks for strict behavior. Inspect relevant
browser evidence for warnings that may represent a visible defect.

After check succeeds, inspect whether valid approval evidence already binds
this exact integrated composition and check result. Recompute and compare the
Integrator's `composition-identity.json`; a path-set, file-hash, or aggregate
digest difference is a project change. When valid approval does not exist,
open the
official final composition preview, write an `action-required` handoff with the
preview locator and composition identity, and stop without rendering. The
Parent obtains explicit user approval and dispatches a different fresh
Render/Delivery Agent with that approval evidence. The new Agent repeats
same-environment preflight, identity verification, and check; any project
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
Agent. The fresh Agent repeats the same-environment preflight and uses another
unused attempt target. Do not treat a partial file as a master and do not
overwrite it.

## Deliverables

Write only under:

`broll-production/05-delivery/`

Deliver:

- one final master;
- `preflight-report.md`;
- `technical-verification.md`;
- `handoff.md`.

Do not include credentials, private environment dumps, or unnecessary raw
logs.

## Completion

Complete when the same-environment official doctor has been evaluated,
delivery supplements are verified, official check succeeds, required preview
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
success never decides visual taste; the user makes the final judgment by
watching the master.
