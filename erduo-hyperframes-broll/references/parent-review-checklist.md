# Parent review checklist

Use only the sections relevant to the stage being reviewed. Start from the
handoff and inspect bounded actual artifacts when a claim needs evidence.

## Goal and output

- When the user supplied no output location, the Parent chose one new
  timestamped directory beside the SRT.
- The default master is `master.mp4`, H.264 MP4, 3840×2160, 30 fps, and high
  quality.
- The output directory, attempt targets, and master path are unused.
- No existing file or directory will be overwritten.
- The selected runtime is recorded and defaults to `hyperframes`.
- No experimental Remotion adapter or witness is described as a
  production-ready delivery backend.

## Onboarding

- A fresh inspection-only Onboarding Agent owned the first pass and made no
  modifications.
- All known repairs and human actions were grouped into one authorization
  request.
- Any repair was performed by a different fresh Agent and followed by a full
  reinspection.
- Official `hyperframes` and `hyperframes-cli` Skills were loaded when
  available through the host.
- Official HyperFrames doctor actually ran with JSON output.
- The report interprets the top-level result and each finding relevant to the
  selected local path.
- Official HyperFrames Skills check actually ran.
- Node is 22 or newer.
- HyperFrames CLI, FFmpeg, FFprobe, and required Chrome are usable in the
  production command environment.
- Production and delivery locations are writable.
- Free space and unique target availability were checked.
- Pexels is securely configured without exposing the key.
- Missing Pexels configuration is `action-required`.
- A discoverable public repository configuration tool was used only through
  stdin or hidden interaction; otherwise a host secret or environment
  mechanism was used.
- The root Skill and all seven stage Skills are discoverable through the host.
- The release installer, not Onboarding, owns initial Skill registration.
- SRT reading was limited to the final cue end milliseconds for storage
  estimation.
- Ready evidence binds the same production run, host, command `PATH`, official
  CLI version, delivery filesystem, selected runtime, runtime-capability
  evidence, and Pexels validation state.
- Any Remotion request was checked against the capability matrix and stopped
  as `unsupported` because the current matrix does not mark that runtime
  production-available.
- Repairs were authorized, safe, reversible, and rechecked.
- Human-only actions were grouped into one request.
- The handoff contains no credential or private environment dump.
- Every non-Pexels child used an explicit host environment map, removed all
  case variants of `PEXELS_API_KEY`, and disabled telemetry by default.
- A stage unable to prove that sanitized map stopped before spawn rather than
  inheriting the parent environment or relying on shell-inline syntax.

## Direction

- The SRT is the only time truth.
- Coverage is continuous from zero through the final cue end.
- Every cue belongs to a semantic shot.
- Shots follow meaning rather than subtitle boundaries.
- The visual direction was created from the current content, not a required
  design file or bundled theme.
- Each shot states its purpose, audience understanding, focus, visual logic,
  readable information, material role, and neighboring connection.
- Sections develop the argument, motif, and density intentionally.
- Adjacent repetition is either removed or justified.
- Uncertain transcript facts use safe wording.
- Title, interface, and body font roles are planned.
- Material requests are actionable.
- Every file under `shot-recipes/` validates against the repository schema and
  maps one-to-one to the shot plan.
- The bundled Recipe validator ran on the complete directory; JSON parsing
  alone was not presented as schema or semantic validation.
- Recipe time values are integer milliseconds and contain no runtime-specific
  APIs, component syntax, or frame-number timing.
- Each Recipe names required capability IDs without claiming unverified
  cross-runtime support.

## Mandatory Assets and Pexels

- A fresh Assets Agent ran even when user material was absent.
- User material was actually inspected.
- Controllable generation was considered.
- When generation was unavailable, that status was recorded and Pexels work
  continued.
- Real Pexels image and video searches ran.
- Only dedicated Pexels requests received the credential; generation, media
  inspection, and other subprocesses used the sanitized child map.
- Search used no fixed query or candidate count.
- Image and video search facts plus selection or rejection reasoning are
  preserved.
- Zero selection, when applicable, is supported by a real search and clear
  rejection reasoning.
- Every selected file exists locally.
- Every selected item has a source, creator, shot binding, semantic role,
  focal point, crop, safe area, and composition-use plan.
- Every selected item also binds to its Shot Recipe and records objective media
  facts and adapter-relevant constraints without choosing a runtime API.
- Photographic material is not used as an unrelated title background.
- Project-local fonts, sources, licenses, roles, and glyph needs are recorded.
- No Pexels key appears in artifacts, arguments, logs, or handoff.

## Each Builder

- The Agent is fresh and owns one contiguous block only.
- The official `hyperframes` Skill was loaded before source was read or
  written.
- Relevant official domain guidance was followed.
- Real renderable HyperFrames source exists.
- Every assigned Shot Recipe maps to a recorded HyperFrames runtime
  implementation decision;
  capability evidence and faithful variances are explicit.
- Exact shot windows and continuous block coverage are preserved.
- Each shot implements its semantic purpose and visual logic.
- Selected material participates meaningfully in the composition.
- Native graphics remain structural support.
- Project-local fonts actually load.
- Persistent screen copy contains no subtitle passage, internal ID, timing,
  debug, or status metadata.
- The block is deterministic and seekable.
- Official checks retain no unresolved block-owned error.
- Seam behavior is explained.

## Integration

- A fresh Integrator loaded the official `hyperframes` Skill before assembly.
- Every block is bound to the same production-ready `hyperframes` runtime;
  mixed or experimental runtime blocks were rejected.
- Shot Recipe-to-runtime traceability is complete.
- `composition-identity.json` covers the declared production source/config,
  referenced local assets/fonts, and dependency locks with sorted relative
  paths, per-file SHA-256, and an aggregate SHA-256.
- Every expected block is present exactly once and in order.
- Whole-film timing is continuous and unchanged.
- Resources, composition identities, and fonts resolve.
- Block seams preserve readability and intentional continuity.
- The Integrator changed only integration-owned structure.
- The official standard HyperFrames check ran.
- No real error remains.
- Warnings with possible visible impact were investigated.
- No final render occurred in this stage.

## Render and delivery

- A fresh Render/Delivery Agent loaded the official `hyperframes` Skill before
  doctor, check, preview, or render.
- The integrated project, Onboarding evidence, and capability decision all bind
  the production-ready `hyperframes` runtime.
- No Remotion or experimental witness output was rendered or reported as the
  final master.
- Official doctor ran in the exact formal-render environment.
- Its top-level result and relevant individual findings were interpreted.
- Output-directory writability, target-specific free space, unique target, and
  command-environment consistency were verified.
- Repairs were authorized and followed by doctor rerun.
- Official standard check succeeded.
- Relevant warnings were reviewed against browser evidence.
- Official final composition preview was opened and explicit approval exists.
- Unattended execution stopped at the preview until that approval.
- The preview-pass Agent stopped without rendering; a different fresh Agent
  received approval evidence bound to the unchanged integrated composition and
  repeated identity verification, preflight, and check.
- Final arguments explicitly name resolution, 30 fps unless otherwise
  requested, H.264 MP4 unless otherwise requested, high quality, audio policy,
  one unused attempt target, and the unused final master path.
- Failed attempts and partial files were preserved as failed evidence.
- Every retry was owned by a different fresh Render/Delivery Agent using a new
  unused target.
- One successful attempt produced exactly one non-empty final master.
- FFprobe reports the expected duration, raster, frame rate, codec, and audio.
- Complete decode succeeded.
- Technical facts are not presented as aesthetic approval.

## Optional shot export

- The user explicitly requested the export.
- Every file was cut from the verified master.
- No HyperFrames rerender occurred.
- Every requested window matches the Director plan.
- FFprobe and complete decode succeeded for each export.

## Final report

- Master path, resolution, duration, and coverage are stated.
- Material and font sources are summarized.
- Optional exports are listed only when requested.
- Environment, host-trace, or platform limitations are explicit.
- No credential, private path, raw environment, or unsupported compatibility
  claim appears.
- The user is asked to make the final visual judgment by watching the master.
