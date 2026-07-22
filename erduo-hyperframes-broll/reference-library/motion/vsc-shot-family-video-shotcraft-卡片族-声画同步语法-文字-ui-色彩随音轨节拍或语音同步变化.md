# video-shotcraft 卡片族：声画同步语法：文字/UI/色彩随音轨节拍或语音同步变化

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：声画同步语法：文字/UI/色彩随音轨节拍或语音同步变化
- 约束：字重脉冲绑节拍（鼓点），卡拉OK填色绑语音（旁白逐词），不混绑；频谱化 UI 只在有音轨段落使用；梯度扫光充能 ≤15–20f（要快），填满后稳态呼吸；声画同步段落后必须真静止收束 ≥20f
- 验收：收据记录同步类型（节拍/语音）、绑定元素、同步精度、收束帧数
- HyperFrames 改写：adapted
- 覆盖卡片：type-rhythm-sync、spectrum-morph-ui、voice-waveform-live、beat-step-list-theme-cycle、gradient-word-sweep
- 参考 demo：demos/type-rhythm-sync/、demos/spectrum-morph-ui/SpectrumMorphUi.tsx、demos/voice-waveform-live/、demos/beat-step-list-theme-cycle/、demos/gradient-word-sweep/

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
