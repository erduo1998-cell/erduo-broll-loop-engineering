# video-shotcraft 组件：chart-live-moves

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Three data visualization motion sub-components: (a) Oscilloscope Stream — real-time waveform with spike event; (b) Unit Dot Swarm Regroup — 320 dots scatter→cluster→bars→digit matrix; (c) Axis Rescale Shock — line chart burst above boundary triggers
- 语义：Three data visualization motion sub-components: (a) Oscilloscope Stream — real-time waveform with spike event; (b) Unit Dot Swarm Regroup — 320 dots scatter→cluster→bars→digit matrix; (c) Axis Rescale Shock — line chart burst above boundary triggers y-axis rescale.
- 约束：Oscilloscope: waveform must be deterministic (pure function, no random). Spike event must be singular. True chart conte
- 验收：Oscilloscope: waveform must be deterministic (pure function, no random)；Oscilloscope: spike event must be singular — repeated spikes = cheap；Oscilloscope: true chart context — real axis labels, units, data；Oscilloscope: hold ≥36f after settle；Unit Dot: 320+ dots to form readable digit bitmap；Unit Dot: spring stiffness ~150 for migration；Unit Dot: true label
- HyperFrames 改写：Deterministic pseudorandom noise pattern (CA-12) for waveform generation.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
