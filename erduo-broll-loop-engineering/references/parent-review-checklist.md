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
- Runtime intent is recorded and new projects default to `auto`.
- Existing schema-1 single-runtime runs remain grandfathered and unchanged.

## Onboarding

- A fresh inspection-only Onboarding Agent owned the first pass and made no
  modifications.
- All known repairs and human actions were grouped into one authorization
  request.
- Any repair was performed by a different fresh Agent and followed by a full
  reinspection.
- Base Onboarding did not install or probe both backends blindly.
- Targeted Onboarding checked exactly the plan's required backends.
- Official HyperFrames Skills and doctor were used when HyperFrames was required.
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
- The root Skill and all thirteen stage Skills are discoverable through the host.
- The release installer, not Onboarding, owns initial Skill registration.
- SRT reading was limited to the final cue end milliseconds for storage
  estimation.
- Ready evidence binds run, host, command `PATH`, onboarding phase,
  selection/runtime-plan identity, delivery filesystem, exact required backend
  versions, capability evidence, and Pexels state.
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
- Shotcraft discovery began with statistics and category-filtered list or
  directed search output; no stage loaded the full catalog or all card bodies.
- Every shot has zero or one `patternRef`; an absent selection is represented
  by omission, not a sentinel card.
- Every selected card ID and style key resolves through the bundled query
  command, `sourceRevision` equals the catalog's pinned 40-character upstream
  Git commit, and the semantic reason and fallback are content-specific.
- No Recipe contains upstream frame constants, TSX, Remotion APIs, audio
  directions, branding, or demo-asset paths.

## Runtime plan

- A fresh Runtime Planner ran after Director and before backend dispatch.
- Generated JSON passes `validate-runtime-plan.mjs`; it was not hand-edited.
- Every shot appears once; coverage is continuous; adjacent same-runtime shots
  are grouped into contiguous blocks.
- Decisions cite capability or exact selected-pattern/backend evidence and do
  not use semantic keywords.
- Reference-source-only Remotion preferences are explicitly unverified.
- Auto may resolve single or hybrid; explicit hybrid never forces an
  evidence-free split.

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
- Every selected Shotcraft card was read individually; its required screenshot,
  UI state, data, paired state, layer, mask, alpha, or depth inputs were
  verified or its declared fallback was invoked.
- Photographic material is not used as an unrelated title background.
- Project-local fonts, sources, licenses, roles, and glyph needs are recorded.
- No Pexels key appears in artifacts, arguments, logs, or handoff.

## Each Builder

- The Agent is fresh and owns one contiguous block only.
- The block runtime and boundaries exactly match the validated runtime plan.
- HyperFrames Builders loaded the official Skill; Remotion Builders used only
  verified project-local dependencies.
- Relevant official domain guidance was followed.
- Real renderable HyperFrames source exists.
- Every assigned Shot Recipe maps to a recorded HyperFrames runtime
  implementation decision;
  capability evidence and faithful variances are explicit.
- Each selected Shotcraft card/style was resolved individually and implemented
  from first principles as native HyperFrames source; no upstream TSX,
  Remotion component, frame constant, demo media, font, sound, or project
  configuration was copied or transpiled.
- `patternRef` card ID, style key, pinned upstream Git commit, preserved card
  constraints, and faithful implementation variances are traceable in the
  Builder notes.
- Exact shot windows and continuous block coverage are preserved.
- Each shot implements its semantic purpose and visual logic.
- Selected material participates meaningfully in the composition.
- Native graphics remain structural support.
- Project-local fonts actually load.
- Persistent screen copy contains no subtitle passage, internal ID, timing,
  debug, or status metadata.
- The block is deterministic and seekable.
- Official checks retain no unresolved block-owned error.
- Hybrid Builders additionally delivered schema-valid, hash-bound frozen block
  media with FFprobe, full decode, boundary inspection, and no live nesting.
- A Remotion Builder using `effects.dom-pixel-postprocess` is bound to a
  same-run real HTML-in-canvas still canary, declares Canvas 2D/WebGL2 in the
  manifest, uses no nested capture or WebGPU, and inspected active-effect plus
  readable-hold frames.

## Hybrid integration and delivery

- Only frozen block media crossed backend boundaries; no generated source or
  live runtime was nested.
- `validate-frozen-blocks.mjs` checked actual files, hashes, profiles, audio,
  plan closure, and duration tolerance.
- Hybrid Integrator inspected every cross-backend seam and froze identity over
  plan, ordered contracts, media hashes, profile, audio, and assembly recipe.
- Approval binds the unchanged hybrid identity; formal delivery used FFmpeg
  from frozen blocks without opening either runtime.
- Seam behavior is explained.

## Single-backend integration

- A fresh Integrator followed its planned backend contract; HyperFrames loaded
  official Skills and Remotion used its verified local toolchain.
- Every block is bound to the one planned runtime; mixed blocks were rejected.
- Shot Recipe-to-runtime traceability is complete.
- Shotcraft references are unchanged from Recipe through Builder and
  Integration, and no unselected pattern was introduced.
- `composition-identity.json` covers the declared production source/config,
  referenced local assets/fonts, and dependency locks with sorted relative
  paths, per-file SHA-256, and an aggregate SHA-256.
- Every expected block is present exactly once and in order.
- Whole-film timing is continuous and unchanged.
- Resources, composition identities, and fonts resolve.
- Block seams preserve readability and intentional continuity.
- The Integrator changed only integration-owned structure.
- HTML-in-canvas projects preserve one non-nested contract and one frozen GL
  backend from every block through the identity-bound master preview.
- The official standard HyperFrames check ran.
- No real error remains.
- Warnings with possible visible impact were investigated.
- No final render occurred in this stage.

## Single-backend render and delivery

- A fresh Render/Delivery Agent followed the selected backend's exact preflight.
- The integrated project, runtime plan, Onboarding evidence, and capability
  decision all bind the same production-ready runtime.
- Official doctor ran in the exact formal-render environment.
- Its top-level result and relevant individual findings were interpreted.
- Output-directory writability, target-specific free space, unique target, and
  command-environment consistency were verified.
- Repairs were authorized and followed by doctor rerun.
- Official standard check succeeded.
- Relevant warnings were reviewed against browser evidence.
- HTML-in-canvas support and real stills were repeated in the formal render
  environment with the identity-bound Chrome and GL facts.
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
