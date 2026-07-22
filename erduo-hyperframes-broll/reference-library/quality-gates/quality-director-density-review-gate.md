# 质量门：导演分镜密度主审

用途：在 assets/render 前拦截过稀、过平、未实现自包含 director method 判断的 shot plan。

- 适用：每次 `broll-director` 产出 shot plan 后、`broll-assets` 开始前。
- 约束：director 在隔离上下文中冻结完整 `erduo-director-method-v1`、shot plan 与 atom trace artifact；主 agent 只接收限长事实包，producer 自评不能替代 `shot_plan_review`。
- 验收：main `shot_plan_review` 必须记录 method completeness、shot count verdict、density range gap、dense-shot recovery、是否全片中等密度、合并理由和返工意见。失败时用一份聚合返工包回到 director，不进入 assets。

边界：这是 advisory atom。公开 receipt 只保存 hash/状态和限长 metrics，不保存私有 SRT 或完整 director-method 输出。外部 enhancer 是否存在不影响该 gate，不创建独立 reviewer Agent。
