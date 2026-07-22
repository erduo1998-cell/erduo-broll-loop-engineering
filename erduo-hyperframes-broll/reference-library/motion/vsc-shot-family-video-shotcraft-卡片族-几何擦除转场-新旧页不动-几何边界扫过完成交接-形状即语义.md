# video-shotcraft 卡片族：几何擦除转场：新旧页不动，几何边界扫过完成交接，形状即语义

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：几何擦除转场：新旧页不动，几何边界扫过完成交接，形状即语义
- 约束：擦除边界必须带亮线/高光，无亮线的 wipe 读作 PPT 转场；扇形顶点 ≥40 防锯齿跳变；亮线在浅色区靠黑描边、深色区靠白核，两侧可读；几何擦除全片 ≤2 次
- 验收：收据记录擦除形状语义、亮线可读性、摘罩时机
- HyperFrames 改写：direct
- 覆盖卡片：wipe-transitions、bottom-push-stack-wipe、color-block-step-wipe、circle-match-iris
- 参考 demo：demos/wipe-transitions/ClockWipe.tsx、demos/wipe-transitions/BlindsSlice.tsx、demos/bottom-push-stack-wipe/、demos/circle-match-iris/

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
