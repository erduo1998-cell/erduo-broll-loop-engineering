---
name: broll-master-integrate
description: Assemble all script-only v3 blocks into one ordered master wrapper while proving every validated source byte is unchanged.
---

# B-roll master integrator

1. Run in fresh isolation after every expected block has passed
   `source-conformance-gate`, `runtime-seek-gate` and `pixel-signal-gate`.
   Accept only the sealed v3 production contract, current validation policy,
   actual shot plan, current block manifests/source bundles and their fixed-size
   JSON receipts.
2. Reopen actual block source bytes. Require one ordered `B001…BN` set,
   complete shot coverage, contiguous frame windows, unique namespaces and
   exact production-contract/source/manifest hashes.
3. Run `integrate-script-only-v3.mjs`. It may create only the minimal master
   wrapper, ordered integration map, integration manifest, no-rewrite proof and
   `integration-delivery-gate` integration receipt.
4. Write every block source file from its validated bytes, then reopen it.
   Require identical SHA-256, byte count and byte sequence before and after
   assembly. Formatting, normalization, minification, parser re-emission,
   concatenation, repair or regeneration is terminal
   `integrator_rewrite_detected`.
5. Aggregate deterministic whole-film facts only: chapter promise/payoff,
   callback, emphasis, density, canonical IDs, time truth, order, coverage,
   namespace and seams. Scripts judge the contract, never aesthetics.
6. Return only the path-free integration manifest envelope, no-rewrite proof
   envelope and Gate 5 receipt. Do not return source, images, long logs,
   private paths or calibration identity. The integrator cannot redesign,
   patch a failed block or render.
