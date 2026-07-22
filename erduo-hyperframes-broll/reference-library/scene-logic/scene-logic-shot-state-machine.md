# 场景逻辑原子：镜头状态机

用途：把每个镜头拆成 `entry`、`result`、`exit` 三个可取证状态，明确每个状态承担的信息。

- 适用：多镜头序列、需要转场衔接或中途状态变化的镜头。
- 约束：`result` 必须包含该镜头唯一主概念；`entry`/`exit` 只做引入和交接。render evidence 中三态各自必须是 `timestamp_ms + frame_sha256`，严格有序且绑定 exact master/window hash。
- 验收：director brief 每镜写出状态表；render 冻结 schema-v2 `entry/result/exit` 证据；pixel gate 与主 agent 在 verify 前检查实际画面。

外部吸收边界：吸收可访问组件库的状态建模思想，不复制 UI 组件结构。
