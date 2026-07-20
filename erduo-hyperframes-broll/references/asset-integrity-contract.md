# Asset integrity gate contract

`asset-integrity-gate.mjs` is the last asset boundary before composition building. It accepts only a selected route's stable reference (`UA-…`, a Pexels download-cache key, or an image-generation render-cache key), plus the exact media record selected upstream. The public request and the returned integrity receipt never contain a URL, a filename, a relative path, or an absolute path.

The host supplies a separate, ephemeral private resolver that maps the stable reference to its local frozen artifact. The gate `lstat`s the resolved value, rejects symlinks/non-files/empty files and URLs, probes media again, calculates the same centered crop rule used by routing (at least 55% retention and no required upscale), verifies the selected kind/dimensions/duration, and hashes the bytes. It returns a deterministic path-free receipt with per-shot `frozen_sha256`, size, media dimensions/duration and crop retention.

User media is selected by ID and resolved only in memory. Pexels and generated media are selected by their existing cache keys; their artifact caches already revalidate hash/size before resolution. A resolver result is never persisted by this gate. A changed, missing, unreadable, mismatched, too-short, or uncroppable asset is a hard error and must be rerouted rather than silently substituted.

The optional CLI takes a public request JSON and an ephemeral private location-map JSON. It emits only the safe receipt or a stable safe error, never either input path or the location-map's local paths.
