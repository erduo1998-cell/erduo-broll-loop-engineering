# video-shotcraft 卡片族：批量内容入场模式：列表/瀑布墙/发牌/整墙显影的规模化信息呈现

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：批量内容入场模式：列表/瀑布墙/发牌/整墙显影的规模化信息呈现
- 约束：入场模式与信息密度匹配：少条目逐张入、多条目整墙显；位移型入场（飞入）与显形型入场（原位点亮）按语义选不混用；批量入场期间主阅读焦点必须可辨；所有批量入场完毕真静止 ≥30f
- 验收：收据记录入场模式、条目数、主焦点可读性、静止帧数
- HyperFrames 改写：adapted
- 覆盖卡片：list-stack-press、page-waterfall-wall、row-embed、deck-deal-flyin、wall-reveal-moves、panel-grid-moves
- 参考 demo：demos/list-stack-press/、demos/page-waterfall-wall/PageWaterfallWall.tsx、demos/row-embed/、demos/deck-deal-flyin/、demos/wall-reveal-moves/、demos/panel-grid-moves/

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
