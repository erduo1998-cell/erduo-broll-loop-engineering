# Stage handoff

Every child writes a concise Markdown handoff. Link to actual artifacts instead
of copying long plans, source, logs, media, or command output into the handoff.

Use these headings:

```markdown
# Stage Handoff

## Stage and status
## Responsibility completed
## Inputs used
## Actual artifacts written
## SRT range and coverage
## Decisions and reasoning
## Visual-direction relationship
## Material and font use
## Connection to adjacent stages
## Official Skills and tools actually used
## Objective checks actually run
## Open issues and limitations
## Next owner and required inputs
## Completion or stop reason
```

Use only applicable headings. State `not applicable` briefly when omitting a
field could create ambiguity.

## Status language

Use one of:

- `complete`
- `needs-revision`
- `action-required`
- `blocked`

Do not use vague states such as “mostly complete” or “should work.”

## Stage additions

### Onboarding

Include sanitized Node, HyperFrames, Skills, FFmpeg, FFprobe, Chrome,
permission, free-space, target, and Pexels status. State whether official
doctor actually ran in the same command environment inspected by onboarding.
State `inspect` or `repair`, whether the Agent modified anything, and the
production-run, host, command `PATH`, official CLI version, delivery filesystem,
and Pexels-state bindings. Include discovery of the root Skill and all seven
stage Skills, plus the final SRT cue end milliseconds used only for storage
estimation. Missing Pexels configuration is `action-required`.
Never include a key, environment dump, home prefix, or raw command output.
For stages that spawned a non-Pexels process, record only the host environment
map capability, `pexels_key_removed_case_insensitively=true`, and the telemetry
setting. Never record any environment value.

### Director

Include total cue coverage, film sections, semantic shot count, original visual
direction, motif and density decisions, uncertain terms, material needs, and
font roles.

### Assets and Pexels

Include user-material inspection, generation consideration, actual Pexels
searches, selected and rejected routes, local files, shot bindings,
composition-use plans, font files, sources, and licenses. When controllable
generation is unavailable, say so and record that Pexels continued. Preserve
separate real image and video search facts without inventing a fixed count.
Confirm the credential was scoped only to dedicated Pexels requests.

### Builder

Include block ID and exact range, implemented shots, seam behavior, material
and font use, official HyperFrames Skill-load trace reference when available,
and actual CLI work.

### Integrator

Include ordered blocks, continuous coverage, integration-owned changes,
resource resolution, official Skill-load trace reference, and official
standard-check result.

### Render and delivery

Include same-environment official doctor result, delivery supplements, standard
check, explicit preview approval, final render arguments, attempt identity,
unused attempt target, final master path, FFprobe facts, complete-decode result,
and official Skill-load trace reference. A failed attempt records its partial
file and remains failed; a retry belongs to a different fresh Agent and uses a
new target.

### Shot export

Include source master, requested shot IDs, exact windows, output paths,
FFprobe, and complete-decode result.

## Privacy

Never include:

- credentials or secret values;
- command arguments containing credentials;
- complete environment variables;
- private home-directory prefixes;
- raw SRT text not needed for the handoff;
- complete source, frames, media, or long logs;
- claims that technical checks prove aesthetic quality.
