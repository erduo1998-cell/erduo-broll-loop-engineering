<div align="center">

# Erduo HyperFrames B-roll

**把一份 SRT 和可选的口播视频，交给一组协作 Agent，得到可编辑、可复查的 HyperFrames B-roll Master。**

[![Version](https://img.shields.io/badge/version-0.1.0--rc.2-f97316)](CHANGELOG.md)
[![Platform](https://img.shields.io/badge/platform-macOS-111827)](SUPPORT-MATRIX.md)
[![Hosts](https://img.shields.io/badge/hosts-Codex%20%7C%20Claude%20Code-2563eb)](#支持范围)
[![License](https://img.shields.io/badge/license-MIT-16a34a)](LICENSE)

[三分钟安装](#三分钟安装) · [第一次怎么用](#第一次怎么用) · [常见问题](#常见问题) · [联系作者](#联系作者)

</div>

> [!WARNING]
> 当前是 `0.1.0-rc.2` 开源候选版，不是正式稳定版。macOS + Codex 已有当前架构的真实生产证据；全新用户安装回归、Claude Code 同输入对照、Windows 与剪映/CapCut GUI 实机验证仍未完成。请先看[支持范围](#支持范围)。

## 它解决什么问题

做口播 B-roll，难点通常不是“生成一个画面”，而是让整条片子的分镜、素材、动效、时间和交付持续对齐。这个 Skill 把工作拆给八个职责明确的 Agent：

- 读懂 SRT，按语义分镜，而不是一句字幕配一个镜头；
- 优先使用你的图片、视频、Logo 和截图，再评估可控生成与 Pexels 素材；
- 把长片拆成多个连续区块，由独立 Builder 并行构建；
- 使用当前官方 HyperFrames Skill 完成可编辑的 HTML 视频工程；
- 整合后先给你看最终预览，得到明确同意才正式渲染；
- 默认交付一个经过分辨率、时长、连续覆盖和解码检查的 4K Master。

它不是一键“审美保证器”。技术验证通过，只说明文件可用；好不好看，最后仍由你观看后决定。

## 一张图看懂完整流程

<p align="center">
  <img src="https://raw.githubusercontent.com/erduo1998-cell/erduo-hyperframes-broll/main/docs/images/workflow-zh.svg" alt="Erduo HyperFrames B-roll 中文工作流程：输入、安装、分镜、素材、构建、整合、预览、渲染" width="100%">
</p>

你实际只需要做三件事：

1. 准备 SRT；口播模式再准备与字幕匹配的已剪视频。
2. 第一次运行时完成必要授权和 Pexels Key 配置。
3. 观看最终预览，满意后明确同意正式渲染。

中间的分镜、素材、分块构建、整合和技术检查由 Agent 链推进。

## 你会得到什么

默认交付：

| 产物 | 默认值 | 说明 |
| --- | --- | --- |
| 最终视频 | `master.mp4` | H.264 MP4 |
| 分辨率 | `3840 × 2160` | 4K |
| 帧率 | `30 fps` | 可在任务中另行指定 |
| 时间范围 | `0 ms` 到最后一条字幕结束 | 以 SRT 整数毫秒为唯一时间真源 |
| 字幕 | 不烧录 | B-roll 不复制整段字幕 |
| 背景音乐 | 不自动添加 | 无人出镜模式默认静音 |
| 逐镜头文件 | 默认不导出 | 你明确要求后，才从已验证 Master 派生 |

此外会保留可继续修改的 HyperFrames 源文件、阶段交接记录、素材与字体来源，以及客观媒体验证结果。

## 渲染运行时边界

当前默认且唯一具有本项目生产证据的渲染运行时仍是 **HyperFrames**。仓库正在建立运行时无关的 Shot Recipe、能力矩阵和适配契约，让同一份镜头意图未来可以分别由 HyperFrames 与 Remotion 后端实现；这项工作目前只是 **runtime-adapter foundation**，不是已经完成的双端渲染器。

- `hyperframes`：默认运行时，继续走现有 Builder、Integrator、预览与正式渲染链路。
- `remotion`：仅有实验性契约，尚无本项目端到端渲染、视觉一致性或生产可用证据。
- 本仓库不捆绑、不安装 Remotion，也不授予 Remotion 的使用许可。是否可以在你的个人、团队、公司或自动化场景中使用，应以 Remotion 官方现行许可为准。
- 运行时能力必须逐项声明为可移植、运行时原生、互操作或不支持；实验性契约不代表所有 Remotion Composition 都能自动转换成 HyperFrames。
- 本轮尚未吸收任何第三方镜头卡。镜头卡迁移必须等基础契约通过验证后，再逐卡提炼 Shot Recipe、实现适配器并分别验证。

因此，现有使用提示词不需要选择运行时；未明确进入将来的实验流程时，一律按 HyperFrames 执行。详细证据边界见[支持矩阵](SUPPORT-MATRIX.md)。

开发者可以对 Director 生成的逐镜头 Recipe 目录运行零依赖校验：

```bash
node erduo-hyperframes-broll/scripts/validate-shot-recipes.mjs <shot-recipes-directory>
```

## 使用前准备

### 必须准备

- 一台 Mac；
- Codex 或 Claude Code，且宿主支持 Skill、文件读写、命令执行和真正独立的子 Agent/任务；
- 一份 `.srt` 字幕；
- 口播模式下，与 SRT 时间一致的已剪视频；
- 可访问 Node.js 官方发布目录、npm registry、GitHub 官方 Skill 来源、HyperFrames 官方浏览器源和 Pexels 的网络。

### 可选准备

- 你的图片、视频、Logo、产品截图、网页截图或品牌素材；
- 特殊输出比例、分辨率、帧率、音频、品牌或隐私要求。

### 不用提前准备

- 不用自己安装 Node.js 22：缺失时安装器会安装固定版本到用户目录；
- 不用写 `design.md`：Director 会根据本期 SRT、目标和素材建立视觉方向；
- 不用手工复制八个 Skill：安装器会同时安装父 Skill 与七个阶段 Skill；
- 不用把 Pexels Key 发进聊天：安装器使用不回显输入并在保存前真实验证。

## 三分钟安装

### 方式 A：使用 Git，后续更新最省事

打开“终端”，逐行粘贴：

```bash
git clone https://github.com/erduo1998-cell/erduo-hyperframes-broll.git
cd erduo-hyperframes-broll
./Install.command
```

### 方式 B：不会 Git，直接下载

1. 在仓库页面点击绿色 **Code** 按钮，再点 **Download ZIP**。
2. 解压后，把文件夹放到一个长期保留的位置，例如“文稿”。不要放在稍后会清空的下载缓存里。
3. 双击文件夹里的 `Install.command`。
4. 如果 macOS 不允许直接打开，按住 Control 点击 `Install.command`，选择“打开”。
5. 如果提示没有执行权限，打开“终端”，输入 `bash` 和一个空格，把 `Install.command` 拖进终端窗口，然后回车。

> [!IMPORTANT]
> 安装器会把 Codex 与 Claude Code 中的 Skill 指向当前解压目录。安装成功后不要移动或删除这个文件夹。确实需要移动时，把整个文件夹移到新位置，再从新位置重新运行 `Install.command`。

### 安装器会做什么

安装器会按顺序：

1. 检查 Node.js 22 或更高版本；
2. 必要时从 Node.js 官方固定目录下载 `v22.23.1`，按 CPU 架构校验内置 SHA-256，并安装到用户应用数据目录；
3. 用 `npm ci --ignore-scripts` 安装锁定的 `hyperframes@0.7.72` 依赖图；
4. 运行官方 `hyperframes skills update` 和 `skills check --json`；
5. 运行官方 `hyperframes browser ensure`；
6. 运行并解析官方 `hyperframes doctor --json`；
7. 把父 Skill 和七个阶段 Skill 安装到 Codex 与 Claude Code；
8. 安全询问一次 Pexels Key，并在保存前做真实轻量验证。

它不会使用 `sudo`，不会修改 shell profile，也不会静默覆盖不同的已有 Skill。发现冲突时，它会先列出冲突、请求一次授权，再做可恢复备份。

如果缺少 FFmpeg/FFprobe，只有在本机已经安装 Homebrew 且你明确同意时，安装器才会执行 `brew install ffmpeg`；它不会擅自安装 Homebrew。

### 获取 Pexels API Key

Pexels 是固定素材阶段，所以正式生产前需要一个 Key。

1. 打开 [Pexels API Key 页面](https://www.pexels.com/api/key/)。
2. 登录或注册 Pexels 账号。
3. 申请并复制 API Key。Pexels 官方说明每个账号可获得自己的 Key。
4. 回到安装窗口，在 `Pexels API Key:` 后粘贴并回车。输入不会显示在屏幕上，这是正常的。
5. 不要把 Key 粘贴到聊天、Issue、截图、命令参数或仓库文件中。

安装时跳过了也没关系：重新运行 `./Install.command`，再通过隐藏输入配置。可用下面的命令安全查看状态；它只显示是否已配置，不显示 Key：

```bash
node scripts/config.mjs status
```

## 第一次怎么用

安装完成后，先彻底退出并重新打开 Codex 或 Claude Code，让宿主重新发现 Skill。

### 场景 A：给口播视频做 B-roll

把 SRT、对应的已剪视频和可选素材拖进对话，然后说：

```text
用 erduo-hyperframes-broll 处理这条口播。
SRT 和已剪视频已经附上；优先使用我附带的 Logo 和产品截图。
默认输出即可，持续推进到最终预览再叫我确认。
```

如果宿主需要文件路径，也可以写：

```text
用 erduo-hyperframes-broll 处理这个 SRT 和对应的已剪视频。
SRT：<把文件拖进对话或填写路径>
视频：<把文件拖进对话或填写路径>
可选素材：<没有就写“无”>
```

### 场景 B：只用 SRT 做无人出镜视频

```text
用 erduo-hyperframes-broll 把这个 SRT 做成无人出镜 B-roll。
没有额外素材，默认输出即可，持续推进到最终预览再叫我确认。
```

### 场景 C：带明确品牌或交付要求

```text
用 erduo-hyperframes-broll 处理这个 SRT。
品牌主色是深蓝和橙色；不要出现人物正脸；输出 1920×1080、30 fps。
Logo 和产品截图已经附上。正式渲染前给我看最终预览。
```

### 运行中什么时候会找你

正常情况下只有两个停点：

1. **首次环境授权**：Onboarding 会一次性列出缺失项和安全、可恢复的修复动作。你确认后，它才修复。
2. **正式渲染批准**：整合完成后先给出最终官方预览。你需要观看并明确回复“同意正式渲染”，Render 才会开始。

Pexels 账号注册、API Key 获取、系统权限、管理员批准、磁盘清理和云服务登录都必须由你本人完成，Agent 不会冒充。

## 这套 Agent 链怎么分工

| 角色 | 负责什么 | 明确不做什么 |
| --- | --- | --- |
| Parent Producer | 明确目标、派发、读交接、审查、把返工交回责任阶段 | 不亲自生产文件或假装子 Agent |
| Onboarding | 检查环境，汇总授权，执行你批准的安全修复 | 不做分镜和创作 |
| Director | 理解 SRT、分段、建立原创视觉方向和镜头意图 | 不下载素材、不写最终工程 |
| Assets | 检查用户素材、评估可控生成、真实搜索 Pexels 并冻结候选 | 不拿无关素材充背景 |
| Master Build | 每个独立 Builder 构建一个连续语义区块 | 不改其他 Builder 的区块 |
| Integrator | 整合全部区块并形成最终预览 | 不偷偷重写各区块创意 |
| Render / Delivery | 同环境复检、正式渲染、解码和媒体验证 | 未经预览批准不正式渲染 |
| Shot Export | 按需从已验证 Master 导出逐镜头文件 | 不重新独立渲染镜头 |

固定素材优先级：

```text
用户素材 → 可控生成 → Pexels → HyperFrames 原生结构辅助
```

Builder、Integrator 和 Render / Delivery 必须在各自独立上下文中真实加载当前官方 `hyperframes` Skill。单纯声称“已加载”或只运行 CLI 都不能替代真实 Skill 加载。

## 常见问题

| 现象 | 怎么处理 |
| --- | --- |
| 双击 `Install.command` 没反应 | Control 点击后选“打开”；仍不行就在终端输入 `bash `，把文件拖进去后回车 |
| 提示 Node 版本太低 | 继续安装即可；安装器会准备用户级 Node.js 22，不替换系统 Node |
| 提示 FFmpeg 缺失 | 如果已有 Homebrew，同意安装器执行 `brew install ffmpeg`；否则先自行安装 FFmpeg，再重跑安装 |
| Pexels 显示 `action-required` | 到 Pexels 官网申请 Key，然后重新运行安装器；不要把 Key发进聊天 |
| Codex / Claude Code 找不到 Skill | 先彻底重启宿主，再运行 `node scripts/doctor.mjs`；同时确认安装后的仓库文件夹没有被移动或删除 |
| 已经有同名 Skill | 安装器会列出冲突，得到一次授权后备份旧安装，再原子替换；不会静默覆盖 |
| 预览不满意 | 说明具体镜头、时间点和问题；Parent 会把返工交给责任阶段，不会整条片子盲目重做 |
| 想导出每个镜头 | 等 Master 验证通过后明确说“从已验证 Master 导出逐镜头文件” |
| Windows 能不能用 | 当前未验证，不建议把首次使用押在 Windows 上 |
| 能不能直接导入剪映 / CapCut | 输出目标是常见 MP4/MOV，但当前桌面 GUI 尚未实机认证，请先手工试导入 |

环境诊断：

```bash
node scripts/doctor.mjs
```

卸载本项目的 Skill 链接并恢复安装器备份：

```bash
node scripts/uninstall.mjs
```

卸载默认保留私有配置和共享 HyperFrames runtime。完整行为与安全边界见[隐私说明](PRIVACY.md)和[安全策略](SECURITY.md)。

## 更新

如果使用 Git 安装：

```bash
cd erduo-hyperframes-broll
git pull --ff-only
./Install.command
```

如果使用 ZIP 安装，下载并解压新版到一个新的长期目录，再运行新版 `Install.command`。安装器会识别现有链接并按安全替换流程处理；确认新版本工作后，再决定是否保留旧目录。

## 支持范围

| 环境 | 当前状态 |
| --- | --- |
| macOS + Codex | 当前提示词架构已有真实 forward-test 证据；RC 发布门仍待完成 |
| macOS + Claude Code | 待同输入 RC 对照 |
| macOS 首次安装 | release candidate，仍需全新用户环境验收 |
| Windows | unverified |
| 剪映 / CapCut 桌面 GUI | unverified |

“有真实证据”不等于每台机器都已验证，也不等于审美一定符合你的要求。详细证据边界见[支持矩阵](SUPPORT-MATRIX.md)和[发布检查表](RELEASE-CHECKLIST.md)。

## 隐私、网络与安全

本仓库自身不采集或发送遥测。安装、诊断、打包和公共生产 Skills 对其启动的非 Pexels 子进程使用显式安全环境映射，并默认设置 `HYPERFRAMES_NO_TELEMETRY=1`。

首次准备可能访问：

- `nodejs.org`：必要时下载固定 Node.js；
- npm registry：安装锁定的 HyperFrames 依赖；
- GitHub 上的 HyperFrames 官方 Skill 来源：执行 `skills update` 与 `skills check`；
- HyperFrames 官方浏览器源：执行 `browser ensure`；
- Pexels API 与 CDN：验证 Key、搜索和下载生产素材；
- Homebrew：仅在你明确授权安装 FFmpeg 时。

SRT、视频、用户素材、阶段交接和渲染产物默认留在本机。Key 不进入项目、产物、命令行或日志。本仓库只能约束自己启动的进程；如果你在本发行包之外直接调用 HyperFrames，其网络和隐私行为受 HyperFrames 自身实现与政策约束。

## 开发、测试与贡献

运行离线 mock 测试与静态隐私扫描：

```bash
npm test
```

检查 Skill 结构、README 安装路径和公开边界后再提交 PR。安装或首次运行相关改动，应附全新临时用户目录的测试结果；生产提示改动应附真实宿主产物和限制说明。不要提交 API Key、Cookie、私人路径、用户 SRT、视频、素材、成片、缓存或未脱敏日志。

贡献规则见 [CONTRIBUTING.md](CONTRIBUTING.md)。项目代码与原创文档采用 [MIT License](LICENSE)，第三方组件和运行期素材保留各自许可，见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

## 联系作者

<table>
  <tr>
    <td width="330" align="center">
      <img src="https://raw.githubusercontent.com/erduo1998-cell/erduo-hyperframes-broll/main/docs/images/wechat-contact.jpg" alt="耳朵微信二维码" width="280">
    </td>
    <td>
      <strong>刘冉 / 耳朵</strong><br><br>
      AI 咨询顾问 · 前影视导演 · 开源 Agent 工具实践者<br><br>
      GitHub：<a href="https://github.com/erduo1998-cell">@erduo1998-cell</a><br>
      主页：<a href="https://erduo.art">erduo.art</a><br>
      微信：扫描左侧二维码添加好友<br><br>
      提问时请附：宿主、macOS 版本、CPU 架构、Node 版本、最小复现和已脱敏报错。不要发送 API Key、Cookie、私人媒体或完整环境变量。
    </td>
  </tr>
</table>

## English quick start

`erduo-hyperframes-broll` is a prompt-first parent/child Agent Skill for SRT-anchored HyperFrames B-roll. The current release candidate supports macOS as its validated baseline.

```bash
git clone https://github.com/erduo1998-cell/erduo-hyperframes-broll.git
cd erduo-hyperframes-broll
./Install.command
```

Restart Codex or Claude Code, attach an SRT, and ask:

```text
Use erduo-hyperframes-broll to turn this SRT into a faceless B-roll master.
Continue unattended until the final preview requires my approval.
```

Talking-head mode also needs the matching edited video. The installer provisions the pinned local runtime, official HyperFrames Skills and browser, installs the parent plus seven stage Skills, and securely offers one-time Pexels configuration. It never uses `sudo` or edits your shell profile.
