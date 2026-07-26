# Policy gate contract

`policy-gate` validates canonical authoring facts; it does not judge beauty.

## Director phase

Before Assets, run with `contract_phase: director`. Require the actual:

- parsed-SRT artifact, SRT-bound shot plan and complete cue/millisecond coverage;
- design system and project-only reference-style binding;
- component registry and validation policy;
- font package, frame projection and delivery profile.

The actual projection must bind the parsed-SRT hash, shot-plan hash, rational
FPS, ordered cue IDs, shot millisecond windows and derived global frame
windows. First/last SRT boundaries and each lifecycle-to-projection frame
count are exact. A self-reported hash or opaque projection is rejected.

Reject gaps, overlaps, duration drift, missing semantic-chain fields, more
than one structured cognitive action, flat/prose semantic chains,
unregistered roles/components/motion,
open chapter promise/payoff or callback ledgers, invalid lifecycle order,
short readable hold, microtext as the only semantic carrier, incomplete data
provenance, and emphasis/density/cooldown budget violations.

Complex hold is inferred from shot/component/text/data facts; an author cannot
self-downgrade it, and an explicit `complex` declaration also forces the
complex minimum. Formulas are evaluated with denominator/unit binding,
promise/callback continuity is
checked across chapters, and cooldown claims are recomputed from adjacent
shot facts.

## Sealed phase

After Assets, rerun with `contract_phase: sealed`. The receipt must bind the
director predecessor through `prior_contract_sha256` and the actual asset
manifest. Any changed director binding or placeholder asset hash fails.

The gate returns a bounded JSON receipt only. Receipt failure/warning codes
must be registered for `policy-gate`. A PASS means that the structured
contract is internally valid; it is not visual approval and contains no
ReachSurge gold or positive-calibration verdict.
Director and sealed receipts use phase-specific closed hash-binding sets.
