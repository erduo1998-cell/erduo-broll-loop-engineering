# video-shotcraft 卡片族：3D 运镜情绪语义：把平面页面当实体拍摄，相机替观众感受

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：3D 运镜情绪语义：把平面页面当实体拍摄，相机替观众感受
- 约束：大动作运镜（爆炸分解/无人机/锁定翻滚）全片合计 ≤2 次；情绪运镜（压迫/孤立/冻结）全片 ≤2 式各 ≤1 次；所有运镜使用确定性关键帧，禁运行时随机；运镜终点必须真静止 ≥30f
- 验收：收据记录运镜类型、情绪语义、关键帧路径、静止帧数
- HyperFrames 改写：adapted
- 覆盖卡片：space-camera-moves、tension-camera-moves、overhead-camera-moves、depth-layer-moves、crane-rise-reveal、steep-tilt-glide、graze-face-tour
- 参考 demo：demos/space-camera-moves/ExplodedView.tsx、demos/space-camera-moves/SnorricamLock.tsx、demos/space-camera-moves/DroneDiveLanding.tsx、demos/tension-camera-moves/、demos/overhead-camera-moves/、demos/steep-tilt-glide/SteepTiltGlide.tsx

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
