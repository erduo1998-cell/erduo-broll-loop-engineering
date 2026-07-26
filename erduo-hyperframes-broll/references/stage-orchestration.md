# Stage orchestration contract

## Active graph

```text
parent deterministic preflight
  → Director
  → Assets
  → deterministic contiguous blocks B001…BN
  → bounded parallel Master Build
  → three deterministic block gates
  → byte-preserving Master Integrate
  → whole-film integration-delivery gate
  → one 4K Render
  → technical delivery verification
  → optional master-derived Shot Export
```

The graph requires `pipeline_contract_version: 3`,
`authoring_topology_id: script-only-authoring-cluster-v1` and
`validation_policy_id: script-only-production-v1`.

Director, Assets, every Master Build block, Master Integrate and Render use
fresh isolated contexts. A run with `N` blocks therefore uses `N + 4` stage
contexts. Preflight, partitioning and gates remain main/script operations. Do
not add reviewer agents.

## Claude Code dispatch boundary

On Claude Code, every production context below is a fresh
`Agent(subagent_type: "general-purpose")`; parent-side `Skill(broll-*)` calls
are inline execution and invalid:

| Stage | Agent-owned Skill | Parent may read | Child returns |
| --- | --- | --- | --- |
| director | `broll-director` | ≤4 KiB preflight receipt and artifact IDs | ≤32 KiB stage envelope/receipts |
| assets | `broll-assets` | upstream hashes and artifact IDs | ≤32 KiB stage envelope/receipts |
| each block | `broll-master-build` | its packet ID and sealed hash facts | ≤16 KiB block receipts |
| integration | `broll-master-integrate` | passed block hashes/IDs | ≤32 KiB stage envelope/receipts |
| render | `broll-render` | sealed/integration/receipt hashes | ≤64 KiB final summary |

The parent supplies no raw SRT, source, images, prompts, transcripts or long
logs. Every child receipt records `execution_isolation` with host
`claude-code`, mechanism `claude-agent`, a dispatch-event hash and a stage
packet/context hash. Missing evidence, an inline mechanism or an out-of-scope
stage is a hard failure. The parent must issue a new event for each child; its
actual uniqueness is verified from the Claude Code end-to-end trace, not
inferred from a hash alone. The optional `broll-shot-export` is likewise a
fresh `Agent(subagent_type: "general-purpose")` only after explicit user
request.

## Director

Director freezes actual parsed-SRT facts, the shot plan, design system,
component registry, validation policy, project-only reference profile,
project-local font package, frame projection and delivery profile.

Every shot binds:

- one semantic evidence chain and cognitive action;
- semantic objects, spatial relation, input, operation and result state;
- functional typography roles and selectors;
- causal `Entry → Action → Result → Hold → Exit` frame ranges;
- readable hold and transition/callback;
- data source, denominator and formula when numeric content exists.

The whole film binds chapter promise/payoff, callback, emphasis, density and
cooldown ledgers. Director compiles the director production contract and
passes `policy-gate`.

## Assets

Assets reopens the exact director contract and freezes structured provenance,
rights, bytes, geometry, route and consumer facts. It returns JSON facts only.
If material selection cannot be resolved from user input and structured facts,
stop for user input.

After Assets, compile a new sealed production contract that binds the actual
asset manifest and all unchanged director facts. Rerun `policy-gate`. Build,
integration, render and export consume only the sealed contract.

## Deterministic blocks and parallel build

The parent deterministically partitions the ordered shot list. Every shot
appears once in one contiguous block. A normal block contains at most 8 shots
and spans at most 45,000 ms. Never split a shot; a longer single shot is one
marked singleton.

Each block packet contains only its exact shot records, time/frame window,
namespace, seam obligations, component/motion facts, material facts and sealed
shared hashes. Missing, extra, reordered, stale or undeclared inputs fail.

Dispatch one fresh `broll-master-build` context per block, concurrently within
the host limit. Each context writes only its block package. Immediately run:

1. `source-conformance-gate`
2. `runtime-seek-gate`
3. `pixel-signal-gate`

The gates bind actual source/runtime/pixel facts and emit bounded JSON
receipts. A failed block receives one aggregate replacement in a fresh context.
Passing blocks remain reusable.

## Byte-preserving integration

Dispatch one fresh `broll-master-integrate` context only after every current
block passes. It may author only:

- the minimal master wrapper;
- the ordered block/import map;
- the block hash and byte-count ledger;
- the integration manifest and deterministic receipts.

The integrator must not format, minify, parse/re-emit or repair a block. Reread
every source and require identical pre/post SHA-256 and byte count.

Run the whole-film phase of `integration-delivery-gate` over block order and
coverage, time truth, namespace/selector uniqueness, seams, current
dependency/profile hashes, chapter/callback ledgers and emphasis/density/
cooldown budgets.

## Render, delivery and export

Dispatch one fresh `broll-render` context from the exact integrated bytes.
Require the current sealed contract, all required five-gate receipts, the
current integrated manifest and its no-rewrite proof. Do not require parent
source/image reading, review pages or reviewer lineage. Render exactly one
final 4K master. Complete the delivery phase of `integration-delivery-gate` by
binding decode, duration, raster, rational fps, codec, audio, SRT coverage,
master hash and current source/tool/profile hashes.

Run `broll-shot-export` only after explicit user request and only from the
verified master. Independent shot rendering is forbidden.

## Context boundary and private calibration

The parent consumes only bounded JSON receipts and summaries: block receipt
at most 16 KiB, stage envelope at most 32 KiB and final summary at most 64 KiB.
Keep source, images, prompts, long logs and private paths in the artifact store.

ReachSurge is private minimum authoring calibration and a source of generalized
negative fixtures only. Never copy its source into the public package or place
its identity, verdict or hashes in a production receipt or profile. Deep
Current remains project-only.
