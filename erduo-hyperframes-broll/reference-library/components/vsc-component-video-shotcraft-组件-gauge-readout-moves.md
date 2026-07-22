# video-shotcraft 组件：gauge-readout-moves

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Two dashboard instrumentation sub-components: (a) Needle Sweep Self-Test — gauge needles sweep full 270° arc then fall back to real value with overshoot bounce; (b) Tape Scroll Fixed Pointer — aircraft airspeed tape scrolls past fixed pointer with s
- 语义：Two dashboard instrumentation sub-components: (a) Needle Sweep Self-Test — gauge needles sweep full 270° arc then fall back to real value with overshoot bounce; (b) Tape Scroll Fixed Pointer — aircraft airspeed tape scrolls past fixed pointer with sprint+spring-brake.
- 约束：Needle Sweep: full arc sweep required — stopping at real value = no self-test ritual. Overshoot 5-8° on return. Stagger
- 验收：Needle: full arc sweep required — stopping at real value = no self-test ritual；Needle: overshoot 5-8° on return — no overshoot = digital readout, not mechanical；Needle: stagger 3-5f per gauge — simultaneous = copy-paste；Needle: hold ≥30f after all needles settle；Needle: SVG gauges hand-drawn or from real dashboard screenshots；Tape: sprint speed ≥45px/f duri
- HyperFrames 改写：SVG gauges hand-drawn or from real dashboard screenshots.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
