# video-shotcraft 转场：bubble-swarm-takeover

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：一群品牌实体飘入涨大遮满全屏→页面同步洗白→遮蔽峰值藏硬切→散开后已是新场景
- 语义：章节级换景——幕布本身就是品牌资产
- 约束：6 颗巨型气泡按网格钉落点兜底（保证峰值真遮满）；洗白层压在页面与气泡之间；峰值必须真遮满，不靠随机群碰运气
- 验收：峰值至少 1 帧完全遮屏，转场后新场景完整可见
- HyperFrames 改写：transition: {type: 'swarmCurtain', entities: 'bubbles', gridAnchors: 6, washoutLayer: true, peakDuration: 1}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
