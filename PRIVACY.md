# 隐私说明

## 本地数据

SRT、口播视频、用户素材、HyperFrames/Remotion 源码、阶段 handoff 和渲染产物默认保留在用户选择的本地工作目录。本仓库自身不包含遥测，不会主动上传这些文件。安装、诊断、打包和公共生产 Skills 对其启动的非 Pexels 子进程使用显式环境映射，按 ASCII 大小写不敏感规则移除 `PEXELS_API_KEY` 的全部拼写变体，并默认设置 `HYPERFRAMES_NO_TELEMETRY=1`；只有 Pexels 凭据验证与素材阶段的专用 Pexels 请求会在最小作用域读取该 Key。

## 凭据

Pexels Key 优先从 `PEXELS_API_KEY` 环境变量读取，否则保存在用户应用数据目录的配置文件中。POSIX 配置文件权限为 `0600`，目录为 `0700`，写入采用同目录临时文件与原子替换。配置根若是符号链接或非目录会被拒绝。

`0.4.0` 更名不会迁移或复制凭据：为继续复用既有配置、固定 runtime 与备份，私有应用数据目录保留 v0.3.x 的内部路径。旧路径仅用于本地兼容存储，不是公开产品或 Skill 标识。

Key 不进入：

- 命令行参数；
- 项目目录、阶段 handoff 或渲染产物；
- 安装/诊断输出与日志；
- Git 仓库或发布包。

## 正常网络访问

- Node.js 官方分发：仅在缺少 Node.js 22+ 时下载运行时和校验文件。
- npm registry：`npm ci` 安装锁定的 HyperFrames 与 Skills CLI 依赖。
- 目标项目 npm registry：只有用户选择 Remotion 且需要在生产目录 scaffold 或恢复依赖时，才按目标项目 lock 执行 `npm ci`；本仓库安装器不安装 Remotion。
- GitHub 上的 HyperFrames 官方 Skill 来源：安装器精确拉取固定 commit，只在隔离 HOME 中运行第三方安装器，再以官方 `skills check --dir/--source` 验证；不会让它直接写真实 HOME。
- HyperFrames 官方浏览器源：`browser ensure` 获取所需浏览器。
- Pexels API 与 CDN：验证 Key、搜索和下载生产素材。
- Homebrew：仅在用户明确授权安装 FFmpeg 时。
- 用户主动启用的生成服务：由对应宿主或服务自己的隐私条款约束。

Pexels 素材与生成素材的来源信息应写入当前生产目录，但凭据本身不得写入。用户负责确认外部服务条款、素材许可和隐私要求。

`HYPERFRAMES_NO_TELEMETRY=1` 覆盖由本仓库安装、诊断和打包工具启动的子进程；公共生产 Skills 还要求每个非 Pexels 子进程使用同一显式环境映射。宿主不能直接注入或证明该映射时，只允许使用随包的 `safe-spawn.mjs` 作为 bounded no-log、no-shell 启动边界；两条路径都不可用时，阶段才在启动前停止。用户在本发行包之外直接调用 HyperFrames 时，其网络和隐私行为受 HyperFrames 自身实现与政策约束。

## 诊断最小化

公开诊断会通过 Pexels 的轻量 API 请求实际验证解析到的凭据；仅存在环境变量不算 ready。输出只包含平台、架构、版本、通过/警告/失败状态和安全的行动建议。真实 home 前缀替换为 `$HOME`；不会返回原始环境、Key 或完整第三方 stdout/stderr。
