# video-shotcraft 动作：freeze-annotate

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：运动中定格画面（remap 中段斜率=0），叠 feTurbulence 手绘圈注+箭头点题，解冻继续
- 语义：卡片流中暂停点名关键项——马克笔手绘标注
- 约束：remap 中段斜率严格=0（定格）；圈注用 SVG stroke-dasharray + stroke-dashoffset 生长；feTurbulence baseFrequency=0.02 scale=7 造手绘抖动；解冻前标注层完全 fade 退出
- 验收：定格段画面零抖动（remap 斜率严格=0），圈注描边生长完整，解冻后标注完全消失
- HyperFrames 改写：freeze: {at: 45, duration: 55, annotation: {type: 'roughCircle', color: '#b45309', strokeWidth: 8, turbulence: {freq: 0.02, scale: 7}}}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
