# video-shotcraft 转场：ink-bleed-reveal

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：旧景被新景以水墨洇开方式吞没——feTurbulence+feDisplacementMap 造须状渗边，filter 只作用在 mask 形状上
- 语义：水墨/纸墨审美的转场——新景内容始终清晰
- 约束：filter 只挂在 mask 的圆上——揉的是遮罩边，不是画面内容；半径 0→1450px out-quad 78f + ±8% 正弦扰动；displacement scale 60→160 增长（越洇越散）；掩码完成后摘 SVG 直接铺新景
- 验收：渗边有须状分叉（不是高斯模糊），新景内容始终清晰，洇满后像素级真静止
- HyperFrames 改写：transition: {type: 'inkBleed', origin: [800, 420], radiusRange: [0, 1450], turbulence: {freq: 0.02, octaves: 3}, displacementRange: [60, 160], wobble: 0.08}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
