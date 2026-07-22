# video-shotcraft 转场：barn-door-split

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：旧景从正中垂直裂成左右两半各自加速滑出，底层新景从 scale 1.06 轻推迎上
- 语义：对开门裂幕——撕开旧景露出新景
- 约束：右半内层 translateX(-960) 对位拼合保证无缝；滑出 0→980px 20f in-cubic 加速离场；裂前中缝细线两次闪现预告裂点
- 验收：拼合无缝，滑出有加速度，底层迎上有 scale 过渡
- HyperFrames 改写：transition: {type: 'barnDoor', splitAxis: 'vertical', slideDistance: 980, slideDuration: 20, revealScale: [1.06, 1.0], crackFlash: [18, 25]}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
