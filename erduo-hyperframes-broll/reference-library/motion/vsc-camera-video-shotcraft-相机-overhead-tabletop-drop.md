# video-shotcraft 相机：overhead-tabletop-drop

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：三张页面卡 rotateX(62°) 平躺桌面上横滑，再骤降扎入——rotateX 62→0 + scale 1→2.04→2.0
- 语义：桌面卡阵→正视满屏的连续机动
- 约束：横滑 inOut-cubic 55f，骤降 out-cubic 30f+过冲回弹；卡片 FakeDashboard 缩到 INNER=0.5185 铺满卡内；骤降 scale 先冲到 2.04（+2% 过冲）再回 2.0
- 验收：骤降后中间卡精确对位满屏，过冲可感但不超 2%
- HyperFrames 改写：camera: {type: 'overheadTabletop', panPhase: {duration: 55, axis: 'x'}, dropPhase: {duration: 30, easing: 'out-cubic'}, rotateX: [62, 0], scale: [1, 2.04, 2.0], cardScale: 0.5185}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
