# video-shotcraft 组件：transition-travel

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Two spatial navigation sub-components: (a) Shared Element Morph — detail card shrinks/translates/rounds corners to fly back into dashboard grid slot, single bezier drives all properties simultaneously; (b) Letterform Zoom — giant title with SVG mask
- 语义：Two spatial navigation sub-components: (a) Shared Element Morph — detail card shrinks/translates/rounds corners to fly back into dashboard grid slot, single bezier drives all properties simultaneously; (b) Letterform Zoom — giant title with SVG mask cutout, camera pushes into letter cavity revealing next scene inside.
- 约束：Shared Element: all properties (x, y, w, h, r) must share one progress curve. Content must render at target slot dimens
- 验收：Shared Element: all properties (x, y, w, h, r) must share one progress curve — separate curves = 'transforming' not 'same object'；Shared Element: content must render at target slot dimensions, then scale up (3.66×) — re-laid-out content = different card；Shared Element: shadow must converge: from 0/36/110/0.32 to 0/2/8/0.06；Shared Element: slot coordinates m
- HyperFrames 改写：Shared element uses reverse-scale compensation (CA-4).

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
