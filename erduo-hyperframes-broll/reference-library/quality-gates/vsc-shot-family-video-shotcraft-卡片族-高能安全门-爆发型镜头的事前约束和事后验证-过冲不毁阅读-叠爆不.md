# video-shotcraft 卡片族：高能安全门：爆发型镜头的事前约束和事后验证——过冲不毁阅读、叠爆不过载、定格不偷跑

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：高能安全门：爆发型镜头的事前约束和事后验证——过冲不毁阅读、叠爆不过载、定格不偷跑
- 约束：任何高能动作（砸入/撞停/闪白/爆炸）后必须真静止 ≥45f；同帧不得有两种爆发型手法同时触发；过冲/回弹参数必须在可读范围内（过冲 ≤12°、回弹 ≤2 次）；全片高能事件 ≤3 次且间隔 ≥3s
- 验收：收据记录高能事件类型/帧号/并发检查/静止帧数/回弹参数
- HyperFrames 改写：direct
- 覆盖卡片：card-flip-reveal、crash-zoom-punch、slam-entrance-moves、cel-flash-stomp、speed-ramp-freeze
- 参考 demo：demos/card-flip-reveal/CardFlipReveal.tsx、demos/crash-zoom-punch/、demos/slam-entrance-moves/、demos/cel-flash-stomp/、demos/speed-ramp-freeze/

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
