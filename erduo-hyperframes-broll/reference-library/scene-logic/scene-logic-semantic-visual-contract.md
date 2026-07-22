# 场景逻辑原子：语义视觉契约

用途：每个镜头先说明“这段话需要被看见的关系”，再选择画面和组件。

- 适用：所有由 SRT 驱动的 B-roll 镜头。
- 约束：装饰性动效不能替代语义表达；无法视觉化时必须说明回退理由。
- 验收：pixel gate 与主 agent 从 render 冻结的 `entry/result/exit` 证据检查画面内容是否支持 brief 主语义；verify 只验证已批准 receipt 与 exact render manifest/master hash 的绑定。

外部吸收边界：结合本项目导演规则和公开无障碍设计原则，保留抽象判断。
