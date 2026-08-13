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
`../../references/runtime/capability-matrix.json`, then read
`../../references/motion-layout-lint.md`. The Integrator accepts only
a validated runtime plan whose resulting route is single-backend
`hyperframes`, and blocks assigned to `hyperframes`,
whose Builder handoffs trace every shot to a validated runtime-neutral Recipe
and HyperFrames-owned implementation decision. Reject mixed-runtime blocks;
hybrid plans belong to `broll-hybrid-integrate` after Builder-owned freezing.

Remotion is not an alternate assembly backend here. If a Remotion block arrives,
stop as `unsupported`
without converting it, wrapping it, rendering it to media, or presenting it as
production-ready.

## Official HyperFrames requirement

Before opening source or assembling blocks, use the host's native Skill
mechanism to load the release-pinned official `hyperframes` Skill and the relevant
official composition and CLI guidance.

A handoff claim or CLI command alone does not replace the real Skill load.
Retain the available host-native trace reference. Stop before assembly if the
official Skill cannot be loaded.

Run every command through `../../references/safe-execution.md` and consume only
the compact executor result. Executor success does not replace standard check.

## Inputs

- Director narrative envelope, shared visual system, full shot plan, and
  validated compact Shot Recipes
- Assets material and font plans
- every expected authoring unit, compact receipt, and handoff, grouped by its
  planned backend block
- output profile and audio policy
- cached HyperFrames readiness plus targeted production-preflight `status: ready`
- selected runtime and capability-matrix decision
- validated runtime plan identity and single-runtime block closure

## Integrate

Confirm before assembly:

- every expected authoring unit and contiguous backend block is present;
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
normal blocking condition is errors. Treat warnings as technical review items and use
strict warning behavior only when the user or an explicit project requirement
requires it. Inspect real browser evidence only when a warning may represent a
concrete visible or runtime defect. Do not score aesthetics or create a
separate visual-review gate.

After check, capture actual per-frame DOM/semantic scene bounds for every
meaningful element exposed by the official adapters and run the shared
motion/layout lint once across the complete master. A pass creates no stills,
clips, or AI visual analysis. Findings alone trigger their bounded diagnostic
windows. Record any element without a truthful official geometry hook as
unmeasured; never fill the gap with source regex or estimates, and never claim
full lint coverage when such gaps exist.

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
- compact motion/layout lint result and measured/unmeasured coverage;
- `composition-identity.json`;
- `handoff.md`.

## Completion

Complete when the integrated project includes every block in order, continuous
time coverage is preserved, resources and fonts resolve, seams are intentional,
Recipe-to-runtime traceability is intact, the official standard check has no
unresolved error, measurable motion/layout findings are closed, the composition
identity manifest is complete, and warnings with possible visible impact have
been investigated.

## Stop

Stop when a required block is absent, time coverage conflicts, a block-owned
defect prevents integration, resources cannot be resolved, the official Skill
cannot be loaded, runtime bindings are mixed or unsupported, Recipe traceability
is missing, or the integrated project retains a real check error. Return
the issue to the owning stage without rendering or rewriting its creative work.
