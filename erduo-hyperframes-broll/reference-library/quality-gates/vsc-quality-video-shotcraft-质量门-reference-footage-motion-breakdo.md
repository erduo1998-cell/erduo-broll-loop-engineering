# video-shotcraft 质量门：Reference Footage → Motion Breakdown → Selective Adaptation

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Reference footage: ffmpeg extract ~100 frames + contact sheet → break down every animation/transition/effect → 'technique｜reference｜adopt/decline' table in spec. Selective adaptation only. Image references = 'a type of shot' feel, NOT whole-film sty
- 语义：Reference footage: ffmpeg extract ~100 frames + contact sheet → break down every animation/transition/effect → 'technique｜reference｜adopt/decline' table in spec. Selective adaptation only. Image references = 'a type of shot' feel, NOT whole-film style mandate. Per-shot applicability decision required.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
