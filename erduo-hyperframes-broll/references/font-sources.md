# Font source and project-copy contract

The public package includes no display-font catalog or display-font binaries. For a display role, the user supplies a local regular font file, its local license file and an explicit `user-confirmed-licensed` declaration; only verified bytes and hashes enter the generated project. `assets/fonts/source-manifest.json` remains the pinned acquisition source for the supporting Noto families.

## Acquisition

1. For a display role, accept only the user-provided local font and local license file declared for that run; do not download, replace, or silently fall back. For a supporting Noto role, try the manifest's exact pinned `raw_url` first and write only to a private user cache.
2. Only when that raw request fails at the network or HTTP transport layer may acquisition use GitHub's Contents API followed by the Git Blob API. The fallback must use the same official GitHub repository, exact pinned commit and exact `source_path`; it is another transport for the same object, not another source.
3. After any successful raw or API response, verify byte length and SHA-256 before parsing the font. A byte-length or hash mismatch is a hard integrity failure: delete or quarantine the response, do not try the other transport, and never switch to a mirror, branch tip, release alias or different commit/path.
4. Verify that the bundled license file SHA-256 equals `license_sha256`. Copy that license into the generated project's font-notices directory.
5. Treat network unavailability as a missing-font blocker only when no already verified complete font exists in the private cache.

The manifest pins Noto Sans CJK SC 2.004 and Noto Serif CJK SC 2.003 from the official `notofonts/noto-cjk` repository. Noto documents CJK Sans/Serif and publishes them under SIL OFL 1.1; the repository commit, file size and SHA-256 were independently checked when this manifest was created.

## Glyph set and packaging

Build one deterministic Unicode set from the SRT plus every approved visible title, label, number, punctuation mark and UI field. Normalize text to NFC, sort code points numerically, and hash the serialized `U+XXXX` list.

- If a validated deterministic OpenType subsetter is callable, subset the verified font, preserve required layout features/weight range, validate every requested glyph, and write the subset into the generated project.
- If no validated subsetter is callable, copy the already verified complete upstream font file into the generated project. Do not block merely because subsetting or WOFF2/Brotli support is absent.

For either path, record the exact delivered file SHA-256 and codepoint-set/CJK coverage SHA-256, copy the license, and bind only that project-local file with `@font-face`. Rendering must run without network access and without fallback. Do not name a modified subset as a reserved upstream family when the license requires renaming; an unmodified full copy retains its verified upstream identity.

## Verification

- Reject system fonts, generic fallback stacks, remote CSS and network font URLs.
- Require `document.fonts.check`, the actual loaded family, delivered-font hash, license hash and target-language frame evidence.
- A glyph missing from the delivered subset or full font is a build failure, not permission to fall back.
- Prefer a verified subset for size when tooling is available; otherwise the verified complete font and its license travel with the generated project.
