# Full-screen composition contract

`build-fullscreen-composition.mjs` builds one deterministic HyperFrames project from a fingerprinted global timeline and matching `hyperframes-native` scene specifications. It is the all-fullscreen/natural-native path: it accepts only `fullscreen` and `native-base-with-overlay` primary composition values, and rejects a hard-alpha-only window.

The generated root starts at `0` and lasts through the SRT-global `timeline.master.duration_sec`. Every generated direct-child `.clip` retains its original global start and exact duration. Scene output contains only stable shot IDs, action classes, node counts, and colors derived from the scene hash; it never copies narrative claims, subject labels, relations, local paths, media URLs, credentials, subtitles, or BGM into HTML.

Run:

```bash
node scripts/build-fullscreen-composition.mjs timeline.json native-scenes.json empty-project-directory
```

The target directory must be empty or missing. The builder writes the current HyperFrames project files, motion assertions, and package pin; CLI stdout is the path-free composition metadata. `check` and a real high-quality MP4 render remain separate evidence gates.
