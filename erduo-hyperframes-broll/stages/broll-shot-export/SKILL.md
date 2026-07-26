---
name: broll-shot-export
description: Optionally cut master-derived shot files after an explicitly requested export from a technically verified master with the current script-only v3 integration-delivery receipt.
---

# B-roll optional shot export

1. Require the exact integrated-source manifest, current integration-delivery
   receipt, verified render manifest, passing automatic technical verify and
   explicit user request. Earlier pipeline authorizations cannot authorize an
   export.
2. Resolve the frozen shared shot windows and cut them from the exact verified
   master; never independently rerender, redesign or change source.
3. Verify master identity and slice windows, freeze a slice artifact manifest,
   and return only its compact envelope and delivery summary.
