# video-shotcraft 组件：flat-panel-3d

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：Paper card lying flat on a desk surface using Three.js (MeshStandardMaterial, planeGeometry, CanvasTexture for shadow). Depends on three + @react-three/fiber + @remotion/three.
- 约束：Can be approximated with CSS rotateX(-90deg) + perspective for 2D texture display. For true 3D scenes, HyperFrames need
- 验收：Flat panel can be approximated with CSS rotateX(-90deg) + perspective for 2D texture display；For true 3D scenes, HyperFrames needs a Three.js adapter contract；Shadow quality: CSS box-shadow suffices for contact shadows; drop CanvasTexture
- HyperFrames 改写：@react-three/fiber → CSS 3D transforms or Three.js adapter. @remotion/three timeline → manual renderer.render() per frame. CanvasTexture procedural shadow → pre-baked PNG or CSS box-shadow. MeshStandardMaterial → CSS background + box-shadow for flat cards.

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
