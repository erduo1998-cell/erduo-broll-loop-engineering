# Changelog

本项目遵循 Semantic Versioning。稳定版本冻结公开的 Skill、目录、查询与发布包契约；运行时支持等级仍以支持矩阵的实际证据为准。

## Unreleased

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
