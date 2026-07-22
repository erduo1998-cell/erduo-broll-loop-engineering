# video-shotcraft 动作：line-boil

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：hold 期间文字/描边轮廓每 3-4 帧轻微扭动——手绘动画 hold 帧的百年惯例，静止画面保持活着
- 语义：寄生在长 hold 段（字卡/标题），让静止不读作卡顿
- 约束：寄生型——沸腾段随宿主 hold 长度；每 4 帧换一次 seed（阶梯跳变），位移幅度 7px/7px/3°；f=108 后冻结保证结尾真静止
- 验收：正常速度：轮廓在呼吸但文字没动。逐帧看：每 3–4 帧轮廓微变
- HyperFrames 改写：lineBoil: {interval: 3, amplitude: {x: 7, y: 7, rot: 3}, freezeAfter: 108}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
