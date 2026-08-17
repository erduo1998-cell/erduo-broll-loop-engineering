# Compact stage receipt and handoff

Use file locators instead of copying plans, JSON, source, logs, screenshots, or
media facts into prose. Successful defaults need no narration. Keep the handoff
short enough to scan; put machine-readable closure in a compact receipt when
the stage defines one.

```markdown
# <stage> handoff

- status: complete | action-required | unsupported | blocked
- owner: <stage>
- scope: <run, block, or authoring-unit ID and exact ms range>
- identity: <runtime-selection/runtime-plan/composition aggregate as relevant>
- artifacts: <receipt and primary artifact locators>
- checks: <validator/check/typecheck/probe/decode result locators>
- exceptions: none | <only unresolved facts and owning stage>
- next: <one stage or user preview decision>
```

## Stage-specific minimums

- **Onboarding:** phase, required backends, bound environment identity, exact
  version/readiness facts, recorded Pexels state, repairs/human actions, and no
  secret values. Missing Pexels is `action-required` only for a plan-required
  Pexels route.
- **Director:** narrative-envelope, visual-system, shot-plan, Recipe directory,
  representative-scenes, validator, actual material needs/no-need set, and
  unresolved factual terms.
  Do not repeat the shared system or catalog bodies.
- **Parent planning script:** generated plan identity, assignment packet
  locators, ordered blocks/authoring units, required backends, warnings, and
  unverified preferences. This is a script receipt, not an Agent handoff.
- **Assets:** selected inventory/font/provenance locators, actual acquisition
  routes, asset-fusion bindings, and conditional Pexels facts. When no request
  reached Pexels, say `pexels: not-invoked (no need)` once.
- **Lead Builder:** role/phase, representative Recipe/media locators,
  runtime-native shared-source manifest/identity, asset/font subset, checks, and
  Director-witness next owner. Do not include unrelated Recipes.
- **Production Builder:** authoring-unit/parent-block ID, Recipe/source/receipt locators,
  shared-system identity, selected 0–2 references, reuse/native-fallback
  decision, material/font bindings, seams, dependency identity and shared
  toolchain receipt when Remotion, check locators, and the verified frozen-unit
  contract/hash/probe/decode locator.
- **Parent preview/delivery script:** plan-ordered unit closure, preview and
  identity locators, FFprobe/full-decode facts, approval state, unused final
  target, and verified master facts. This is a script receipt, not an
  Integrator or Render handoff.
- **Visual lock:** three representative selections/reasons, runtime-specific
  moving-scene and shared-source identities, bound assets/fonts, concrete
  Director witness, user status (`approved` or explicit `skipped`), skip risk
  when applicable, validator result, and next production packets.
- **Legacy Planner/Integrator/Render:** only when the user explicitly asks to
  inspect or recover a pre-v0.9 task, report the last trustworthy identity,
  available artifact locators, concrete mismatch, and safest next owner. Do
  not create new production artifacts or continue the legacy chain.
- **Shot Export:** source master identity, requested shot windows, outputs,
  FFprobe, and decode facts.

Never include credentials, command arguments containing secrets, full
environment dumps, home-directory prefixes, raw SRT text not needed for
identification, complete source, long logs, craft scores, aesthetic checklist
claims, or assertions that technical checks prove visual quality.
