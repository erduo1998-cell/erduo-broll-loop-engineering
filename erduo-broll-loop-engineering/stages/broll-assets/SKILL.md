---
name: broll-assets
description: Close user material, conditional external-media needs, provenance, asset fusion, and project-local fonts for an SRT-anchored B-roll film.
---

# B-roll Assets

Act only as the material producer. This stage always runs. Do not change the
film structure, write HyperFrames source, integrate blocks, render, or export.

## Inputs

- Director narrative envelope, shared visual system, shot plan, validated
  compact Shot Recipes, and shot-specific material requests
- optional user material
- ready onboarding handoff
- validated post-Director runtime plan
- recorded Pexels state; secure access is required only when an actual request
  reaches the Pexels route
- production root

Read `../../references/runtime/runtime-contract.md` and preserve the
runtime-neutral material roles defined by the Shot Recipes. Assets may record
verified media facts and capability constraints, but must not choose adapter
APIs, rewrite a recipe for one runtime, or claim cross-runtime support.

For each Recipe with `patternRef`, resolve only that selected card and style
from the installed Skill root:

```text
node scripts/query-shotcraft.mjs --card <card-id> --style <style-key>
```

Read its material assumptions, composition needs, and known failure modes. Do
not load the full catalog or other card bodies. A card may refine the facts
that must be collected, but it never authorizes copying its upstream demo
media, branded UI, fonts, sounds, or Remotion source.

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
the host cannot inject or attest the sanitized map, invoke the command only
through the parent Skill's bundled `scripts/safe-spawn.mjs` with the documented
`node …/safe-spawn.mjs -- <executable> [args...]` form. That
launcher is the bounded no-log, no-shell trust boundary. If neither route is
available, stop before spawn as `action-required`.

## Perform the material pass

Always inspect supplied user material, close every project-local font role and
license, and verify existing selected-file provenance. For each shot whose
material need is empty, record one compact `no-external-material-needed`
decision; do not invoke generation, Pexels, or candidate review.

For every non-empty ordinary-media request:

1. inspect relevant user media;
2. consider whether controllable generation can provide a more precise result;
3. if still unresolved and suitable for stock, perform only the relevant real
   Pexels image and/or video search;
4. compare relevance and composition before selecting;
5. download every selected external item to a project-local file;
6. bind every selected item to planned shots and a concrete use in the
   composition.

When a selected pattern depends on screenshots, UI states, data, multiple
layers, masks, alpha, depth, or a before/after pair, verify those exact inputs
rather than substituting unrelated stock. Record privacy-safe capture state,
dimensions, separability, crop, and any relationship the Builder must preserve.
If a hard pattern precondition cannot be met, use the Recipe's declared
fallback or return the decision to the Director; do not fabricate the missing
material or silently choose a different card.

When the host has no controllable generation capability and the need calls for
it, record `unavailable` with host evidence and continue to the next suitable
route. Do not test generation for shots with no generation need.

Pexels is conditional, not a ritual. Do not search when user material or an
authorized generated result already satisfies the need, when the Recipe
declares native motion graphics, or when the request requires a factual,
brand, logo, webpage, or real-interface source. For a Pexels-routed need,
search only media types that can satisfy it; record query facts, selection or
rejection reasoning, and a zero selection when results are unsuitable.

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

For every ordinary-media selection, inspect its real geometry, focal point,
safe region, palette, depth cues, and motion. Specify how it becomes an axis,
path, mask, crop, annotation surface, palette source, foreground/background
relationship, or state transition. Do not reduce it to a generic white card,
thumbnail, or unrelated title background.

Route material in this order:

```text
user material
→ controllable generation
→ Pexels
→ assigned-runtime native structural support
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
- `broll-production/02-assets/pexels-search.md` only when at least one request
  actually reached Pexels; otherwise record the no-search reason in the
  material plan
- `broll-production/02-assets/material-plan.md`
- `broll-production/02-assets/font-plan.md`
- `broll-production/02-assets/handoff.md`

## Completion

Complete when user material was actually inspected, every non-empty request
followed only the suitable acquisition routes, every selected file exists
locally, every selection has a shot
and Shot Recipe binding plus a runtime-neutral composition-use plan, objective
media constraints are recorded, rejected routes are explained, and the
required fonts are local and licensed. Every selected Shotcraft pattern's
material preconditions must be satisfied or resolved through its declared
fallback.

## Stop

Stop when an actual Pexels-routed need exists and secure access is missing or
invalid, a required material
choice cannot be made without user judgment, a selected file cannot be
downloaded or used lawfully, a required font cannot be sourced, or the
Director plan lacks enough information to choose material. Also stop when a
selected card/style cannot be resolved or its hard material precondition has
no declared fallback. Return ownership to Onboarding or Director rather than
inventing a substitute.
