# Delivery media gate contract

`delivery-media-gate.mjs` verifies rendered bytes after the HyperFrames structural gate. Its private resolver maps a stable artifact ID to a local file only for the duration of verification; neither locations nor paths enter the receipt.

Every artifact is re-probed, fully decoded, and compared with its exact duration, display size and rational frame rate. It accepts the FFmpeg `mov` container family (the shared probe label for MP4/MOV), then distinguishes delivery semantics by actual codecs and pixels rather than filename: opaque fullscreen/light/faceless/talking-head outputs are H.264 without Alpha; hard overlays are ProRes with an Alpha pixel format; talking-head masters have exactly one audio stream and every other current artifact is silent.

Hard-alpha output additionally runs `alphaextract` plus `signalstats` and requires both transparent and opaque pixel values. A black light pass runs `signalstats` on its visible plane and requires a near-black floor (YMIN ≤ 24) plus a brighter visible signal. A failed probe, full decode, audio policy, format contract, or pixel analysis is a hard verification failure, not a warning. The output receipt is deterministic and path-free.
