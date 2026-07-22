# video-shotcraft 相机：slow-push-in

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：深色底大数字 scale 1.0→1.14（4s 匀加速），四角暗角同步加深，前 2s 几乎不可察
- 语义：缓慢累积的压迫感——后接暗→亮大反差硬切
- 约束：scale easing in-quad（匀加速）；暗角同步 easing（同一曲线）；120f 后无过渡硬切到亮场新景
- 验收：前 2s 观众几乎注意不到变化，后段压迫感渐强，硬切瞬间大反差
- HyperFrames 改写：camera: {type: 'slowPushIn', scale: [1.0, 1.14], duration: 120, easing: 'in-quad', vignette: {opacity: [0, 0.5], syncEasing: true}}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
