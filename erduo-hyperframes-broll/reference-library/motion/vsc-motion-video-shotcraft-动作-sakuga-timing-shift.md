# video-shotcraft 动作：sakuga-timing-shift

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：一拍三（10fps 顿挫）→ 一拍一（30fps 丝滑）的节奏切换，用帧率切换本身当叙事转折
- 语义：作画打拍切换——前半段手翻书钝感，后半段丝滑冲刺
- 约束：一拍三驱动帧 q = floor(f/3)*3，位置在 3 帧内冻结；切换点后用原始 f 连续驱动 + out-poly(4) 高初速冲刺；切换瞬间角标弹一下 pop 1→1.35→1；落位急停 squash 3f 内收干
- 验收：一拍三段每步顿挫可感（步长 ≈74px），切换后丝滑连续
- HyperFrames 改写：frameRate 分层——同一元素不同时间段不同采样率。timingShift: {from: 'on3s', to: 'on1s', switchFrame: 48}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
