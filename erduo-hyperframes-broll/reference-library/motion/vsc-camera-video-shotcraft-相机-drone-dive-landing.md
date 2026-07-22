# video-shotcraft 相机：drone-dive-landing

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：上帝视角俯视整页（rotateX 72°）猛扎下来——俯角抬平、页面放大立正，气垫式长尾减速
- 语义：FPV 无人机俯冲降落——全局→焦点（与 C3 互为反向）
- 约束：主俯冲 25f in-cubic + 气垫 20f out-quint；三轴联动——rotateX/scale/translate 同一 p 驱动；hero 卡当 transformOrigin；地面椭圆软影随俯角减小而收干
- 验收：俯冲加速度可感，气垫段有明显减速缓冲
- HyperFrames 改写：camera: {type: 'droneDive', phases: [{type: 'dive', duration: 25, easing: 'in-cubic', share: 0.82}, {type: 'cushion', duration: 20, easing: 'out-quint', share: 0.18}], rotateX: [72, 0], scale: [0.42, 1.35], shadowFollows: true}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
