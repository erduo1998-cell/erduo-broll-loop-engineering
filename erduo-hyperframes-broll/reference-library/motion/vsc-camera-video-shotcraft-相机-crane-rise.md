# video-shotcraft 相机：crane-rise

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：开场从底行数据特写（scale 3.2）沿 Y 轴减速升起后拉（scale→1），行行涌入直到整面铺满
- 语义：焦点→全局的开场定场
- 约束：相机联动公式 translate = 屏幕中心 - 对准点*scale；scale 3.2→1 out-quad 100f；视野上缘越过行顶边时该行深色脉冲一拍
- 验收：特写→全景过渡连续（无跳切），行脉冲与行边界对齐
- HyperFrames 改写：camera: {type: 'craneRise', scale: [3.2, 1], focusPoint: {from: [520, 958], to: [960, 540]}, rowPulse: {rise: 4, fall: 18}, easing: 'out-quad'}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
