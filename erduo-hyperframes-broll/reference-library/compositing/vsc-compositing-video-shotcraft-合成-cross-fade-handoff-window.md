# video-shotcraft 合成：cross-fade-handoff-window

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Source content fades 0→1 while destination fades 1→0, with a deliberate gap (no simultaneous visibility) or deliberate overlap (brief dual visibility)
- HyperFrames 改写：Two clips on same track with overlapping time windows, or sequential with data-start/data-duration

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
