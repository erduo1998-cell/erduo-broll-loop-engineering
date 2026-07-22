# video-shotcraft 相机：tilt-reveal

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：开场俯视 rotateX -80°（只露顶栏），机位抬头回正——内容一排排从地平线升起
- 语义：产品界面从地平线升起的开场揭示
- 约束：rotateX -80→+2.6→-0.9→0 四段，transformOrigin 上缘；perspective 600→1200 配合视距变化；scale 3.2→1 同步缩小
- 验收：开场只露顶部一小条，抬升过程内容从地平线升起，过冲自然
- HyperFrames 改写：camera: {type: 'tiltReveal', rotateX: [-80, 2.6, -0.9, 0], origin: [50, 0], scale: [3.2, 1], perspective: [600, 1200]}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
