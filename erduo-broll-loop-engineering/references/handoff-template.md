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
  validator, actual material needs/no-need set, and unresolved factual terms.
  Do not repeat the shared system or catalog bodies.
- **Runtime Planner:** generated plan/validator identity, ordered blocks,
  authoring units, required backends, warnings, and unverified preferences.
- **Assets:** selected inventory/font/provenance locators, actual acquisition
  routes, asset-fusion bindings, and conditional Pexels facts. When no request
  reached Pexels, say `pexels: not-invoked (no need)` once.
- **Builder:** authoring-unit/parent-block ID, Recipe/source/receipt locators,
  shared-system identity, selected 0–2 references, reuse/native-fallback
  decision, material/font bindings, seams, and check locators. Hybrid adds its
  frozen-media contract/hash/probe/decode locator.
- **Hybrid block-freeze Builder:** same-backend block ID/window, ordered passed
  unit receipt/source-export locators, temporary block-level glue locator,
  per-file hashes and aggregate source identity, same-backend technical command
  evidence, and the existing `block-media.json`/mezzanine identity. Record no
  unit-internal source or creative change; return source/hash drift, glue
  conflict, or render failure to the implicated unit Builder.
- **Integrator:** ordered unit/block closure, integration-only changes,
  runtime check/typecheck/still/preview facts, and composition identity.
- **Render:** same-environment preflight and identity. Preview pass reports the
  final preview locator and `action-required` because approval is absent;
  approved pass reports bound approval, unused attempt/final targets,
  FFprobe/full-decode facts, and final master.
- **Shot Export:** source master identity, requested shot windows, outputs,
  FFprobe, and decode facts.

Never include credentials, command arguments containing secrets, full
environment dumps, home-directory prefixes, raw SRT text not needed for
identification, complete source, long logs, craft scores, aesthetic checklist
claims, or assertions that technical checks prove visual quality.
