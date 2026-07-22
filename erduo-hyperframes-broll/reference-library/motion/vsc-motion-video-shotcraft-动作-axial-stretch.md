# video-shotcraft 动作：axial-stretch

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：速度差分驱动轴向拉伸——高速入场元素沿运动轴拉长（糖稀拉丝），落点压扁回弹收正
- 语义：给高速入场元素一个可见的速度肉身
- 约束：拉伸量由速度差分驱动 v=posAt(f)-posAt(f-1)，非固定值；与 CameraMotionBlur 不叠加——拉伸是身体的事，blur 是相机的事；与 smear-multiples 不混用——那是离散残像，这是连续拉伸；白底卡片拉伸不露底色（overflow hidden）
- 验收：高速段 scaleX > 1.05 可感，落点回弹 6f 内收干
- HyperFrames 改写：motion-blur 组件增加 type: 'stretch' | 'smear' | 'camera' 互斥通道，速度阈值门控

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
