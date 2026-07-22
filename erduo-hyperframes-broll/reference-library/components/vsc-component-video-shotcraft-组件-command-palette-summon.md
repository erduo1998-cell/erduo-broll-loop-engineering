# video-shotcraft 组件：command-palette-summon

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：⌘K palette ritual: background dims + blurs, palette drops from above with overshoot bounce, candidate rows stagger-enter, typing narrows the list. Collapse uses height→0 (not fade) for squeeze feel.
- 约束：Background dim must not go fully black — context must persist. Palette entry must have overshoot — no bounce = no ritua
- 验收：Background dim must not go fully black — context must persist；Palette entry must have overshoot — no bounce = no ritual；Cursor blink by frame parity (16f cycle), forced solid after settle；Collapse uses height塌缩, not opacity fade；Candidate rows use real feature names — not placeholder text
- HyperFrames 改写：Uses overshoot settle pattern (CA-7) for palette drop. Staggered cascade timing (CA-9) for rows.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
