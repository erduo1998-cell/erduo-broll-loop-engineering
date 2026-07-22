# video-shotcraft 转场：whip-brake

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：前 70% 路程 12f 全速甩→后 30% 路程 48f ease-out 长尾滑入，急刹停在目标卡正前方
- 语义：卡片长廊的急刹点名——甩过一串卡后精确停在高清目标卡前
- 约束：三段关键帧 [30, 42, 90] → 位移 [0, END*0.7, END]；峰值 ~710px/f；目标卡单独高清纹理覆盖原位；刹车段 blur 保持——滑入全程有速度就有拖影
- 验收：前 12f 猛烈模糊（>600px/f），后 48f 速度单调递减到 0，落点静止 ≥40f
- HyperFrames 改写：transition: {type: 'whipBrake', dash: {duration: 12, share: 0.7}, brake: {duration: 48, share: 0.3}, targetHiRes: true}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
