# Retry and resume contract

`retry-resume.mjs` is the bounded coordinator above the existing state machine and content-addressed cache. It does not invent another persisted run format. A caller supplies one valid state stage and a path-free list of shot jobs; valid cache keys are checked by `cache.mjs` before a producer is invoked, so successful search/download/render work becomes a cache hit and only missing, failed, or integrity-invalid artifacts are produced again. Cache's existing hash/size validation quarantines a tampered entry before rebuilding it.

The coordinator starts only a pending stage or a retryable failed stage, never a running or completed stage. It permits at most five attempts (normally fewer), records failures through `state.mjs`' fixed safe catalog, and returns a path-free receipt listing only shot ID, namespace, cache key and hit/miss. A completed stage may be reused only when both supplied fingerprints match; changed input must first flow through manifest invalidation, preserving the state graph's source of truth.

Job producers are host callbacks and never receive or return a user-facing path. The helper catches producer/cache errors, marks only the current stage failed and retryable, and on the next invocation lets cache hits skip earlier successful shots. Non-retryable or exhausted failures return a safe terminal receipt without attempting more work.
