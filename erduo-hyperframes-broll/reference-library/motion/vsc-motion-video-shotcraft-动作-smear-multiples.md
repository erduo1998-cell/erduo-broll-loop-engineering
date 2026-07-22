# video-shotcraft 动作：smear-multiples

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：高速横移时身后拖 4 个可数的半透明完整分身，每个分身=本体在 frame-k*2 时刻的位置
- 语义：高速横移的离散残像——与连续运动模糊互斥
- 约束：仅在本体速度 > 25px/f 时可见（speedGate）；分身 opacity 阶梯递减 [0.45, 0.30, 0.18, 0.09]；落位合拢期 delay 收缩到 0 + opacity 归零；分身数量固定 4 个，不动态变化；与 CameraMotionBlur 不同时开启
- 验收：高速段分身可数（不是连续拖影），静止段零分身
- HyperFrames 改写：smear 属性 {count: 4, delay: 2, speedGate: 25, opacities: [0.45, 0.30, 0.18, 0.09]}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
