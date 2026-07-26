---
name: broll-assets
description: Freeze actual local ordinary-media facts from a validated script-only v3 director contract, seal the immutable production contract, and return one bounded deterministic receipt.
---

# B-roll assets producer

1. Accept only the immutable script-only v3 director contract, its actual
   passed `policy-gate` director receipt with exact `director` scope, and the
   canonical parsed SRT, shot plan, design system, component registry,
   validation policy, project-only reference profile, font package, frame
   projection and delivery profile that it hashes. Version-2 artifacts are
   inspection-only and cannot be continued, resigned or used to authorize
   production.
2. For every canonical shot, apply the fixed route order
   `user-media → image-generation → Pexels`; `native-auxiliary` may support
   typography, relationships, information graphics, emphasis and transitions
   but cannot replace the ordinary image/video primary. Keep exactly one
   primary selection per shot in canonical shot order.
3. Material choice must come from explicit user input and structured semantic
   facts. When those facts cannot determine the material, return
   `material_selection_requires_user_input`. Do not ask a model to choose from
   appearances. Private ReachSurge authoring examples are never asset bytes,
   ordinary-media fixtures or a production authorization.
4. Resolve each selected material to a real local regular file. Read and hash
   its actual bytes, run the deterministic media probe and decode smoke test,
   and reject symlinks, missing/empty files, decode failures or a file that
   changes during the freeze. Local paths are input-only and never enter any
   manifest returned to the parent.
5. Freeze only technical and auditable facts: shot/asset identity, route and
   route order, byte hash and size, normalized probe, provenance, rights and
   evidence hash, crop, safe region, focal point, title relationship and the
   type-correct primary consumer. Geometry must fit the actual decoded raster.
   Selection evidence is a bounded identifier list, not prose about quality.
6. Validate the director receipt against the actual predecessor and policy,
   then compile a new immutable `contract_phase: sealed` production contract
   from that predecessor and the actual asset-facts manifest. Rerun
   `policy-gate` in the sealed phase with the exact closed binding set,
   including predecessor and asset-manifest hashes.
7. Return only the asset-facts manifest, sealed contract and a bounded parent
   envelope containing the sealed policy receipt. The envelope contains no
   local locator, media bytes, rendered frame, inline source, long log,
   subjective conclusion or private calibration payload. This stage does not
   build source, render output, approve quality or dispatch another stage.
