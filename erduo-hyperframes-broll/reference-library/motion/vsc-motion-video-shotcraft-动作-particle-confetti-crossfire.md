# video-shotcraft 动作：particle-confetti-crossfire

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：双侧炮口各射 50 颗矩形彩屑——闭式弹道（初速+spread+重力+decay），交叉喷洒过中央卡
- 语义：KPI 揭晓时刻的高能庆祝粒子
- 约束：decay=0.9 闭式解，位移 = v0*(1-decay^age)/(1-decay)；初速 70–95 px/f，spread 55°；灰阶为主 + 1/3 琥珀点缀；落出画外即条件卸载；帧确定性——sin 散列伪随机派生每颗参数
- 验收：弹道有重力弧线（抛物线），彩屑翻转 8–15°/f，全部 ~f100 前落出画外
- HyperFrames 改写：particles: {count: 50, spread: 55, speed: [70, 95], gravity: 1.5, decay: 0.9, shape: 'rect', colors: ['#6d6d6b', '#8f8f8d', '#b45309']}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
