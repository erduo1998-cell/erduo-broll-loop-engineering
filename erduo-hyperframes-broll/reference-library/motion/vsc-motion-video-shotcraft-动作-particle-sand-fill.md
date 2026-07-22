# video-shotcraft 动作：particle-sand-fill

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：图表柱从上方下雨填满——方点错峰坠落（重力加速），触堆积面即停+15%回弹，逐层堆高
- 语义：数据指标累计过程的物理可视化
- 约束：堆积高度闭式预解析（第 k 层顶面 = 基线 - (k+1)*粒径），无真碰撞；各柱错峰 6f 启动；末颗落地后 solidOp 从 0→1 完成交接，solidOp=1 时粒子面条件卸载；标签用 ease-out-back(2.2) 弹出
- 验收：坠落有重力加速，触地有回弹（15% 振幅），堆满后无缝过渡实体柱
- HyperFrames 改写：sandFill: {grainSize: 14, perLayer: 9, gravity: 1.6, stagger: 6, bounceRatio: 0.15, closedForm: true}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
