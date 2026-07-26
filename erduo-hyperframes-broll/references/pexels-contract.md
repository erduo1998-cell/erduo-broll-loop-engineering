# Pexels search contract

Search only after user-media routing and image generation have both failed,
been unavailable, or been marked unsuitable for the approved design/shot
purpose with frozen reasons. Each abstract brief supplies one or more concrete
English subject phrases; the selector expands the first phrase into three
queries: documentary (`phrase`), emotional
(`phrase cinematic natural light`), and visual-metaphor
(`phrase conceptual composition`). It never treats Chinese narration as a
deterministic English translation.

The client sends the Pexels key only in an `Authorization` header to `https://api.pexels.com/v1/search` and `https://api.pexels.com/v1/videos/search`. Query/cache/report JSON never contains the key. Both APIs are requested for every query. Candidate records keep only public Pexels ID, kind, dimensions, duration when present, page URL, creator attribution URL, and one HTTPS download URL; raw API payloads are discarded.

Filter images/videos by target orientation, safe crop retention (at least 55%), target pixels, and video duration. Deduplicate by `kind:id`, sort deterministically, cap results, and record query IDs. HTTP failure, malformed JSON, rate limit, and missing key return stable public codes. Search JSON is cached through the existing `search` namespace with a request that excludes credentials.

Before selection, evaluate each shown candidate against the immutable design
slice at target raster: subject/focal point, visible crop, type-safe and
protected regions, title relationship, palette/contrast, source/treatment
motion, consumer type/window and result ROI. Freeze concrete rejection reasons.
A selected item is downloaded locally, re-probed and hash-checked, and binds
its Pexels source/creator attribution record plus auditable Pexels-license
evidence and limitations. It must satisfy the same
[Flat Shot Kit](flat-shot-kit-contract.md) fields as user and generated media,
including a target-raster preview and `pending-master-build` contribution.
Page/download URLs remain in the private provenance record; the parent packet
uses opaque IDs and hashes only. A search hit or source thumbnail alone is not
a composited candidate and cannot be approved.
