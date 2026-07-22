# video-shotcraft 卡片族：质感与材质语言：手绘感/印刷感/纸墨感的视觉质感体系

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：质感与材质语言：手绘感/印刷感/纸墨感的视觉质感体系
- 约束：质感层是寄生型——永远附着在宿主镜头上，不独立成镜；同片质感语言 ≤2 种（如纸墨+套印错位），不同时出现；质感效果必须帧确定（seed 驱动），禁随机抖动；高分辨率栅格化是 3D 文字的硬依赖——不做的结果是糊字
- 验收：收据记录质感类型、seed 参数、宿主镜头、帧确定性
- HyperFrames 改写：direct
- 覆盖卡片：line-boil、riso-print-hits、print-texture-transitions、smear-multiples、paper-craft-moves、hires-rasterize-3d-text
- 参考 demo：demos/line-boil/LineBoil.tsx、demos/riso-print-hits/RisoMisregistrationHit.tsx、demos/print-texture-transitions/InkBleedReveal.tsx、demos/smear-multiples/SmearMultiples.tsx、demos/paper-craft-moves/、demos/hires-rasterize-3d-text/

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
