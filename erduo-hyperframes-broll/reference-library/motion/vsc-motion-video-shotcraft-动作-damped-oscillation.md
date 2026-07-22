# video-shotcraft 动作：damped-oscillation

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：冲击后元素弹簧回弹——闭式阻尼正弦 exp(-damp*t)*sin(2π*freq*t)，帧确定且可控
- 语义：邻卡被冲击波推开后的弹回、合体收口震屏等一切需要衰减振荡的场景
- 约束：包络 cos(t*0.5)*exp(-t/8)，40f 钳到 0；禁用弹簧库的迭代求解——闭式解保证帧确定；exp(-damping*t) 保证永不发散
- 验收：弹跳幅度逐次递减，指定帧数内归零，无浮点累积误差
- HyperFrames 改写：dampedSettle: {freq: 0.08, damping: 0.125, clampAfter: 40}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
