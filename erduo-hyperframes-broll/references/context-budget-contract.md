# Context budget contract

Parent-visible script-only v3 packets have fixed ceilings:

| Packet | Maximum |
| --- | ---: |
| startup preflight receipt | 4 KiB |
| block receipt | 16 KiB |
| stage envelope | 32 KiB |
| final summary | 64 KiB |
| Block Creative Commission | 6 KiB |
| scoped block creative packet | 24 KiB |

`production-preflight.mjs` uses canonical UTF-8 JSON bytes for its fixed 4 KiB
receipt. `validate-context-budget.mjs` applies the frozen v3 ceilings to later
production packets. Both reject an oversized packet before it enters the parent
context.

The 6/24 KiB limits are child-bootstrap limits, not parent-visible receipt
limits. A Commission is the ordered task instruction for one fresh Builder.
Its only production-artifact binding is `{block_id, shot_ids, packet_sha256}`.
The companion scoped packet is a canonical, self-hashed private artifact that
binds the sealed production contract, ordered shots, time window, adjacent
seam IDs, creative directives and design/font/asset hashes. It must never be
copied into a parent receipt or stage envelope.

All three packet classes forbid:

- inline HTML/CSS/JS or other source;
- image bytes, image URLs, screenshots and contact sheet fields;
- stdout, stderr, stack traces and long logs;
- prompts, private evidence payloads and subjective quality fields.

Block Creative Commissions and scoped packets additionally forbid full/raw
director or assets contracts, raw SRT/cues, source HTML/CSS/JS, image bytes or
URLs, prompt bodies, reference originals, private paths and facts for another
block. Larger artifacts are resolved only inside the private artifact store by
their bound hash or opaque ID. These limits do not create an aesthetic score,
visual reviewer or subjective PASS field.

Hash fields such as `source_sha256` are allowed. Detailed failures remain in
the private artifact store and are opened only by a narrow failure code during
repair. A policy cannot relax the frozen 16 KiB, 32 KiB or 64 KiB limits.
