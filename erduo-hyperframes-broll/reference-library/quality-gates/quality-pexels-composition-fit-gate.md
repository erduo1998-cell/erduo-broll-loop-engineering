# 质量门：Pexels 构图融合检查

用途：阻断“下载一段 Pexels 素材后把组件硬叠上去”的低质量成片。

- 适用：任何 route plan 中出现 `pexels` selected route 的镜头。
- 约束：assets 必须完成素材设计适配，render 必须消费该适配：裁切、焦点、安全区、调色、组件位置、景深和运动关系都要有对应实现。只记录 Pexels ID、下载成功或媒体可解码，不足以通过。
- 验收：`pexels-composition-fit` gate 检查所有 Pexels 镜头均在 composition review 中列明且 `pexels_integrated: true`；失败列表必须为空。pixel gate 与主 agent 从实际证据判断主体遮挡、标题压主体、调色冲突或组件漂浮无关系，任一成立即要求返工；verify 不得自行抽帧批准。

边界：这是 advisory atom。若本轮无 Pexels 素材，该 gate 标记为不适用并写明原因。
