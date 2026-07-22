# video-shotcraft 组件：draw-svg-trace

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Visible pen tip traces an element's outline, 'drawing' it into existence. Uses SVG strokeDasharray/strokeDashoffset with pathLength={1}. Pen tip is a thicker short dash riding ahead of the main stroke. Closure flash (2f black+thick) then hands off t
- 语义：Visible pen tip traces an element's outline, 'drawing' it into existence. Uses SVG strokeDasharray/strokeDashoffset with pathLength={1}. Pen tip is a thicker short dash riding ahead of the main stroke. Closure flash (2f black+thick) then hands off to real element border + content fade-in.
- 约束：pathLength={1} — no getTotalLength() needed. Pen tip must be visibly thicker than trace line. Closure flash is mandator
- 验收：pathLength={1} — no getTotalLength() needed；Pen tip must be visibly thicker than trace line — otherwise disappears；Closure flash is mandatory — it's the 'period' at end of the sentence；Content must not appear before trace closes — causality break；Trace path must match element's real border-radius exactly；One element per trace — queued multi-element tracing
- HyperFrames 改写：SVG-based, framework agnostic. Uses cross-fade handoff window (CA-10).

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
