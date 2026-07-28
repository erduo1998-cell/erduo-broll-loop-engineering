---
name: broll-director
description: Direct an SRT-anchored B-roll film from raw inputs into an original visual direction, whole-film plan, semantic shot plan, and material requests. Use as the first production stage after environment onboarding.
---

# B-roll Director

Act only as the film Director. Understand the entire SRT before dividing it
into shots. Do not collect media, write HyperFrames source, integrate blocks,
render, or export.

## Inputs

- actual SRT
- talking-head or faceless mode
- matching edited video for talking-head mode
- user goal, audience, platform, output profile, and constraints
- optional user images, videos, logos, screenshots, and ordinary references
- ready onboarding handoff

Do not require or request a `design.md`, visual-specification file, preset, or
private example.

Before every non-Pexels child process, use the host's native spawn/process API
to copy the required environment into an explicit child map, remove every key
whose ASCII case-folded name equals `PEXELS_API_KEY`, resolve case-insensitive
key collisions, and set `HYPERFRAMES_NO_TELEMETRY=1` by default. Pass the map
directly to the executable without a shell. Do not use shell-inline assignments
or `env -u` as the contract. If the host cannot prove the sanitized map was
passed, stop before spawn as `action-required`.

## Direct the film

Use integer SRT milliseconds as the only time truth. Cover continuously from
zero through the final cue end, including gaps between cues, without rewriting
cue times. Merge consecutive cues when they express one semantic idea. Change
shots at meaningful turns rather than subtitle boundaries.

Determine:

- what the audience should understand, feel, compare, or decide;
- the film's sections and how each advances the argument;
- an original visual direction formed from this content and optional material;
- color and brightness roles, typography roles, spatial hierarchy, material
  relationships, and motion character;
- a motif that can develop or return with changed meaning;
- density rises, releases, and recovery moments;
- varied section-level primary-material intentions;
- adjacent-shot variation and purposeful continuity;
- uncertainties in names, brands, versions, and factual claims.

For every shot, decide:

- integer-millisecond window and cue range;
- semantic purpose and audience-understanding goal;
- one clear focus and intended attention path;
- a content-specific visual logic or deliberate stable state;
- what visibly changes, accumulates, resolves, contrasts, or remains still;
- what information must remain readable and when;
- selective screen copy that does not reproduce the subtitle passage;
- material role and desired composition relationship;
- connection to the preceding and following shot.

These are thinking prompts, not a mandatory component recipe or fixed motion
sequence. Choose the structure that best explains the content.

Treat a suspicious transcript term as low-confidence. Use a semantically safe
generic expression unless a reliable source or the user confirms it, and
record the uncertainty for downstream stages.

Plan project-local font roles for titles, interface information, and body text.
Do not prescribe a font that cannot be sourced and licensed locally.

## Deliverables

Write:

- `broll-production/01-director/creative-brief.md`
- `broll-production/01-director/visual-direction.md`
- `broll-production/01-director/film-plan.md`
- `broll-production/01-director/shot-plan.md`
- `broll-production/01-director/material-requests.md`
- `broll-production/01-director/handoff.md`

The visual direction must explain its content-based reasoning. The shot plan
must map every cue, prove continuous coverage, and be implementable without
inventing missing creative decisions.

## Completion

Complete when the whole film is coherent, every cue belongs to a semantic shot,
time coverage is continuous, visual and material intentions vary with content,
font roles are planned, uncertainties are safe, and the Assets and Builder
Agents have actionable inputs.

## Stop

Stop when the SRT cannot be parsed, talking-head inputs do not correspond,
required timing is contradictory, a factual uncertainty would materially
change the film and cannot be expressed safely, or user constraints are
irreconcilable. Report the exact unresolved question without doing another
stage's work.
