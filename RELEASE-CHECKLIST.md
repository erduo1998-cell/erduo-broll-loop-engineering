# 发布检查表

## 公共边界

- [ ] 公共包只含根文档、安装/诊断工具、提示词型 Skill 表面和 manifest 明确列出的 Shotcraft 文本知识库。
- [ ] 不含凭据、用户数据、私人路径、渲染产物、缓存、`node_modules` 或开发历史。
- [ ] 私有样板名、旧工程架构术语和未声明来源静态扫描为零；Shotcraft 来源标识只出现在允许的归因与目录字段。
- [ ] MIT、第三方说明与 `third_party/licenses/video-shotcraft-APACHE-2.0.txt` 完整。
- [ ] 只对最终归档内容重新生成逐文件 SHA-256 清单；不得复用 staging 或历史清单，并在独立解压目录复核。
- [ ] 只使用 `node scripts/package-release.mjs --output <外部绝对路径>` 打包；创建 tar 的子进程显式设置 `COPYFILE_DISABLE=1`，输出纯 ustar 并忽略扩展属性，owner、权限、时间和 gzip header 均通过规范化检查；gzip 必须只有一个 member、footer CRC32/ISIZE 正确且无尾随，每个 tar body padding 全零；Node 原始 tar 解析确认 regular member 精确闭集、0 PAX/GNU metadata、0 AppleDouble/symlink/special，内部摘要逐条一致，再完成独立解包复核。成员数量从白名单与 Shotcraft manifest 推导，不在文档中硬编码旧版本计数。
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
- [ ] 8 个官方 Skill 与 11 个本项目 Skill 共用一次占用确认、备份、链接、manifest schema 4 commit 和失败逆序回滚事务；升级能读取历史 schema 1/2/3、只退休匹配所有权的旧父 Skill 名称，并保留或恢复初始备份链。
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

- [ ] 从本版本执行一次全新 Codex 真实 SRT 端到端，完成官方 HyperFrames check、render 和媒体验证。
- [ ] Claude Code 使用同输入独立执行并比较公开交付契约。
- [ ] Assets/Pexels 固定阶段真实运行。
- [ ] Builder、Integrator、Render/Delivery 的官方 HyperFrames Skill 加载有真实宿主 trace。
- [ ] 最终 master 连续覆盖 SRT，分辨率、时长、帧率、音频策略和完整解码符合请求。
- [ ] 用户已观看 master；技术成功没有被表述为审美通过。
- [ ] Windows 与剪映 GUI 保持 `unverified`，除非已有对应实机证据。

## Runtime adapter 与 Shotcraft 知识层

- [ ] Shot Recipe schema、能力矩阵、运行时映射文档与零依赖 Recipe 校验器均通过确定性校验，枚举、必填字段、时间包含关系、唯一 ID 和引用闭集无漂移。
- [ ] Runtime selector 遵循显式选择优先、既有项目证据识别、双信号停止和空白新项目默认 auto；目录名不作为判断依据。
- [ ] Runtime Planner 只按 capability 与 exact pattern/backend evidence 决策，逐镜选择、相邻聚合；schema validator 拒绝 gap/overlap、冲突和 identity drift。
- [ ] Hybrid Builder 输出 frozen block schema；validator 核验实际 hash、profile/audio、FFprobe/full decode、plan closure；Integrator/Render 禁止实时嵌套或源码互导。
- [ ] Base Onboarding 不盲目准备两套后端；targeted Onboarding 只检查 planner 的 requiredBackends。
- [ ] 初始 Runtime Router 保持只读且不执行项目本地 CLI；只有获得 Remotion 修复与本地执行授权后的 fresh Onboarding repair Agent 才使用 `--probe-cli`，并记录非只读执行事实与最小 allowlist 子环境。
- [ ] Remotion Build/Integrate/Render 是独立后段；目标项目的 `remotion`、`@remotion/cli` 声明、安装版本与 local CLI 必须精确一致，失败时不偷偷切回 HyperFrames。
- [ ] 本仓库安装器和 runtime lock 不包含 Remotion；不得使用全局 Remotion 或允许临时下载的 `npx` 作为 readiness 证据。
- [ ] README、支持矩阵和 Skill 表面均没有把独立双后端误称为自动互转、双端视觉一致或任意既有工程兼容。
- [ ] Remotion 边界明确：项目本地使用不等于本仓库代为授权；使用者按 Remotion 官方现行许可判断自身场景。
- [ ] `catalog.json` 固定上游 URL、commit `41ee360d82f4c491ba9d88a24a4add7d8ff1cf8b`、library revision `bdd94be16d60fa8f` 与 Apache-2.0，并精确记录 152 张卡、209 个全局唯一 style key。
- [ ] `manifest.json` 精确覆盖 catalog、归因文件和 152 张卡；每项 target、bytes 与 SHA-256 对实际 regular file 复算一致，且不存在 manifest 外卡片或卡片外 manifest 条目。
- [ ] 卡片 name、文件路径和 catalog 引用一一对应；上游 source 与本地 localSource 均通过路径闭集验证。
- [ ] 查询脚本的 stats、list、search 保持小型摘要，只允许 card 模式输出一张卡片全文；`--style` 只能随 `--card` 限定卡内 style，不存在一次输出完整卡库的默认路径。
- [ ] 发布包包含 catalog、manifest、查询脚本、归因文件、152 张文本卡、Remotion source manifest 精确声明的源码子集和完整 Apache-2.0 文本；不含 manifest 外 TSX、预览媒体、音频、字体或运行时依赖。
- [ ] README、支持矩阵和 Skill 表面均明确：152 张卡片是可检索的运行时无关知识，不是 152 个已验证 HyperFrames 组件，也不代表完成 Remotion/HyperFrames 双端一致性。
- [ ] Remotion 后段至少通过目标项目精确依赖、local CLI、Composition 注册、类型检查、stills/preview、正式 render 与 ffprobe 契约；跨后端视觉对比仍须另行留存 witness 才能声明。

## 正式发布与回滚

- [ ] `package.json`、`runtime/package.json`、`runtime/package-lock.json` 根版本与 `scripts/lib.mjs` 全部为 `0.5.0`。
- [ ] `npm test`、Skill quick validation 和确定性发布包验证均通过，CI workflow 只运行可在公开 clone 中重现的命令。
- [ ] 发布 commit、tag 与归档 SHA-256 已记录；远端 tag 只指向审过的发布 commit。
- [ ] 回滚路径已演练：未合并时删除功能分支；合并后 revert 发布 commit；已发布版本不移动 tag，以补丁版本修复并保留旧归档。
