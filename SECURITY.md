# 安全策略

## 支持范围

安全修复优先覆盖最新发布版和当前候选版。旧版本可能只收到升级建议。

## 报告漏洞

当前 staging 候选尚未配置可公开引用的私密漏洞报告入口，因此这是正式发布阻塞项。在 GitHub 仓库启用 **Private vulnerability reporting** 并从公开仓库 Security 页面验证入口之前，不得发布正式 Release，也不得声称已有私密报告渠道。

入口启用后，请只通过仓库 Security 页的私密报告按钮提交，不要在公开 Issue 中披露可利用细节、Key、Cookie、私人媒体或本机路径。报告应包含受影响版本、影响、最小复现和建议缓解方式。

## 安全边界

- 安装器不使用 `sudo`，不修改 shell profile，不静默覆盖已有 Skill。
- Node.js 引导固定为官方 `v22.23.1`，归档文件名是安装器常量，并使用内置的 arm64/x64 SHA-256 校验；远程清单不能决定下载文件名或信任值。
- 每次需要用户级 Node 时都新建唯一的版本、架构和 digest 目录并执行本轮刚验证的副本；旧 app-local Node 仅保留，不复用。
- HyperFrames 固定为 `0.7.104`，完整 npm lock 与 registry integrity 随仓库发布，并用 `npm ci --ignore-scripts` 安装在用户应用数据目录。
- runtime lock 的根依赖闭集只能包含固定版 HyperFrames 与 Skills CLI；每个非根包都必须是 npm registry HTTPS tarball 且带合法 SHA-512 integrity，git、file、link、HTTP 和缺失 resolved 会失败关闭。
- 发布包只允许单 member、无尾随、CRC32/ISIZE 正确的规范化 gzip + 纯 ustar：压缩文件先经 regular-file、大小和短读检查；gzip 可选 metadata、PAX/GNU metadata、扩展属性、ACL、非固定 owner/mode/mtime、非零 body padding、AppleDouble、链接和特殊文件全部失败关闭。
- Pexels Key 只能从环境变量、标准输入或隐藏交互进入；不接受 argv 中的 Key。
- 非 Pexels 子进程使用显式环境映射，按大小写不敏感规则删除所有 `PEXELS_API_KEY` 变体并默认关闭 telemetry；不能证明隔离时不启动子进程。
- 配置目录使用用户权限，配置文件以 `0600` 原子替换；读写前都验证从用户 home 到配置目录的完整非符号链接目录链。
- 诊断输出不包含真实 home 前缀、原始环境、凭据或外部命令原始输出。
- 官方 doctor 的五个本地渲染必需事实必须各恰好出现一次；顶层状态与限定的本地渲染 readiness 分别报告。
- 项目不自动安装 Homebrew；FFmpeg 只在 Homebrew 已存在且用户明确授权时安装。
- manifest 必须通过八个 Skill、两个宿主根、当前发行源和受控备份目录的严格路径校验；重复目标或越界记录会使卸载停止。
- 卸载只删除本安装器记录且仍指向本发行包的符号链接，包括已悬空但链接文本仍由本安装器所有的链接；不同目标和普通目录不会被删除。
- Skill 链接安装和 manifest 提交属于一个回滚事务；重装继承最初的可恢复备份链。
- 成功卸载后安装 manifest 会被删除，并只保留不含本机路径的最小 receipt。
- 正式归档只能由显式白名单打包器创建；未知文件、符号链接、媒体、SRT、环境文件、凭据形态内容或私有绝对路径都会阻断。

安装与诊断没有创作、审美或质量放行权。成片仍必须经过官方 HyperFrames 检查、媒体验证和用户观看。
