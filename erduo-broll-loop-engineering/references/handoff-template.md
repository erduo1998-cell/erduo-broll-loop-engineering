# Compact Agent handoff and Parent script receipt

Use file locators instead of copying plans, JSON, source, logs, screenshots, or
media facts into prose. Successful defaults need no narration. Keep the handoff
short enough to scan. Creative Agents do not hand-write receipts, manifests,
hashes, probes, decode results, media contracts, or proof; Parent scripts own
those machine artifacts.

```markdown
# <stage> handoff

- status: complete | action-required | unsupported | blocked
- owner: <stage>
- scope: <run, block, or authoring-unit ID and exact ms range>
- identity: <runtime-selection/runtime-plan/composition aggregate as relevant>
- artifacts: <primary editable-source or direction locators>
- standard-command: <exact Parent-owned command or compact result locator>
- exceptions: none | <only unresolved facts and owning stage>
- next: <one stage or user preview decision>
```

## Stage-specific minimums

- **Onboarding:** phase, required backends, bound environment identity, exact
  version/readiness facts, recorded Pexels state, repairs/human actions, and no
  secret values. Missing Pexels is `action-required` only for a plan-required
  Pexels route.
- **Director:** narrative-envelope, visual-system, shot-plan, Recipe directory,
  motion-map, representative-scenes, standard validator result, actual material
  needs/no-need set, and unresolved factual terms.
  Do not repeat the shared system or catalog bodies.
- **Parent planning script:** generated plan identity, assignment packet
  locators, ordered blocks/authoring units, required backends, warnings, and
  unverified preferences. This is a script receipt, not an Agent handoff.
- **Assets:** selected inventory/font/provenance locators, actual acquisition
  routes, asset-fusion bindings, and conditional Pexels facts. When no request
  reached Pexels, say `pexels: not-invoked (no need)` once.
- **Lead Builder:** role/phase, three representative Recipe/source locators,
  runtime-native shared primitive locator, asset/font subset, exact standard
  command, and only real unresolved issues. Parent creates source identity,
  rendered media, checks, and visual-lock inputs. Do not include unrelated
  Recipes or the full film plan beyond `motion-map.json`.
- **Production Builder:** authoring-unit ID, assigned Recipe/source/direct-render
  target locators, shared-system locator, selected 0–2 references,
  material/font bindings, seams, dependency identity when Remotion, exact
  standard command, and real unresolved issues. Do not include Agent-authored
  receipt, manifest, hash, probe, decode, media contract, or proof.
- **Parent direct-shot script:** ordered shot/media-contract locators,
  six-frame sheet and bounded-failure locators, source/Recipe/profile identities,
  FFprobe/full-decode facts, and `delivery-index.json`. This is a script receipt,
  not an Agent handoff.
- **Parent preview/delivery script:** verified shot closure, preview locator,
  approval state, default ordered shot-directory locator, and optional unused
  Master target/facts. A Master is not required for normal delivery.
- **Visual lock:** three representative selections/reasons, runtime-specific
  moving-scene and shared-source identities, bound assets/fonts, concrete
  Director witness, user status (`approved` or explicit `skipped`), skip risk
  when applicable, validator result, and next production packets.
- **Legacy Planner/Integrator/Render:** only when the user explicitly asks to
  inspect or recover a pre-v0.9 task, report the last trustworthy identity,
  available artifact locators, concrete mismatch, and safest next owner. Do
  not create new production artifacts or continue the legacy chain.
- **Legacy Shot Export:** source Master identity, requested windows, explicitly
  master-derived outputs, FFprobe, and decode facts. Never label them
  `direct-runtime-render`.

Never include credentials, command arguments containing secrets, full
environment dumps, home-directory prefixes, raw SRT text not needed for
identification, complete source, long logs, craft scores, aesthetic checklist
claims, or assertions that technical checks prove visual quality.
