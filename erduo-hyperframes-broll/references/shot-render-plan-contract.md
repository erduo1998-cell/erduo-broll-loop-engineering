# Per-shot render plan contract

The shared fingerprinted timeline is the only time source. `buildShotRenderPlan()` maps each SRT-global master window to stable per-shot artifacts at local time zero and exactly the window duration. Fullscreen/native base windows create `<shot>-fullscreen.mp4`; hard-alpha windows create `<shot>-alpha.mov`; optional supplementary light passes create `<shot>-light-pass.mp4` without claiming they are primary coverage.

The plan keeps global start only for master placement, never for local render start. It contains no text, source paths, media URLs, credentials, or user content.
