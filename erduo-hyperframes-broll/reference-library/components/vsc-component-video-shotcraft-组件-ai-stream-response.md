# video-shotcraft 组件：ai-stream-response

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：AI response panel: summary appears first (readable), then 6-8 evidence rows stream in from below with status icons lagging 2-4f behind. Completion pulse on panel, then ≥15f hold.
- 约束：Summary must be fully readable before first evidence row starts (≥12f gap). Row stagger intervals must tighten (11→5f),
- 验收：Summary must be fully readable before first evidence row starts (≥12f gap)；Row stagger intervals must tighten (11→5f), not remain uniform；Status icons must lag row body by 2-4f — simultaneous = fake loading；Only ONE completion pulse, panel-level — not per-row；Content uses real product screenshots, positioned to match layout coordinates
- HyperFrames 改写：Staggered cascade with tightening intervals (CA-9 variant).

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
