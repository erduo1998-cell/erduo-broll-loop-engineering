# video-shotcraft 转场：drop-blackout-slam

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：正常播放→12f 纯黑死寂（蓄力）→大标题撞入+震屏+亮环扩散→全静止
- 语义：EDM concert blackout 式节奏爆点
- 约束：黑场=纯 #0c0c0c 12f 屏上完全无物；爆入 title scale 1.35→1.0 5f cubic out；震屏 10px τ≈2.5f 指数衰减；亮环 80→900px 16f + 3f 峰值 opacity 0.85→0
- 验收：黑场段连续 12f 无变化，爆入瞬间标题过冲可感，亮环快速扩散+消散
- HyperFrames 改写：transition: {type: 'blackoutSlam', silenceFrames: 12, slamScale: [1.35, 1.0], slamDuration: 5, shake: {amp: 10, tau: 2.5}, ring: {from: 80, to: 900, duration: 16}}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
