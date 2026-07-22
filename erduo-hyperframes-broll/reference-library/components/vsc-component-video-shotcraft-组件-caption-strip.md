# video-shotcraft 组件：caption-strip

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Bottom-screen mono caption strip with amber square bullet. Fade+rise in over 8 frames, fade out over last 8 frames.
- 约束：In duration 8f, out duration 8f — minimum readability window. Mono font stack with fallback chain. Caption must not ove
- 验收：In duration 8f, out duration 8f — minimum readability window；Mono font stack with fallback chain；Caption must not overlap critical content area
- HyperFrames 改写：Replace useCurrentFrame() with timeline time; in/out window logic with clip timing attributes.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
