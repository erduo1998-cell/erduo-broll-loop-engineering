# Changelog

本项目遵循 Semantic Versioning。稳定版本冻结公开的 Skill、目录、查询与发布包契约；运行时支持等级仍以支持矩阵的实际证据为准。

## Unreleased

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
