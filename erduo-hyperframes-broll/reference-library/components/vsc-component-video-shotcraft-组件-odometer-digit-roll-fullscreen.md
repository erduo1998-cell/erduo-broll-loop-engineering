# video-shotcraft 组件：odometer-digit-roll-fullscreen

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Full-screen giant odometer: each digit is a vertical strip of 0-9, rolling independently left-to-right with staggered lock-in. Each digit overshoots +0.5 row then bounces back to integer. Two ghost copies create motion blur trails during roll. Final
- 语义：Full-screen giant odometer: each digit is a vertical strip of 0-9, rolling independently left-to-right with staggered lock-in. Each digit overshoots +0.5 row then bounces back to integer. Two ghost copies create motion blur trails during roll. Final lock-in triggers deepen pulse + 1.035 micro-scale.
- 约束：fontVariantNumeric: tabular-nums mandatory. Max 6 digits (including decimal) — each extra digit adds 7f stagger. Roll m
- 验收：fontVariantNumeric: tabular-nums mandatory — proportional digits jitter per frame；Max 6 digits (including decimal) — each extra digit adds 7f stagger；Roll must use real final digits — random intermediate numbers will be caught by frame-steppers；Ghost trails must be velocity-gated (auto-remove when stopped)；Completion pulse: deepen + 1.035 scale — deepen alo
- HyperFrames 改写：Extends DigitRoll (#2) as element-level primitive. Uses velocity-gated ghost trails (CA-6) and overshoot settle (CA-7).

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
