# video-shotcraft 合成：frame-determinate-velocity-blur

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Blur amount = |position(frame) - position(frame-1)| × coefficient
- 验收：Remotion's CameraMotionBlur (sub-frame sampling) is superior to CSS blur. For high-speed sequences, pre-render blurred intermediate frames as composited layers.
- HyperFrames 改写：CSS filter: blur() driven by frame-delta calculation in timeline callback

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
