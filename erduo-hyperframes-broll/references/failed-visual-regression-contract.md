# Failed visual regression evidence

This registry preserves failure classes, not private media. `archived-metadata-only`
means the historical ART record is available but its original media bytes are not
currently readable. It is never valid to recreate frame hashes, pixels or a visual
decision from that metadata.

Use `scripts/failed-visual-regression.mjs` with caller-supplied local paths to
capture a readable sample into a private directory. The generated package binds:

- the source media SHA-256 and normalized probe facts;
- at least twelve exact full-raster PNG frames;
- one contact sheet derived from those frames;
- every artifact locator, byte count, raster and SHA-256;
- a path-free main-review request whose visual decision remains `pending`.

`validate` proves only byte integrity, media facts and packet binding. It cannot
approve or reject visual quality. A producer, renderer, deterministic validator or
receipt cannot create the private main-review record.

After a qualified main agent actually views the contact sheet and, where needed,
the full-raster frames, `record-review` may mechanically bind its explicit
`revision_required` decision and finding codes to the frozen request. This command
does not infer findings and cannot turn a historical failed sample into an
approval.

The package is private evidence, not a user preview or public Skill asset. Never
copy the captured media, frames, contact sheet, local input name or local
filesystem location into this public package.
