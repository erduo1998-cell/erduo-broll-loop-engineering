# Support matrix

| Surface | Status | Evidence / limit |
| --- | --- | --- |
| macOS + Codex | verified (single-entry baseline); M9 orchestration unverified | Current HyperFrames 0.7.64 check and high-quality 4s native fixture render; media and frame gates pass. The current Codex CLI could discover but could not execute the new SURGE dependency because its global Skill context exceeded the host budget; do not claim M9 Codex orchestration verification. |
| macOS + Claude Code | verified | Claude Code 2.1.215 discovered all five M9 stage Skills, invoked `video-script-builder` through its Skill tool, ran the five-receipt fixture, current HyperFrames check, and a high-quality 4s 1920×1080/30fps H.264 render. Its broken SessionEnd hook is host-side noise, not product evidence. |
| Windows | unverified | Path/config/command contracts are deterministic, but no Windows host has run this fixture. |
| 剪映专业版桌面端 | unverified | Outputs use MP4/ProRes 4444 MOV/black-light MP4 contracts, but no GUI import test exists. |

No `unverified` row may be described as supported in user reports, package metadata, or release notes.
