# video-shotcraft 动作：float-wrap-shadow

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：文字悬浮在 3D 界面上方时，向下方投射同形软影——位置/缩放/模糊/透明度随悬浮高度连续变化
- 语义：2.5D 运镜中悬浮文字的空间感线索
- 约束：影子用真实 DOM 内容复制渲染（不是 box-shadow）；位移 h*0.24 水平 + h*0.46 垂直；缩放 1 + h*0.0009；模糊 5 + h*0.075；opacity min(0.38, 0.15 + h*0.0016)
- 验收：影子形状与本体一致（同形），高度→0 时影子完全消失
- HyperFrames 改写：floatShadow: {offsetX: 0.24, offsetY: 0.46, scaleGrowth: 0.0009, blurGrowth: 0.075, maxOpacity: 0.38}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
