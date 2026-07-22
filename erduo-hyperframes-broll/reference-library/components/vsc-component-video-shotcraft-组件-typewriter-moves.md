# video-shotcraft 组件：typewriter-moves

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Two narrative text entrance sub-components: (a) Terminal Typewriter — command typed 2f/char in dark terminal, camera slams into command line (scale 1→3.2) then hard cut to product dashboard; (b) Error Retype — three-act drama of type→pause→backspace
- 语义：Two narrative text entrance sub-components: (a) Terminal Typewriter — command typed 2f/char in dark terminal, camera slams into command line (scale 1→3.2) then hard cut to product dashboard; (b) Error Retype — three-act drama of type→pause→backspace→retype with speed contrast.
- 约束：Terminal: character rate 2f/char, substring-based (frame-determinate). Cursor: block style, square-wave blink — fade cu
- 验收：Terminal: character rate 2f/char, substring-based (frame-determinate, no easing)；Terminal: cursor block style, square-wave blink — fade cursor = webpage, not terminal；Terminal: camera slam scale ≥3× — less = twitch, not 'crashing into'；Terminal: hard cut at peak motion — no crossfade (destroys fuse→explosion causality)；Terminal: hold ≥77f on destination sce
- HyperFrames 改写：Frame-determinate character reveal (not easing-based).

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
