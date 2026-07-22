# video-shotcraft 组件：ui-to-brand-morph

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Two brand/logo animation sub-components: (a) Icon Flip Bloom — product icon rocks in anticipation, flattens on Y-axis, entity-swaps at thinnest moment, blooms into 5-petal flower mark via spring; (b) Input Morph Assemble — cursor types in input, tex
- 语义：Two brand/logo animation sub-components: (a) Icon Flip Bloom — product icon rocks in anticipation, flattens on Y-axis, entity-swaps at thinnest moment, blooms into 5-petal flower mark via spring; (b) Input Morph Assemble — cursor types in input, text flies away, input box morphs into rounded capsule, geometric primitives drop and assemble into abstract logo
- 约束：Icon Flip: entity swap must occur at scaleX ≤ 0.05. Anticipation tilts must increase in amplitude. Petals must bloom fr
- 验收：Icon Flip: entity swap must occur at scaleX ≤ 0.05 — earlier swap = ghost overlap visible；Icon Flip: anticipation tilts must increase in amplitude — single tilt = no wind-up；Icon Flip: petals must bloom from closed vertical line state — pre-formed flower = no causal chain；Icon Flip: wordmark per-character scale+blur landing (not horizontal slide)；Icon Flip:
- HyperFrames 改写：Overshoot settle pattern (CA-7) for anticipation tilts. Cross-fade handoff (CA-10) for entity swap.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
