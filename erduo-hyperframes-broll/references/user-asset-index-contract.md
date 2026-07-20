# User asset index contract

`scripts/index-user-assets.mjs` recursively inventories visual candidates inside one user-supplied directory. It never follows symlinks, escapes the root, or publishes the root's absolute path.

## Traversal

- The root must exist as a real directory, not a symlink.
- Traverse deterministically by sorted directory-entry name.
- Skip hidden entries and directories named `node_modules`, `deliverables`, or `.erduo-hyperframes-broll`.
- Do not follow directory or file symlinks. A candidate-extension symlink becomes a safe rejected record.
- Candidate extensions only reduce work; they do not prove type: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.avif`, `.mp4`, `.mov`, `.m4v`, `.webm`, `.mkv`, `.avi`, `.mpeg`, `.mpg` (case-insensitive).
- Cap the default candidate count at 5000, file size at 10 GiB, depth at 20, and concurrent probes at 4. Hitting a root-wide limit is an input error; one oversized/unreadable/bad candidate is rejected without blocking siblings.

Use `lstat` for every entry. Convert every accepted/rejected path to root-relative POSIX form, reject any result that is absolute or contains a `..` segment, and pass only the internal absolute path to `probeMedia`.

## Probe and classification

- Reuse `probe-media.mjs`; never duplicate or weaken its ffprobe/decode gate.
- A successful visual stream with null duration and no audio is `image`; other successful media containing video is `video`.
- Audio-only and no-video results are rejected as `not_visual`.
- A bad candidate yields `{ relative_path, code, stage, message }` with the probe's fixed safe values. Do not include raw stderr or an absolute path.

## Asset output

Return stable, sorted JSON:

```json
{
  "schema_version": 1,
  "candidate_count": 1,
  "indexed_count": 1,
  "rejected_count": 0,
  "assets": [
    {
      "asset_id": "UA-...",
      "relative_path": "product/hero-shot.mp4",
      "media_kind": "video",
      "size_bytes": 123,
      "duration_ms": 2500,
      "width": 1920,
      "height": 1080,
      "orientation": "landscape",
      "codec": "h264",
      "semantic_tokens": ["product", "hero", "shot"]
    }
  ],
  "rejected": []
}
```

- `asset_id` is `UA-` plus the first 16 lowercase hex characters of SHA-256 over the normalized relative path. It is a stable slot identity, not a content hash.
- Dimensions use probe display dimensions. Orientation is `landscape`, `portrait`, or `square`.
- Semantic tokens come only from relative directory/file names: normalize Unicode, split camelCase/ASCII punctuation/digits, lowercase Latin, retain contiguous Han phrases plus Han bigrams, deduplicate, sort, and cap at 64. Do not inspect media tags, OCR, private file content, or parent directories outside the root.
- Results and rejected records remain sorted by `relative_path` regardless of probe completion order.

## CLI and errors

```bash
node scripts/index-user-assets.mjs <user-assets-directory> [--pretty]
```

Success, including an empty valid directory, exits `0`. Invalid root/limit exits `2`; invalid arguments exit `64`; unexpected failure exits `70`. Root errors contain fixed code/stage/message only. The output contains no root path.

## Test minimum

Cover empty/mixed/nested directories, case-insensitive candidate filtering, ignored files/directories, symlink handling, stable sorting under out-of-order probes, concurrency cap, count/depth/size limits, path containment, Windows-style separators normalized to POSIX, image/video/audio-only classification, rejected sibling isolation, stable IDs, landscape/portrait/square, English camel/punctuation and Chinese tokens, 64-token cap, root missing/file/symlink/read failure, safe CLI/exit codes, and a scan proving the private root never appears in output/errors. Codex acceptance must additionally index a real directory containing generated PNG, MP4, WAV, ignored text, symlink, and damaged visual candidate.
