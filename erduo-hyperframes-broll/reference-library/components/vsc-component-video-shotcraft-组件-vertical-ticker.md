# video-shotcraft 组件：vertical-ticker

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Multi-column 3D perspective infinite vertical scroll wall. Each column scrolls independently with seamless looping (items doubled, translateY 0→-50% modulo). Configurable tilt, perspective, scale, column width, gap, and fade masks.
- 约束：No repeat: -1 — use finite repeat count with explicit total. Column items total height ≥ viewport effective height (no
- 验收：Seamless loop: -50% translateY must exactly equal single-copy height；No repeat: -1 — use repeat: N where N covers composition duration；Column items total height ≥ viewport effective height (no duplicate visible)；Tilt angle ≤25° — beyond this, top text becomes unreadable；Fade mask height ≥200px — too short = hard edges on entry/exit
- HyperFrames 改写：Infinite loop: frame % loopFrames → finite repeat with explicit end frame. FPS access: useVideoConfig().fps → hardcoded 30fps or data attr. Loop duration: seconds-based → frame-based data-duration. Seamless gap: marginBottom not flex gap — same constraint applies.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
