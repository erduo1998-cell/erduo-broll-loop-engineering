# Concept translation and silent review

For every normalized semantic shot, translate the spoken idea into a visible causal statement. Do not start from an asset, icon, effect, or template.

## Four steps

1. **Comprehension purpose** — state what the viewer must understand or feel after this shot. Classify the semantic job: concept, process, quantity, relationship, evidence, emotion, or environment.
2. **Visible structure** — choose a grounded physical object, spatial relationship, process system, quantitative chart, documentary evidence, or emotional atmosphere. Name the subjects and the business/argument relationship they stand for. A generic icon plus label is not a representation.
3. **Action and result** — make one explanatory action happen: route, filter, transform, accumulate, compare, reveal, connect, sort, switch, scan, grow, separate, compress, assemble, observe, or hold. Describe the before state, after state, and the visible result that remains readable. Fit the action and result hold inside the fixed shot window; never extend SRT time.
4. **Evidence, silent test, and anti-collision** — decide whether a literal claim is backed by user material or a verified source. Otherwise show only an abstract relationship and do not impersonate evidence. In a separate review pass, mute the imagined shot and hide subtitles; record the concept a viewer should guess, at least two visible clues, ambiguity risk, and verdict. Replace a failed brief. Give every shot a distinct hero motif and vary at least two of layout, entrance, primary action, and focus from adjacent shots.

## Evidence boundary

- `user-material` and `verified-source` may show literal people, interfaces, documents, policies, products, events, and data only with registered source IDs.
- `abstract-relationship` has no source IDs and uses non-literal objects/relationships. It cannot look like a screenshot, news record, real metric, or documentary proof.
- `not-required` is limited to non-factual mood/environment work.
- A quantity/evidence shot without literal evidence may explain direction, ordering, comparison, or causality, but must not invent numbers, logos, quotes, dashboards, or platform UI.

## Silent review

The reviewer must not merely repeat the brief's claim. Ask: “With audio and subtitles removed, what relationship or process would I infer from these subjects, their action, and the final state?” A pass needs at least two concrete visible clues and a review note that names the remaining ambiguity. “Looks good”, “clear”, or “matches narration” is not a review.

## Output

Create one director brief per normalized shot and validate with `scripts/validate-director-brief.mjs`. The brief chooses explanatory structure and asset needs, not a final asset, style template, or render command. Asset needs must also declare the primary coverage composition: `fullscreen`, `hard-alpha-over-source`, or `native-base-with-overlay`. A black-background light pass is supplementary and cannot be primary coverage.
