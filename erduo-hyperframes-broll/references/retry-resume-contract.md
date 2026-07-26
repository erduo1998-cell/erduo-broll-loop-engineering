# Retry and resume contract

`retry-resume.mjs` is the bounded coordinator above the existing state machine and content-addressed cache. It does not invent another persisted run format. A caller supplies one valid state stage and a path-free list of shot jobs; valid cache keys are checked by `cache.mjs` before a producer is invoked, so successful search/download/render work becomes a cache hit and only missing, failed, or integrity-invalid artifacts are produced again. Cache's existing hash/size validation quarantines a tampered entry before rebuilding it.

The coordinator starts only a pending stage or a retryable failed stage, never a running or completed stage. It permits at most five attempts (normally fewer), records failures through `state.mjs`' fixed safe catalog, and returns a path-free receipt listing only shot ID, namespace, cache key and hit/miss. A completed stage may be reused only when both supplied fingerprints match; changed input must first flow through manifest invalidation, preserving the state graph's source of truth.

Job producers are host callbacks and never receive or return a user-facing path. The helper catches producer/cache errors, marks only the current stage failed and retryable, and on the next invocation lets cache hits skip earlier successful shots. Non-retryable or exhausted failures return a safe terminal receipt without attempting more work.

For `build`, persist the deterministic authoring plan and one receipt per
`chunk_id`. A chunk has at most two attempts. A changed validated brief,
selection context, selection option/replay receipt, complete packaged design
library, visual-grammar program,
full-film rule, projection, design slice, kit set, font package or profile
invalidates every chunk; a changed shot/material input invalidates only its
owning chunk, then the chunk set, style evidence/review/authorization,
integration, `source_code_review` and render. A failed chunk must not reset
unaffected verified chunks. A style finding is owned by one block and consumes
that block's same single aggregate retry; it does not create another retry
budget. After any replacement, regenerate the complete capture/facts
generation, packet, review and authorization over all current bytes.
Integration is resumable only after reopening every chunk manifest, receipt
and source byte, reconstructing the exact block visual packets and
their self-contained scoped design-shot/Flat Shot Kit/asset-binding rows,
independently revalidating the approved `style_conformance_review` and
recomputing the exact B↔C source ledger. Source
review is resumable only after reopening the integrated source pages, current
style authorization, trusted-capture validator receipt and no-rewrite receipt.
Render and delivery resume additionally require a freshly recomputed full
style-lineage render receipt; compact stage or aggregate summaries alone are
never reusable authority.
