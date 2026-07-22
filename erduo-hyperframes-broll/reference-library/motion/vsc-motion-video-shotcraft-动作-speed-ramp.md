# video-shotcraft 动作：speed-ramp

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：帧号→源帧 remap 实现快→慢→快三段变速，慢速段 0.2x 当展示窗，快段包 blur 慢段不包
- 语义：卡片流快放 + 慢速展示窗——反差即凝视感
- 约束：remap 斜率 = 速度倍率；快段 2.2x → 慢段 0.2x → 快段 2.2x；慢速窗中目标卡用高清纹理；blur 只在快段挂载
- 验收：慢速窗中目标卡清晰可读，快段连续无闪烁
- HyperFrames 改写：timeRemap: [{from: 0, to: 40, slope: 2.2}, {from: 40, to: 85, slope: 0.2}, {from: 85, to: 135, slope: 2.2}]

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
