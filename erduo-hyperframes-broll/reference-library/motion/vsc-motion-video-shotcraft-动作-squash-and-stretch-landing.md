# video-shotcraft 动作：squash-and-stretch-landing

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：元素落位瞬间 scaleX>1 + scaleY<1（压扁），6f 内回弹收正——给落位一个物理重量
- 语义：元素落位时的物理反馈
- 约束：squash 3f + stretch 3f 总共 6f 内收完；最长边缩放 ≤ 1.1；transformOrigin 在接触面（通常是 bottom center）；收干后 scale 严格 = 1（帧确定）
- 验收：压扁总时长 ≤ 6f，最长边缩放 ≤ 1.1，收干后无残留
- HyperFrames 改写：landing: {type: 'squash', duration: 6, maxScaleX: 1.07, minScaleY: 0.9, origin: 'bottom'}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
