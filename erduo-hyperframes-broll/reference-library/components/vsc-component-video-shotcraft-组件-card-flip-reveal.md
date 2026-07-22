# video-shotcraft 组件：card-flip-reveal

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Function cards flip 180° on Y-axis: front = feature UI, back = big result number. 18f flip with 12° overshoot (192°→180°), 8f settle. Side-edge highlight sweeps with rotation angle, peaking at 90°. 3 cards staggered 10f apart.
- 约束：Flip duration: 18f + 8f settle — <14f loses side-edge moment, >28f is a slow turn. Overshoot 12° required — <8° imperce
- 验收：Flip duration: 18f + 8f settle — <14f loses side-edge moment, >28f is a slow turn；Overshoot 12° required — <8° imperceptible (was bumped from 8° to 12°)；Side highlight must peak exactly at 90° — offset = visual bug；Front/back must be semantically paired (feature→its result) — unrelated content = fancy image swap；Back content: big number (90px) + one label l
- HyperFrames 改写：Uses overshoot settle (CA-7) and staggered cascade (CA-9).

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
