# video-shotcraft 合成：parallax-depth-layering

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：2-3 layers at same origin, each with scale(1 + progress × coeff) where coeff differs (near=0.3, far=0.08). No blur on layers.
- HyperFrames 改写：Synchronized GSAP tweens with different scale multipliers

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
