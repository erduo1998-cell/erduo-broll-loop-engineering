# 第三方说明

本仓库原创代码和文档采用 MIT License。以下组件与运行期内容保留各自许可和服务条款。链接与版本最后核对日期：**2026-08-10**。

## 随发布包分发的适配内容

- [`Vincentwei1021/video-shotcraft`](https://github.com/Vincentwei1021/video-shotcraft)，固定来源 commit `41ee360d82f4c491ba9d88a24a4add7d8ff1cf8b`、library revision `bdd94be16d60fa8f`，采用 Apache License 2.0。
- 本仓库按 byte-identical 方式收录该固定版本的 152 张上游 Markdown 卡片原文；另外生成带 `adaptationNotice` 的 catalog、209 个 style 索引、查询器和完整性 manifest。生成的适配元数据保留上游路径、pinned commit URL 与稳定来源字段。
- 本仓库不复制上游 TSX、Remotion 工程、预览图片/视频、音频、纹理、字体或其他媒体；镜头机制描述也不表示已取得这些外部媒体的再分发权。
- Apache License 2.0 完整文本随包保存在 [`third_party/licenses/video-shotcraft-APACHE-2.0.txt`](third_party/licenses/video-shotcraft-APACHE-2.0.txt)。卡库内部的 [`upstream-attribution.md`](erduo-hyperframes-broll/references/shotcraft/upstream-attribution.md) 用于研究溯源；机器可核对的文件闭集由 `manifest.json` 提供。

除 Apache-2.0 明示授予的权利外，第三方名称与商标不因此获得额外授权。卡片正文是上游原文；本项目生成的 catalog、manifest 和工作流适配不应被误认为上游原始实现或官方背书。

## 运行时、工具与服务

- [HyperFrames CLI `0.7.104`](https://www.npmjs.com/package/hyperframes/v/0.7.104)，[源仓库](https://github.com/heygen-com/hyperframes)标注 Apache-2.0；安装器固定源码 commit `c96b30c7174984e684620556ce871a285381ec60`，通过 exact-SHA shallow fetch 取得 8 个官方核心 Skill，在隔离 HOME 中安装、验证后保存应用自有副本并链接给宿主。本仓库的发布包不预装这些上游文件，也不把它们冒充为本项目原创 Skill。
- [`skills@1.5.22`](https://www.npmjs.com/package/skills/v/1.5.22) 采用 MIT；它与 HyperFrames 通过 `npm ci` 从 npm registry 按完整性锁安装。Skills CLI 只在隔离 staging 中把固定 HyperFrames 来源整理成可验证的核心 Skill 闭集，不直接写用户真实 HOME。
- [Node.js `v22.23.1` 官方发布目录](https://nodejs.org/download/release/v22.23.1/)，采用 [Node.js License](https://github.com/nodejs/node/blob/v22.23.1/LICENSE) 及分发包内列出的第三方许可证；本项目只在用户机器缺失兼容 Node 时下载，不再分发二进制。
- FFmpeg/FFprobe 遵循 [FFmpeg 法律与许可说明](https://ffmpeg.org/legal.html)及用户所安装版本的配置；可选安装来自 [Homebrew ffmpeg formula](https://formulae.brew.sh/formula/ffmpeg)。本仓库不再分发其二进制。
- Pexels API 与媒体遵循 [Pexels API 文档](https://www.pexels.com/api/documentation/)、[Pexels License](https://www.pexels.com/license/) 和 [Terms of Service](https://www.pexels.com/terms-of-service/)。本仓库不再分发搜索结果或下载素材。
- 用户素材、字体和可控生成素材，权利与许可由用户及对应提供方负责；生产 handoff 应保留来源，不应把私有文件加入公开仓库。

第三方名称仅用于说明互操作和来源，不表示关联、背书或所有权。

本仓库自身不采集或发送遥测。安装与诊断对其启动的 npm、官方 HyperFrames、浏览器检查和可选 Homebrew 子进程强制设置 `HYPERFRAMES_NO_TELEMETRY=1`；如果用户在本发行包之外直接调用 HyperFrames，其网络和隐私行为受 HyperFrames 自身实现与政策约束。

首次安装的明确网络边界包括：从 npm registry 安装锁定依赖；从 GitHub 精确拉取固定 commit 以整理并校验 8 个官方 Skill；运行 HyperFrames `browser ensure` 时从其官方浏览器源取得所需浏览器；以及用户主动选择时通过 Homebrew 安装 FFmpeg。发布包外直接使用 HyperFrames 的其他网络行为受 HyperFrames 自身实现与政策约束。

锁文件审查发现 `@google/genai@1.52.0`、`esbuild@0.25.12`、`onnxruntime-node@1.21.1` 与 `protobufjs@7.6.5` 标记了 lifecycle install script。本项目安装命令固定使用 `npm ci --ignore-scripts`，因此这些脚本不会在首次安装中执行；这降低了供应链执行面，但正式发布仍需用受支持 macOS 做 HyperFrames 实际运行验证，确认忽略脚本没有破坏所需本地能力。
