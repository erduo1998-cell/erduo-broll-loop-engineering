# video-shotcraft 组件：paper-title-card

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：One-sentence chapter title: words appear sequentially with letterpress impression effect (scale 1.28→1 + blur→0 + opacity). Exactly one word gets italic + accent color + short underline that grows to close the card.
- 约束：Exactly ONE accent word per card — two accents = zero accents. Accent word must be function name or benefit word — not
- 验收：Exactly ONE accent word per card — two accents = zero accents；Accent word must be function name or benefit word — not filler；Underline timing: appears after last word, signals card ending；Duration: 50-55f (≈1.8s) — longer drags, shorter unreadable；Copy must be concrete: product feature + specific benefit, not abstract metaphor；Mono footer with DigitRoll mus
- HyperFrames 改写：Uses DigitRoll (#2) as sub-component.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
