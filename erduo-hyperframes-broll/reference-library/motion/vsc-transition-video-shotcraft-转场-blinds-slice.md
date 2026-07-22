# video-shotcraft 转场：blinds-slice

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：12 根竖条从左到右错峰翻换（A→B），缝上亮线三层（柔光+暗描边+白核）随波扫过
- 语义：百叶窗式场景切换
- 约束：条数=1920/160=12，错峰=列号×2f，翻换 10f in-cubic；A/B 宽度和恒等于条宽——数学上无露底；白底亮线必须叠加深色描边（三层结构）；翻换完成后条结构全部条件卸载
- 验收：任意帧无露底，翻换完成后无条带/缝线残留
- HyperFrames 改写：transition: {type: 'blindsSlice', strips: 12, stripWidth: 160, stagger: 2, flipDuration: 10, seamLayers: 3}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
