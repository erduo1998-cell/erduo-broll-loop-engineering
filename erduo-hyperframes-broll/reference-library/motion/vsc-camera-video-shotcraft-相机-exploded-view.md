# video-shotcraft 相机：exploded-view

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：整页 dashboard 带 3D 倾斜沿 Z 轴炸开——8 层各浮到不同深度，hold 后逆序合体+震屏收口
- 语义：展示组件层级——先炸开看清结构，再合体确认关系
- 约束：8 层 z 深度 60–320；炸开 easing out-back(1.7) 14f，合体 easing in-cubic 12f 逆序；每层挂假投影（随 z 浮起而下移/变虚）；底板随散开度压暗 brightness 0→-22%
- 验收：深度差可感（近大远小/近实远暗），炸开和合体都是错峰的
- HyperFrames 改写：camera: {type: 'explodedView', layers: 8, explodeEasing: 'out-back(1.7)', assembleEasing: 'in-cubic', stagger: 3, shake: {amp: 13, tau: 1.3}}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
