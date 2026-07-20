# Semantic shot and chapter planning

Read the parsed SRT as an argument, not as isolated captions. The host model proposes contiguous cue ranges; `scripts/validate-shot-plan.mjs` owns every time and coverage invariant.

## Model output

Return JSON only:

```json
{
  "schema_version": 1,
  "srt_sha256": "<parsed SRT content_sha256>",
  "shots": [
    {
      "shot_id": "S001",
      "cue_start": 1,
      "cue_end": 4,
      "narrated_claim": "One concise semantic claim",
      "transition_reason": "opening"
    }
  ],
  "chapters": [
    {
      "chapter_id": "C001",
      "shot_start": "S001",
      "shot_end": "S001",
      "title": "Short internal title",
      "purpose": "What changes in the argument here"
    }
  ]
}
```

Allowed `transition_reason` values are `opening`, `continuation`, `question`, `claim`, `contrast`, `example`, `data`, `list-item`, `emotional-turn`, and `conclusion`.

Do not output timestamps, asset choices, visual metaphors, template names, or copied full subtitle text. `narrated_claim` summarizes what the range means; it is not screen copy. The first shot uses `opening`; later shots state why the visual thought changes.

## How to merge

- Merge consecutive cues that complete one claim, causal chain, example, contrast, list item, or emotional beat.
- Cut when the argument changes job: setup to thesis, question to answer, rule to evidence, one list item to another, example to conclusion, or emotional direction changes.
- Do not cut merely because a cue ends or because a sentence contains a keyword.
- Avoid 1–2 second fragments unless the fragment is a deliberate punchline or hard turn.
- Do not put an entire multi-part argument into one shot just to reduce work.
- Chapters are larger argumentative movements, not equal time buckets.

The plan must use every cue ordinal exactly once, in order. The validator derives each visual shot start from its first cue. A non-final shot ends at the next shot's first cue start, so subtitle pauses keep the previous visual alive; the final shot ends at the last cue end.

## Review

Treat `mechanical_split`, `short_shot`, `overlong_shot`, and `under_segmented` as warnings requiring model reconsideration, not automatic regrouping. Passing structure validation proves timing/coverage only; a host model must still review whether each merge expresses one coherent thought.
