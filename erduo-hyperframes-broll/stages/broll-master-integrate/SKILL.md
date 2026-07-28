---
name: broll-master-integrate
description: Integrate all completed contiguous HyperFrames blocks into one ordered SRT-anchored master project. Use as a fresh isolated Integrator after every required Builder block is complete.
---

# B-roll Master Integrator

Act only as the Integrator. Assemble the completed blocks and resolve
integration-owned connections. Do not collect media, redesign block-owned
shots, render the final master, or export shots.

## Official HyperFrames requirement

Before opening source or assembling blocks, use the host's native Skill
mechanism to load the current official `hyperframes` Skill and the relevant
official composition and CLI guidance.

A handoff claim or CLI command alone does not replace the real Skill load.
Retain the available host-native trace reference. Stop before assembly if the
official Skill cannot be loaded.

Before every non-Pexels child process, use the host's native spawn/process API
to copy the required environment into an explicit child map, remove every key
whose ASCII case-folded name equals `PEXELS_API_KEY`, resolve case-insensitive
key collisions, and set `HYPERFRAMES_NO_TELEMETRY=1` by default. Pass the map
directly to the executable without a shell. Telemetry opt-in may change only
the telemetry value; Pexels-key removal remains mandatory. Do not use
shell-inline assignments or `env -u` as the contract. If the host cannot prove
the sanitized map was passed, stop before spawn as `action-required`. This
setting does not prove Skill loading or replace the standard check.

## Inputs

- Director creative brief, visual direction, film plan, and full shot plan
- Assets material and font plans
- every expected Builder block and handoff
- output profile and audio policy
- ready onboarding handoff

## Integrate

Confirm before assembly:

- every expected contiguous block is present;
- block and shot order matches the Director plan;
- integer-millisecond coverage is continuous from zero through the final cue;
- no shot is omitted, duplicated, overlapped, or retimed;
- source names, resources, fonts, and composition identities do not conflict;
- each seam preserves the intended handoff, readable content, and visual
  continuity;
- the whole film retains its motif development, density variation, material
  variety, and original visual direction.

Create the smallest master structure needed to mount the blocks in order.
Resolve wrapper, resource, and integration-owned seam problems only. Return
block-owned source, creative, asset, font, or timing defects to the responsible
stage rather than hiding them during assembly.

Run the official standard HyperFrames `check` on the integrated project. Its
normal blocking condition is errors. Treat warnings as review items and use
strict warning behavior only when the user or an explicit project requirement
requires it. Inspect real browser evidence when a warning may represent a
visible or runtime defect.

Do not render the final master.

## Deliverables

Write only under:

`broll-production/04-integrate/`

Deliver:

- complete integrated HyperFrames project;
- `integration-notes.md`;
- official check output or a bounded human-readable summary with its artifact
  locator;
- `handoff.md`.

## Completion

Complete when the integrated project includes every block in order, continuous
time coverage is preserved, resources and fonts resolve, seams are intentional,
the official standard check has no unresolved error, and warnings with possible
visible impact have been investigated.

## Stop

Stop when a required block is absent, time coverage conflicts, a block-owned
defect prevents integration, resources cannot be resolved, the official Skill
cannot be loaded, or the integrated project retains a real check error. Return
the issue to the owning stage without rendering or rewriting its creative work.
