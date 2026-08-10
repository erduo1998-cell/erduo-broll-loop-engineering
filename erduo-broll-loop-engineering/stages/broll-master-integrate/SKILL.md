---
name: broll-master-integrate
description: Integrate all completed contiguous HyperFrames blocks into one ordered SRT-anchored master project. Use as a fresh isolated Integrator after every required Builder block is complete.
---

# B-roll Master Integrator

Act only as the Integrator. Assemble the completed blocks and resolve
integration-owned connections. Do not collect media, redesign block-owned
shots, render the final master, or export shots.

## Runtime route

Read `../../references/runtime/runtime-contract.md` and
`../../references/runtime/capability-matrix.json`. This release's production
Integrator accepts only blocks whose selected runtime is `hyperframes` and
whose Builder handoffs trace every shot to a validated runtime-neutral Recipe
and HyperFrames-owned implementation decision. Reject mixed-runtime blocks.

The Remotion adapter contract is experimental and is not an alternate formal
assembly backend here. If a Remotion block arrives, stop as `unsupported`
without converting it, wrapping it, rendering it to media, or presenting it as
production-ready.

## Official HyperFrames requirement

Before opening source or assembling blocks, use the host's native Skill
mechanism to load the release-pinned official `hyperframes` Skill and the relevant
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
shell-inline assignments or `env -u` as the contract. If the host cannot inject
or attest the sanitized map, invoke the command only through the parent Skill's
bundled `scripts/safe-spawn.mjs` using the command form documented in the
parent Skill. That launcher is the bounded no-log, no-shell trust
boundary. If neither route is available, stop before spawn as
`action-required`. This setting does not prove Skill loading or replace the
standard check.

## Inputs

- Director creative brief, visual direction, film plan, full shot plan, and
  validated Shot Recipes
- Assets material and font plans
- every expected Builder block and handoff
- output profile and audio policy
- ready onboarding handoff
- selected runtime and capability-matrix decision

## Integrate

Confirm before assembly:

- every expected contiguous block is present;
- block and shot order matches the Director plan;
- every shot maps one-for-one to its Shot Recipe and recorded runtime
  implementation decision;
- every Recipe `patternRef`, when present, maps to the same card ID, style key,
  and pinned upstream Git commit recorded by its Builder; no unselected
  catalog pattern was introduced during implementation;
- every block uses the same selected `hyperframes` runtime;
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

After the successful check, freeze `composition-identity.json`. List every
production-authored source/config file and every referenced local media, font,
and dependency-lock file as a normalized project-relative path plus SHA-256;
sort entries by path and record an aggregate SHA-256 of that canonical list.
Exclude dependency directories, caches, logs, previews, and delivery outputs.
This manifest is the identity to which preview approval binds. Any listed-file
change or referenced-file-set change invalidates it and requires reintegration,
check, preview, and approval again.

Do not render the final master.

## Deliverables

Write only under:

`broll-production/04-integrate/`

Deliver:

- complete integrated HyperFrames project;
- `integration-notes.md`;
- official check output or a bounded human-readable summary with its artifact
  locator;
- `composition-identity.json`;
- `handoff.md`.

## Completion

Complete when the integrated project includes every block in order, continuous
time coverage is preserved, resources and fonts resolve, seams are intentional,
Recipe-to-runtime traceability is intact, the official standard check has no
unresolved error, the composition identity manifest is complete, and warnings
with possible visible impact have been investigated.

## Stop

Stop when a required block is absent, time coverage conflicts, a block-owned
defect prevents integration, resources cannot be resolved, the official Skill
cannot be loaded, runtime bindings are mixed or unsupported, Recipe traceability
is missing, or the integrated project retains a real check error. Return
the issue to the owning stage without rendering or rewriting its creative work.
