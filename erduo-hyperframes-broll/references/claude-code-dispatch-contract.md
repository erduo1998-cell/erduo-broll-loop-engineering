# Claude Code dispatch contract

Claude Code must use a fresh `Agent(subagent_type: "general-purpose")` for each active producer: `broll-director`, `broll-assets`, `broll-master-build`, `broll-render`. The child invokes exactly its assigned Skill. Parent-side `Skill(broll-*)` is inline execution and must stop.

The Agent prompt contains only the stage goal, brief/upstream hashes, allowed private artifact IDs, required contracts and compact output schema. Do not paste raw SRT, plan rows, inventory, source, frames, logs or previous transcripts.

Normal success uses four Agent calls. One creative gate may receive one aggregate replacement attempt; the whole run may use at most two replacement contexts. Do not create reviewer agents or serial micro-fix agents.

Record `execution_isolation` with host `claude-code`, mechanism `claude-agent`, dispatch-event hash and stage-packet hash. Reject inline/missing Agent evidence.

Before dispatch, verify one source fingerprint for the root and active stage Skills. A copied or stale mixed installation is a hard blocker. Current evidence shows `deepseek-v4-pro` cannot reliably approve visual packets; it may not sign `html_preview_review` or `final_frame_review` without new independent evidence.
