# Director design selection

Choose one visual system for the whole video after every shot has a validated director brief. Do not pick a different base template per shot.

The selector reads the packaged `library-policy.json` and seven packaged templates. It aggregates semantic jobs, representation modes, asset routes, required primary compositing, topic and mood signals, then applies the policy weights and avoid boundaries. A result contains one base template, at most two declared borrowable atoms, and machine-readable reasons or rejection codes.

Every result freezes `design_library_snapshot_sha256` with the render-value canonicalizer over `{policy, source_registry, templates sorted by id, native_base_compiler, native_compiler_source_bundle_sha256}`. A winning result keeps `base_template` as the canonical template ID, adds `base_template_sha256` over the exact selected template with the same render-value canonicalizer, freezes `native_compiler_source_bundle_sha256`, and marks `visual_grammar_compilation` as `eligible / BASE_TEMPLATE_BOUND`. `selection_sha256` covers these facts.

## Public and development behavior

- Public selection only considers `production` templates. The packaged seven are initially `draft`, so the honest public result is `hyperframes-native` fallback until a template passes real render promotion gates.
- `allowDraft` is an out-of-band development option for template testing. It is not accepted inside model/user request JSON.
- `quiet-editorial-print` is additionally `calibration-only`. Ordinary `allowDraft` selection must reject it with `CALIBRATION_EXPLICIT_SELECTION_REQUIRED`; it can be a base only when the existing `user_template_id` explicitly names it and the out-of-band caller enables `allowDraft`. This reuses the existing explicit-template API instead of introducing a public calibration bypass.
- The calibration profile is bound to reference atom `STY-028` and source `GC-ZINE-001`. It fails closed unless the requested aspect ratio is one of its declared ratios and every brief-derived output mode is supported. Its initial scope is exactly 16:9 fullscreen.
- An explicit template ID cannot bypass draft status, avoid boundaries, prohibited compositing, or conflicts.
- One template is the base. Borrowed atoms never become a second full visual system, and the policy maximum is two.

## Native compiler branch

The packaged `native-base-compiler.json` is a real built-in compiler artifact outside `templates/`. It is not an eighth design template, has no `production` status, never enters profile scoring and does not enable any draft. When no production template is eligible, `native-fallback` binds `base_template: "hyperframes-native"` and the actual render-canonical hash of that artifact, then returns `visual_grammar_compilation: {eligible:true, guard_code:"NATIVE_BASE_COMPILER_BOUND"}`.

Each native compiler provenance reference freezes `{artifact_id, relative_path, sha256, size_bytes}` for its actual packaged source. Loading walks the real package-root ancestors and every source-path component, rejects symlinks and lexical/realpath escape, reads the resolved regular file, and verifies its exact size and SHA-256. `native_compiler_source_bundle_sha256` canonically binds the sorted source-reference records. The design-library snapshot binds both the complete native compiler artifact and that bundle hash, so source, compiler, selection and snapshot substitution cannot be hidden by re-signing only the outer selection.

A fully protected `user-design-native-supplement` may bind the same compiler only for unspecified auxiliary native relationships and returns guard code `NATIVE_SUPPORT_ONLY_USER_LAYERS_PROTECTED`. It cannot overwrite any protected user layer or turn native graphics into the ordinary primary material. Missing or structurally changed native compiler bytes invalidate the packaged library; a downstream stage must resolve the actual artifact rather than inventing a template hash.

`replayDirectorDesignSelection` verifies the selection's own fingerprint,
reruns selection from the same briefs/context/library/options and requires
canonical equality. The production director validator must call it over the
actual frozen `director-briefs`, `design-selection-context` and complete
packaged runtime library before validating VGP/WFR. Its deterministic replay
first reconstructs and revalidates the canonical briefs against the actual
shot plan. The replay receipt binds the actual four manifest artifact hashes,
full runtime-library hash, sorted library-snapshot hash, native compiler
source-bundle hash, selection/base/guard and exact option hash.
Assets reruns this validation and every later visual-authoring binding carries
the replay-receipt hash.

Production defaults to `{allowDraft:false}`. A trusted out-of-band calibration
caller may supply `{allowDraft:true}` only when the selection context explicitly
names a policy-declared calibration-only template and the exact option hash is
already bound in run state as `design_selection_options_sha256`. User/model
request JSON cannot set the option. A changed option hash invalidates directing
and replay. Template, native compiler, policy, source-registry, brief, context
or selection substitution therefore fails before VGP.

## User design

User-defined `visual_system`, `scene_grammar`, `motion_grammar`, and `compositing` layers are protected. If every layer is defined, selection returns a user-design native supplement without imposing a base template. If only some layers are defined, a selected base may fill the remaining layers but cannot overwrite the protected ones.

## Hard conflicts

- Literal evidence must route through `user-media` or `mixed`; generated/native visuals cannot impersonate the registered evidence.
- Documentary representation requires literal evidence.
- Every base template must support all required primary composition modes. Conditional modes require explicit opt-in; prohibited modes reject the candidate.
- Recent base templates and already-used signature motifs receive the exact cooldown penalties in the packaged policy.
- A borrow is rejected if its template conflicts with the base, its atom is undeclared, its status is ineligible, or its forbidden motifs are active.
