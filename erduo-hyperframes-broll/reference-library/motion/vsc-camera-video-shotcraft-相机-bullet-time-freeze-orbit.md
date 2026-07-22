# video-shotcraft 相机：bullet-time-freeze-orbit

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：柱子生长→时钟冻结→相机绕面板 rotateY 0→55°→0 + scale 呼吸→解冻→标签浮现
- 语义：子弹时间——世界静止但相机环绕
- 约束：effFrame 双态：正常=frame，冻结=常量值；冻结区间相机用真实 frame 驱动（相机动、世界静）；环绕 easing inOut-cubic，顶点悬停 10f
- 验收：冻结段柱子像素级不动，相机环绕流畅，解冻后无跳变
- HyperFrames 改写：camera: {type: 'bulletTime', freezeRange: [45, 105], orbit: {axis: 'y', angle: [0, 55, 0], hover: 10, scale: [1, 1.12, 1]}}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
