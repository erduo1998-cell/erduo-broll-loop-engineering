# video-shotcraft 转场：whip-pan

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：相机 8f 甩 2880px——blur 包甩动段，A/B 两景横向并排，切点藏在模糊峰值
- 语义：功能段之间的快速区块交棒
- 约束：甩动 8f（峰值 ~540px/f），easing bezier(0.6, 0, 0.4, 1)；CameraMotionBlur shutterAngle=200 samples=20；前后 hold ≥35f 建立 + ≥77f 阅读；A/B 景需横向并排布局
- 验收：甩动段画面完全模糊，新景落定后真静止 ≥40f，峰值速度 >400px/f
- HyperFrames 改写：transition: {type: 'whipPan', duration: 8, distance: 2880, shutterAngle: 200, samples: 20}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
