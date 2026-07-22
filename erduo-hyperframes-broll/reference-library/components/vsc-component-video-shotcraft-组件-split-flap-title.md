# video-shotcraft 组件：split-flap-title

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Airport split-flap display: each character in a dark mechanical cell flips through 2 random glyphs before landing on target. Upper half drops (rotateX 0→-90, brightness dims), lower half slaps down (90→0, brightness restores). 5f per flip, 3 flips p
- 语义：Airport split-flap display: each character in a dark mechanical cell flips through 2 random glyphs before landing on target. Upper half drops (rotateX 0→-90, brightness dims), lower half slaps down (90→0, brightness restores). 5f per flip, 3 flips per cell, 4f stagger left→right cascade.
- 约束：Easing.in(quad) on drop — gravity feel; linear = electronic, not mechanical. 3 flips per cell minimum — <2 = no 'search
- 验收：Easing.in(quad) on drop — gravity feel; linear = electronic, not mechanical；3 flips per cell minimum — <2 = no 'searching' feel；Stagger 4f — tighter = simultaneous wave lost, looser = tail characters wait too long；Settle click: 6px drop minimum — 4px was imperceptible；Brightness swing on flip: 1→0.55→1 — this is the 3D depth cue, more important than rotateX
- HyperFrames 改写：Uses deterministic pseudorandom noise (CA-12) for glyph selection and overshoot settle (CA-7) for click.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
