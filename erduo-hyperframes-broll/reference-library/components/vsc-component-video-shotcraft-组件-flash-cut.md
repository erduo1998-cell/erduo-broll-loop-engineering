# video-shotcraft 组件：flash-cut

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Warm-white radial bloom that flashes over a hard cut. Single radial gradient with opacity ramp. Duration 8-12 frames, peak opacity 0.85.
- 约束：Peak opacity 0.85 max — full white flash obscures too much. Duration 8-12 frames — longer reads as fade-to-white. Must
- 验收：Peak opacity 0.85 max — full white flash obscures too much；Duration 8-12 frames — longer reads as fade-to-white；Must be on highest z-index track
- HyperFrames 改写：Minimal — single-opacity tween on a positioned div.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
