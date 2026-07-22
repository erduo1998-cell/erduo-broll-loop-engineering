# 参考原子库契约

## 目标

参考库不是“模板切换器”，而是按镜头决策检索的**轻量知识入口**。
运行时仅先读 `reference-library/registry.json`，再按召回结果读取对应 `relative_path` 原子文件。

## 目录结构

```
reference-library/
  styles/         视觉样式、字体、色彩、节奏令牌原子
  scene-logic/    场景逻辑、叙事结构、镜头状态原子
  components/     局部组件、关系组件、数据组件原子
  motion/         动效、转场、运动约束原子
  compositing/    叠加、透明、层级合成规则原子
  quality-gates/  可验证质量门原子
  registry.json   最小元数据索引
```

## Registry 条目（最小字段）

每条目只能包含以下字段（其余为违规）：

1. `id`：稳定 ID，按类目前缀固定（`STY` / `SCN` / `CPT` / `MOT` / `CPS` / `QLT`）+ 3 位数字。
2. `category`：`styles|scene-logic|components|motion|compositing|quality-gates`。
3. `tags`：最多 6 个短标签，用于检索。
4. `capabilities`：能力描述，不含执行命令/参数。
5. `summary`：一句抽象用途说明。
6. `source_boundary`：来源边界；必须包含：
   - `user_reference_priority`（布尔值，必须为 `true`）
   - `usage_mode`（必须为 `advisory`）
   - `provenance`（必须为 `sanitized-abstract`）
   - `content_handling`（必须为 `non-literal-only`）
7. `dependencies`：依赖的上游原子 ID（可为空数组）。
8. `validation_status`：状态标签，必须为非空字符串，且不能是 `production`。
9. `relative_path`：指向 `reference-library/` 下的相对路径，不得含绝对路径、`..`、绝对盘符或主机私有路径片段。

## 约束

- 每类至少 1 个原子；单类上限 64 个，避免召回不可控。
- 所有 registry 条目均为脱敏摘要，不储存原始私有文案、绝对路径、Logo、媒体文件内容。
- 原子文件文本是候选判断语义和审美记忆，不强制每镜执行，也不能被编译成固定模板。
- GitHub、设计系统、视频框架等外部项目只能被吸收为抽象约束、质量门或命名启发；不得复制代码、品牌样式、专有 token 数值或原项目视觉。Remotion 项目可作为组件语义和参数边界参考，但 HyperFrames 运行时不得直接导入 Remotion TSX、`useCurrentFrame`/`Sequence` 代码或来源不清音频。
- 每次生成正式 shot plan 时，必须记录轻量 `reference_atom_trace`：召回的 atom ID、使用/拒绝原因、被用户设计覆盖的原因。没有匹配原子时也要写 `no_match_reason`。Trace 只解释创作判断和审查依据，不要求每镜绑定 atom 正文作为合规字段。
- 文字镜头应召回字体/排版相关 atom（至少覆盖 `STY-006`、`STY-025` 或用户 design override）作为排版计划依据，并在 main preview/final frame review 与 verify 阶段应用 `QLT-018`。无来源的 `Inter`、system/browser sans 默认或其他禁用字体栈不得作为内部默认。
- 没有用户 design/reference 时，director 必须召回 `STY-026`，先写设计读数与视觉差异、运动强度、视觉密度三档拨盘，再选择风格。
- 标题、金句、章节字、UI 字段和其他关键文字镜头必须有 `STY-027`、展示字体库选择或显式用户字体覆盖作为依据；pixel gate 与 main agent 都必须按 `QLT-018` 检查标题完整可读，verify 只核验对应 main review refs 和字体事实。
- 自包含 director method 必须召回 `SCN-011` 并在 assets 前由 main `shot_plan_review` 应用 `QLT-019`。任一 Pexels selected route 必须召回 `CPS-018` 并通过 `QLT-020`。所有真实运行在 render 前必须通过 `QLT-021`，除非用户提供的完整 design review 已覆盖同一字段并写入 trace。
- 不写入任何 `production` 伪证；若需上线，必须另行升级审核流程并写入验收证据。
- `source_boundary` 用于明确用户参考优先：用户输入/用户约束可覆盖，默认库仅提供建议。

## 验证入口

- `scripts/validate-reference-library.mjs`
  - 检查 registry 指向文件存在
  - 检查 ID 稳定性
  - 检查私有/绝对路径泄漏
  - 检查 `source_boundary` 合规
- `scripts/test-validate-reference-library.mjs`
  - 覆盖正常、边界、失败测试
