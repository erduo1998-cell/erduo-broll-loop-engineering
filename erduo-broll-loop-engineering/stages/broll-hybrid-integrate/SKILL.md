---
name: broll-hybrid-integrate
description: Validate and assemble evidence-bound frozen block media from mixed HyperFrames and Remotion builders into one runtime-neutral hybrid preview without nesting either animation runtime.
---

# B-roll Hybrid Integrator

Act only as the mixed-backend Integrator. Do not modify backend source, repair
Builder output, change routing, redesign shots, formally render the approved
master, or export individual shots.

## Boundary and inputs

Read `../../references/runtime/runtime-plan.schema.json`,
`../../references/runtime/frozen-block.schema.json`, and the validated hybrid
runtime plan. Require one Builder-owned `block-media.json` plus its local
mezzanine file for every planned block.

Never import HyperFrames into Remotion, Remotion into HyperFrames, embed one
Studio/preview in the other, or use generated source as an interop layer.
Mixed integration accepts only frozen media. Every backend source remains in
its Builder directory and is represented by its `sourceIdentity` hash.

## Validate before assembly

Run the bundled frozen-block validator with the exact ordered contract
locators. It verifies runtime/shot/window closure, local regular media files,
hashes, profile and audio agreement, FFprobe/decode attestations, duration
tolerance, and the `noRealtimeNesting` invariant. Any red result returns to the
owning Builder; do not transcode a bad block into compliance.

Require all blocks to use one frozen profile, fps rational, raster, pixel
format, color space, and audio policy. Boundaries remain the Director's integer
milliseconds; any unavoidable frame rounding must stay within one frame and be
recorded. Inspect every seam, opening, final safe frame, and representative
readable hold.

## Runtime-neutral assembly and identity

Use only direct, sanitized FFmpeg/FFprobe processes without a shell. Assemble
blocks in runtime-plan order into a temporary hybrid preview. A concat copy is
allowed only when stream parameters and timing close exactly; otherwise use
one explicit deterministic normalization encode and record its full profile.
The preview is evidence, not the final master.

Create `hybrid-composition-identity.json` only after validation and visual seam
inspection. Its canonical hash closure includes runtime-plan identity, ordered
block contract bytes, block media SHA-256 values, output profile, audio policy,
and integration recipe. Preview media and logs remain outside that identity.

## Deliverables

Write only under `broll-production/04-hybrid-integrate/`:

- ordered contract index and validation result;
- `hybrid-composition-identity.json`;
- `integration-notes.md` with frame rounding and seam evidence;
- one technically verified preview plus FFprobe/full-decode facts;
- `handoff.md` naming the preview locator and aggregate identity.

## Completion and stop

Complete when every block appears once, contracts and actual hashes validate,
coverage closes, no runtime is nested live, preview media decodes fully, seams
and holds were inspected, and the identity is frozen.

Stop for missing or changed blocks, profile mismatch, hash drift, more than
one frame of duration error, audio-policy mismatch, visible seam defects, or
any attempt to pass runtime source across the boundary. Return Builder-owned
defects to a fresh Builder.
