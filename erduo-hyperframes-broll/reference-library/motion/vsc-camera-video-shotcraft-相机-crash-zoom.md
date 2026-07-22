# video-shotcraft 相机：crash-zoom

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：全景 6f 急推 1→2.6x + 过冲回弹 2.45——blur 只包急推段
- 语义：功能段点名镜头——一拍把观众视线按到目标卡上
- 约束：easing bezier(0.55, 0, 0.7, 1) 中间快；对准点从屏心滑到目标卡中心；目标卡高清纹理覆盖原位；blur shutterAngle=200 samples=20 仅 38–48f 挂载
- 验收：6f 内完成急推，目标卡文字锐利
- HyperFrames 改写：camera: {type: 'crashZoom', zoom: [1, 2.6], duration: 6, overshoot: 0.15, targetAnchor: [960, 772], blur: {frames: [38, 48], shutterAngle: 200}}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
