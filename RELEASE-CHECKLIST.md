# 发布检查表

## 公共边界

- [ ] 公共包只含根文档、安装/诊断工具和提示词型 Skill 表面。
- [ ] 不含凭据、用户数据、私人路径、渲染产物、缓存、`node_modules` 或开发历史。
- [ ] 原作者标识、私有样板名和旧工程架构术语静态扫描为零。
- [ ] MIT 与第三方说明完整。
- [ ] 只对最终归档内容重新生成逐文件 SHA-256 清单；不得复用 staging 或历史清单，并在独立解压目录复核。
- [ ] 只使用 `node scripts/package-release.mjs --output <外部绝对路径>` 打包；创建 tar 的子进程显式设置 `COPYFILE_DISABLE=1`，输出纯 ustar 并忽略扩展属性，owner、权限、时间和 gzip header 均通过规范化检查；gzip 必须只有一个 member、footer CRC32/ISIZE 正确且无尾随，每个 tar body padding 全零；Node 原始 tar 解析确认 43 个 regular、精确目录闭集、0 PAX/GNU metadata、0 AppleDouble/symlink/special，内部 42 条摘要 42/42 一致，再完成独立解包复核。
- [ ] README、PRIVACY 与第三方说明明确：本仓库自身无遥测；包外直接调用 HyperFrames 时，其隐私行为受 HyperFrames 自身政策约束。

## 首次运行

- [ ] 在干净 macOS 用户环境双击 `Install.command` 完成。
- [ ] 缺少 Node 时，只下载官方固定 `v22.23.1` 架构归档，内置 arm64/x64 SHA-256 校验通过，且未使用 sudo 或修改 shell profile。
- [ ] 官方 `hyperframes@0.7.72` Skills update/check、browser ensure 与 doctor payload 解析完成。
- [ ] 安装与诊断启动的 npm、官方 HyperFrames、browser 和可选 Homebrew 子进程均强制 `HYPERFRAMES_NO_TELEMETRY=1` 且不继承 `PEXELS_API_KEY`。
- [ ] 安装引导、打包 tar 和生产 Skills 启动的所有非 Pexels 子进程也使用显式环境映射，大小写不敏感地删除全部 Pexels Key 变量变体；不能证明映射时在 spawn 前停止。
- [ ] 网络边界已公开：`npm ci` 访问 npm registry；Skills update/check 访问 GitHub 官方 Skill 来源；browser ensure 访问官方浏览器源。
- [ ] `runtime/package-lock.json` 的根依赖和已锁包均为 `hyperframes@0.7.72`，registry 包 integrity 完整；安装命令是 `npm ci --ignore-scripts --no-audit --no-fund`。
- [ ] runtime lock 拒绝额外根依赖、git/file/link/HTTP、缺失 resolved、非 npm registry HTTPS tarball 和缺失或非法 integrity。
- [ ] FFmpeg 缺失路径只在 Homebrew 已存在并获一次授权时安装，否则清晰返回 action-required。
- [ ] Codex 与 Claude Code 的父 Skill + 七个阶段 Skill 均安装；冲突安装有可恢复备份。
- [ ] Pexels Key 通过隐藏输入或 stdin 配置、真实 API 验证、0600 原子保存，并且未进入 argv、日志或诊断。
- [ ] Pexels 配置读取与写入都拒绝 home 到配置目录链上的任何中间符号链接。
- [ ] 官方 doctor 五个必需本地渲染事实各恰好一次；重复或缺失 payload 被拒绝，顶层 `ok=false` 不会把完整的限定本地渲染事实误判为缺失。
- [ ] 卸载只移除本发行包链接并可恢复备份。
- [ ] 成功卸载后 `install-manifest.json` 已退役，安全 receipt 不含路径；再次卸载明确返回 manifest missing，随后可重新安装。
- [ ] 安装中途失败和 manifest 写入失败均逆序回滚全部本轮 Skill 改动；重装保留首次安装前的备份链。
- [ ] GitHub **Private vulnerability reporting** 已启用，并从公开 Security 页面验证私密入口可用；未满足时阻塞正式发布。

## 生产验证

- [ ] 从本 RC 执行一次全新 Codex 真实 SRT 端到端，完成官方 HyperFrames check、render 和媒体验证。
- [ ] Claude Code 使用同输入独立执行并比较公开交付契约。
- [ ] Assets/Pexels 固定阶段真实运行。
- [ ] Builder、Integrator、Render/Delivery 的官方 HyperFrames Skill 加载有真实宿主 trace。
- [ ] 最终 master 连续覆盖 SRT，分辨率、时长、帧率、音频策略和完整解码符合请求。
- [ ] 用户已观看 master；技术成功没有被表述为审美通过。
- [ ] Windows 与剪映 GUI 保持 `unverified`，除非已有对应实机证据。
