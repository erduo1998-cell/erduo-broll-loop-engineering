# video-shotcraft 相机：pull-back-isolation

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：相机 scale 2.2→0.62（怼脸→远景），兄弟卡按距离由近到远错峰熄灭，背景变暗，主卡发光孤悬
- 语义：全片只为这一个数字——从热闹到孤独的收束
- 约束：8 张兄弟卡近的先灭（30f 起每 8f 一张）；相机 out-cubic 110f；背景灰度 236→20 inOut-quad；主卡叠白光晕
- 验收：兄弟卡逐张熄灭有先后顺序，远景主卡孤悬感强（暗场+发光）
- HyperFrames 改写：camera: {type: 'pullBackIsolation', scale: [2.2, 0.62], duration: 110, siblingFade: {stagger: 8, order: 'byDistance', nearestFirst: true}, background: {from: '#ececea', to: '#141414'}}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
