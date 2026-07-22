# video-shotcraft 合成：reverse-scale-compensation

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Outer container scales up → inner content scales down by reciprocal → net visual size of inner content stays stable
- HyperFrames 改写：GSAP timeline with synchronized tweens on outer and inner elements

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
