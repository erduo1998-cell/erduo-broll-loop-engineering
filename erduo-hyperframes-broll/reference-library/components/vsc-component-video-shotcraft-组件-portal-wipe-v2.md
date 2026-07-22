# video-shotcraft 组件：portal-wipe-v2

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Card enlarges into a window revealing a new scene with parallax layers inside. Two depth layers (far background at 0.08 spread, near cards at 0.3 spread) create dimensional entry. No blur — readability was the key fix from v1.
- 约束：Max 2 parallax layers — 3+ layers with heavy spread was the v1 failure. No blur on inner layers — blur killed readabili
- 验收：Max 2 parallax layers — 3+ layers with heavy spread was the v1 failure；No blur on inner layers — blur killed readability in v1；Parallax spread coefficients: far ≤0.12, near ≤0.35；8f ease-out settle after portal complete；Hold ≥30f for reading the new scene
- HyperFrames 改写：Parallax depth layering pattern (CA-8). Reverse-scale compensation (CA-4) for inner content stability.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
