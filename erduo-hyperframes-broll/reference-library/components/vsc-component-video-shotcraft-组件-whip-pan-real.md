# video-shotcraft 组件：whip-pan-real

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Fast horizontal whip pan between two page sections. Uses CameraMotionBlur for motion blur during 8f swing. 2880px travel in 8f (~540px/f peak).
- 约束：Peak velocity ≥300px/f — slower makes the whip read as a slow pan. Both scenes on same y-level in page space — vertical
- 验收：Peak velocity ≥300px/f — slower makes the 'whip' read as a slow pan；Both scenes on same y-level in page space — vertical offset breaks continuity；Hold ≥20f before and after swing；Motion blur samples ≥8 for continuous streak
- HyperFrames 改写：Motion blur: Remotion's CameraMotionBlur samples at 20/subframe — CSS blur() is a poor substitute. Consider rendering blurred intermediate frames as pre-composited layers, or accept lower quality with CSS blur driven by velocity. staticFile() → data-media-src.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
