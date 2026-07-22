# video-shotcraft 卡片族：页面身份转换语法：整页实体翻篇/撕裂/换肤/频谱化，页面自己是实体

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：页面身份转换语法：整页实体翻篇/撕裂/换肤/频谱化，页面自己是实体
- 约束：立方体翻转与对开门裂幕不同片混用（物理隐喻冲突）；撕裂/故障转场全片 ≤1 次（一次性高能标记）；主题切换是「就地换肤」不是切场景——观众必须感知到同一个页面变了色；全片页面身份转换手法 ≤2 种
- 验收：收据记录转换类型、物理隐喻一致性、就地/切换判别
- HyperFrames 改写：direct
- 覆盖卡片：page-turn-transitions、tear-streak-transitions、theme-switch-moves、spectrum-morph-ui
- 参考 demo：demos/page-turn-transitions/CubeRotate.tsx、demos/page-turn-transitions/BarnDoorSplit.tsx、demos/tear-streak-transitions/GlitchDisplace.tsx、demos/theme-switch-moves/、demos/spectrum-morph-ui/SpectrumMorphUi.tsx

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
