# video-shotcraft 卡片族：3D 翻面揭示：卡片正反两面承载因果对，翻面动作本身即语义转换

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：3D 翻面揭示：卡片正反两面承载因果对，翻面动作本身即语义转换
- 约束：正反两面必须语义成对（界面→成果），翻出无关内容即花哨换图；过冲 12° 回落 180°，无过冲读作生硬停表；全片 ≤2 种翻面方向（入场 rotateX / 揭示 rotateY）；末卡落定真静止 ≥40f
- 验收：收据记录翻转方向、语义配对、过冲角度、真静止帧数
- HyperFrames 改写：adapted
- 覆盖卡片：card-flip-reveal、wall-reveal-moves、card-flock-tumble
- 参考 demo：demos/card-flip-reveal/CardFlipReveal.tsx、demos/wall-reveal-moves/、demos/card-flock-tumble/

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
