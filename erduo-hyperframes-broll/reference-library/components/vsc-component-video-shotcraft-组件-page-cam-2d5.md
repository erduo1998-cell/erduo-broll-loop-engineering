# video-shotcraft 组件：page-cam-2d5

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：2.5D camera over full-page screenshots with flat pan/zoom and 3D tilt (rotX/rotY/rotZ + perspective). Keyframe-based interpolation with easing and DOF approximation via gradient blur band.
- 约束：3D mode requires CSS zoom rasterization path verification on target browser. perspective value must scale with zoom: pe
- 验收：3D mode: verify CSS zoom rasterization path on target browser (Chromium sharpness)；DOF band must not clip content at page boundaries；perspective value must scale with zoom: persp * zoom px；Flat mode (no 3D keys) must render pixel-identical to Remotion original；Snapshot at 3 midpoints per keyframe segment
- HyperFrames 改写：useCurrentFrame() → window.__timelines[id].time(). interpolate(frame, [a,b], [0,1]) → GSAP tween with segment timing. staticFile() + <Img> → <img> with data-media-src. CSS zoom property is framework-agnostic. DOF backdrop filter is identical CSS.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
