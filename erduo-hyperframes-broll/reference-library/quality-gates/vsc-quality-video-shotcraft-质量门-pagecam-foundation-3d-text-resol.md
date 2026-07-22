# video-shotcraft 质量门：PageCam Foundation + 3D Text Resolution Chain

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：All real-page shots use PageCam: 2x full-page texture + keyframed 2.5D camera + page-space overlay. 3D text: CSS zoom (layout-level) NOT transform:scale. Texture source ≥2x display size is floor; hero elements get separate 4x screenshots crossfaded
- 语义：All real-page shots use PageCam: 2x full-page texture + keyframed 2.5D camera + page-space overlay. 3D text: CSS zoom (layout-level) NOT transform:scale. Texture source ≥2x display size is floor; hero elements get separate 4x screenshots crossfaded during camera push.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
