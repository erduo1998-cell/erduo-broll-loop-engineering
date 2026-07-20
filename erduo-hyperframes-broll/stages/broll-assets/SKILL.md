---
name: broll-assets
description: Route and freeze suitable B-roll assets for validated director briefs. Use only after a valid broll-director receipt; preserve the fixed user-media, Pexels, host-image-generation, and HyperFrames-native fallback order.
---

# B-roll assets

1. Reject missing or invalid `director` receipts. Use the director brief's semantic need, not a subtitle keyword, to route each shot.
2. Check relevant user media first; then Pexels image/video; then a real host image-generation capability; finally deterministic HyperFrames-native graphics. Do not skip Pexels because SURGE disallows it.
3. Freeze external selections locally, record source/provenance privately, and run the asset-integrity gate. A missing or irrelevant asset must fall through to the next route instead of leaving a coverage gap.
4. Write a path-free `assets` receipt linked to the director receipt. It reports only route summary and scene count.
5. Fail only this stage on search, download, or generation error; preserve valid preflight and director work for resume.

Pass the validated asset result to `broll-render`; do not build media or report delivery.
