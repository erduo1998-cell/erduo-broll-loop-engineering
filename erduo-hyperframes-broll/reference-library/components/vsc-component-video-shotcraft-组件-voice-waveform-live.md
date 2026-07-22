# video-shotcraft 组件：voice-waveform-live

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：64 vertical bars in a glassmorphism capsule respond to 'speaking' with waveform animation. Speaking = tall bars in center; silence = collapsed to 5px dot line. History scrolls left. Submit collapses waveform with spring.
- 约束：Deterministic PRNG mandatory — Math.random() causes per-frame jitter. Speaking and silence segments must be clearly dis
- 验收：Deterministic PRNG mandatory — Math.random() causes per-frame jitter；Speaking and silence segments must be clearly distinct — silence must actually collapse to dots；Syllable noise layer required — without it, waveform is smooth hills；Bar count: 40-80 — <40 reads as equalizer, >90 individual bars invisible；If real voiceover exists, envelope must sync to audi
- HyperFrames 改写：Uses deterministic pseudorandom noise pattern (CA-12).

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
