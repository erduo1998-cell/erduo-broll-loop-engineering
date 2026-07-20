---
name: broll-render
description: Build and render HyperFrames B-roll master and per-shot media from validated assets and director briefs. Use only after a valid broll-assets receipt, including when resuming a failed build or render stage.
---

# B-roll render

1. Reject missing or invalid `assets` receipts. Reuse the shared SRT-anchored timeline; do not create a second timing model.
2. Build master and local-zero shot compositions. Preserve source audio for talking-head; keep faceless master silent by default; never burn subtitles or add BGM.
3. Route full-screen output to MP4, hard-edge transparency to ProRes 4444 MOV, and soft light to black-background MP4. Run the current HyperFrames check before rendering.
4. Retry only failed build/render work. Reuse matching upstream state and successful artifacts.
5. Write a path-free `render` receipt linked to the assets receipt after both internal build and render states complete.

Pass media and the validated receipt to `broll-verify`; do not report the project as complete.
