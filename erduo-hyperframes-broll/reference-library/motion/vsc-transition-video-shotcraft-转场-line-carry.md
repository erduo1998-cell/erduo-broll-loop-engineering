# video-shotcraft 转场：line-carry

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：场景 A 的进度条延伸出画→镜头跟线横移→线在移动中拐角围出场景 B 的卡框——全程无剪切
- 语义：两个有图形亲缘的场景之间——一条线牵着你走过去
- 约束：线的身份要有叙事逻辑（进度条走完了所以延伸）；线从 A 元素末端连续生长（不是新画一条）；横移距离 1920px（一屏）
- 验收：线从 A 出发到围出 B 框全程连续，横移过程中线不抖动
- HyperFrames 改写：transition: {type: 'lineCarry', sourceElement: 'progressBar', path: [{to: 'extend'}, {to: 'corner'}, {to: 'frame'}], travelDistance: 1920}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
