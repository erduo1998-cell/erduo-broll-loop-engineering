# video-shotcraft 组件：mask-wipe-real

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Card on a page enlarges to full screen, revealing a new scene inside it. Card face fades out as it grows, exposing the detail view within. Reverse-scale compensation keeps inner content stable.
- 约束：Inner scale must exactly compensate outer expansion: innerScale = 1/outerScale at every frame. Card initial position mu
- 验收：Inner scale must exactly compensate outer expansion: innerScale = 1/outerScale at every frame；Card initial position must match pixel-exact texture coordinate from layout.json；Card face opacity must reach 0 before inner scene becomes fully readable；Hold ≥30f after full expansion
- HyperFrames 改写：Reverse-scale compensation pattern (CA-4). All geometry properties share one progress curve.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
