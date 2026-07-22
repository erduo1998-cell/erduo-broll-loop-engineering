# 合成原子：层级堆叠契约

用途：把背景、素材、遮罩、面板、文字、光效的顺序固定成可审核清单。

- 适用：两个以上视觉层同时出现的镜头。
- 约束：每层必须有 z-order、blend role、可见区间和遮挡说明。
- 验收：source gate 对照 layer stack 检查实现绑定；pixel gate 与主 agent 从实际 `entry/result/exit` 证据检查可见性和遮挡风险，verify 只验证批准 receipt 的绑定。

外部吸收边界：吸收视频框架的层组合思想，不复制任何代码。
