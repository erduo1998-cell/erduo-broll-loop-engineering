# video-shotcraft 组件：integration-hub-map

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Old page flips 180° (rotateY) to reveal new hub page. Five integration app icons appear simultaneously (beat 1), then five colored light pipes connect simultaneously (beat 2 — 10f after icons). Pulsing transport dashes flow through pipes continuousl
- 语义：Old page flips 180° (rotateY) to reveal new hub page. Five integration app icons appear simultaneously (beat 1), then five colored light pipes connect simultaneously (beat 2 — 10f after icons). Pulsing transport dashes flow through pipes continuously.
- 约束：Flip must be monotonic — no pause at 90° (was rejected). Side flash ≤4f total. Icons must appear simultaneously — stagg
- 验收：Flip must be monotonic — no pause at 90° (was rejected)；Side flash ≤4f total — long glow platform was rejected；Icons must appear simultaneously — staggered was rejected twice；Pipes must connect simultaneously — staggered was rejected；Transport pulses must phase-offset per pipe — same phase = flicker；backfaceVisibility: hidden or equivalent on both card faces
- HyperFrames 改写：Uses two-beat simultaneity ritual (CA-5).

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
