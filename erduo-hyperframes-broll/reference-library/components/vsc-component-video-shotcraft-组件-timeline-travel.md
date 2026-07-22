# video-shotcraft 组件：timeline-travel

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Horizontal timeline axis: camera accelerates across version markers (v1.0, v2.0, v3.0). Cards spring-pop from axis as camera passes each marker. Ends with emergency brake + push-in on 'today'.
- 约束：Velocity curve must have distinct acceleration phase — uniform = boring slideshow. Marker density: 3-5 major markers +
- 验收：Velocity curve must have distinct acceleration phase — uniform = boring slideshow；Marker density: 3-5 major markers + minor tick marks (tick marks = speed reference)；Card pop must start 6f before camera arrives — late pop = audience misses it；Brake + push-in must leave ≥30f hold；Card content: real version highlights in 1 sentence each
- HyperFrames 改写：Frame-determinate velocity blur (CA-1) during sprint segment.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
