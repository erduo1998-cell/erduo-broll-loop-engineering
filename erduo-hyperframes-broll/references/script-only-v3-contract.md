# Script-only v3 production contract

This contract freezes the incompatible v3 identity:

```text
pipeline_contract_version: 3
authoring_topology_id: script-only-authoring-cluster-v1
validation_policy_id: script-only-production-v1
```

The runtime authority is canonical JSON plus actual-byte validation, not prose.
The four schemas are:

- `production-contract.schema.json`
- `design-system.schema.json`
- `component-registry.schema.json`
- `validation-policy.schema.json`

`validate-production-contract.mjs` validates the canonical documents and their
cross-references. `compile-production-contract.mjs` creates immutable
production-contract versions. A supplied SHA-256 without the actual artifact
is not sufficient evidence.

## Immutable phase chain

`contract_phase: director` is compiled after Director has frozen the actual
parsed-SRT artifact, shot plan, design system, component registry, validation
policy, project reference profile, font package, frame projection and
delivery profile. It
does not contain `asset_manifest_sha256` or `prior_contract_sha256`; inventing
a future asset hash is forbidden.

`contract_phase: sealed` is a new immutable contract compiled after Assets. It
must bind:

- the exact director contract as `prior_contract_sha256`;
- the actual asset manifest as `asset_manifest_sha256`;
- every director-phase hash without changing any of them.

Build, integration, render and export may consume only the sealed contract.
The policy gate runs once against the director contract before Assets and once
against the sealed contract after Assets.

## Canonical authoring facts

Every shot carries one semantic evidence chain:

```text
semantic claim
→ cognitive action
→ visual structure and semantic objects
→ spatial relation
→ input state
→ operation
→ result state
→ readable hold
→ transition/callback
```

The evidence chain is structured data, never a prose substitute:

- `cognitive_action` has exactly one action with stable action ID, actor object
  and target object IDs;
- every semantic object has both an object ID and continuity ID;
- `spatial_relation` binds subject, predicate, object and direction;
- `operation` binds action, actor, targets, property, `from` and `to`;
- `result_state` binds the changed object/property/value and a functional
  text-element carrier.

Process-like shots must change a business/semantic property; opacity,
visibility, title fade-in or ambient motion is not a semantic state change.
The cognitive action actor and ordered target IDs must exactly equal the
operation actor and targets. The forbidden visual-property family includes
opacity, alpha, visibility, visible and display aliases or prefixes.
Each shot binds one primary cognitive action, its component and motion
profile, per-element functional type roles/selectors/responsibilities, focal
role, density, layout, metaphor and
`Entry → Action → Result → Hold → Exit` frame ranges. Every lifecycle phase
declares selectors and timeline-call IDs for later source/runtime
verification. Functional meaning cannot exist only in
`microtext-texture`. The result carrier selector must participate in both the
Result and Hold lifecycle phases.

Data records bind numeric `value`, unit, a structured numeric denominator, a
restricted structured formula operation, source and
`measured|reported|illustrative`. Validation evaluates the formula and
requires every operator to bind the declared denominator value, denominator
unit/basis, result and result unit. Canonical `source_ref` values cannot be
local absolute paths or `file://` URLs. The whole film binds chapter
promise/payoff, motif callbacks, emphasis events, density curve and adjacent
layout/metaphor cooldown. Promise and callback records may cross chapters, but
must agree on object identity, direction and structured state delta. Layout
and metaphor runs and `changed_dimensions` are recomputed from shot facts;
author declarations cannot downgrade them. Short SRT windows reduce content
or motion; they do not change SRT time truth.

The actual parsed-SRT hash, ordered cue coverage, shot windows, rational FPS
and derived global frame windows must agree with the actual frame projection.
The first cue start and last cue end equal the shot-plan timeline boundaries,
and each local lifecycle frame count equals its actual projected global frame
window. Self-reported hashes are not evidence.

The reference profile closes `profile_id`, `project_id`, `project_only`,
`public_default`, `status` and the exact profile hash. Deep Current remains a
project-only draft profile, never a public default skin. Material choice that cannot be
determined from user input and structured facts returns
`material_selection_requires_user_input`; no visual model chooses it.
Profile `parameters` cannot shadow `project_id`, `project_only`,
`public_default`, `default_profile_id` or `status`.

## Frozen creative directives and block scope

Director freezes exactly one self-hashed `creative_directive` in every
canonical shot before Assets. Its closed minimum is one bounded
`primary_visual_decision`, an `attention_plan`, zero to three conditional
module bindings, and `creative_directive_sha256`. The attention plan always
binds an existing first-focus reference, ordered reading references, registered
negative-space region references and an existing result or adjacent-shot exit
reference. It is content direction for the Builder, not a second timeline,
template selector or aesthetic verdict.

Conditional module IDs are limited to `narrative-attention-v1`,
`physical-media-v1`, `reference-variation-v1`, `editorial-evidence-v1` and
`cultural-evidence-v1`; each carries only a private fact hash. They are
enabled only when the current content requires them. The baseline attention
plan applies to every shot. Neither F01–F09/G01–G10 nor any external style,
prompt or reference is a module, a default, or a frozen visual answer.

After Assets, the canonical compiler may emit one self-hashed
`scoped-block-creative-packet` for an ordered contiguous block. It contains
only that block's shot facts, directives, bounded seam IDs and hash bindings to
the sealed production contract, shot plan, design system, font package and
asset manifest. The compiler and validator reconstruct this packet from actual
canonical artifacts; changing a shot, binding or block membership is rejected.
The Builder receives the packet privately through a bounded Commission. The
parent receives only technical receipts and cannot treat a self-reported Skill
load or packet hash as host-trace evidence.

## Five deterministic receipts

The only v3 gates are:

1. `policy-gate`
2. `source-conformance-gate`
3. `runtime-seek-gate`
4. `pixel-signal-gate`
5. `integration-delivery-gate`

Every receipt contains v3 identity, gate and phase, scope, current production
contract hash, bounded input hashes, status, hard-failure codes, warnings,
bounded scalar metrics, cache binding and `receipt_sha256`. It contains no
source, image, contact sheet, long log, prompt or subjective quality field.
Every emitted hard-failure or warning code must belong to the selected gate's
policy registry. PASS receipts cannot contain ReachSurge gold, positive
calibration or other subjective approval verdicts.
Each gate/phase accepts an exact closed set of required `input_bindings`;
missing, extra or contract-mismatched hashes fail.
The supplied validation-policy document, production-contract
`validation_policy_sha256` and receipt binding must be byte-identical; a
different policy registry cannot authorize its own receipt codes.

The block receipt limit is 16 KiB. A stage envelope is at most 32 KiB and the
final summary is at most 64 KiB. See `context-budget-contract.md`.

## P1 activation boundary

These schemas, validators and references freeze the v3 contract. They do not
by themselves switch the existing orchestrator, state machine, manifest,
stage receipt or render preflight. That active-graph cutover belongs to P2 and
later phases.
