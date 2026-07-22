# video-shotcraft 动作：impact-burst-kit

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：主卡砸落瞬间同时触发冲击波环+14 粒子迸发+震屏+邻卡推开回弹——四件事同帧起爆
- 语义：重要元素落位的冲击反馈套件
- 约束：四件事全部锁死同一落点帧 IMPACT=20；环前沿到达邻卡中心的帧（落点后 3f）才是邻卡被推开的触发帧；震屏 4f 6px 指数衰减；邻卡外推用阻尼振荡包络 cos(t*0.5)*exp(-t/8)，40f 后钳到 0
- 验收：四件事同帧起爆，邻卡在环到达时才动（不是落点帧立即动），结尾 77f 真静止
- HyperFrames 改写：impact: {ring: {from: 80, to: 900, duration: 14}, particles: {count: 14, dist: [160, 340], bias: 'up'}, shake: {amp: 6, duration: 4}, neighbors: {push: 30, rotate: 3, settleTime: 40}}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
