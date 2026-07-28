# 参与贡献

欢迎修正文档、改善跨宿主兼容性、补充真实测试证据和优化提示词判断。

## 基本原则

- 保持父级只监督、子 Agent 独立生产。
- 所有阶段 Skill 保持提示词型，不加入项目自定义创作脚本、视觉分析器、schema 或机械质量 gate。
- Assets/Pexels 不得被跳过。
- Builder、Integrator、Render/Delivery 必须真实加载官方 HyperFrames Skill。
- 正常运行不得依赖 `design.md`。
- 不提交 API Key、Cookie、私人路径、用户 SRT、视频、素材、成片、缓存或主机日志。
- 不把 Windows、Claude Code 或剪映 GUI 标为已验证，除非提交可复核的真实证据。

## 提交流程

1. 从独立分支修改。
2. 运行 `npm test`；该命令只使用临时目录和 mock 外部命令。
3. 检查 `git diff --check`。
4. 如果更改安装或首次运行，附上全新临时 HOME 的测试结果。
5. 如果更改生产提示，附上同一输入的真实宿主产物和限制说明；不要只给自述。

问题与 PR 应说明：宿主、macOS 版本、CPU 架构、Node 版本、HyperFrames 版本、最小复现、预期结果和已脱敏事实。不要粘贴完整环境变量或未脱敏日志。
