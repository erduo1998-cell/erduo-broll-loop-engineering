---
name: broll-assets
description: Run the mandatory material stage for an SRT-anchored B-roll film by inspecting user media, considering controllable generation, performing real Pexels image and video searches, freezing selected files locally, and binding each selection to a shot and composition plan.
---

# B-roll Assets and Pexels

Act only as the material producer. This stage always runs. Do not change the
film structure, write HyperFrames source, integrate blocks, render, or export.

## Inputs

- Director creative brief, visual direction, film plan, shot plan, validated
  Shot Recipes, and material requests
- optional user material
- ready onboarding handoff
- secure Pexels access
- production root

Read `../../references/runtime/runtime-contract.md` and preserve the
runtime-neutral material roles defined by the Shot Recipes. Assets may record
verified media facts and capability constraints, but must not choose adapter
APIs, rewrite a recipe for one runtime, or claim cross-runtime support.

Never print, log, serialize, or place the Pexels key in a command argument,
handoff, path, or artifact.

Only the exact Pexels API request may receive the credential, in the smallest
available scope. Before generation, media inspection, download, or any other
non-Pexels child process, use the host's native spawn/process API to copy the
required environment into an explicit child map, remove every key whose ASCII
case-folded name equals `PEXELS_API_KEY`, resolve case-insensitive key
collisions, and set `HYPERFRAMES_NO_TELEMETRY=1` by default. Pass the map
directly to the executable without a shell. Do not reuse the Pexels request
environment, use shell-inline assignments, or use `env -u` as the contract. If
the host cannot prove the sanitized map was passed, stop before spawn as
`action-required`.

## Perform the material pass

For every material request:

1. inspect relevant user media;
2. consider whether controllable generation can provide a more precise result;
3. perform real Pexels image and video searches;
4. compare relevance and composition before selecting;
5. download every selected external item to a project-local file;
6. bind every selected item to planned shots and a concrete use in the
   composition.

When the host has no controllable generation capability, record
`unavailable` with the host evidence and continue to Pexels. The missing
generation capability does not skip or weaken the Pexels stage.

The Pexels search is mandatory even when user media or generated material is
available. Search both the real image and video endpoints. Do not impose a
fixed query or candidate count; search until the semantic need and selection
reasoning are adequately supported or the available results are shown
unsuitable. A real search may select zero Pexels items when none is suitable.
Record the image and video search facts, search intent, selection reasoning,
why candidates were rejected, and why forcing weak footage would harm the
film.

For each selected visual item, record:

- source, creator, and usage information;
- local project path;
- bound shot or shots;
- subject and semantic role;
- focal point and intended crop;
- safe overlay area;
- brightness, color temperature, depth, and movement;
- relationship to titles, interface elements, or native structure;
- objective dimensions, duration when applicable, codec/container when
  applicable, alpha behavior, and any capability-matrix requirement that a
  downstream adapter must verify;
- why it is stronger than the alternatives.

Treat Pexels material as composition material, not an unrelated background.
Do not place titles or components over the subject without a planned spatial
relationship.

Route material in this order:

```text
user material
→ controllable generation
→ Pexels
→ HyperFrames-native structural support
```

Native graphics are not assets to collect and must not be used here to hide a
missing primary-material decision.

Source real project-local font files for the Director's title, interface, and
body roles. Record source and license, confirm the needed glyphs are present,
and freeze the files in the project. Do not rely on system fonts, remote font
loading, or unlicensed files.

## Deliverables

Write:

- selected files under `broll-production/02-assets/media/`
- font files and license records under `broll-production/02-assets/fonts/`
- `broll-production/02-assets/user-material-review.md`
- `broll-production/02-assets/generation-review.md`
- `broll-production/02-assets/pexels-search.md`
- `broll-production/02-assets/material-plan.md`
- `broll-production/02-assets/font-plan.md`
- `broll-production/02-assets/handoff.md`

## Completion

Complete when user material was actually inspected, controllable generation
was used or explicitly recorded as unavailable, real Pexels image and video
searches ran, every selected file exists locally, every selection has a shot
and Shot Recipe binding plus a runtime-neutral composition-use plan, objective
media constraints are recorded, rejected routes are explained, and the
required fonts are local and licensed.

## Stop

Stop when secure Pexels access is missing or invalid, a required material
choice cannot be made without user judgment, a selected file cannot be
downloaded or used lawfully, a required font cannot be sourced, or the
Director plan lacks enough information to choose material. Return ownership to
Onboarding or Director rather than inventing a substitute.
