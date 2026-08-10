# 支持矩阵

“有真实证据”只表示指定宿主和输入曾完成对应链路，不等于所有机器已验证，也不等于用户已经认可审美。

| 环境 | 当前状态 | 证据边界 |
| --- | --- | --- |
| macOS + Codex | 当前提示词架构已有真实 forward-test 证据；RC 发布门待完成 | 已有真实 SRT 生产和 master 证据；仍需从本 RC 公开包执行全新用户安装、隐私扫描和最终复核 |
| macOS + Claude Code | 待同输入 RC 对照 | 不把旧架构或复制过期 Skill 的结果算作当前验证 |
| macOS 首次安装 | release candidate | 安装器与离线 mock 已设计；发布前必须在干净用户环境完成真实安装验收 |
| HyperFrames runtime | 默认；已有当前架构生产证据 | Builder、Integrator、预览与正式渲染继续使用官方 HyperFrames Skill 和锁定运行时；真实发布门仍以本表和发布检查表为准 |
| Remotion runtime | experimental contract only | 仅建立 Shot Recipe、能力分级和适配边界；没有本项目端到端 Remotion 渲染、双端视觉一致性或生产可用证据 |
| Windows | unverified | 保留路径和配置兼容设计；没有真实 Windows 运行证据 |
| 剪映/CapCut 桌面 GUI | unverified | 输出以常见 MP4/MOV 交付为目标；尚未完成当前版本 GUI 实机导入认证 |

首次开源只可把实际通过的行提升为 `verified`。Windows 与剪映 GUI 未验证不阻塞首次开源，但必须保持本表声明。

## Runtime adapter foundation

本轮新增内容只定义运行时无关 Shot Recipe 和能力矩阵，目的是先冻结语义、时间、素材和适配边界，再实现具体后端。默认生产路径没有改变，仍为 HyperFrames。

能力状态必须按镜头机制逐项判断：

- `portable`：两个运行时原则上都能实现，但仍需各自实现和验证；
- `native-hyperframes` 或 `native-remotion`：依赖对应运行时特性；
- `interop`：需要预渲染、嵌入或其他显式桥接；
- `unsupported`：当前明确不承诺支持。

这些状态不是完成证明。只有实际适配器、对应运行时检查、渲染产物和对比记录齐全后，才能提升支持状态。尤其不能据此宣称 React 状态、异步行为、第三方组件或任意 Remotion Composition 可以自动转换为 HyperFrames。

本仓库不捆绑或安装 Remotion，实验性契约也不构成 Remotion 授权。使用者须根据 Remotion 官方现行许可判断其具体使用场景。本轮没有吸收第三方镜头卡，也没有把第三方预览当作本项目能力证据。
