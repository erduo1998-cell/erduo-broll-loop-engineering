# video-shotcraft 组件：before-after-slider-scrub

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Two versions of same screen (before/after AI processing) stacked with vertical divider handle. Handle whips fast 8%→70%, rebounds to 70%, then slowly scrubs back to 40%. Speed contrast (~5:1) is the rhythm.
- 约束：Both versions must be same layout, same camera angle — different layout reads as two pages. Before version: real old st
- 验收：Both versions must be same layout, same camera angle — different layout reads as two pages；Before version: real old state, not artificially degraded；Slow scrub end at 40%, not 0% — keep some 'after' visible；Handle scaleX stretch must be velocity-driven, not keyframed；Speed ratio fast:slow ≥5:1
- HyperFrames 改写：Shot recipe — no demo code found in audit; implement from spec. Handle position drives both clip-path and handle left. Speed-differential: fast whip 12f, slow scrub 48f.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
