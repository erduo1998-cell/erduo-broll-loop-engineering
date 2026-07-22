# video-shotcraft 组件：ui-strip-away-outro

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Subtractive outro: 6 UI layers evaporate from periphery to center (4f stagger per layer), each with directional displacement. Only the clicked button survives, slides to screen center, scales 1.5×, then fades to black for wordmark takeover.
- 约束：Layer order must be periphery→center — center first = crash, not evaporation. Each layer must be a semantically complet
- 验收：Layer order must be periphery→center — center first = crash, not evaporation；Each layer must be a semantically complete UI block — pixel-based slicing exposes partial structures；Directional displacement required — pure fade = adjusting opacity, not evaporating；Button must migrate to center before fading — corner button on black field = forgot to delete；Butt
- HyperFrames 改写：Uses directional evaporation pattern (CA-11).

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
