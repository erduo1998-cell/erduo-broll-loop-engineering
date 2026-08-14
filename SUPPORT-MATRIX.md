# 支持矩阵

“有真实证据”只表示指定宿主和输入曾完成对应链路，不等于所有机器已验证，也不等于用户已经认可审美。

| 环境 | 当前状态 | 证据边界 |
| --- | --- | --- |
| macOS + Codex | supported | 已有当前提示词架构的真实 SRT 生产和 master 证据；具体机器仍须先运行 doctor |
| macOS + Claude Code | experimental | 安装目标和契约受测试覆盖，尚缺与 Codex 同输入的当前版本端到端对照 |
| macOS 首次安装 | supported installer | 安装器、离线 mock 与安全边界受自动化测试覆盖；硬件、网络和宿主差异仍可能要求人工处理 |
| HyperFrames runtime | supported production backend | CLI 固定为 `0.7.104`，8 个官方核心 Skill 固定为 commit `c96b30c7174984e684620556ce871a285381ec60`；可由 auto 或显式单后端计划选择 |
| Remotion runtime | project-local supported workflow | 具备前置识别、独立 Build/Integrate/Render Skill 和失败关闭验证；只接受目标项目本地锁定依赖与可直启 CLI，不承诺与 HyperFrames 视觉一致 |
| Hybrid frozen-media route | contract + validator supported | 逐镜证据规划、连续区块聚合、冻结媒体 schema/hash validator 和 FFmpeg 集成已进入公开契约；FFprobe/完整解码由阶段实跑留证；尚不构成双后端成片或视觉一致性 witness |
| Windows | unverified | 保留路径和配置兼容设计；没有真实 Windows 运行证据 |
| 剪映/CapCut 桌面 GUI | unverified | 输出以常见 MP4/MOV 交付为目标；尚未完成当前版本 GUI 实机导入认证 |

稳定版本只冻结公开契约，不会把未完成的环境验证自动提升为 `verified`。Windows 与剪映 GUI 必须保持本表声明，直到取得对应实机证据。

官方 doctor 可能因为 npm 上已有更新版本而把顶层 `ok` 置为 false。只在 doctor 的 `_meta.version` 精确等于本发行包锁定的 `0.7.104`、失败项只是“newer version available”，且 Node、FFmpeg、FFprobe、Chrome 等选中本地渲染事实全部通过时，本项目把它记录为非阻断更新提示；版本不明、版本不符或任何渲染事实失败仍会关闭发布/生产门。

## v0.8 Production Slim 合同

`0.8.0` 把深度环境排查移到安装/升级，正常视频只执行轻量 preflight；把多阶段抽帧改为运行时 motion/layout 代码筛查，只有异常窗口取证；把父级默认读取的 11 份 reference 改为按需加载。冻结 Prompt-load 代理相对 v0.7.0：父默认减少 `95.89%`，HyperFrames `79.93%`，Remotion `79.87%`，Hybrid `82.58%`。

| 项目 | 当前状态 | 证据边界 |
| --- | --- | --- |
| 安装 readiness 缓存 + production preflight | automated tests pass | 正常生产 Onboarding Agent 为 0；缓存失效或真实工具故障仍会进入定点诊断 |
| Remotion DOM geometry capture + motion/layout lint | script + fixtures verified | 可筛查可测的运动/构图风险；真实 Player E2E 依赖目标项目本地浏览器与精确依赖 |
| HyperFrames geometry lint | contract with honest coverage | 有官方真实 geometry hook 时运行；无 hook 的元素标为 `unmeasured`，不能伪装完整覆盖 |
| Context measurement | deterministic byte proxy | 可重复统计默认 Prompt 文件读取量；不等于真实宿主 token、产物 I/O 或视频质量 |
| 唯一完整动态预览 | production contract | 仍由用户判断故事、重量、弧线、夸张和 appeal；技术绿灯不等于审美通过 |

本版不新增审美评分或视觉审查 Agent，也不声明跨后端视觉一致性。Windows、剪映/CapCut GUI 与任意既有项目自动修复仍未验证。

## v0.7 first-pass craft 合同（历史基线）

`0.7.0` 冻结的是第一次预览的生成机制，不是自动化审美证明。默认链不增加独立视觉审查、审美评分、lookdev 或逐镜审批；最终 composition preview 仍是正式渲染前唯一默认审美/用户停点。发布前已完成同输入 first-pass benchmark，用户在两版技术均通过后明确选择 `0.7.0`；该结论只绑定冻结样本，不外推为所有输入的审美保证。

| 项目 | 当前状态 | 证据边界 |
| --- | --- | --- |
| Narrative envelope + shared visual system | verified contract + validator | 全片上下文、视觉世界、颜色/字体角色、材料/深度、构图家族、节奏、禁用项和安全区只冻结一次；不表示任意 Builder 输出天然符合审美 |
| Compact Shot Recipe v2 | verified contract + validator | 每镜差量、hero frame、micro-beats、material needs、接缝和 hold 可确定性校验；beat 语义与画面质量仍须在实际预览中判断 |
| Recipe / Runtime Plan v1 compatibility | supported read compatibility | validator 和 planner 按 `schemaVersion` 接受 v1；旧 run 不追溯迁移，不会凭旧合同获得 v2 shared artifact 或 authoring-unit 声明 |
| Focused `authoringUnits` | verified deterministic plan | unit 只含同一 backend block 的完整镜头，默认 1–3 镜、绝对上限 40 秒，并精确闭合所有 shots；不改变 backend capability routing |
| Runtime-neutral craft catalog | verified original data + CLI | 小型原创 catalog、归因 manifest 和渐进查询进入发布闭集；条目是 authoring guidance，不是现成组件、模板、审美评分或跨后端 parity 证据 |
| Conditional Assets | supported production contract | shot-specific material need 为空时不搜索 Pexels/生成素材；命中素材路由后仍要求来源、权利、hash、裁切、字体和融合几何。该合同不保证外部服务始终可用 |
| Context / handoff reduction | measured, partially met | Director + Builder Markdown/JSON I/O 从 220,665 降至 209,199 bytes（`5.20%`），未达到原 `30%` 优化目标；handoff prose 从 18,493 降至 4,884 bytes（`73.59%`），超过 `50%` 目标。未达项公开保留为后续优化，不伪装成通过 |
| First-preview visual uplift | selected on frozen benchmark | 使用相同 14.1 秒 SRT、2160 × 3840、30 fps、字幕/静音政策与服务边界比较两版第一次完整预览；技术检查通过后用户明确选择 `0.7.0`。结论不外推到其他输入 |
| `auto-motion` clean-room boundary | verified attribution boundary | 仅记录 `vibe-motion/auto-motion@17ead629d010f7e5495f645d46fafd6876482c32` 的可观察设计思想；审计时未发现 LICENSE，不复制代码、Prompt、Skill、范例、媒体或原文 |

两代合同都继续要求 SRT 整数毫秒、完整覆盖、来源与字体闭包、能力证据路由、后端隔离、preview identity、FFprobe 和完整解码。技术验证不得宣称审美通过。

## Runtime adapter 与 Shotcraft 知识层

运行时无关 Shot Recipe 先冻结语义、时间、素材和适配边界，再由确定性 Runtime Planner 按 capability 与 exact pattern/backend evidence 逐镜选择后端、聚合连续区块并生成聚焦 authoring units。用户可强制整片单后端；空白新项目默认 auto。Planner 不读语义关键词。

能力状态必须按镜头机制逐项判断：

- `portable`：两个运行时原则上都能实现，但仍需各自实现和验证；
- `native-hyperframes` 或 `native-remotion`：依赖对应运行时特性；
- `interop`：只允许经过验证的冻结媒体桥接，不允许实时嵌套运行时；
- `unsupported`：当前明确不承诺支持。

这些状态不是跨运行时一致性证明。React 状态、异步行为、第三方组件和任意既有 Composition 都必须在所选运行时内真实检查；不能据此宣称 Remotion 与 HyperFrames 会自动互转或输出相同画面。

本仓库安装器不捆绑、不全局安装 Remotion，也不构成 Remotion 授权。已有 Remotion 项目必须声明并安装精确的 project-local `remotion` 与 `@remotion/cli`；新项目只由用户选中的 Remotion 后段在生产目录内显式 scaffold、锁版并生成 npm lock。使用者须根据 Remotion 官方现行许可判断其具体场景。

发行版不再固定单一 Remotion 版本。每个项目仍必须把解析出的稳定版本精确锁定，并让依赖声明、lock、安装包和 local CLI 证据一致。`effects.dom-pixel-postprocess` 可把确定性 DOM 子树交给 Remotion HTML-in-canvas 的 Canvas 2D/WebGL2 路径；它要求 Remotion 4.0.455+、非嵌套实现、同环境 Chrome/GL 事实和真实 still canary。该能力仍是 `contract-only`，不冒充跨机器生产 witness。

### `video-shotcraft` 吸收边界

| 项目 | 当前状态 | 证据边界 |
| --- | --- | --- |
| 镜头卡目录 | verified data | 152 张卡、209 个全局唯一 style key；目录、来源 commit 与 manifest 由自动化测试核验 |
| 卡片全文 | verified upstream artifact | 每卡与 pinned upstream Markdown byte-identical，并有稳定 ID、上游 URL、本地路径、字节数与 SHA-256；正文作为运行时中立镜头知识消费 |
| 查询 | verified CLI | 支持 stats、list、search 与 card；`--style` 只能随 card 限定卡内 style，只有 card 模式加载卡片全文 |
| 创作触发 | optional reference | Director 默认不查询，先独立完成视觉与运动逻辑；只在具名的未解技法问题或用户明确要求时查询。整片 0 次查询、0 个 `patternRef` 完全有效，不需逐镜记录“无卡片” |
| 固定 Remotion 来源 | verified source subset | 仅收录 manifest 声明、逐文件哈希验证的源码与最小 fixture，供 Remotion 后段按来源证据借鉴；不因此安装运行时 |
| 上游媒体 | not bundled | 不复制预览、音频、纹理、字体或其他媒体资产 |
| HyperFrames 组件 | not implied | 152 张知识卡不等于 152 个已经构建、seek 和渲染验证的 HyperFrames 组件 |
| 双端视觉一致性 | not claimed | 两个后端分别验收；除非另有逐镜头 witness，不推断关键时间点或视觉结果一致 |

来源固定为 `Vincentwei1021/video-shotcraft@41ee360d82f4c491ba9d88a24a4add7d8ff1cf8b`，library revision 为 `bdd94be16d60fa8f`。适配文本遵循 Apache-2.0，完整许可证随发布包提供；上游未来变化不会在未更新 commit、manifest 和测试的情况下静默进入本仓库。
