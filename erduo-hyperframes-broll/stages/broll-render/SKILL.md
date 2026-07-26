---
name: broll-render
description: Render one final 4K master from current script-only v3 integration evidence, then verify the actual delivered media technically.
---

# B-roll master render producer

1. Accept only the sealed v3 production contract, current validation policy,
   passed integration-phase `integration-delivery-gate` receipt, exact
   integration manifest and no-rewrite proof.
2. Reopen the master wrapper, ordered map and every integrated block source
   file. Recompute current hashes and stop if any validated byte, manifest,
   policy, renderer, HyperFrames or delivery-profile binding is stale.
3. Run `render-script-only-v3.mjs` with network disabled. The delivery profile
   must be the sealed 3840×2160 profile. Refuse an occupied output path; file
   existence is never a cache hit. Invoke the renderer exactly once.
4. Treat render failure as technical failure, never permission to alter source.
   After render, hash the actual master and run ffprobe plus full decode against
   duration, 4K raster, rational fps, H.264 codec, audio policy and alpha
   behavior.
5. Emit one delivery-phase `integration-delivery-gate` receipt bound to the
   current production contract, integrated source, no-rewrite proof, renderer
   and HyperFrames versions, delivery profile, render receipt, technical
   verification receipt and actual master-media hash.
6. Return only path-free render/media facts, technical status and real
   limitations. Do not return source, frames, images, long logs, private paths
   or calibration identity. Shot export remains optional and must derive from
   the verified master after an explicit request.
