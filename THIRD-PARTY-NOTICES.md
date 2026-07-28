# 第三方说明

本仓库原创代码和文档采用 MIT License。以下组件与运行期内容保留各自许可和服务条款。链接与版本最后核对日期：**2026-07-27**。

- [HyperFrames CLI `0.7.72`](https://www.npmjs.com/package/hyperframes/v/0.7.72)，[源仓库](https://github.com/heygen-com/hyperframes)标注 Apache-2.0；运行时通过 `npm ci` 从 npm registry 安装，`skills update`/`skills check` 会访问 GitHub 上的官方 Skill 来源，`browser ensure` 会访问官方浏览器源。本项目不复制其源码，也不冒充官方 Skill。
- [Node.js `v22.23.1` 官方发布目录](https://nodejs.org/download/release/v22.23.1/)，采用 [Node.js License](https://github.com/nodejs/node/blob/v22.23.1/LICENSE) 及分发包内列出的第三方许可证；本项目只在用户机器缺失兼容 Node 时下载，不再分发二进制。
- FFmpeg/FFprobe 遵循 [FFmpeg 法律与许可说明](https://ffmpeg.org/legal.html)及用户所安装版本的配置；可选安装来自 [Homebrew ffmpeg formula](https://formulae.brew.sh/formula/ffmpeg)。本仓库不再分发其二进制。
- Pexels API 与媒体遵循 [Pexels API 文档](https://www.pexels.com/api/documentation/)、[Pexels License](https://www.pexels.com/license/) 和 [Terms of Service](https://www.pexels.com/terms-of-service/)。本仓库不再分发搜索结果或下载素材。
- 用户素材、字体和可控生成素材，权利与许可由用户及对应提供方负责；生产 handoff 应保留来源，不应把私有文件加入公开仓库。

第三方名称仅用于说明互操作和来源，不表示关联、背书或所有权。

本仓库自身不采集或发送遥测。安装与诊断对其启动的 npm、官方 HyperFrames、浏览器检查和可选 Homebrew 子进程强制设置 `HYPERFRAMES_NO_TELEMETRY=1`；如果用户在本发行包之外直接调用 HyperFrames，其网络和隐私行为受 HyperFrames 自身实现与政策约束。

锁文件审查发现 `@google/genai@1.52.0`、`esbuild@0.25.12`、`onnxruntime-node@1.23.2`、`protobufjs@7.6.5` 与 `sharp@0.34.5` 标记了 lifecycle install script。本项目安装命令固定使用 `npm ci --ignore-scripts`，因此这些脚本不会在首次安装中执行；这降低了供应链执行面，但正式发布仍需用受支持 macOS 做 HyperFrames 实际运行验证，确认忽略脚本没有破坏所需本地能力。
