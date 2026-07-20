# Stage orchestration contract

The public product has one parent Skill and five installed stage Skills. They are not subagents. The parent dispatches them in this exact order only after verifying the preceding receipt:

`preflight → director → assets → render → verify`

Every receipt is private project state at `.erduo-hyperframes-broll/receipts/`, contains no path, credential, raw prompt, or source transcript, and is integrity-hashed. The product-stage to existing implementation-state mapping is:

| Product stage | Existing state |
| --- | --- |
| `preflight` | `preflight` |
| `director` | `directing` |
| `assets` | `assets` |
| `render` | `build` then `render` |
| `verify` | `verify` |

An upstream receipt is immutable for matching input fingerprints. If it changes, invalidate only the matching downstream state: input/time changes start at preflight; design changes start at director; user assets start at assets; frame rate or aspect ratio start at render. Never redo a receipt that remains valid.

The director receipt must name `video-script-builder`, state `time_source: srt`, prohibit `video-spec-hf.md`, word-estimated timing, and asset-route override, and include hashed host-call evidence. In Claude Code the evidence comes from its `Skill(video-script-builder, args)` event. In Codex it comes from an explicit `$video-script-builder` invocation. No callable Skill means director failure, not a silent fallback.

Use `scripts/stage-receipt.mjs` to validate receipt shape and privacy; use `scripts/orchestrate-stages.mjs` for the deterministic public fixture harness. The harness is an integration test of the handoff chain, not a replacement for host-side SURGE invocation evidence.
