# video-shotcraft 转场：mask-wipe

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：前景卡片放大成全屏窗口——卡片自身即转场遮罩，窗内新景反向补偿放大透视
- 语义：点开一张卡进入它的世界——卡片放大成新场景
- 约束：卡片初始几何从 layout.json 取真实坐标；窗放大 45f bezier(0.5, 0, 0.2, 1)；窗内 innerScale 从 0.42 反向长到 1；卡片脸 opacity = max(0, 1 - t*2.2) 早期快速隐去
- 验收：放大过程中卡片始终对齐原位，窗内景无缝铺满，卡片脸在窗宽约 2 倍时已不可见
- HyperFrames 改写：transition: {type: 'maskWipe', sourceElement: 'card4', innerScaleRange: [0.42, 1], faceFadeRate: 2.2}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
