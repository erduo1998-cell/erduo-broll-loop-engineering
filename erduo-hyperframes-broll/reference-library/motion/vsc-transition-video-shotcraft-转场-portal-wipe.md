# video-shotcraft 转场：portal-wipe

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：卡片放大成全屏窗——窗内新场景分远景/近景两层视差散开——穿窗入景
- 语义：卡片→新场景的连续转场，带视差深度感
- 约束：窗放大 easing bezier(0.7, 0, 0.3, 1) 先慢后快；散开系数 近景 0.3 / 远景 0.08；窗内只 2 层，不加 blur；穿窗完成后所有层 8f 内缓停
- 验收：近景层扩张比远景快 3.75 倍，散开在缓停前速度最大，缓停后严格 0
- HyperFrames 改写：transition: {type: 'portalWipe', layers: [{depth: 'far', spread: 0.08}, {depth: 'near', spread: 0.3}], settleFrames: 8}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
