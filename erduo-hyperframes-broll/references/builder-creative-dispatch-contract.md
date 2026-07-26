# Builder creative dispatch contract

## Purpose

Every fresh `broll-master-build` Builder receives one bounded Block Creative
Commission before it reads or writes source. The Commission is a production
instruction for a single continuous block, not a reviewer, an aesthetic gate
or a reusable visual template.

Its required prelude is fixed and ordered:

```text
hyperframes-core
→ hyperframes-creative (read house-style and video-composition)
→ hyperframes-animation
→ validate and read the scoped block creative packet
→ author source
```

The real host tool trace is the only evidence that this prelude ran before
source access. A receipt, prompt acknowledgement or packet hash cannot replace
that trace.

## Commission shape and freedom boundary

A Commission is at most 6 KiB and binds exactly:

```json
{
  "block_id": "B001",
  "shot_ids": ["S001", "S002"],
  "packet_sha256": "64 lowercase hexadecimal characters"
}
```

Its prose supplies only the block creative mission, current user-design
priority, continuity handoff, mandatory prelude and freedom boundary. The
Builder freely chooses DOM, composition, material treatment and causal motion
implementation inside the frozen semantic, time, typography, asset and
creative facts. It must not force an F01–F09/G01–G10 candidate, external
style, reference reconstruction, generic/system font, remote dependency,
copy-only neighbouring repeat or ambient-only semantic action.

## Scoped block creative packet

Before dispatch, the parent privately verifies a `scoped-block-creative-packet`
against actual canonical artifacts. It is at most 24 KiB and has a self-hash.
It contains only the ordered block shot IDs, its exact time window, adjacent
seam IDs, each shot's semantic/design/type/lifecycle facts and frozen
`creative_directive`, plus sealed contract, shot-plan, design-system,
font-package and asset-manifest hashes.

The packet is reconstructed from canonical artifacts. It is rejected if its
hash, shot order, block membership, directive, design/type/lifecycle fact,
seam, predecessor contract, asset manifest or other binding is substituted.
Multi-shot blocks are limited to eight shots and 45 seconds; a longer singleton
shot remains a valid singleton.

The packet and Commission must not contain full/raw director or assets
contracts, SRT/cues, source HTML/CSS/JS, images, prompts, reference originals,
private paths or facts from any other block. Larger materials resolve only in
the private artifact store via their bound hash or opaque ID. Neither packet
validation nor a technical gate may create a subjective PASS, visual review or
style conclusion.

## Canonical validator

The dispatch compiler calls this validator before it creates a Commission:

```js
import { validateScopedBlockCreativePacket } from './validate-production-contract.mjs';

const verified = validateScopedBlockCreativePacket(packet, {
  block: { block_id, shot_ids },
  productionContract: sealedContract,
  priorContract,
  artifacts,
  assetManifest,
});
```

`priorContract`, `artifacts` and `assetManifest` stay in the dispatch
compiler's private context; they are never serialized into the Commission.
Success returns only `{status, block_id, shot_count, packet_sha256}`. The
dispatcher may pass the three Commission bindings and private packet locator to
the fresh Builder, but never the compiler inputs or another block's packet.
