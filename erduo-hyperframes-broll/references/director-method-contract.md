# Self-contained director method contract

## Purpose

This public contract is the complete required directing method for `broll-director`. It preserves the validated intent-card, visual-motif, density, component/material taste and anti-fatigue outcomes without requiring any external Skill. SRT remains the sole time truth and the product material order is user media → licensed host image generation → Pexels → HyperFrames-native auxiliary aid.

## Required artifact

Freeze one `director_method` artifact with:

```text
schema_version, method_id, time_source, intent_card, semantic_map,
visual_motif, density_map, shot_table, anti_fatigue_audit,
component_taste_audit, asset_route_policy, quality_audit,
optional_enhancer
```

`schema_version` is `1`, `method_id` is `erduo-director-method-v1`, and `time_source` is `srt`.

This artifact and the normalized shot plan remain compatible version-1
director outputs. In a pipeline-contract-version-2 run they are accompanied,
not replaced, by the plan-bound
[design slice](design-slice-contract.md), the validated display selection and
the [all-shot director review packet](director-design-packet-contract.md) in
one director manifest. A valid legacy method artifact alone cannot resume into
assets.

### Intent card

State the audience's current state, desired viewer shift, central claim, hook promise, ending action/result, emotional curve and evidence needs. Distinguish what the narration says from what the image must make understandable or felt.

### Semantic map

Group contiguous SRT cues only when they share one visual purpose. Each beat binds cue IDs, exact start/end milliseconds, claim, information function, emotional turn and merge/split reason. Split on argument turns, evidence changes, examples, contrasts, causal steps, data reveals and emotional pivots. Never reduce shot count to save context, sourcing or render work.

### Visual motif

Define one motif with physical/visual logic, planned recurrences, transformation across sections and an exhaustion rule. A recurrence must advance meaning; replaying the same completed metaphor is repetition.

### Density map

Assign every shot a density level `1…5`, information-unit count, visual-element budget and motion budget. The project normally needs at least a two-level min/max spread and must not leave every shot at the same middle level. High-density runs require recovery shots; quiet shots still need a clear hero and readable result. Record any content-driven exception in the deterministic director fact packet so assets can reopen and revalidate it.

### Shot table

Use continuous `S001…SN`. Every shot binds exact SRT time, semantic purpose, scene grammar, intended `hero_relation`, material roles, primary route and fallback order, visible action, readable result state, result-hold budget, transition intent, density, selected reference trace, font roles, prohibited directions and Pexels integration requirement when relevant. The plan must be concrete enough for a HyperFrames authoring child to build HTML, but must not freeze low-level HTML/CSS implementation fields that should be creatively solved by the official HyperFrames skill. Adjacent shots must vary at least two of layout, entrance direction, primary action and focus position unless the narration requires continuity.

The shot table is the compatible semantic/routing view. The design slice is
the required executable design view for the same shot IDs. It binds the
authoritative SRT millisecond windows to the one shared frame projection and
freezes, per shot, the Style DNA relationships, spatial blueprint, explicit
typography, content-specific composition/typography/motion rationale, motion
lifecycle and anti-template signatures defined by its contract. Never infer
or hand-edit frame windows inside this method artifact.

F01–F09 and G01–G10 may label candidate topology/motion vocabulary only. They
are not a fixed DOM, a visual skin or promotion evidence. Every choice must
include a content-specific reason and spatial/action result that stands on its
own without the label.

### Taste and anti-fatigue

Reject decorative generic UI, subtitle restatement, equal-weight element scatter, static black/small-text scenes, repeated card/arrow/list structures and native graphics used only because they are easy. Prefer one dominant relation, material-title integration, purposeful type hierarchy and a motion action that visibly causes the result. Record component/material choices and rejected alternatives with content-specific reasons, including why a recalled design atom was used, rejected or overridden by the user's design.

### Quality audit

Self-audit completeness, timing, motif development, density range, adjacent
variation, route policy, font plan, design-slice relationship coverage,
executable result states and anti-template signatures. Reject unowned negative
space, automatic final-title wrapping, repeated geometry with only copy
changes, generic card/HUD defaults and any Scene Kit, hero quota, layer,
matte, depth, clean-plate or alpha-decomposition field.

Run the shot-plan and design-slice validators before freezing hashes. This
producer audit emits deterministic facts and failure codes only. There is no
main `shot_plan_review` or director visual verdict in the current topology.
Assets must reopen the actual director artifacts and rerun the complete
director chain before routing material; any missing, changed, incomplete or
contradictory fact blocks assets.

## Optional enhancer

The artifact is valid with `{used: false}`. Follow the [director enhancer contract](director-enhancer-contract.md). An installed external director Skill may be used only when its public source, exact version and license are recorded. When used, record `{used: true, name, version, license_id, output_sha256, absorbed_sections}`. Treat its output as advisory input to this method; never adopt its timing, material bans, file outputs or unreviewed plan directly. Do not require host-call transcripts, tool-event hashes or the enhancer's presence for a valid run.
