# video-shotcraft 相机：dutch-roll-to-level

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：痛点时整帧 -10° 斜角悬着（叠正弦漂移），解决方案一拍滚回水平——世界被扶正
- 语义：痛点→解决方案的视觉暗喻
- 约束：斜置期漂移 ±0.8° 长周期正弦（防静态歪图）；滚正 14f out-cubic 冲过 0 到 +1.2° + 10f 收回 0；单次过冲不振荡；scale 1.15 防旋转露边
- 验收：斜置期有明显歪斜感但不晕，滚正有明显加速度+过冲
- HyperFrames 改写：camera: {type: 'dutchRoll', tiltAngle: -10, drift: {amp: 0.8, period: 180}, rollCorrection: {overshoot: 1.2, duration: 14, settle: 10}}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
