# video-shotcraft 卡片族：转场选型决策树：按能量落差和语义关系从交棒六式+藏切三式+穿越两式中选用

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：转场选型决策树：按能量落差和语义关系从交棒六式+藏切三式+穿越两式中选用
- 约束：转场必须说明它连接的语义（因果/对比/推进/空间切换）；连续两次不得使用同一转场族；技法卡不占能量位，帧数从相邻镜头预算划；全片转场族类 ≤3 种
- 验收：director brief 写出每处转场理由和语义，pixel gate 与主 agent 检查首尾帧非空；verify 只验已批准 main review ref 的哈希链
- HyperFrames 改写：direct
- 覆盖卡片：shot-transitions、transition-hidden-cut、transition-travel
- 参考 demo：demos/shot-transitions/PortalWipeV2.tsx、demos/shot-transitions/WhipPanReal.tsx、demos/transition-hidden-cut/、demos/transition-travel/

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
