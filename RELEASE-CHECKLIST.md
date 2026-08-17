# 发布检查表

## 公共边界

- [ ] 公共包只含根文档、安装/诊断工具、提示词型 Skill 表面、manifest 明确列出的 Shotcraft 文本知识库，以及原创 craft catalog/归因边界。
- [ ] 不含凭据、用户数据、私人路径、渲染产物、缓存、`node_modules` 或开发历史。
- [ ] 私有样板名、旧工程架构术语和未声明来源静态扫描为零；Shotcraft 来源标识只出现在允许的归因与目录字段。
- [ ] MIT、第三方说明与 `third_party/licenses/video-shotcraft-APACHE-2.0.txt` 完整。
- [ ] `auto-motion` clean-room 边界绑定审计 commit `17ead629d010f7e5495f645d46fafd6876482c32` 和“审计时无 LICENSE”事实；归因 manifest、发布包与静态扫描证明没有复制其代码、Prompt、Skill、范例、素材或文字。
- [ ] 只对最终归档内容重新生成逐文件 SHA-256 清单；不得复用 staging 或历史清单，并在独立解压目录复核。
- [ ] 分别使用 `node scripts/package-release.mjs --profile full --output <外部绝对路径>` 与 `--profile standard` 生成完整环境包和标准 Skill 包；创建 tar 的子进程显式设置 `COPYFILE_DISABLE=1`，输出纯 ustar并忽略扩展属性，owner、权限、时间和 gzip header 均通过规范化检查；gzip 必须只有一个 member、footer CRC32/ISIZE 正确且无尾随，每个 tar body padding 全零；Node 原始 tar 解析确认 regular member 精确闭集、0 PAX/GNU metadata、0 AppleDouble/symlink/special，内部摘要逐条一致，再完成独立解包复核。
- [ ] 标准 Skill 包不含 `Install.command`、runtime lock、安装/卸载脚本、测试夹具或发布工具；完整环境包也不携带测试夹具和发布工具。两包中的 `erduo-broll-loop-engineering/` 全部文件哈希逐项一致。
- [ ] README、PRIVACY 与第三方说明明确：本仓库自身无遥测；包外直接调用 HyperFrames 时，其隐私行为受 HyperFrames 自身政策约束。
- [ ] 宿主无环境映射注入能力时，bundled `safe-spawn.mjs` 的 no-log、大小写碰撞拒绝、Pexels Key 全变体移除、`shell: false` 与退出码传递均通过真实子进程回归。

## 首次运行

- [ ] 在干净 macOS 用户环境双击 `Install.command` 完成。
- [ ] 缺少 Node 或现有版本低于 `22.20.0` 时，只下载官方固定 `v22.23.1` 架构归档，内置 arm64/x64 SHA-256 校验通过，且未使用 sudo 或修改 shell profile。
- [ ] 官方 `hyperframes@0.7.104` exact-SHA Skill staging/check、browser ensure 与 doctor payload 解析完成。
- [ ] 安装与诊断启动的 npm、官方 HyperFrames、browser 和可选 Homebrew 子进程均强制 `HYPERFRAMES_NO_TELEMETRY=1` 且不继承 `PEXELS_API_KEY`。
- [ ] 安装引导、打包 tar 和生产 Skills 启动的所有非 Pexels 子进程也使用显式环境映射，大小写不敏感地删除全部 Pexels Key 变量变体；不能证明映射时在 spawn 前停止。
- [ ] 网络边界已公开：`npm ci` 访问 npm registry；exact-SHA shallow fetch 访问 GitHub 官方 Skill 来源；browser ensure 访问官方浏览器源。
- [ ] `runtime/package-lock.json` 的根依赖只包含 `hyperframes@0.7.104` 与 `skills@1.5.22`，registry 包 integrity 完整；安装命令是 `npm ci --ignore-scripts --no-audit --no-fund`。
- [ ] runtime lock 拒绝额外根依赖、git/file/link/HTTP、缺失 resolved、非 npm registry HTTPS tarball 和缺失或非法 integrity。
- [ ] 固定 HyperFrames commit 已核验；第三方 Skills CLI 只写隔离 HOME；staged store 精确闭合 8 个核心 Skill且无 symlink/special file；官方 check 显式绑定 `--dir` 与 `--source`。
- [ ] doctor 的版本更新提示只在 `_meta.version` 精确命中锁定版本时降为非阻断；版本不明/不符以及 Node、FFmpeg、FFprobe、Chrome 任一失败仍关闭。
- [ ] 8 个官方 Skill 与父 Skill + 十三个阶段 Skill 共用一次占用确认、备份、链接、manifest schema 5 commit 和失败逆序回滚事务；升级能读取历史 schema 1/2/3/4、只退休匹配所有权的旧父 Skill 名称，并保留或恢复初始备份链。
- [ ] FFmpeg 缺失路径只在 Homebrew 已存在并获一次授权时安装，否则清晰返回 action-required。
- [ ] Codex 与 Claude Code 的父 Skill + 十三个阶段 Skill 均安装；冲突安装有可恢复备份。
- [ ] Pexels Key 通过隐藏输入或 stdin 配置、真实 API 验证、0600 原子保存，并且未进入 argv、日志或诊断。
- [ ] Pexels 配置读取与写入都拒绝 home 到配置目录链上的任何中间符号链接。
- [ ] 官方 doctor 五个必需本地渲染事实各恰好一次；重复或缺失 payload 被拒绝，顶层 `ok=false` 不会把完整的限定本地渲染事实误判为缺失。
- [ ] 卸载只移除本发行包链接并可恢复备份。
- [ ] 成功卸载后 `install-manifest.json` 已退役，安全 receipt 不含路径；再次卸载明确返回 manifest missing，随后可重新安装。
- [ ] 安装中途失败和 manifest 写入失败均逆序回滚全部本轮 Skill 改动；重装保留首次安装前的备份链。
- [ ] GitHub **Private vulnerability reporting** 已启用，并从公开 Security 页面验证私密入口可用；未满足时阻塞正式发布。

## 生产验证

- [ ] `1.0.0` 保留 Director、Assets 与多 Builder 的创作分工；没有另建 fast pipeline，没有把镜头或共享视觉母体改成固定模板，也没有新增抽象比例、固定构图、最少视觉机制或复杂度评分。
- [ ] Director 默认把完整语义镜头控制在约 5–12 秒；超过 15 秒时有内容持续发展的必要性。没有按字幕行机械切碎，也没有用背景循环或巨型文字冒充长镜头发展。
- [ ] Runtime Plan v3 把 shot 与 authoring unit 分开：普通约 180 秒单后端样本规划为目标 2–3 个 Builder，一个 unit 可含约 5–8 个普通短镜头；复杂、独占、后端边界和 live transition 例外不被强行合并。
- [ ] 三个代表场景精确覆盖 opening、information-dense、late，并记录选择理由及构图、文字、材质、运动问题；不是机械取前三镜。
- [ ] Lead Builder 交付三个真实动态场景及每实际后端可导入的共享视觉源码；Hybrid 只共享运行时中立 token，不跨后端复用实现源码。
- [ ] `visual-lock.json` 绑定代表场景、visual token、字体/资产、共享源码身份、Director 具体见证与用户 approve/revise/skip。未批准且未明确 skip 时，普通 Builder fan-out 被拒绝；skip 风险被记录。
- [ ] 图解只在口播需要看清具体关系时按需选择；8 种 grammar 通过紧凑 catalog 查询，发行包不复制上游完整 Skill、模板、示例、脚本、动画控制器或视觉皮肤。
- [ ] `diagram-*` 镜头在每个 readable hold 提供真实运行时 `diagramFrames`；测试证明缺失证据、连线穿过无关节点、标签压线/压节点、共享连线路径和画面越界会失败。
- [ ] Director 先记录每镜口播含义、画面任务和第一眼重点，再自由完成视觉设计；这些字段保持紧凑，不形成新的长篇交接文档。
- [ ] 环境检查、运行时规划、任务分发、结构校验、片段拼接、预览准备和技术验证均由 Parent 直接运行脚本，正常生产不启动 Runtime Planner、Integrator 或 Render Agent；对应旧阶段 Skill 只用于读取历史记录。
- [ ] 每个 Builder 单元同时交付可编辑源码与统一规格、身份和时间均已验证的视频片段；最终脚本只拼接视频片段，不直接合并任意双后端源码。
- [ ] 普通单后端 unit 默认冻结为 H.264 MP4（`libx264 / medium / CRF 12 / yuv420p / fixed GOP`），不产生默认 FFV1 `yuv444p10le`；FFV1 只有显式 lossless upgrade 和非空原因。
- [ ] 短 codec fixture 证明默认 H.264 与显式 FFV1 均可完整解码，H.264 concat 连续；它只证明媒体合同，不冒充长片速度或审美证据。
- [ ] preview 输出不超过 1080p，并固定使用 `veryfast / CRF 22`；preview identity 精确绑定 runtime plan（含 representative-scenes 身份）、visual lock、对应后端 shared-source identities、narrative envelope、visual system、全部 shot contracts 和冻结片段 hashes。
- [ ] deliver 必须重新提供 `--plan`、`--narrative-envelope`、`--visual-system` 和全部 `--contract`；缺失、重复、不属于 plan、内容漂移或片段 hash 漂移均失败关闭。CLI 输入顺序不作为身份，脚本按 plan 的实际顺序装配。
- [ ] deliver 从冻结片段重新生成请求完整规格的 `medium / CRF 16` Master；测试明确证明没有复制、重命名或复用 preview 文件作为 Master。
- [ ] 同一生产任务只保留一份共享素材库和每种精确依赖身份的一份工具链；Builder 单元不含完整工程、全部素材、无关镜头或完整生产历史。
- [ ] 多 Builder 按工作量分担完整镜头；返工由原责任 Builder 定点完成，不创建继承完整历史的替代 Builder。
- [ ] 每个计划动画节拍都能在对应时间看到主体、空间、大小、层级、材料、关系或视觉重点的发展；只有装饰线条、粒子或背景循环运动的反例被拒绝。
- [ ] 至少一个长镜头夹具证明画面会随语义持续发展；创作规则不规定动画每几秒变化、固定节拍数量或固定构图模板。检测可以使用公开、经过测试的长段风险阈值，只用于发现未声明静止，不作为审美标准。
- [ ] visual lock 与完整动态 preview 是两个明确且不同的用户决定：前者放行批量生产，后者放行正式交付；任何脚本或自动检查都没有宣称动画高级、隐喻有效或整体审美已经通过。
- [ ] motion/layout 默认只采样 Recipe beat 边界、readable hold、切点和必要点；异常窗口、精密 connector/path、Canvas/WebGL 或用户明确要求才升级高密度 trace。正常样本不生成全片逐帧 PNG，既有负例仍能定位。
- [x] `production-metrics.json` 已用一次生产目录扫描和已有事件/receipt/manifest 事实记录阶段耗时、Agent 调用、unit、文件/字节、render/trace/full-decode/hash、失败/重试；宿主 Token 为 unknown，full-history 子 Agent 为 0。公开事实见 `docs/V1.0.0-BENCHMARK.md`。
- [ ] `0.8.0` 三项核心变化有真实证据：正常生产 Onboarding Agent 为 0；motion-layout 通过时不产生默认抽帧；父默认和三条路线 Prompt 代理达到冻结结果。
- [ ] `node scripts/measure-context.mjs --baseline v0.7.0 --current v0.8.0` 与 `docs/V0.8.0-CONTEXT-MEASUREMENT.json` 一致：父默认 `95.89%`、HyperFrames `79.93%`、Remotion `79.87%`、Hybrid `82.58%`；这是冻结 tag 的 bytes 代理，不冒充当前工作树或真实 token/I-O。
- [ ] 真实限制已公开：代码不能证明故事、重量、弧线、夸张或 appeal；HyperFrames 无 geometry hook 时标记 `unmeasured`；Remotion 真捕获依赖目标项目本地浏览器/精确依赖；不声明双端视觉一致。
- [x] 已用指定 IP Strategist 同一 SRT 和全新 production root 完成一次 Codex 真实端到端：Lead `62.90` 分钟和首次完整 preview 约 `242.05` 分钟，两个时间目标未通过；目录 `156,980 KiB`、`213` 个文件，两个规模目标通过。详见 `docs/V1.0.0-BENCHMARK.md`。
- [x] 公开报告已区分 Director/Assets/Lead/production Builders/返修、外部素材、PNG/video、目录扫描、render/trace/decode/hash 与 Token unknown；preview/Master 身份和完整解码已复核。用户 visual lock 为 `skipped`，没有写成 approved。
- [ ] Claude Code 使用同输入独立执行并比较公开交付契约；未完成前保持 pending，不把 Codex 结果外推到 Claude Code。
- [ ] Assets 按 v2 shot-specific material need 条件触发：空 material need 的纯原生 MG 没有 Pexels/生成调用；需要普通媒体时真实运行所选来源路线并保留来源、权利、hash、裁切、字体和 fusion geometry。
- [ ] HyperFrames Builder 的官方 HyperFrames Skill 加载有真实宿主 trace；片段验证、拼接与交付脚本有可重复运行证据。
- [x] 最终 master 连续覆盖 `179.866` 秒 SRT，为 `2880 × 2160`、30 fps、静音 H.264，完整解码通过；本次静音生产未测试音画同步。
- [ ] 用户已观看绑定 plan/contracts/media identity 的 preview 并明确批准正式交付；技术成功没有被表述为审美通过。
- [ ] Windows 与剪映 GUI 保持 `unverified`，除非已有对应实机证据。

## Runtime adapter 与 Shotcraft 知识层

- [ ] Narrative envelope、shared visual system、representative scenes、Shot Recipe v3、Runtime Plan v3、visual lock、能力矩阵、运行时映射文档与零依赖校验器均通过确定性校验；枚举、必填字段、时间包含关系、唯一 ID、artifact/source identity 和引用闭集无漂移。
- [ ] Shot Recipe v1/v2 与 Runtime Plan v1/v2 fixture 继续通过 read compatibility；旧 run 不追溯迁移，版本混用、版本伪装和 identity drift 失败关闭。
- [ ] Runtime selector 遵循显式选择优先、既有项目证据识别、双信号停止和空白新项目默认 auto；目录名不作为判断依据。
- [ ] Parent 直接运行 `plan-runtime.mjs`；脚本只按 capability 与 exact pattern/backend evidence 决策，逐镜选择、按连续性/后端/素材/复杂度聚合，并确定性生成每个完整镜头恰好一次的 `authoringUnits` 与最小 Builder 任务包；v3 不再有普遍 1–3 镜/40 秒上限，validator 仍拒绝 gap/overlap、跨后端、越界、冲突和 identity drift。
- [ ] Hybrid Builder 输出统一片段 schema；validator 核验实际 hash、profile/audio、FFprobe/full decode、plan closure；最终脚本只拼接片段，禁止实时嵌套或源码互导。
- [ ] 正常生产只运行缓存式轻量 preflight，Onboarding Agent 调用数为 0；缓存缺失、安装身份变化或真实工具故障才进入定点诊断。
- [ ] 初始 Runtime Router 保持只读且不执行项目本地 CLI；Remotion 项目依赖由 targeted preflight 按 package/lock/local CLI 身份验证，缺失时返回项目修复，不触发全量环境审计。
- [ ] Remotion Builder 是独立制作路线并交付源码与已验证片段；目标项目的 `remotion`、`@remotion/cli` 声明、共享工具链收据、安装版本与 local CLI 必须精确一致，失败时不偷偷切回 HyperFrames。
- [ ] 多 Remotion 单元只隔离源码与证据：相同依赖身份只执行一次 `npm ci` 并共享一份工具链；不同依赖身份各自隔离；安装、typecheck、浏览器捕获和渲染的并发实测不超过 2。
- [ ] 发行版不硬编码单一 Remotion 版本；新项目解析一个稳定版本后精确锁定，既有项目保留通过证据门的精确 lock；`latest`、range 和网络下载式 `npx` 均不能进入生产证据。
- [ ] `effects.dom-pixel-postprocess` 必须确定性路由到 Remotion，并由同一 package lock、Chrome 和 GL 后端的真实 HTML-in-canvas still canary 放行；WebGPU、嵌套捕获和 silent fallback 保持拒绝。
- [ ] 本仓库安装器和 runtime lock 不包含 Remotion；不得使用全局 Remotion 或允许临时下载的 `npx` 作为 readiness 证据。
- [ ] README、支持矩阵和 Skill 表面均没有把独立双后端误称为自动互转、双端视觉一致或任意既有工程兼容。
- [ ] Remotion 边界明确：项目本地使用不等于本仓库代为授权；使用者按 Remotion 官方现行许可判断自身场景。
- [ ] `catalog.json` 固定上游 URL、commit `41ee360d82f4c491ba9d88a24a4add7d8ff1cf8b`、library revision `bdd94be16d60fa8f` 与 Apache-2.0，并精确记录 152 张卡、209 个全局唯一 style key。
- [ ] `manifest.json` 精确覆盖 catalog、归因文件和 152 张卡；每项 target、bytes 与 SHA-256 对实际 regular file 复算一致，且不存在 manifest 外卡片或卡片外 manifest 条目。
- [ ] 卡片 name、文件路径和 catalog 引用一一对应；上游 source 与本地 localSource 均通过路径闭集验证。
- [ ] 查询脚本的 stats、list、search 保持小型摘要，只允许 card 模式输出一张卡片全文；`--style` 只能随 `--card` 限定卡内 style，不存在一次输出完整卡库的默认路径。
- [ ] 发布包包含 catalog、manifest、查询脚本、归因文件、152 张文本卡、Remotion source manifest 精确声明的源码子集和完整 Apache-2.0 文本；不含 manifest 外 TSX、预览媒体、音频、字体或运行时依赖。
- [ ] README、支持矩阵和 Skill 表面均明确：152 张卡片是可检索的运行时无关知识，不是 152 个已验证 HyperFrames 组件，也不代表完成 Remotion/HyperFrames 双端一致性。
- [ ] 原创 craft catalog、attribution manifest 与查询器进入发布闭集；summary/category/search 保持紧凑，只有显式 entry 读取一个完整条目，且不存在 Builder 默认加载全 catalog 的路径。
- [ ] HyperFrames Builder 真实加载锁定官方 `hyperframes`、`hyperframes-creative` 与 `hyperframes-animation` 并 reuse-first；Remotion Builder 只复用本项目已有真实 witness 的 primitive，否则原生实现。两者均先完成 hero frame，再编排有限的可见 micro-beats，不产生新的审查或审批 artifact。
- [ ] Builder 输入只包含自己的 authoring unit、相邻接缝摘要、共享 narrative/visual locators、冻结素材/字体、capability evidence 与实际命中的 0–2 份参考；没有全片 Recipe、完整 Shotcraft 或完整 craft catalog。
- [ ] Remotion 后段至少通过目标项目精确依赖、共享工具链、local CLI、Composition 注册、类型检查、motion-layout 代码筛查、唯一完整动态 preview、正式 render 与 ffprobe 契约；仅 lint 异常生成定点帧/短片。

## 正式发布与回滚

- [ ] 用冻结的同一份 12–15 秒中文 SRT、相同画幅/fps/字幕/音频政策、相同素材和外部服务授权比较 `v0.7.0` 与当前版本第一次完整预览；禁止先按对比结果精修当前版再称为 first pass。
- [ ] benchmark 记录预览 locator、实际 agents/authoring units、墙钟时间、实际可得 token/Agent I-O，并运行 `npm run measure:context -- --baseline v0.7.0` 留存确定性 Prompt 代理。
- [ ] 历史基线如实保留：`v0.7.0` Director + Builder I/O 只减少 `5.20%`，handoff prose 减少 `73.59%`；当前版另行报告整体与 Director+Builder 实测，不得用 Prompt 文件大小冒充实际 Agent I-O。
- [ ] benchmark 与生产链没有新增 Agent 类型、独立视觉审查 Agent、逐镜停点或审美评分；Lead Builder 仍使用现有 Builder Skill。只有三场景 visual lock 与最终 composition preview 两个默认用户 gate。
- [ ] `package.json`、`runtime/package.json`、`runtime/package-lock.json` 根版本与 `scripts/lib.mjs` 全部为当前发布版本。
- [ ] README 五种语言、CHANGELOG、支持矩阵、仓库 Skill、本机已安装 Skill、安装收据与发布归档均显示 `1.0.0`；`0.9.x` 只出现在明确的历史或兼容章节，不再代表当前版本。
- [ ] `npm test`、Skill quick validation 和确定性发布包验证均通过，CI workflow 只运行可在公开 clone 中重现的命令。
- [ ] Remotion DOM trace 夹具的 lockfile 与 E2E 安装只使用官方 `https://registry.npmjs.org`，不继承维护者本机第三方镜像。
- [ ] 发布 commit、tag 与归档 SHA-256 已记录；远端 tag 只指向审过的发布 commit。
- [ ] 回滚路径已演练：未合并时删除功能分支；合并后 revert 发布 commit；已发布版本不移动 tag，以补丁版本修复并保留旧归档。
