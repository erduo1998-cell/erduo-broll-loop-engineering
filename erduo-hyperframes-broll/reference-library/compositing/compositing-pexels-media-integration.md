# 合成原子：Pexels 素材画面融合

用途：把 Pexels 图片/视频当作被设计的画面材料，而不是被组件硬盖住的背景。

- 适用：任一镜头选择 `pexels` 作为主素材或辅助素材。
- 约束：assets 阶段必须为候选素材记录主体、焦点、可裁切区域、负空间、安全叠加区、亮度/色温/色彩、景深、运动方向和语义贴合度。组件、标题、图表或光效只能放在素材允许的位置，并解释它们与素材主体的空间关系。若素材只提供氛围、无法承载该镜头语义，或需要大面积遮挡才能读懂，必须拒绝该素材并继续路由。
- 验收：每个 Pexels 镜头有 composition-fit 记录：crop plan、focal box、overlay safe zone、palette treatment、component relation、motion treatment、failure fallback。pixel gate 与主 agent 从实际证据检查文字/组件没有压住主体且色彩不与用户 design/reference 冲突；verify 不得自行抽帧批准。

边界：这是 advisory atom。Pexels 来源、创作者和页面出处按 `pexels-contract.md` 保留；本原子只管画面设计融合，不改变素材优先级。
