# Host image-generation contract

Image generation is optional but precedes Pexels in the main material order. A host adapter explicitly declares `{available, adapter_id, image_formats}`; absent, malformed, or unavailable declarations return a bounded fallback to `pexels` without calling generation. The public Skill never requires a Codex-only API or host-specific creative branch.

Build a prompt from the approved design slice's visible subject/action/result,
Style DNA relationships, target-raster crop, text-safe and protected regions,
plus explicit prohibitions. Image generation cannot carry factual text or
final readable copy. Reject prompts containing paths, credentials, literal
subtitle/claim fields, unverifiable people/products/interfaces/data or a
request to redraw protected user evidence.

The adapter writes one ordinary local image. The pipeline freezes its prompt
record and hash, adapter/source identity, generator-terms rights evidence,
local bytes, real probe and provenance. A selected result must satisfy the same
[Flat Shot Kit](flat-shot-kit-contract.md) composition, consumer, preview,
rejection/fallback and pending-contribution fields as user media and Pexels.
No adapter path or prompt body enters state or the parent packet. Unsuitable or
unavailable generation advances to Pexels with a concrete frozen reason;
native output remains auxiliary and cannot become the primary fallback.
