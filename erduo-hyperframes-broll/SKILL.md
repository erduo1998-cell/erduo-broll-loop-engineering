---
name: erduo-hyperframes-broll
description: Create editable, SRT-anchored HyperFrames B-roll with the script-only v3 five-gate contract, bounded parallel block authoring, byte-preserving integration, one final 4K render, deterministic technical delivery verification, and optional master-derived shot export.
---

# Erduo HyperFrames B-roll

Act as the main producer and decision-maker. Use
`pipeline_contract_version: 3`,
`authoring_topology_id: script-only-authoring-cluster-v1` and
`validation_policy_id: script-only-production-v1`.

Treat every earlier pipeline contract as inspection-only. In Claude Code, read
[the dispatch contract](references/claude-code-dispatch-contract.md) before the
first producer is started. The parent does not load raw SRT, source, images or
long stage artifacts to perform intake; it runs the deterministic preflight
below and consumes its small receipt.

## Start

1. Ask for the SRT, mode-specific media, safe Pexels configuration and one
   style/material reference. Present one complete brief and wait for explicit
   confirmation.
2. Write the confirmed brief and input locators into a private preflight
   manifest. Run `node scripts/production-preflight.mjs --manifest
   <private-manifest> --host-skill-root <active-host-skill-root>`.
3. The parent may receive only the script's hash-only receipt (at most 4 KiB).
   It must not open the SRT, media, source, images or long diagnostic output
   for this check. A blocked receipt ends intake with its short blocker codes.
4. A passed receipt proves local input hashes, confirmed brief, runtime
   capabilities and one-source Skill installation. Freeze SRT-millisecond time
   truth, delivery profile, material route, font roles, native-primary ceiling
   and prohibited directions only after that result.

## Run the v3 authoring cluster

1. On Claude Code, start a fresh `Agent(subagent_type: "general-purpose")`
   for `broll-director`; a parent-side `Skill(broll-director)` call is invalid.
   Freeze the parsed SRT, shot plan, design
   system, component registry, validation policy, project-only reference
   profile, font package, frame projection and delivery profile. Compile the
   director production contract and pass `policy-gate`.
2. Require every shot to bind one semantic evidence chain, one cognitive
   action, causal `Entry → Action → Result → Hold → Exit` lifecycle, readable
   hold, functional typography roles and any data source/formula. Freeze
   chapter promise/payoff, callback, emphasis, density and cooldown ledgers.
3. Start a fresh `Agent(subagent_type: "general-purpose")` for
   `broll-assets` from the exact director contract. Freeze only
   structured provenance, rights, bytes, geometry, route and consumer facts.
   Seal a new immutable production contract with the actual asset-manifest
   hash and rerun `policy-gate`.
4. Deterministically partition the ordered shot list into contiguous blocks.
   A normal block contains at most 8 shots and at most 45,000 ms. Never split
   a shot; mark a longer single shot as a singleton block.
5. Start one fresh `Agent(subagent_type: "general-purpose")` for
   `broll-master-build` per block, concurrently
   within the host limit. Give each author only its sealed shared facts and
   exact shot/window/namespace/material allocation.
6. Immediately validate each authored block with
   `source-conformance-gate`, `runtime-seek-gate` and `pixel-signal-gate`.
   Scripts judge contracts and measurable signals, never beauty. A failed
   block gets one aggregate block-scoped replacement; passing blocks remain
   reusable.
7. Start one fresh `Agent(subagent_type: "general-purpose")` for
   `broll-master-integrate` after every block
   passes. It may add only the wrapper, ordered map, hash ledger, manifest and
   receipts. Prove every block source byte is unchanged.
8. Run the whole-film portion of `integration-delivery-gate`: exact
   block/order/time/hash truth, no gap or overlap, namespace and selector
   integrity, cross-block seams, chapter/callback ledgers, emphasis/density/
   cooldown budgets and current dependency/profile bindings.
9. Start one fresh `Agent(subagent_type: "general-purpose")` for
   `broll-render` from the exact byte-verified integrated source.
   Authorize render only from the current sealed contract, all required
   five-gate receipts, integrated manifest and no-rewrite proof. Render exactly
   one final 4K master and complete the delivery phase of
   `integration-delivery-gate`, including decode, duration, raster, fps, codec,
   audio, SRT coverage and current source/tool/profile hashes.
10. Only after an explicit request, start one fresh
    `Agent(subagent_type: "general-purpose")` for `broll-shot-export` and cut
    from the verified master. Never independently rerender shots.

The only production gate receipts are:

1. `policy-gate`
2. `source-conformance-gate`
3. `runtime-seek-gate`
4. `pixel-signal-gate`
5. `integration-delivery-gate`

Keep the preflight receipt at or below 4 KiB, every block receipt at or below
16 KiB, every stage envelope at or below 32 KiB and the final summary at or
below 64 KiB. Receipts contain hashes,
failure codes, warnings and bounded scalar metrics only; never inline source,
images, prompts, long logs or subjective verdicts.

## ReachSurge boundary

Use ReachSurge only as private minimum authoring calibration and as a source of
minimal negative engineering fixtures. Do not copy its project source into the
public package, identify it in a public receipt, bind it into a production or
reference profile, or turn Deep Current into a public default. A passing script
receipt proves only the declared technical contract.

## Hard failures

- Any contract identity other than v3, any legacy artifact attempting to
  resume, or any missing current-byte/hash binding.
- A non-contiguous or oversized non-singleton block, out-of-scope write,
  undeclared input, or integration rewrite of a block byte.
- Missing semantic action/result/hold evidence, inconsistent data formula,
  unresolved chapter promise or callback, or violated whole-film budget.
- Network/runtime nondeterminism, irreversible seek state, conflicting
  duration truth, remote or fallback fonts, hidden primary material, invalid
  selector/ID, out-of-bounds animation or unusable rendered pixels.
- A receipt that exceeds its budget or includes source, media, private
  calibration identity, long logs, prompts or subjective approval.
- More than one final render or any shot export not derived from the verified
  master.

## Report

Return only the master path, duration, route counts, block count, five-gate
receipt summary, technical delivery result, optional export paths and real
limitations. Do not expose private artifacts, source, frames, prompts, logs,
credentials or private calibration identities.
