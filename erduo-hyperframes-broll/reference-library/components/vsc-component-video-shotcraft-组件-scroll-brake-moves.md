# video-shotcraft 组件：scroll-brake-moves

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Two scroll/brake sub-components: (a) Changelog Scroll Brake — long list scrolls at high speed with velocity-driven blur, exponentially decelerates to stop on featured entry; (b) Brake Reticle Lock — same scroll brake with 4 L-shaped corner brackets
- 语义：Two scroll/brake sub-components: (a) Changelog Scroll Brake — long list scrolls at high speed with velocity-driven blur, exponentially decelerates to stop on featured entry; (b) Brake Reticle Lock — same scroll brake with 4 L-shaped corner brackets flying in from off-screen at exact stop frame.
- 约束：Changelog: blur must be velocity-driven (|pos(f) - pos(f-1)| × coeff) — hand-keyed blur will misalign. Deceleration: ou
- 验收：Changelog: blur must be velocity-driven (|pos(f) - pos(f-1)| × coeff) — hand-keyed blur will misalign；Changelog: deceleration out-exp curve — uniform = marquee text；Changelog: stop position — target row exactly at vertical center；Changelog: dim surrounding entries to 0.38, not 0 — context must survive；Changelog: target entry content must be publication-grad
- HyperFrames 改写：Uses frame-determinate velocity blur (CA-1).

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
