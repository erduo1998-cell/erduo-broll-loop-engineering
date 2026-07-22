# video-shotcraft 相机：snorricam-lock

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：KPI 卡片焊死正中纹丝不动，背后整页 dashboard 做倾斜/平移/翻滚的复合运动——卡片扛着摄影机狂奔
- 语义：空间眩晕感——让背景狂奔而主体极致稳定
- 约束：分段关键帧插值每段独立 easing——衔接处速度不连续也无妨；背景 x 位移三段带过冲 bezier + 翻滚 -6°→8°→-3° + zoom 呼吸；狂奔期手持微颤 sin 哈希 + 包络首尾归零；前景投影随背景速度加重
- 验收：前景卡片绝对零位移（像素级），背景运动有甩动感而非匀速
- HyperFrames 改写：camera: {type: 'snorricamLock', foreground: 'fixed', background: {x: {segments: [...]}, rot: [...], scale: [...]}, microJitter: {env: [0,1,1,0], freq: [0.9,1.3,0.7], amp: [10,7,0.6]}}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
