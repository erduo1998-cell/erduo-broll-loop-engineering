# video-shotcraft 组件：digit-roll

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Odometer-style digit column roll for monospace numerals. Each digit column scrolls through 0-9 strip, landing on target with bezier easing. Non-digit characters pass through unchanged.
- 约束：fontVariantNumeric: tabular-nums mandatory — non-monospace fonts cause horizontal jitter. Digit strip height = fontSize
- 验收：tabular-nums enforced — non-monospace fonts cause horizontal jitter；Digit strip height = fontSize * 1.15 * 20 (10 digits × 2 copies)；Overflow hidden on digit box — no partial digits visible；Roll completes before parent scene fade-out
- HyperFrames 改写：useCurrentFrame() → timeline time. Stagger: Manual interpolate per digit → GSAP stagger or clip timing attributes. Easing: bezier(0.25, 0.8, 0.25, 1) → same easing in GSAP.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
