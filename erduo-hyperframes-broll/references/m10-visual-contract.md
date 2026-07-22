# M10 Visual Contract

This contract is the ARC-001 gate for the reworked public path. It does not choose a fixed style or force a reference atom. It forces the agent to leave an auditable trail of its directing judgment before assets or rendering begin.

## Product Boundary

The public main path accepts:

- one SRT file as the only timing source
- one or more talking-head still frames as fusion evidence
- optional user references or user assets

The still frames are not the visual ceiling. They provide fusion constraints: speaker position, safe zones, lighting, palette conflicts, background complexity, overlay feasibility, full-screen cutaway return conditions, and hard-alpha feasibility.

The bundled [director method](director-method-contract.md) is the directing authority. It produces the intent card, motif, scene granularity, component/material thinking, taste rationale and quality self-check without an external dependency. The project owns SRT timing, still-frame fusion, material route order and delivery constraints. A licensed external enhancer is optional advisory input only.

## Frame Fusion Analysis

The preflight output must describe each still frame with stable IDs and hash-only media identity:

- `frame_id`
- `image_sha256`
- `width`
- `height`
- `speaker_presence`
- `speaker_box`
- `safe_zones`
- `lighting`
- `palette`
- `background`
- `overlay_capability`
- `fullscreen_cutaway`
- `hard_alpha`

The analysis is allowed to be approximate because the agent may use visual judgment. It must be concrete enough for another agent to explain why an overlay, split, cutaway, or no-speaker shot is appropriate.

## Shot Visual Contract

Every SRT-anchored semantic shot must include:

- information intent and readable outcome
- visual grammar family and the agent's reason for choosing it
- compositing mode and reason
- material roles, including the intended route order
- component or graphic intent when relevant
- key action, transition intent, and result hold
- still-frame fusion decision, including constraints used or why the still is intentionally absent
- user-reference alignment or a clear statement that no user reference was provided
- reference atom candidates as inspiration only, not forced templates
- quality notes that prove the shot is not a copied subtitle card, generic native filler, or media-only pass

The contract is intentionally not a template prescription. It says what the agent must think through, not what the answer must be.

## Failure Gates

The validator must block:

- missing still-frame fusion analysis
- missing material roles or route intent
- a whole film whose primary route is `hyperframes-native`
- screen text that mechanically copies the narration
- references marked as mandatory style templates
- a director-method artifact missing intent, semantic map, motif, density, component taste, anti-fatigue or executable shot sections
- word-count timing or a proprietary enhancer output treated as final delivery
- media decode/visibility evidence presented as content-quality approval
