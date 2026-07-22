# video-shotcraft 组件：letterspace-materialize

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Word drawn letter-by-letter via SVG strokeDasharray/strokeDashoffset. All letters start and finish simultaneously. Dark gradient background with horizon light band. Glow pulse on completion.
- 约束：pathLength={1} on all paths — no getTotalLength() needed. All letters share same start/duration — per-character stagger
- 验收：pathLength={1} on all paths — no getTotalLength() needed；All letters share same start/duration — per-character stagger was v2 mistake；Easing: easeInOut (hand-drawn feel) — not linear；Glow pulse <8f after completion
- HyperFrames 改写：SVG-based, framework agnostic. No Remotion-specific APIs beyond useCurrentFrame() for progress.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
