# 支持矩阵

“有真实证据”只表示指定宿主和输入曾完成对应链路，不等于所有机器已验证，也不等于用户已经认可审美。

| 环境 | 当前状态 | 证据边界 |
| --- | --- | --- |
| macOS + Codex | supported | 已有当前提示词架构的真实 SRT 生产和 master 证据；具体机器仍须先运行 doctor |
| macOS + Claude Code | experimental | 安装目标和契约受测试覆盖，尚缺与 Codex 同输入的当前版本端到端对照 |
| macOS 首次安装 | supported installer | 安装器、离线 mock 与安全边界受自动化测试覆盖；硬件、网络和宿主差异仍可能要求人工处理 |
| HyperFrames runtime | 默认；已有当前架构生产证据 | CLI 固定为 `0.7.104`，8 个官方核心 Skill 固定为 commit `c96b30c7174984e684620556ce871a285381ec60`；Builder、Integrator、预览与正式渲染使用这组可复现基线 |
| Remotion runtime | experimental contract only | 仅建立 Shot Recipe、能力分级和适配边界；没有本项目端到端 Remotion 渲染、双端视觉一致性或生产可用证据 |
| Windows | unverified | 保留路径和配置兼容设计；没有真实 Windows 运行证据 |
| 剪映/CapCut 桌面 GUI | unverified | 输出以常见 MP4/MOV 交付为目标；尚未完成当前版本 GUI 实机导入认证 |

稳定版本只冻结公开契约，不会把未完成的环境验证自动提升为 `verified`。Windows 与剪映 GUI 必须保持本表声明，直到取得对应实机证据。

官方 doctor 可能因为 npm 上已有更新版本而把顶层 `ok` 置为 false。只在 doctor 的 `_meta.version` 精确等于本发行包锁定的 `0.7.104`、失败项只是“newer version available”，且 Node、FFmpeg、FFprobe、Chrome 等选中本地渲染事实全部通过时，本项目把它记录为非阻断更新提示；版本不明、版本不符或任何渲染事实失败仍会关闭发布/生产门。

## Runtime adapter 与 Shotcraft 知识层

运行时无关 Shot Recipe 和能力矩阵先冻结语义、时间、素材和适配边界，再由具体后端实现。默认生产路径没有改变，仍为 HyperFrames。

能力状态必须按镜头机制逐项判断：

- `portable`：两个运行时原则上都能实现，但仍需各自实现和验证；
- `native-hyperframes` 或 `native-remotion`：依赖对应运行时特性；
- `interop`：需要预渲染、嵌入或其他显式桥接；
- `unsupported`：当前明确不承诺支持。

这些状态不是完成证明。只有实际适配器、对应运行时检查、渲染产物和对比记录齐全后，才能提升支持状态。尤其不能据此宣称 React 状态、异步行为、第三方组件或任意 Remotion Composition 可以自动转换为 HyperFrames。

本仓库不捆绑或安装 Remotion，实验性契约也不构成 Remotion 授权。使用者须根据 Remotion 官方现行许可判断其具体使用场景。

### `video-shotcraft` 吸收边界

| 项目 | `0.2.0` 状态 | 证据边界 |
| --- | --- | --- |
| 镜头卡目录 | verified data | 152 张卡、209 个全局唯一 style key；目录、来源 commit 与 manifest 由自动化测试核验 |
| 卡片全文 | verified upstream artifact | 每卡与 pinned upstream Markdown byte-identical，并有稳定 ID、上游 URL、本地路径、字节数与 SHA-256；正文可能包含 Remotion/TSX 参考，本 Skill 只将镜头知识作为运行时中立输入消费 |
| 查询 | verified CLI | 支持 stats、list、search 与 card；`--style` 只能随 card 限定卡内 style，只有 card 模式加载卡片全文 |
| 上游代码 | not bundled | 不复制 TSX，不安装 Remotion，不携带上游运行时依赖 |
| 上游媒体 | not bundled | 不复制预览、音频、纹理、字体或其他媒体资产 |
| HyperFrames 组件 | not implied | 152 张知识卡不等于 152 个已经构建、seek 和渲染验证的 HyperFrames 组件 |
| 双端视觉一致性 | unverified | 尚未逐卡完成 Remotion/HyperFrames witness 与关键时间点对比 |

来源固定为 `Vincentwei1021/video-shotcraft@41ee360d82f4c491ba9d88a24a4add7d8ff1cf8b`，library revision 为 `bdd94be16d60fa8f`。适配文本遵循 Apache-2.0，完整许可证随发布包提供；上游未来变化不会在未更新 commit、manifest 和测试的情况下静默进入本仓库。
