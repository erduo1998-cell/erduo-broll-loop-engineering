# video-shotcraft 卡片族：框与光的 UI 包装语法：霓虹框/聚光灯/品牌色画框作为页面登场和品牌露出的包装层

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：框与光的 UI 包装语法：霓虹框/聚光灯/品牌色画框作为页面登场和品牌露出的包装层
- 约束：框先于内容到达，营造登场仪式感；聚光灯三式（醒睡扫过/贴边泛光/角落扩张）按页面密度选型；品牌色画框全片驻场，翻色瞬间是唯一打击点；霓虹框与聚光灯不同片混用
- 验收：收据记录框类型、光模式、翻色时机、品牌色一致性
- HyperFrames 改写：adapted
- 覆盖卡片：neon-frame-forerun、neon-frame-orbit-drop、neon-triple-marquee、spotlight-sweep-moves、spotlight-hero-card、brand-frame-snap
- 参考 demo：demos/neon-frame-forerun/NeonFrameForerun.tsx、demos/neon-frame-orbit-drop/NeonFrameForerunOrbit.tsx、demos/neon-triple-marquee/NeonTripleMarquee.tsx、demos/spotlight-sweep-moves/、demos/spotlight-hero-card/、demos/brand-frame-snap/

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
