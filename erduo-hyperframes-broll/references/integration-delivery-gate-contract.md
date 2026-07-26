# Integration and delivery gate contract

`integration-delivery-gate` uses two separately hashed receipt instances from
the same sealed production contract.

The executable paths are `scripts/integrate-script-only-v3.mjs` and
`scripts/render-script-only-v3.mjs`. The former writes and reopens every block
file before issuing the integration receipt. The latter reopens that complete
integrated set, refuses occupied output, invokes one 4K render and verifies the
actual master with probe plus full decode before issuing the delivery receipt.

## `phase: integration`

Require every expected block exactly once and in order, complete SRT/shot
coverage, no gap/overlap, unique canonical shot/chapter IDs, namespace and
selector isolation, valid seams and transition ownership, identical
projection/profile/font/asset/policy bindings, an offline-loadable master
wrapper and byte-for-byte preservation of each author block.

Aggregate and close chapter promise/payoff, motif callback, emphasis, density
and cooldown ledgers. Cross-chapter callbacks preserve object identity,
direction and state delta. The integrator cannot repair or format block
source.
The integration receipt requires the exact integration binding set, including
ordered block-receipt set, master wrapper, integration manifest, no-rewrite
proof, integrated source, renderer version and HyperFrames version hashes.
Delivery additionally requires integration, render, technical-verification
receipt hashes and the verified master-media hash; neither phase accepts
missing or extra bindings.

## `phase: delivery`

Bind the master to current integrated source, production contract, renderer,
HyperFrames version and delivery profile. Require decode, duration, raster,
fps, codec, audio and alpha behavior to match the profile. File existence is
not a cache hit; changed source/tool/profile hashes require rerender.

Optional shot files must be derived from the verified master, not independently
rendered. The report states technical contract results and real limitations;
it does not claim aesthetic approval. Integration and delivery receipt codes
must belong to the `integration-delivery-gate` policy registry.

## Private calibration boundary

ReachSurge is a private minimum authoring calibration and negative engineering
dry-run source only. `scripts/reachsurge-private-dry-run.mjs` reads such a copy
without modifying it and emits bounded failure codes and counts. Its identity,
path, source, media, gold verdict and profile parameters never enter a
production receipt, public profile, stage envelope or parent result.
