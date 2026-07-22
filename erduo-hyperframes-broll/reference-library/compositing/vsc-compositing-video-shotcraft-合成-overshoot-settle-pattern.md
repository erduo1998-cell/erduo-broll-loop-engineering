# video-shotcraft 合成：overshoot-settle-pattern

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Target value → overshoot by 5-12° / 0.5row / 8px → spring/ease back to target
- HyperFrames 改写：GSAP y: target, yoyo: true, repeat: 1 or two-phase tween

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
