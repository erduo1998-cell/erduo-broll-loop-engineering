# Workflow contract

## Active identity and boundary

Every new or resumed production run requires:

```text
pipeline_contract_version: 3
authoring_topology_id: script-only-authoring-cluster-v1
validation_policy_id: script-only-production-v1
```

Earlier artifacts are readable only for migration inspection and can never
authorize v3 work. Keep raw SRT, plans, inventories, source, frames and long
logs in the private artifact store. Parent-facing data is limited to
hash-bound JSON receipts and bounded summaries.

The five production gates are:

1. `policy-gate`
2. `source-conformance-gate`
3. `runtime-seek-gate`
4. `pixel-signal-gate`
5. `integration-delivery-gate`

Scripts validate contracts and measurable facts. They do not issue aesthetic
verdicts.

## Inputs and brief

Accept `talking-head` with edited video and matching SRT, or `faceless` with
SRT and optional reference/audio. Confirm one hash-bound brief. SRT integer
milliseconds are the only upstream time truth.

Freeze mode, raster, fps, audio, delivery, material route
`user-media → image-generation → Pexels → native auxiliary`, local font roles,
native-primary ceiling and prohibited directions. Missing required input or a
material choice that cannot be resolved from structured facts requires user
input.

## Canonical path

1. Build a private manifest from the confirmed brief and local input locators.
   Run `production-preflight.mjs`; the parent consumes only its ≤4 KiB,
   path-free, hash-only receipt. The script, not the parent, hashes local
   inputs, checks the confirmed brief, runtime capabilities and the one-source
   active Skill installation. Do not create a child context, parse the SRT or
   inspect source/images during preflight.
2. In Claude Code, start a fresh `Agent(subagent_type: "general-purpose")` for
   `broll-director`; parent-side stage-Skill execution is invalid. Freeze parsed
   SRT, shot plan, design system,
   component registry, validation policy, project-only reference profile,
   project-local font package, frame projection and delivery profile.
3. Compile the director production contract. Validate complete SRT coverage
   and, for each shot, one semantic claim, cognitive action, visual structure,
   spatial relation, input state, operation, result state, readable hold and
   transition/callback.
4. Require functional typography roles, source-bound data/formulas,
   `Entry → Action → Result → Hold → Exit` ranges, chapter promise/payoff,
   callback, emphasis, density and cooldown ledgers. Pass `policy-gate`.
5. In Claude Code, start a fresh `Agent(subagent_type: "general-purpose")` for
   `broll-assets` from the exact director contract. Freeze ordinary
   material provenance, rights, bytes, geometry, route and consumer facts.
   Assets returns JSON facts only.
6. Compile the sealed production contract with the actual asset-manifest hash
   and the unchanged director facts. Rerun `policy-gate`.
7. Deterministically create one ordered block plan. Blocks are contiguous,
   never split a shot, contain at most 8 shots and span at most 45,000 ms. One
   longer shot may be a marked singleton.
8. Extract one exact self-contained packet per block and, in Claude Code, start
   a fresh `Agent(subagent_type: "general-purpose")` for
   `broll-master-build` for each block. Run blocks concurrently within the host
   limit. Each context writes only its allocation.
9. Immediately run `source-conformance-gate`, `runtime-seek-gate` and
   `pixel-signal-gate` against actual block bytes. One failed block gets one
   aggregate replacement; passing unrelated blocks remain reusable.
10. In Claude Code, start a fresh `Agent(subagent_type: "general-purpose")`
    for `broll-master-integrate` after all blocks pass.
    It may author only a deterministic wrapper, ordered map, byte ledger,
    manifest and receipts. Every block source byte must remain identical.
11. Run the whole-film phase of `integration-delivery-gate` against current
    integration bytes, coverage, namespace/selector/seam facts, chapter and
    callback ledgers, whole-film budgets and current dependency hashes.
12. In Claude Code, start a fresh `Agent(subagent_type: "general-purpose")`
    for `broll-render` from the exact byte-verified integrated source.
    Require the current sealed contract, all required five-gate receipts, the
    current integrated manifest and its no-rewrite proof. Render one final 4K
    master and complete the delivery phase of `integration-delivery-gate`:
    decode, duration, raster, fps, codec, audio, coverage and current
    source/tool/profile hashes.
13. Only after explicit request, start a fresh
    `Agent(subagent_type: "general-purpose")` for `broll-shot-export`. Export
    by cutting the verified master; never rerender individual shots.

## Receipt and context budgets

Every receipt binds v3 identity, gate/phase, scope, current production
contract hash, bounded input hashes, status, registered failure/warning codes,
bounded scalar metrics, cache binding and receipt hash.

- Preflight receipt: at most 4 KiB.
- Block receipt: at most 16 KiB.
- Stage envelope: at most 32 KiB.
- Final summary: at most 64 KiB.

Do not inline source, images, prompts, private paths or long logs. Do not emit
subjective quality fields.

## ReachSurge and project profiles

ReachSurge is private minimum authoring calibration plus a source of minimal
negative engineering fixtures. Its source, name, calibration verdict and
private hashes never enter a public receipt, production profile or reference
profile. Deep Current remains project-only and cannot become a public default.
The public package may contain only generalized contracts and minimal fixtures.

## Resume, retry and invalidation

Resume only exact v3 manifests with current identity and actual-byte bindings.
A brief, SRT, director fact, design system, validation policy, projection, font
or delivery change invalidates every descendant. An asset change invalidates
consuming blocks and downstream integration. A block change invalidates only
that block's receipt/cache plus integration, render and delivery. A wrapper,
map or integration change invalidates render and all downstream results.

A failing block may consume one aggregate block-scoped retry. Integration may
retry once only for wrapper/map faults without changing block bytes. Render is
executed once after all prerequisites pass.

## Report

Report the master path, duration, route counts, block count, five-gate receipt
summary, technical delivery result, optional master-derived export paths and
real limitations. Keep private source, frames, logs, prompts, credentials and
calibration identities out of the report.
