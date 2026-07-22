# video-shotcraft 卡片族：3D 空间内 UI 合成：文字/组件悬浮在 3D 空间带同形软影，随运镜贴落回界面

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：3D 空间内 UI 合成：文字/组件悬浮在 3D 空间带同形软影，随运镜贴落回界面
- 约束：悬浮文字需要同形软影（不是普通 drop-shadow），否则读作漂浮 bug；贴落时机与相机运动同步——镜头到达位置时文字已贴好；3D 透视下的文字清晰度依赖 hires-rasterize 技法；悬浮-贴落全片 ≤2 段
- 验收：收据记录软影参数、贴落同步帧、文字清晰度、使用次数
- HyperFrames 改写：adapted
- 覆盖卡片：neon-frame-forerun、neon-frame-orbit-drop、scene-locked-title、graze-face-tour
- 参考 demo：demos/neon-frame-forerun/NeonFrameForerun.tsx、demos/neon-frame-orbit-drop/NeonFrameForerunOrbit.tsx、demos/scene-locked-title/SceneLockedTitle.tsx、demos/graze-face-tour/

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
