# video-shotcraft 质量门：Still-Frame Self-Check Per Shot

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Every shot has 2 verification frame numbers in plan. On completion: `npx remotion still --frame=<N>`. Naked-eye check composition/穿帮/text sharpness. Archive by version in out/qa/.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
