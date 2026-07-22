# video-shotcraft 卡片族：闭式粒子与光效基元：帧确定的弹道/光扫/辉光，免物理引擎

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：闭式粒子与光效基元：帧确定的弹道/光扫/辉光，免物理引擎
- 约束：所有粒子使用闭式弹道公式（seed 伪随机），禁 Math.random；粒子寿命耗尽条件卸载，残留粒子=脏帧；光效角色分四类：扫/擦/晕/呼吸，不混用；庆祝粒子全片 ≤1 次（一次性高潮）
- 验收：收据记录粒子数/seed/弹道参数/卸载帧/光效角色分类
- HyperFrames 改写：direct
- 覆盖卡片：particle-celebrate-hits、particle-sand-fill、glow-flyline-moves、light-play-moves
- 参考 demo：demos/particle-celebrate-hits/ConfettiCrossfire.tsx、demos/particle-celebrate-hits/CounterTickSparks.tsx、demos/particle-sand-fill/ParticleSandFill.tsx、demos/glow-flyline-moves/、demos/light-play-moves/

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
