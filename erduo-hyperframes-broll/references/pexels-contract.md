# Pexels search contract

Search only after user-media routing returns `next_route: "pexels"`. Each abstract brief supplies one or more concrete English subject phrases; the selector expands the first phrase into three queries: documentary (`phrase`), emotional (`phrase cinematic natural light`), and visual-metaphor (`phrase conceptual composition`). It never treats Chinese narration as a deterministic English translation.

The client sends the Pexels key only in an `Authorization` header to `https://api.pexels.com/v1/search` and `https://api.pexels.com/v1/videos/search`. Query/cache/report JSON never contains the key. Both APIs are requested for every query. Candidate records keep only public Pexels ID, kind, dimensions, duration when present, page URL, creator attribution URL, and one HTTPS download URL; raw API payloads are discarded.

Filter images/videos by target orientation, safe crop retention (at least 55%), target pixels, and video duration. Deduplicate by `kind:id`, sort deterministically, cap results, and record query IDs. HTTP failure, malformed JSON, rate limit, and missing key return stable public codes. Search JSON is cached through the existing `search` namespace with a request that excludes credentials.
