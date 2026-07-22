# video-shotcraft 组件：document-typewriter-reveal

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Full-page real document 'writes itself' behind a caret: content blocks revealed in pairs by shrinking a right-anchored color mask. @-mentions grow accent backgrounds after reveal. Dual sidebar columns enter via top→bottom color patches with hairline
- 语义：Full-page real document 'writes itself' behind a caret: content blocks revealed in pairs by shrinking a right-anchored color mask. @-mentions grow accent backgrounds after reveal. Dual sidebar columns enter via top→bottom color patches with hairline accent borders. History entries drop into sidebar rail at the end.
- 约束：Reveal mask: width 100%→0, bezier easing, caret 2px only on newest block. Block pairing: 20 blocks in pairs, cue = 6 +
- 验收：Reveal mask: width 100%→0, bezier easing, caret 2px only on newest block；Block pairing: 20 blocks in pairs, cue = 6 + g*3.5, each wipe 8f；@-mention highlight: 4f after wipe completes, 8f accent background grow — not same frame；Dual columns: staggered entry (left cue 46, right cue 54) — simultaneous = visual collision；History entries: 6 items, cue = 58 + i*5
- HyperFrames 改写：Complex multi-layer timing with paired reveals.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
