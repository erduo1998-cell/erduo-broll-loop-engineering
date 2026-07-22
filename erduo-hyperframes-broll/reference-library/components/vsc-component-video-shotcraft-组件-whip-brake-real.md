# video-shotcraft 组件：whip-brake-real

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Horizontal card rail: 9 cards whip past, then brake into target card with long ease-out tail. Two-speed motion: 70% distance in 12f (blurred), 30% in 48f (sharp tail).
- 约束：Speed ratio ≥4:1 (fast:slow) — less makes the brake imperceptible. Target card uses high-res texture (2x minimum). Hold
- 验收：Speed ratio ≥4:1 (fast:slow) — less makes the brake imperceptible；Target card uses high-res texture (2x minimum)；Hold ≥40f after full stop；Motion blur only on 12f segment; removed during 48f tail
- HyperFrames 改写：Same CameraMotionBlur → CSS blur caveats as WhipPanReal.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
