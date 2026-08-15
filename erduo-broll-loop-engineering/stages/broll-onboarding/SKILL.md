---
name: broll-onboarding
description: Diagnose and repair installation readiness only when the cached first-run evidence is missing or a real machine/tool fact changed.
---

# B-roll onboarding

Act only as the environment diagnostic and authorized repair coordinator. This
is an exception path, not a stage in every production. Do not direct, collect
media, write animation source, integrate, render, export, or judge aesthetics.

## Dispatch gate

Accept only a compact JSON result from `scripts/production-preflight.mjs` with
`next: run-onboarding-diagnostic`. If `next` is `continue`, do not run. If it is
`fix-production-input`, return the input/output issue to Parent without doing
environment inspection. `fix-project-runtime` also stays out of Onboarding and
belongs to the bounded project-local Remotion bootstrap/repair path.

Valid diagnostic causes are limited to:

- no readiness cache after installation or migration;
- cached release, machine, architecture, Node major, installed Skill set,
  pinned HyperFrames version, or pinned official-Skills commit changed;
- a requested backend is not recorded ready;
- a production command actually failed and points to a machine/tool problem.

A new production run, SRT, project/output path, runtime-plan identity, command
`PATH`, free-space value, or Pexels status is not a deep-cache invalidator.

## Inputs

- release and Skill roots;
- preflight JSON and failed fact IDs;
- mode: `inspect` or `repair`;
- exact required backend set, if already planned;
- in repair mode only, explicit authorization and the approved repair list;
- previous readiness cache, when present.

Read `../../references/first-run-onboarding.md`. Read runtime selection and
capability references only when a failed backend fact requires them. Do not
read film, craft, material, review, or rendering references.

## Inspect once

Inspection is read-only. Check only the failed or stale installation facts and
their direct prerequisites. Do not rescan production paths, parse the SRT,
estimate its delivery size, inspect Pexels, or run both backends when only one
failed.

Common installation facts are Node 22.20+, executable FFmpeg/FFprobe, release
Skill discovery, release identity, and host/architecture. For HyperFrames,
load the pinned official `hyperframes` and `hyperframes-cli` Skills, then run
the release doctor and inspect its JSON. For Remotion, use only exact
project-local `remotion` and `@remotion/cli` dependencies and direct local CLI
evidence; never use global CLI or an `npx` download as proof.

When a requested optional capability needs a canary, run only that canary. Do
not make optional backend capabilities part of the common installation cache.

Return one grouped repair/authorization request. Never modify the machine in
inspect mode.

## Repair and cache

Repair runs in a fresh Agent after explicit authorization. Perform only the
approved reversible work, rerun only affected checks and their direct
dependents, then invoke:

`node <release-root>/scripts/doctor.mjs --refresh-cache --json`

The doctor is the sole writer of deep-readiness evidence. The handoff may cite
its compact result but must not reproduce its raw output.

For a genuinely new Remotion project, confirm the official license terms and
the exact proposed local package set before authorization. Create only the
minimal locked project shell; composition authoring remains Builder work.

Never delete files for disk space, rewrite shell profiles, alter an existing
machine-wide Node.js installation, prepare a browser outside the official
pinned runtime, or treat a host sandbox limitation as an installation defect.

## Shared execution boundary

Run every command through `../../references/safe-execution.md` and consume only
the compact executor result.

## Deliverable

Write `broll-production/00-onboarding/environment-handoff.md` containing only:

- preflight failed fact IDs and diagnostic scope;
- affected checks and compact pass/fail status;
- exact proposed or performed repairs;
- authorization or human action still required;
- readiness-cache refresh status and locator;
- final status: `ready`, `action-required`, `unsupported`, or `blocked`.

Do not include production-run bindings, SRT duration, target paths, Pexels
status, full environment dumps, raw command output, unrelated installed
software, private path prefixes, or aesthetic conclusions.

Complete `ready` only after the cache refresh succeeds. Use `action-required`
for an unapproved repair, `unsupported` for a required unavailable backend or
capability, and `blocked` only after an authorized repair still fails.
