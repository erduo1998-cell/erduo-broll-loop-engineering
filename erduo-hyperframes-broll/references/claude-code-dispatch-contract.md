# Claude Code dispatch contract

Before any producer, run `production-preflight.mjs` from the parent. Consume
only its ≤4 KiB receipt; a blocked receipt stops the run. The script verifies
the confirmed brief/input hashes, runtime capabilities and that the root plus
all active stage Skills resolve to one fingerprinted source tree.

Claude Code must use a fresh `Agent(subagent_type: "general-purpose")` for
each production stage:

1. `broll-director` once.
2. `broll-assets` once.
3. `broll-master-build` once for every deterministic block and once more only
   for that block's allowed aggregate replacement.
4. `broll-master-integrate` once after all current blocks pass.
5. `broll-render` once after the integration gate passes.
6. `broll-shot-export` only after an explicit user request.

`Skill(broll-*)` from the parent is inline execution and invalid. Do not let a
parent summarize, reinterpret or continue a production stage itself. No reviewer
or serial micro-fix Agent is allowed.

Each Agent prompt contains only the stage goal, compact upstream hashes,
permitted private artifact IDs, required contracts and the bounded output
schema. Never paste raw SRT, plan rows, inventories, source, images, frames,
logs or prior transcripts into the parent or another child.

## Block Creative Commission for `broll-master-build`

The parent must compile, rather than hand-write, a Block Creative Commission
for every fresh `broll-master-build` Agent. The compiler accepts exactly one
validated, sealed `scoped-block-creative-packet`; it does not accept a director
contract, assets contract, SRT, source, image, prompt, reference body or a
whole-film inventory. The Commission is at most 6 KiB and binds only the
assigned `block_id`, its ordered `shot_ids`, and the packet's
`packet_sha256`. The packet is the separate, private, at-most-24-KiB delivery
of this block's frozen content facts and adjacent seam summary.

The generated Commission has these seven sections in this exact order:

1. **Isolated assignment.** Author only the named continuous block and
   namespace; do not alter another block, wrapper, whole-film rule or packet.
2. **Mandatory authoring prelude.** Before any source read or write, call
   `Skill(hyperframes-core)`, then `Skill(hyperframes-creative)` and read
   `house-style.md` followed by `video-composition.md`, then call
   `Skill(hyperframes-animation)`. Next read the sealed scoped packet, and
   only then author source. This sequence is unconditional.
3. **Creative mission.** Realize the block's frozen content change,
   attention/transition responsibility and user-design priority from its
   scoped packet.
4. **Frozen block facts.** Use only the packet's assigned
   `creative_directive`, design, font, material, lifecycle, seam and time
   facts. Do not obtain facts from a full director/assets document or another
   block.
5. **Author freedom and prohibitions.** Within those facts, freely choose DOM,
   spatial composition, material treatment and concrete causal motion. Do not
   turn F01–F09/G01–G10 into fixed templates, recreate a reference, use a
   generic or system font, add a remote dependency, build a centered web-page
   stack, repeat an adjacent shot by changing only text, or use ambient-only
   motion without visible causal change.
6. **Private creative resolution.** Before writing source, form one private
   `creative_resolution` per shot: the primary relation, focus path,
   text/material relationship, and visible Action→Result causality. It is
   working context only: do not return it, score it or add it to a receipt.
7. **Implementation and technical finish.** Freeze the assigned source and
   run the existing source-conformance, runtime-seek and pixel-signal gates in
   order. Return only the bounded technical receipt required by the stage.

The Commission is an authoring prelude, not a new gate. It must not introduce
a visual model, static-frame aesthetic check, reviewer, subjective verdict or
creative PASS field. The five existing gates continue to prove only contract
and technical facts.

Actual Claude Code host tool trace is the only evidence that this prelude ran.
For every block it must show the fresh
`Agent(subagent_type: "general-purpose")`, the three Skill calls and the two
required creative reference reads in the stated order before the first source
read or write. A receipt JSON must not state or imply that any Skill was
loaded; its dispatch-event hash may bind the trace but cannot replace it.

Record `execution_isolation` for every child with:

```json
{
  "host": "claude-code",
  "mechanism": "claude-agent",
  "dispatch_evidence_sha256": "actual Agent tool-event hash",
  "stage_context_sha256": "exact stage-packet hash"
}
```

The dispatch event is unique to one child stage; a block retry has a new event
and stage-context hash. Reject missing hashes, `Skill(...)`/inline mechanisms,
wrong stage names, reused events and any non-`general-purpose` child. The
parent keeps only bounded receipts: block ≤16 KiB, stage envelope ≤32 KiB and
final summary ≤64 KiB.

The receipt validator proves that the declared isolation record has the required
shape and bindings; its hashes alone do **not** prove that Claude Code actually
called `Agent`. Promote that claim only after a real Claude Code end-to-end run
has retained the corresponding host tool trace and unique event evidence.
