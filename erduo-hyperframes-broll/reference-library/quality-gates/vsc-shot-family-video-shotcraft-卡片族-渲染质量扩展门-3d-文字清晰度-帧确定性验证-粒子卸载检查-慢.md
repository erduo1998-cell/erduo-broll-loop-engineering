# video-shotcraft 卡片族：渲染质量扩展门：3D 文字清晰度、帧确定性验证、粒子卸载检查、慢速窗可读性

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：渲染质量扩展门：3D 文字清晰度、帧确定性验证、粒子卸载检查、慢速窗可读性
- 约束：3D 透视下 UI 文字必须高分辨率栅格化+CSS zoom 向下采样；所有粒子/抖动/漂移必须来自可复现 seed 或确定性函数；粒子寿命耗尽必须条件卸载——残留=脏帧；变速段慢速窗 ≥40f 确保内容可读
- 验收：收据记录栅格化分辨率、seed 参数、粒子卸载帧、慢速窗帧数
- HyperFrames 改写：direct
- 覆盖卡片：hires-rasterize-3d-text、line-boil、smear-multiples、particle-celebrate-hits、speed-ramp-freeze
- 参考 demo：demos/hires-rasterize-3d-text/、demos/line-boil/LineBoil.tsx、demos/smear-multiples/SmearMultiples.tsx、demos/particle-celebrate-hits/、demos/speed-ramp-freeze/

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
