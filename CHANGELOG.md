# Changelog

本项目遵循 Semantic Versioning。稳定版本冻结公开的 Skill、目录、查询与发布包契约；运行时支持等级仍以支持矩阵的实际证据为准。

## Unreleased

## 1.0.1 — 2026-08-19

- 修正 2026-08-18 技术通过但视觉失败的候选实现：保留逐镜直出和 Parent 机械媒体检查，把创作边界恢复为一名 Chapter Builder 负责通常 `5–8` 个连续镜头的完整“理解—选择—制作—观看—修改”闭环。
- Shot Recipe v4 拆为不可修改的 `truth` 与可由 Builder 用一句理由重做的 `creativeProposal`；Director 只建议语义章节、seam、素材路线和 2–4 条 `craftIntent`，不再拥有 `authoring.solo` 决策。
- 完整原始 SRT 与原始 design 连同 identity 直接进入 Director、Lead 和 Chapter Builder packet，不再用中间摘要替代创作事实。
- Assets 只冻结已知共享素材、字体、授权和衍生物；每镜继续开放 `native|provided|search|generate|mixed`。全局关闭搜索/生成必须来自用户禁止、能力不可用或授权/费用边界。
- Lead 必须交付原生图形/文字、真实或生成素材融合、信息密集界面/流程/数据三类真样片；落实 design signature motion、裁切/遮罩/纵深/背景融合能力和一页以内内容关系能力索引。样片成为对应镜头最终源码。
- Chapter Builder 必须运行标准命令并实际打开每镜 6 格图和 chapter preview；修复低级错误后只返回简短 `accepted|revised`，不能以 lint/inspection/diagnostics 通过代替看片。
- 从 creative source 和通过态输出删除 `inspection.tsx`、DOM trace metadata、人工 motion windows、visual-weight/focus-group/layer 证明及 dense diagnostics；Parent 仍负责 render、FFprobe、完整解码、hash、合同、6 格图和 preview。
- 单一角色真源新增正向十二原则短锚点；每镜只选真正相关的 2–4 条，不做逐条评分或 trace。
- v1.0.1 production 默认改为 HyperFrames；Remotion 只限 explicit opt-in/canary，`auto` 为 experimental opt-in。
- 完整生产前新增 5 镜头 creative canary：5/5 直出解码、Builder 真实观看、构图/素材/signature motion 多样性、用户选择不少于 3/5、首版 `≤45` 分钟。用户未选择前禁止跑完整长片。
- 使用同一份 `179.866` 秒、`124` 条 cue 的原始 SRT/design 完成全新 HyperFrames forward canary：20 份 Recipe v4 与 3 个 `7/7/6` chapter 已规划，三条 Lead 样片与 5 个 canary shot 已真实直出；5/5 canary 为 4K、30 fps、H.264、完整解码通过，六格图、Lead/Builder 观看回执、三种构图、两类素材融合与两种 signature motion 闭合。用户观看盲测后明确认可本版，并明确要求停止剩余 14 镜、不生成全片预览，直接发布。
- 旧 `179.866` 秒 Remotion run 仅作为失败依据保留：20/20 技术媒体通过，但产生 20 个创作 unit、原始 design 未直达、素材不足、视觉不合格，且 `203m13s / 54m17s / 63m13s` 未达目标。它不证明本次 reset、正式发布或双后端等价。
- v1.0.1 正式发布；发布证据只覆盖 Lead 三样片与五镜 creative canary，不把用户明确取消的剩余 14 镜或完整 preview 写成已完成，也不声明双后端视觉等价。

## 1.0.0 — 2026-08-18

- 从 v0.9.2 原地升级正常生产闭环，不另建 fast pipeline；继续保留 Parent、Director、Assets、多 Builder、HyperFrames、Remotion、Hybrid、可编辑源码、素材来源与冻结装配边界。
- Shot Recipe v3 默认使用约 5–12 秒的完整语义镜头；Runtime Plan v3 独立聚合 Builder 工作包，允许一个 unit 包含超过 3 个镜头和 40 秒，普通约 180 秒单后端任务以 2–3 个 Builder 为规划目标，同时保留复杂镜头、后端和 live transition 例外。
- 新增三个代表场景与 visual-lock 合同。Lead Builder 先交付真实动态场景和每实际后端可导入的共享视觉源码；Director 见证与用户批准、返修或明确跳过均绑定 identity，未通过时普通 Builder 默认不能批量展开。
- 普通单后端冻结媒体默认改为高质量 H.264 MP4（`libx264 / medium / CRF 12 / yuv420p / fixed GOP`）。FFV1 只作为有明确原因的 lossless upgrade；assembler 保留 hash、FFprobe、完整解码、连续覆盖、批准 identity，并对 preview 和 Master 各执行稳定的单次重编码。
- 新增 provider-neutral `production-events.ndjson` 与 `production-metrics.json` 工具，记录阶段耗时、Agent 调用、unit、文件/字节、render/trace/decode/hash、失败/重试和可选宿主 Token。Token 不可得时明确为 unknown，不读取私人 session 路径或估算。
- motion/layout 默认改为节拍边界、readable hold、切点和必要采样优先；仅异常窗口、复杂 connector/path、Canvas/WebGL 或明确要求时升级高密度 trace，正常通过不产生全片逐帧 PNG。
- Director/Builder 合同加强第一眼具体锚点、动作、结果、中文优先与内容驱动发展；抽象隐喻仍允许，但不能只靠材质、能量线、巨型文字或背景循环承担含义。
- 保留 Shot Recipe v1/v2、Runtime Plan v1/v2 与旧 run 的读取/验证边界；新生产默认写 v3，不静默迁移历史记录。
- 版本表面、五语 README、支持矩阵、发布检查表和 v1 设计文档同步到 1.0.0。
- 新增 [v1.0.0 公开生产基准](docs/V1.0.0-BENCHMARK.md)：Codex 用同一份 `179.866` 秒、`124` 条 cue 的 SRT 完成 `20` 镜头生产，`1` 名 Lead + `3` 名 production Builder、`10` 次 Agent 调用、`0` 次 full-history 调用、`0` 件外部素材。目录为 `213` 个文件、磁盘占用 `156,980 KiB`，preview 与 Master 完整解码通过；但首次 preview 约 `242.05` 分钟和 Lead `62.90` 分钟均未达目标。Director 拒绝一次 visual lock 后定点返修通过，用户没有观看或审美批准，状态为 `skipped`；Token 未知、音画同步未测，Claude Code 同输入对照仍为 pending。

## 0.9.2 — 2026-08-15

- 新增标准 Skill 发行包：保留父 Skill、十三个阶段 Skill、生产脚本、引用、来源与许可证，排除一键环境安装器、测试夹具和发布工具，降低第三方安全扫描的无关命中。
- 完整环境发行包继续提供固定 Node、HyperFrames、官方 Skill、浏览器和 FFmpeg 准备；两种包中的项目 Skill 文件逐字节一致。
- README 五种语言拆分“标准 Skill 安装”和“完整环境安装”，明确标准路径只注册项目 Skill，不会静默准备或降低运行环境。
- 未修改 Director、Assets、Builder、Shot Recipe、runtime plan、镜头卡、图解 grammar、预览审批、渲染或交付合同。

## 0.9.1 — 2026-08-15

- 参考固定版本 `cathrynlavery/diagram-design@09df49d8` 的关系优先思路，把原来单一的因果图解扩展为 8 种紧凑视频图解 grammar：因果、流程分支、时间顺序、层级、反馈循环、分层系统、系统路径和同标准比较。
- 图解不是默认路线也没有数量要求。Director 仍先判断口播含义、观众理解障碍和画面任务，只有“看见关系”明显比解释隐喻更清楚时才查询 `diagram` 分类；情绪、材料、角色和氛围镜头继续自由创作。
- 不捆绑上游 2.2 MB Skill、模板、示例、图标、脚本、动画控制器、品牌配置或视觉皮肤；Builder 只读取命中的一个紧凑条目，继续按全片视觉系统原创空间、材质与动画。
- `motion-layout` trace 兼容新增 schema 1.1。选中 `diagram-*` 的镜头必须在每个 readable hold 从真实运行时捕获节点、连线和连线标签几何；脚本拒绝缺失证据、连线穿过无关节点、标签压线/压节点、连线路径重叠和画面越界。
- 图解检查只处理确定性可读性底线，不规定斜线/折线、节点形状、网格、配色、元素数量或动画时长，也不判断图解是否是正确创意。
- 补充上游固定 commit、MIT 许可与“不复制完整 Skill”的发行边界。

## 0.9.0 — 2026-08-15

- 保留 Director、Assets 与多 Builder 的创作分工；每个 Builder 继续专注少量镜头，返工回到原责任 Builder，不用完整生产历史创建替代 Agent。
- Director 先冻结口播含义、画面任务和观众第一眼必须读到的内容，再自由设计构图、隐喻、动画与视觉风格；不增加“最少视觉机制”、抽象比例、固定构图或复杂度限制。
- 环境检查、运行时规划、任务分发、结构校验、片段拼接、预览准备与技术验证改由 Parent 直接运行确定性脚本，不再启动 Runtime Planner、Integrator 或 Render Agent；旧阶段 Skill 只读取历史记录。
- 每个 Builder 同时交付可编辑源码与统一规格、已验证的视频片段；最终脚本按 SRT 拼接片段，不声称能直接理解任意双后端源码，也不声称双后端视觉一致。
- 新增确定性输出规格生成器：默认 3840×2160、30 fps、静音 H.264 MP4，也能把竖屏、其他帧率与音频政策以同一身份写入运行计划、每个 Builder 任务和最终交付校验；Parent 不手写规格 JSON。
- 预览与正式交付分离：预览最高 1080p，固定 `veryfast / CRF 22`；批准身份绑定运行计划、整体叙事、视觉系统、全部镜头合同与冻结片段 hash。
- 正式交付必须重新提供 `--plan`、`--narrative-envelope`、`--visual-system` 和全部 `--contract`，复核身份闭合后从冻结片段重新生成完整规格的 `medium / CRF 16` Master；禁止复制预览文件作为成片。
- `--contract` 的 CLI 输入顺序不影响结果；脚本按 plan 顺序装配，并对缺失、重复、不属于 plan、内容或媒体 hash 漂移失败关闭。
- 同一生产任务共用一份素材库与相同依赖工具链；Builder 只保存本单元源码和必要证据，不复制完整工程、全部素材或无关镜头资料。
- 动画节拍从“计划存在”升级为“画面落地”：Builder 必须让主体、空间、大小、层级、材料、关系或视觉重点随语义节拍产生可见发展；装饰线条、粒子和背景循环不能代替主要动画。
- 保持唯一完整动态预览为用户审美关卡。脚本可以检查节拍计划与可测运动是否对应，不能判断动画是否高级、隐喻是否动人或替用户证明审美质量。
- 用户预览前由原 Director 对完整低成本预览做一次有界视觉见证，只返回具体镜头的理解、节奏、可读性或一致性问题；不新增 Reviewer Agent、审美评分或人工停点。宿主不能读取动态视频时必须如实停止，不能伪造通过。

## 0.8.2 — 2026-08-14

- 修复多 Remotion 单元重复安装导致磁盘、内存和 CPU 放大的契约缺陷：Builder 继续隔离源码与证据，但同一生产目录内相同依赖身份只安装一份共享工具链；安装、typecheck、浏览器逐帧捕获和渲染统一进入固定双通道队列。不同精确依赖身份仍各自隔离，不引入自动硬件调度。
- 重新设计中文 GitHub 主页：README 从 454 行压到 218 行，以完整 40 秒成片和 HyperFrames 制作的 15 秒三步操作 GIF 取代长篇流程说明；安装细节、诊断和常见问题改为折叠阅读。

## 0.8.1 — 2026-08-14

- Shotcraft 从“每镜查询并记录无卡决定”改为真正的按需技法辞典。Director 默认先独立完成整片视觉与运动逻辑；只在具名的未解技法问题或用户明确要求时渐进查询。整片 0 次查询、0 个 `patternRef` 是完整有效结果；镜头卡不是素材库。

## 0.8.0 — 2026-08-14

- **环境检查退出日常制片。** 安装器/升级流程一次性写入机器级 readiness；每条视频只跑紧凑 preflight。正常生产不派 Onboarding Agent，只有缓存失效或真实工具故障才做定点诊断。SRT、项目、输出目录、runtime plan 或 Pexels 状态变化不再触发整套环境重审。
- **动态代码筛查取代多轮抽帧。** 新增运行时 geometry trace 与 `motion-layout-lint`，按逐帧位置、尺寸、透明度、层级、遮挡、密度、速度、加速度、jerk、settle、readable hold 和运动焦点筛查风险。通过时不生成静帧或 AI 视觉分析；只有异常窗口取证。最终完整动态预览仍是唯一默认审美决定。
- **默认上下文真正瘦身。** 父 Skill 改为自足短路由，v0.7.0 强制预载的 11 份 reference 改为按决策读取；重复安全执行合同合并为单一 reference，Director、Assets 与两套 Builder 只保留创作所需判断。确定性 Prompt-load 代理相对 v0.7.0 减少：父默认 `95.89%`，HyperFrames 路线 `79.93%`，Remotion 路线 `79.87%`，Hybrid 路线 `82.58%`。
- 新增可重复计量命令 `npm run measure:context -- --baseline v0.7.0`、冻结结果与发布回归；该结果是默认 Prompt 文件字节代理，不冒充真实宿主 token 或端到端产物 I/O。
- 真实限制：代码筛查只能发现可测的运动/构图风险，不能证明故事感染力、重量感、弧线、夸张、appeal 或整体高级感；HyperFrames 无可信 geometry hook 的元素必须标为 `unmeasured`；Remotion Player 真实捕获仍依赖目标项目本地浏览器和精确依赖。两后端视觉一致性、Windows、剪映/CapCut GUI 仍未验证。

## 0.7.0 — 2026-08-13

- Director 新增一次性 `narrative-envelope.json` 与共享 `visual-system.json`，Shot Recipe 升级为紧凑 v2：逐镜只保留理解目标、第一眼焦点、构图家族、hero-frame 关系、可见 `microBeats[]`、镜头特定素材需求、可选 craft/pattern locator、接缝和 readable hold，避免重复全片字体、颜色、材料、安全区与禁用项。
- Runtime Plan v2 新增确定性 `authoringUnits`。每个 unit 只含一个 backend block 内的完整语义镜头，默认 1–3 镜且绝不超过 40 秒；Builder 只读取本 unit、相邻接缝摘要、共享 artifact、冻结素材及实际命中的 0–2 份参考。Shot Recipe v1 与 Runtime Plan v1 继续可读，旧 run 不要求迁移。
- 新增原创 runtime-neutral visual craft 索引与渐进查询器，接入 hero-frame-first、micro-beat、构图家族、视觉层次/密度、单镜聚焦、素材融合和 reuse-first authoring。HyperFrames Builder 优先查询锁定官方 registry/creative/animation 能力；Remotion Builder 只复用本项目有证据的 primitive，否则按相同 craft grammar 原生实现。
- Assets 改为按 shot-specific material need 条件触发：纯原生 motion graphics 不再为了流程无条件搜索 Pexels 或调用生成服务；真实素材仍保持用户素材 → 可控生成 → Pexels → 原生结构辅助的路由、来源、权利、hash、裁切、字体闭包和融合几何。
- 默认生产链移除独立视觉审查和广泛抽帧复审，不新增审查 Agent、逐镜审批、lookdev 停点或审美评分。确定性 schema、时间、来源、依赖、identity、FFprobe 与完整解码检查保留；最终 composition preview 仍是正式渲染前唯一默认审美/用户停点。
- HyperFrames Builder 新增本地 seek 机制预检：选定机制没有同环境 witness 时，先在本阶段 scratch 中运行一个最小 disposable canary，必须通过 official check 并产生两个非空、明显不同的时间快照后才完整 authoring；该步骤不新增 stage、Agent、审批或审美评分。
- 保留 HyperFrames / Remotion / Hybrid 的 capability 与证据路由、后端隔离、SRT 整数毫秒、连续覆盖、安全子进程、预览 identity 绑定和技术交付底线；本版不声明跨后端视觉一致性。
- 对 `vibe-motion/auto-motion@17ead629d010f7e5495f645d46fafd6876482c32` 仅做 clean-room 设计思想审计。审计时未发现 LICENSE；发布包不复制其代码、Prompt、Skill、范例、素材或文字，并随原创 craft catalog 保留机器可读归因边界。
- 冻结条件下的 `0.6.0` / `0.7.0` 同输入 first-pass benchmark 已完成：两版均为 14.1 秒、2160 × 3840、30 fps、静音并通过技术检查，用户明确选择 `0.7.0`。Director + Builder Markdown/JSON I/O 减少 `5.20%`，未达到原 `30%` 优化目标；handoff prose 减少 `73.59%`，超过 `50%` 目标。一次样本选择不构成对所有输入的审美保证。

## 0.6.0 — 2026-08-12

- 新增 `animation-craft.md`，把迪士尼动画十二法则编译为 Director、HyperFrames Builder 和 Remotion Builder 的提示词生成顺序：先语义与注意力，再确定物体身体、动作因果、关键状态/连续运动、单一表现峰值与稳定结果；明确禁止把它改造成逐镜清单、schema、运行时路由标签、评分或静态帧审美证明。
- 解除发行版对 Remotion `4.0.484` 的全局硬编码：既有项目可保留任意通过证据门的精确锁版；新项目在获授权的 Onboarding 中解析一个当前稳定版本，并把对齐的 `remotion` / `@remotion/cli`、React 和 TypeScript 工具链精确写入项目 lock。
- Remotion verifier 改为验证“项目内精确版本、Remotion/CLI 对齐、React/ReactDOM 对齐、manifest 与 lock 闭合”，不再要求所有 run 使用同一发行版常量。
- 新增 `effects.dom-pixel-postprocess` 原生 Remotion capability，自动路由到 Remotion；加入 HTML-in-canvas Canvas 2D/WebGL2 manifest、版本下限、非嵌套、GL 配置和静态实现验证。
- Onboarding、Builder、Integrator、Render 增加同版本 HTML-in-canvas real-still canary、Chrome/flag、`angle`/`swangle`、可读 hold 和身份绑定规则；暂不支持 WebGPU、嵌套捕获与静默降级。

## 0.5.0 — 2026-08-11

- 全新项目默认从 `hyperframes` 改为 `auto`：Director 先完成运行时中立 Shot Recipes，再由零依赖确定性 Planner 按 capability 与 exact pattern/backend evidence 逐镜选择后端，并聚合相邻同后端镜头。
- 用户可显式强制整片 HyperFrames/Remotion，也可选择 hybrid；既有 schema-1 单后端 run 原样兼容，不追溯重路由。
- 依据操作者多次生产观察，把 frame-driven multiphase、particles/physics、3D camera、mask/geometry morph 的复杂动画偏好路由到 Remotion；该证据不冒充受控双端 benchmark。Shotcraft Remotion TSX 只标为 `reference-source-unverified`。
- 新增 runtime plan/frozen block schema、Planner 与实际媒体 hash validator；FFprobe 和完整解码由 Builder/Integrator 阶段实跑并留证；新增 `broll-runtime-plan`、`broll-hybrid-integrate`、`broll-hybrid-render` 三个隔离阶段。
- Hybrid 只通过 Builder 冻结的 lossless/visually-lossless block media 互操作，禁止运行时实时嵌套、源码互导或失败后静默改后端；预览批准绑定 plan、contracts、media hashes 与 assembly identity。
- Onboarding 拆为 common base 与 post-plan targeted readiness；auto 不再开工前盲目准备两套后端。安装 manifest 升级 schema 5，并保留 schema 1–4 严格升级兼容。

## 0.4.0 — 2026-08-10

- 项目与父 Skill 正式更名为 **Erduo B-roll Loop Engineering** / `erduo-broll-loop-engineering`，移除公开名称对单一 HyperFrames 后端的误导。
- 安装 manifest 升级为 schema 4；升级时严格识别 schema 1/2/3 的历史所有权，重新绑定十个阶段 Skill，并安全退休旧父 Skill 链接或恢复其原始备份。
- 为兼容既有用户，私有配置、固定 HyperFrames runtime 与备份继续复用原内部应用数据目录；旧字符串仅作为迁移定位符，不再是公开产品名。
- README、Skill 元数据、安装提示、诊断、发布包、Shotcraft 来源闭包与 GitHub 仓库地址统一到新名称。

## 0.3.0 — 2026-08-10

- 新增前置 Runtime Router：用户显式选择优先；现有项目按真实文件和本地 CLI 证据识别 HyperFrames/Remotion；双信号冲突停止询问；空白新项目默认 HyperFrames。
- 新增 `broll-remotion-build`、`broll-remotion-integrate`、`broll-remotion-render` 三阶段，把同一份运行时无关 Shot Recipe 接到独立 Remotion 后段，不经过 HyperFrames 转译。
- Remotion 只使用目标项目本地、精确锁定并可直接执行的 `remotion` 与 `@remotion/cli`；安装器和本仓库 runtime lock 不新增全局 Remotion 依赖。
- 安装 manifest 升级为 schema 3，并继续严格识别、升级和卸载 0.1.x schema 1 与 0.2.0 schema 2 安装。
- 发布包纳入 Runtime Router、Remotion 后段 Skill、项目契约、验证器和固定来源实现闭集，继续拒绝未知文件、运行时依赖和媒体混入。
- CLI 入口使用真实路径判断，避免 macOS `/tmp` 与 `/private/tmp` 别名让命令误判为仅被导入而静默不执行。
- Remotion 静音策略显式使用 `--muted` 并验证零音轨与帧精确时长；项目验证器拒绝系统字体 fallback，要求带哈希和显式加载的本地字体闭包。

## 0.2.0 — 2026-08-10

- 新增 runtime-adapter foundation：用运行时无关 Shot Recipe、能力矩阵、映射文档和零依赖校验器冻结 HyperFrames/Remotion 的适配边界。
- HyperFrames 继续作为默认且唯一具有本项目生产证据的运行时；Remotion 仅为实验性契约，不捆绑、不安装，也不代表已完成双端渲染或全自动转换。
- 从固定的 `video-shotcraft@41ee360d82f4c491ba9d88a24a4add7d8ff1cf8b` 收录 152 张 byte-identical Markdown 卡片原文，并生成 209 个全局唯一 style 索引；保留 Apache-2.0、来源路径、逐文件字节数与 SHA-256。
- 新增渐进式 Shotcraft 查询命令：stats、list、search 只返回摘要，card 才读取单卡全文；`--style` 只能随 `--card` 限定卡内 style。
- 明确不复制上游 TSX、Remotion 工程、媒体和运行时依赖；152 张能力卡不等于 152 个已验证 HyperFrames 组件。
- 首次安装把 HyperFrames 官方核心 Skill 固定到与 CLI 0.7.104 对应的 commit；锁定 `skills@1.5.22`，只在隔离 staging 中安装并验证，再与本项目 Skill 一起执行可回滚事务，避开官方 `skills update --full-depth` 在新机上的无进度克隆风险。
- Director、Assets 与 Builder 接入卡片查询和运行时中立意图，保持 Parent、Integrator 与 Render 的既有职责边界。
- 消除预览批准输入循环：预览 Agent 停止后，由新的 Render Agent 绑定未变更 composition 的批准证据并复检后渲染。
- 更新中文 README，补充 Shotcraft 能力边界、查询示例、许可证、零基础安装、三类使用提示词与支持范围。
- 新增中文八步流程图与作者联系方式；两项文档图片作为仓库展示资产，不进入严格白名单发布归档。
- 发布归档纳入 catalog、manifest、查询器、归因、152 张卡片和完整 Apache-2.0 文本；以显式白名单与 manifest 哈希闭集继续保持确定性发布边界。
- 新增公开 CI，执行完整测试与 Skill quick validation。

## 0.1.0-rc.2 — 2026-07-28

- 禁用 macOS `copyfile` 在发布 tar 中隐式加入 AppleDouble 成员，并让归档创建忽略扩展属性。
- 发布归档固定为无 PAX/GNU 元数据的纯 ustar；uid/gid、owner/group、mode 和 mtime 全部归一化，gzip header 不允许 comment、filename、extra 等可隐藏私密信息的可选字段。
- gzip 验证只接受一个 raw-deflate member，显式核验 footer CRC32/ISIZE 并拒绝拼接 member 或尾随字节；每个 tar 正文后的 512 字节对齐区必须全零。
- 发布验收改为先对压缩文件做有界 regular-file 读取，再由 Node 直接解析 gzip 后的原始 tar header、成员类型、路径闭集和内容哈希，不再信任可能隐藏成员的归档列表输出。
- 新增 AppleDouble、PAX/xattr、gzip metadata、owner 泄露、路径碰撞、特殊类型、摘要篡改及压缩炸弹回归矩阵，并对解包后的文件类型和完整成员闭集做二次验证。

## 0.1.0-rc.1 — 2026-07-27

- 建立提示词型父级监督与独立阶段 Agent 链。
- 正常运行不再依赖独立视觉规格文件。
- 固定 Assets/Pexels 素材阶段。
- Builder、Integrator、Render/Delivery 强制真实加载官方 HyperFrames Skill。
- 新增 macOS 一键安装、用户级 Node.js 引导、官方 HyperFrames 环境准备、Pexels 安全配置和可恢复卸载。
- 新增开源隐私、安全、贡献、支持矩阵与发布门。
