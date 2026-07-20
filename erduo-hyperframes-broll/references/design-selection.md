# Director design selection

Choose one visual system for the whole video after every shot has a validated director brief. Do not pick a different base template per shot.

The selector reads the packaged `library-policy.json` and six packaged templates. It aggregates semantic jobs, representation modes, asset routes, required primary compositing, topic and mood signals, then applies the policy weights and avoid boundaries. A result contains one base template, at most two declared borrowable atoms, and machine-readable reasons or rejection codes.

## Public and development behavior

- Public selection only considers `production` templates. The packaged six are initially `draft`, so the honest public result is `hyperframes-native` fallback until a template passes real render promotion gates.
- `allowDraft` is an out-of-band development option for template testing. It is not accepted inside model/user request JSON.
- An explicit template ID cannot bypass draft status, avoid boundaries, prohibited compositing, or conflicts.
- One template is the base. Borrowed atoms never become a second full visual system, and the policy maximum is two.

## User design

User-defined `visual_system`, `scene_grammar`, `motion_grammar`, and `compositing` layers are protected. If every layer is defined, selection returns a user-design native supplement without imposing a base template. If only some layers are defined, a selected base may fill the remaining layers but cannot overwrite the protected ones.

## Hard conflicts

- Literal evidence must route through `user-media` or `mixed`; generated/native visuals cannot impersonate the registered evidence.
- Documentary representation requires literal evidence.
- Every base template must support all required primary composition modes. Conditional modes require explicit opt-in; prohibited modes reject the candidate.
- Recent base templates and already-used signature motifs receive the exact cooldown penalties in the packaged policy.
- A borrow is rejected if its template conflicts with the base, its atom is undeclared, its status is ineligible, or its forbidden motifs are active.
