# video-shotcraft 转场：clock-wipe

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：雷达指针从 12 点顺时针扫一圈（60f linear），B 页扇形 clip-path 逐帧张开
- 语义：雷达扫描式场景切换
- 约束：72 段 polygon——顶点固定且够密防锯齿；扫描 linear 匀速（雷达感）；白底亮线同 T5 三层规则
- 验收：扫描线匀速绕一圈，扇形边缘无锯齿，指针到达 12 点后无残留线
- HyperFrames 改写：transition: {type: 'clockWipe', duration: 60, segments: 72, direction: 'clockwise', center: [960, 540]}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
