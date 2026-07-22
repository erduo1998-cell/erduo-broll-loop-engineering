# video-shotcraft 卡片族：标注与揭示性文字：描边/下划线/准星/遮罩/词槽等辅助文字的语义可视化

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：标注与揭示性文字：描边/下划线/准星/遮罩/词槽等辅助文字的语义可视化
- 约束：标注类寄生在宿主元素上，不独立成镜；描边生长闭合瞬间闪黑交棒是标配——无交棒读作未完成；字腔穿越/文字遮罩需要超粗字体（≥800 weight）；词槽轮换拍速恒定 21f/拍——快了读不清慢了读作卡
- 验收：收据记录标注类型、宿主元素、交棒时机、字体约束
- HyperFrames 改写：adapted
- 覆盖卡片：draw-svg-trace、marker-underline-title、fui-hud-moves、text-as-mask、text-column-converge、pill-slot-cycle
- 参考 demo：demos/draw-svg-trace/、demos/marker-underline-title/MarkerUnderlineTitle.tsx、demos/fui-hud-moves/、demos/text-as-mask/、demos/text-column-converge/、demos/pill-slot-cycle/PillSlotCycle.tsx

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
