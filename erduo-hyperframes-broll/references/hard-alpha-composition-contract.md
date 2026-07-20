# Hard-edge Alpha composition contract

Hard-alpha output is a separate path from full-screen video and black light passes. `buildHardAlphaComposition()` accepts only timeline clips whose primary compositing is `hard-alpha-over-source`, plus a fingerprinted overlay document containing a stable shot ID, exact window duration, hard-edge layout kind, and an accent hue.

It emits transparent HTML with no background fill, no soft blur, particle, haze, subtitle, BGM, narrative text, local path, URL, or credential. The only supported delivery target is a high-quality `mov` render verified as ProRes 4444 with an alpha-capable pixel format and a non-uniform alpha plane. A `.mov` name alone is never proof.
