---
name: broll-shot-export
description: Optionally cut master-derived shot files after the user explicitly requests them and a verified, main-agent-final-reviewed master exists.
---

# B-roll optional shot export

1. Require the verified render manifest, main `html_preview_review`, main `final_frame_review` and explicit user request.
2. Resolve frozen shot windows privately and cut them from the exact master; never independently rerender or redesign.
3. Verify master identity and slice windows, freeze a slice artifact manifest, and return only its compact envelope and delivery summary.
