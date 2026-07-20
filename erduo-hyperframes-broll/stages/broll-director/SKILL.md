---
name: broll-director
description: Create SRT-anchored B-roll shot plans and director briefs after preflight. Use only after a valid broll-preflight receipt exists; it must invoke video-script-builder (SURGE) for directing judgment while preserving this product's timing, asset, and delivery rules.
---

# B-roll director

1. Reject a missing or invalid `preflight` receipt. Read the shared stage contract and the approved SRT; do not infer duration from word count.
2. Invoke the installed `video-script-builder` Skill before writing the plan. In Claude Code use its `Skill` tool with `skill: "video-script-builder"`; in Codex explicitly invoke `$video-script-builder`. Pass a constrained internal packet: the SRT text is the time truth, no file may be created, and the desired response is only intent, motif, rhythm, component taste, scene reasons, density, and anti-repetition guidance.
3. Record a path-free host-call proof containing only host, mechanism, hashed args, hashed transcript, and verified status. If the host cannot invoke SURGE, fail closed; do not pretend a static reference was called.
4. Adapt SURGE's judgment into this project's validated shot plan and director briefs. Every window must equal the covered SRT cues; require comprehension purpose, visible action, readable result, silent review, and anti-collision evidence.
5. Never create or deliver `video-spec-hf.md`; never use word-estimated timing; never inherit SURGE's asset prohibition. The fixed asset order remains user media → Pexels → host image generation → HyperFrames-native.
6. Write a `director` receipt linked to preflight. It may contain hashes and the SURGE call proof, never raw prompts, private paths, or credentials.

Pass only a validated receipt and briefs to `broll-assets`; never render or declare project completion.
