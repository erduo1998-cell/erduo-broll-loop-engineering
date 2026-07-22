# video-shotcraft 卡片族：标题入场选型矩阵：按调性（理性/趣味/机械/手工）和能量级选用文字揭示方式

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：标题入场选型矩阵：按调性（理性/趣味/机械/手工）和能量级选用文字揭示方式
- 约束：全片标题入场品类 ≤2 种；逐字动画需等宽字体或固定槽宽，比例字体逐跳整行抖动；字符集不混入与真字符太像的字形（O/0）；所有文字入场动作完毕真静止 ≥20f
- 验收：收据记录 reveal type、字数、停留时长、可读帧区间、字体检查
- HyperFrames 改写：adapted
- 覆盖卡片：type-entrance-moves、type-assembly-moves、split-flap-title、document-typewriter-reveal、stroke-segment-build、typewriter-moves、letterspace-materialize
- 参考 demo：demos/type-entrance-moves/ScrambleDecode.tsx、demos/type-entrance-moves/LetterDropPhysics.tsx、demos/type-assembly-moves/、demos/split-flap-title/SplitFlapFlip.tsx、demos/stroke-segment-build/StrokeSegmentBuild.tsx、demos/letterspace-materialize/

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
