# video-shotcraft 相机：crash-impact

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：同 crash zoom 急推但落位不回弹——撞停震屏 14px 指数衰减 6f
- 语义：强调级更高的点名——重量感 vs 弹性感
- 约束：zoom 1→2.5（无回弹段）；震屏 14*exp(-t/1.8)*sin(t*3.3)；blur 只包急推段，震屏段保持清晰；与 C1 crash-zoom 择一使用
- 验收：撞停瞬间震屏可感（14px 峰值），震屏 6f 内收干
- HyperFrames 改写：camera: {type: 'crashImpact', zoom: [1, 2.5], duration: 6, shake: {amp: 14, tau: 1.8, freq: 3.3}}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
