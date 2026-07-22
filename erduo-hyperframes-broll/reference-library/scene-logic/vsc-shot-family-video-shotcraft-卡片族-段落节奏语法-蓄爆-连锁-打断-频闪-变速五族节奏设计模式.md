# video-shotcraft 卡片族：段落节奏语法：蓄爆/连锁/打断/频闪/变速五族节奏设计模式

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：段落节奏语法：蓄爆/连锁/打断/频闪/变速五族节奏设计模式
- 约束：每段落只用一个节奏主导模式；打断型（频闪/跳切）全片 ≤2 段；变速段慢速窗 ≥40f 确保可读；一拍三转一拍一技法全片 ≤1 次
- 验收：收据记录每段节奏模式、节拍密度、打断次数、慢速窗帧数
- HyperFrames 改写：direct
- 覆盖卡片：montage-rhythm-moves、beat-cut-moves、rhythm-interrupt-moves、trailer-grammar-moves、speed-ramp-freeze、sakuga-timing-shift
- 参考 demo：demos/montage-rhythm-moves/DropBlackoutSlam.tsx、demos/montage-rhythm-moves/WrightTripleCut.tsx、demos/montage-rhythm-moves/DominoCascade.tsx、demos/beat-cut-moves/、demos/rhythm-interrupt-moves/JumpCutPunchIn.tsx、demos/rhythm-interrupt-moves/StrobeBlackFrames.tsx

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
