# 场景逻辑原子：导演分镜密度保留

用途：防止 director 把内容压扁成稀疏、重复、泛化的两三段 B-roll。

- 适用：director 运行 bundled `erduo-director-method-v1` 并准备冻结 SRT 锚定 shot plan 时。
- 约束：method artifact 必须包含意图卡、视觉母题、语义地图、组件/素材计划、密度变化和反疲劳规则。镜头可按 SRT 时间合并，但合并必须有语义理由；不能因为省上下文、少渲染或素材难找而降低密度。全片通常至少有 2 档密度差；高密度镜头后有恢复，不得全片中等密度。
- 验收：main `shot_plan_review` 从限长事实包检查语义 beat 数、最终 shot 数、合并理由、密度分布、最高/最低密度差、组件/素材覆盖率和反重复结果。低于内容需要的密度时用一份聚合返工包回到 director 重拆。

边界：这是 advisory atom。SRT 仍是唯一时间真源；密度高不等于每条字幕机械换镜。
