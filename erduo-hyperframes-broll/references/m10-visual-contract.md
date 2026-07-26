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
- visual grammar family, registry evidence status and a content-specific reason
- compositing mode and reason
- material roles, including the intended route order
- component or graphic intent when relevant
- key action, transition intent, and result hold
- still-frame fusion decision, including constraints used or why the still is intentionally absent
- user-reference alignment or a clear statement that no user reference was provided
- reference atom candidates as inspiration only, not forced templates
- quality notes that prove the shot is not a copied subtitle card, generic native filler, or media-only pass

The contract is intentionally not a template prescription. It says what the agent must think through, not what the answer must be.

For a version-2 run these facts must be compiled into the plan-bound
[design slice](design-slice-contract.md), not left as prose beside the
compatible shot plan. Every shot therefore also exposes an inspectable spatial
blueprint: composition/focus geometry, ordered reading path, protected
regions, owned negative space, explicit type lines and bboxes, the design
slice's content-specific composition/typography/motion reasons, the five
Style DNA relationship applications, one complete motion lifecycle and
anti-template signatures. SRT integer milliseconds remain authoritative.
Frames come only from the shared projection bound by the design slice.

F01–F09 and G01–G10 are candidate vocabulary with explicit evidence status.
They do not authorize a fixed layout, DOM, visual skin or repeated motion
recipe. The director's reason, geometry, action and readable result must remain
content-specific even when an ID repeats.

## Failure Gates

The validator must block:

- missing still-frame fusion analysis
- missing material roles or route intent
- a missing, invalid or plan/SRT/display/projection-unbound design slice
- a family or grammar ID without content-specific selection reasoning and registry evidence status
- a shot without a complete spatial blueprint, explicit typography and its content-specific rationale, or readable action/result lifecycle
- unowned negative space, automatic title wrapping, generic/system fonts or repeated geometry with only text changed
- adjacent repeated composition/action/focus signatures without a content-driven continuity exception
- Scene Kit, 3–5 hero quota, layer, matte, depth, clean plate, alpha decomposition or Codex-only fields
- a whole film whose primary route is `hyperframes-native`
- screen text that mechanically copies the narration
- references marked as mandatory style templates
- a director-method artifact missing intent, semantic map, motif, density, component taste, anti-fatigue or executable shot sections
- word-count timing or a proprietary enhancer output treated as final delivery
- media decode/visibility evidence presented as content-quality approval

The director freezes both validator receipts and the all-shot review artifact
defined by the
[director packet contract](director-design-packet-contract.md). Deterministic
success cannot authorize assets: the main agent must inspect every packet page
and freeze a hash-bound deterministic facts packet for the exact director
chain. New runs do not issue `shot_plan_review`; assets reopens and revalidates
the actual director bytes.
