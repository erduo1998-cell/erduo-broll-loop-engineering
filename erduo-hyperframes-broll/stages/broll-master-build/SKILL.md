---
name: broll-master-build
description: Author exactly one bounded contiguous HyperFrames block from the sealed script-only v3 contract, then pass source, runtime-seek and pixel-signal gates with one failure-code-driven aggregate retry.
---

# B-roll script-only v3 block author

Invoke this Skill once for one assigned block. It authors neither another
block nor the integrated wrapper, final master or master-derived exports.

## Required private input

The fresh Builder must receive one compiled Block Creative Commission and its
one sealed scoped block creative packet before source authoring. The Commission
binds this block's identity, ordered shots and packet hash; the packet contains
only this block's frozen creative facts and adjacent seam summary. Do not put a
full director contract, full assets contract, raw SRT, image, source, prompt or
reference body into the Builder context.

Private deterministic validation resolves the exact seven-field P3 evidence
set without returning those whole documents to the authoring context:

1. director-phase `prior_contract`;
2. passing director `policy-gate` receipt;
3. all nine actual canonical artifacts, not a hash-only surrogate;
4. the actual asset-facts manifest;
5. passing sealed `policy-gate` receipt;
6. sealed `production_contract`;
7. its actual `validation_policy`.

Recompute canonical document hashes and validate the immutable
director-to-sealed chain. The actual policy document, both policy receipts,
asset manifest and contract bindings must agree byte-for-byte. Reject an
older pipeline, substituted artifact, stale receipt, future hash placeholder
or missing actual document before authoring or validating source.

The assigned block is one continuous ordered canonical shot slice. Preserve
its `B001…BN` identity, namespace, projection windows and exact source hash.
Use at most eight shots. Never add, omit, split, reorder or retime a shot, and
never write outside this block package.

## Mandatory creative prelude

Before any source read or write, perform this exact sequence:

1. call `Skill(hyperframes-core)`;
2. call `Skill(hyperframes-creative)` and read `house-style.md`, then
   `video-composition.md`;
3. call `Skill(hyperframes-animation)`;
4. read the sealed scoped block creative packet bound by the Commission;
5. author source.

Do not reorder, omit or conditionally choose any item. If the Commission,
packet binding or required prelude is absent, stop before source authoring.
The actual Claude Code host trace is the only proof that this happened; never
claim Skill loading in a receipt or stage output.

## Authoring contract

The author, not a deterministic validator, makes the creative implementation
inside the packet's frozen content facts. It may freely choose the DOM,
composition, material treatment, picture language and causal motion that serve
those facts. Do not use F01–F09/G01–G10 as a fixed template, recreate a
reference, use a generic/system font, remote dependency, centered web-page
stack, adjacent shot that only changes text, or ambient-only motion without a
visible causal Action→Result change. ReachSurge may calibrate authoring privately,
but no ReachSurge identifier, positive calibration conclusion or copied
project source enters production evidence. Deep Current remains only the
current project's bound reference profile and is never a public default.

Before writing source, form a private `creative_resolution` for each assigned
shot: primary relation, focus path, text/material relationship and visible
Action→Result causality. It is never returned to the parent or written into a
receipt, and it is not a subjective approval field.

Implement the canonical facts without reinterpretation:

- one primary cognitive action per shot;
- registered semantic objects, relation, operation and visible result;
- registered component, layout, focal, token, type-role and motion-profile
  references;
- one actual `Entry → Action → Result → Hold → Exit` lifecycle whose
  selectors and timeline calls bind the canonical shot and projection;
- at least one non-opacity semantic state change in Action;
- Result after Action and the same functional result carrier throughout
  Result and Hold;
- the exact readable-Hold minimum from policy, including the complex minimum
  for data, table, chart and multi-field shots;
- role-aware functional text; texture microtext cannot carry primary meaning;
- structured data value, unit, denominator, formula, source reference and
  evidence role identical to the canonical shot;
- finite, paused, reversible and seek-safe HyperFrames timelines.

Use only registered local source, font and material bytes. Ordinary image or
video primaries must match the P3 asset-facts manifest and their declared
consumer type. Native auxiliary material must remain auxiliary, bind its
actual local bytes and use its declared shot IDs. Do not use a remote
dependency, runtime network request, system/generic/local font fallback,
unseeded randomness, wall-clock state, infinite repeat, one-way DOM callback,
root escape, symlink input or hard-coded user path.

## Mandatory gate chain

After freezing the actual block bytes, run
`scripts/run-block-gate-chain.mjs` in this exact order:

1. `source-conformance-gate`;
2. `runtime-seek-gate`;
3. `pixel-signal-gate`.

The source gate reopens actual source, font and material bytes; recomputes
file, bundle and block hashes; validates the complete actual P3 chain;
cross-checks canonical registration, selectors, DOM roles, lifecycle calls,
numeric facts, duration truth and local dependencies; and emits one P1
lineage receipt.

The runtime gate samples every declared causal checkpoint through
`fresh_direct`, `zero_to_t`, `end_to_t` and `repeat_to_t`. It compares
normalized state hashes and rejects network, console, result-order, repeat,
font or reverse-seek drift.

The pixel gate consumes a closed technical-facts object. Technical frames
remain private and are never returned. It checks only deterministic black,
empty, alpha, transform, overflow, crop, overlap, ROI, font, glyph, Hold and
declared adjacent-change facts. It cannot issue an aesthetic score or quality
approval.

Each cache key binds current source, policy, production contract, renderer,
HyperFrames and state/frame identity. A passing cached gate is revalidated
and re-signed against the current upstream receipt. Identical second-run
inputs must be all hits and must not repeat runtime or frame capture.

## Recovery and output

One block may consume exactly one aggregate replacement, producing attempt
2. The replacement request receives only the block identity/current private
block plus a deduplicated bounded list of technical failure codes; it receives
no stack, long log, image or subjective conclusion. Restart this block at the
source gate. A second failure is terminal. Passing blocks and their cache
entries remain unchanged.

Return only:

```text
block_id
attempt
source-conformance receipt
runtime-seek receipt
pixel-signal receipt
```

Every gate receipt is at most 16 KiB and the enclosing stage packet is at most
32 KiB. Parent-visible output contains no source, local path, image, prompt,
private calibration payload, long log or subjective field. A script PASS
proves only the frozen technical contract; it does not prove aesthetic
quality.
