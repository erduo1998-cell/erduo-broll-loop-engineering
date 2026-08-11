<div align="center">

# Erduo B-roll Loop Engineering

**把一份 SRT 和可选口播视频交给协作 Agent：先做运行时中立分镜，再按镜头证据自动分配 HyperFrames / Remotion，得到可编辑、可复查的 B-roll Master。**

[![Version](https://img.shields.io/badge/version-0.5.0-16a34a)](CHANGELOG.md)
[![Platform](https://img.shields.io/badge/platform-macOS-111827)](SUPPORT-MATRIX.md)
[![Hosts](https://img.shields.io/badge/hosts-Codex%20%7C%20Claude%20Code-2563eb)](#支持范围)
[![License](https://img.shields.io/badge/license-MIT-16a34a)](LICENSE)

[三分钟安装](#三分钟安装) · [镜头能力目录](#镜头能力目录) · [第一次怎么用](#第一次怎么用) · [常见问题](#常见问题) · [联系作者](#联系作者)

</div>

> [!IMPORTANT]
> `0.4.0` 起项目正式更名为 **Erduo B-roll Loop Engineering**，公开仓库与父 Skill 统一使用 `erduo-broll-loop-engineering`。双后端能力保持不变；稳定不表示同一镜头在 HyperFrames 与 Remotion 中天然视觉一致，也不表示任意既有工程都能自动修复。请先看[支持范围](#支持范围)。

## 它解决什么问题

做口播 B-roll，难点通常不是“生成一个画面”，而是让整条片子的分镜、素材、动效、时间和交付持续对齐。这个 Skill 把工作拆给一个共用前段和两套独立后段：

- 读懂 SRT，按语义分镜，而不是一句字幕配一个镜头；
- 优先使用你的图片、视频、Logo 和截图，再评估可控生成与 Pexels 素材；
- 把长片拆成多个连续区块，由独立 Builder 并行构建；
- 分镜后按 capability 与实测/来源证据逐镜选择后端，再把相邻同后端镜头合并为区块；
- HyperFrames 使用锁定的官方 Skill；Remotion 只使用目标项目本地锁定的 CLI 与依赖；
- 整合后先给你看最终预览，得到明确同意才正式渲染；
- 默认交付一个经过分辨率、时长、连续覆盖和解码检查的 4K Master。

它不是一键“审美保证器”。技术验证通过，只说明文件可用；好不好看，最后仍由你观看后决定。

## 一张图看懂完整流程

<p align="center">
  <img src="https://raw.githubusercontent.com/erduo1998-cell/erduo-broll-loop-engineering/main/docs/images/workflow-zh.svg" alt="Erduo B-roll Loop Engineering 中文工作流程：输入、安装、分镜、素材、构建、整合、预览、渲染" width="100%">
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

此外会保留可继续修改的目标运行时源文件、阶段交接记录、素材与字体来源，以及客观媒体验证结果。

## 渲染运行时边界

仓库先用运行时无关的 Shot Recipe 冻结镜头意图，再由确定性 Runtime Planner 逐镜选择后端，并把相邻同后端镜头合并为连续区块。

- 用户明确说 `hyperframes` 或 `remotion` 时，强制整片单后端；也可明确选择 `auto` 或 `hybrid`。
- 现有项目按真实特征判断；同时命中两类特征时停止并请用户选择，不静默猜测。
- 空白新项目且用户未指定时默认 `auto`。
- `hyperframes` 走现有 Master Build → Integrate → Render 链路。
- `remotion` 走 Remotion Build → Integrate → Render 链路；已有项目必须能证明本地精确版本和 local CLI，新项目由该后段显式 scaffold 并生成 lockfile。
- `auto` 可落到单后端或 hybrid；hybrid 只交换带 hash、FFprobe 和完整解码证据的冻结区块媒体，不实时嵌套两套运行时。
- 安装器不会把 Remotion 加入共享 runtime 或全局安装。Remotion 的许可、依赖与执行范围属于用户选择的目标项目。
- 运行时选择不构成视觉一致性声明，也不表示任意 Remotion Composition 可以自动转换成 HyperFrames。

可直接检查一个项目的路由结果：

```bash
node erduo-broll-loop-engineering/scripts/detect-runtime.mjs --project <项目目录> --json
```

也可显式追加 `--runtime auto|hybrid|hyperframes|remotion`。Director 完成后用 `plan-runtime.mjs` 生成并校验后端区块计划。详细证据边界见[支持矩阵](SUPPORT-MATRIX.md)。

开发者可以对 Director 生成的逐镜头 Recipe 目录运行零依赖校验：

```bash
node erduo-broll-loop-engineering/scripts/validate-shot-recipes.mjs <shot-recipes-directory>
```

## 镜头能力目录

`0.5.0` 继续收录 **152 张上游 Markdown 镜头卡原文**，覆盖目录中的 **209 个 style 条目**。本项目另外生成带 `adaptationNotice` 的检索目录和完整性 manifest。Director 和目标后段 Builder 把这些原文作为运行时中立的镜头知识消费：先查询小型目录，再只加载命中的卡片，避免一次把完整卡库塞进 Agent 上下文。

请准确理解这里的“吸收”：

- 已验证的是卡片数量、style 覆盖、唯一 ID、来源 commit、逐文件哈希、查询闭集和发布包闭集；
- 上游卡片正文用于两个后端的镜头语义；Remotion Builder 还可以只读取所选卡片 manifest 绑定的固定 TSX 来源作为改编参考，但必须替换 fixture/媒体并写入独立目标项目，不能在运行时直接导入参考树；
- **152 张卡片不等于 152 个已经渲染验证的 HyperFrames 组件**，也不等于 Remotion TSX 可以自动转换；
- 实际镜头仍由 Director 选择、Assets 准备素材、目标后段 Builder 原生实现，并接受该运行时的检查、预览和渲染验证；
- 上游文本及 Remotion 来源子集依据 Apache-2.0 收录并保留逐文件来源和哈希；发布包不携带上游预览媒体、音频、字体、纹理或 Remotion 运行时依赖。

开发者和 Agent 应使用仓库提供的查询脚本，不要递归加载全部卡片。常见查询方式：

```bash
# 查看数量摘要
node erduo-broll-loop-engineering/scripts/query-shotcraft.mjs --stats

# 按语义查询，先取得候选摘要
node erduo-broll-loop-engineering/scripts/query-shotcraft.mjs --search '急推 特写' --category camera

# 已知稳定 card id 时只读取这一张
node erduo-broll-loop-engineering/scripts/query-shotcraft.mjs --card <card-id>
```

`--search` 会把空白分隔的关键词按 AND 匹配；长句无结果时，改用一两个辨识度高的词重试，不要直接判定“没有合适卡片”。还可以用 `--list --category <category>` 枚举分类；已选定卡片后，可用 `--card <card-id> --style <style-key>` 限定该卡内部的 style。`--style` 不能独立反查。只有 `--card` 输出卡片全文，其余命令保持渐进式摘要。目录、卡片和逐文件哈希之间的绑定由测试与发布清单验证。完整许可证见 [`third_party/licenses/video-shotcraft-APACHE-2.0.txt`](third_party/licenses/video-shotcraft-APACHE-2.0.txt)，证据边界见[支持矩阵](SUPPORT-MATRIX.md)。

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

- 不用自己安装 Node.js：缺失或低于 `22.20.0` 时，安装器会安装固定版本到用户目录；
- 不用写 `design.md`：Director 会根据本期 SRT、目标和素材建立视觉方向；
- 不用手工复制十四个 Skill：安装器会同时安装父 Skill和十三个阶段 Skill；
- 不用把 Pexels Key 发进聊天：安装器使用不回显输入并在保存前真实验证。

## 三分钟安装

### 方式 A：使用 Git，后续更新最省事

打开“终端”，逐行粘贴：

```bash
git clone https://github.com/erduo1998-cell/erduo-broll-loop-engineering.git
cd erduo-broll-loop-engineering
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

1. 检查 Node.js `22.20.0` 或更高版本；
2. 必要时从 Node.js 官方固定目录下载 `v22.23.1`，按 CPU 架构校验内置 SHA-256，并安装到用户应用数据目录；
3. 用 `npm ci --ignore-scripts` 安装锁定的 `hyperframes@0.7.104` 与 `skills@1.5.22` 依赖图；
4. 精确拉取 HyperFrames `c96b30c7174984e684620556ce871a285381ec60`，在隔离 HOME 中安装并用官方 `skills check --dir ... --source ... --json` 验证 8 个核心 Skill；
5. 运行官方 `hyperframes browser ensure`；
6. 运行并解析官方 `hyperframes doctor --json`；
7. 把 8 个官方 HyperFrames 核心 Skill、父 Skill和十三个阶段 Skill一起纳入冲突确认、备份、链接和失败回滚事务，再安装到 Codex 与 Claude Code；Remotion 不进入共享 runtime；
8. 安全询问一次 Pexels Key，并在保存前做真实轻量验证。

它不会使用 `sudo`，不会修改 shell profile，也不会让第三方安装器直接写真实 HOME。发现不同的已有 Skill 时，它会先列出冲突、请求一次授权，再做可恢复备份；任一步失败都会逆序恢复已改变的目标。

首次冷安装需要下载 HyperFrames 的完整锁定依赖、固定 Skill 源和浏览器，在普通网络下可能需要 10–20 分钟；每个网络阶段都有硬超时，固定 Git 拉取最多重试三次。失败后可直接重新运行，已完成的 npm 缓存和应用自有运行时会复用，安装器不会把半成品 Skill 链接进宿主。

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
用 erduo-broll-loop-engineering 处理这条口播。
SRT 和已剪视频已经附上；优先使用我附带的 Logo 和产品截图。
默认输出即可，持续推进到最终预览再叫我确认。
```

如果宿主需要文件路径，也可以写：

```text
用 erduo-broll-loop-engineering 处理这个 SRT 和对应的已剪视频。
SRT：<把文件拖进对话或填写路径>
视频：<把文件拖进对话或填写路径>
可选素材：<没有就写“无”>
```

### 场景 B：只用 SRT 做无人出镜视频

```text
用 erduo-broll-loop-engineering 把这个 SRT 做成无人出镜 B-roll。
没有额外素材，默认输出即可，持续推进到最终预览再叫我确认。
```

### 场景 C：带明确品牌或交付要求

```text
用 erduo-broll-loop-engineering 处理这个 SRT。
品牌主色是深蓝和橙色；不要出现人物正脸；输出 1920×1080、30 fps。
Logo 和产品截图已经附上。正式渲染前给我看最终预览。
```

### 场景 D：明确使用 Remotion 后段

```text
用 erduo-broll-loop-engineering 处理这个 SRT，后段明确使用 Remotion。
项目目录：<现有 Remotion 项目或准备创建新项目的空目录>
先完成 runtime 路由和本地依赖证据检查；不要全局安装 Remotion。
持续推进到最终预览，再叫我确认正式渲染。
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
| Runtime Selector + Planner | 开工前冻结选择意图，分镜后按 capability/pattern evidence 逐镜规划并连续分块 | 不读语义关键词，不制造无证据切换 |
| Director | 理解 SRT、分段、建立原创视觉方向和镜头意图 | 不下载素材、不写最终工程 |
| Assets | 检查用户素材、评估可控生成、真实搜索 Pexels 并冻结候选 | 不拿无关素材充背景 |
| HyperFrames Build / Integrate / Render | 用锁定的官方 Skill 构建、整合、预览与交付 | 不接管已选择的 Remotion 项目 |
| Remotion Build / Integrate / Render | 用目标项目本地锁定依赖构建 Composition、整合并交付 | 不全局安装 Remotion，不调用 HyperFrames 代渲染 |
| Hybrid Integrate / Render | 校验冻结区块媒体、检查跨后端接缝、绑定批准并用 FFmpeg 交付 | 不实时嵌套运行时，不互导生成源码 |
| Shot Export | 按需从已验证 Master 导出逐镜头文件 | 不重新独立渲染镜头 |

固定素材优先级：

```text
用户素材 → 可控生成 → Pexels → 目标运行时原生结构辅助
```

HyperFrames 后段必须在各自独立上下文中真实加载发行版锁定的官方 `hyperframes` Skill。Remotion 后段必须读取目标项目的 package/lock、验证 project-local CLI，再按自身契约执行；全局 `remotion`、`npx` 自动下载或 PATH 上的偶然命令都不能作为 readiness 证据。

## 常见问题

| 现象 | 怎么处理 |
| --- | --- |
| 双击 `Install.command` 没反应 | Control 点击后选“打开”；仍不行就在终端输入 `bash `，把文件拖进去后回车 |
| 提示 Node 版本太低 | 继续安装即可；低于 `22.20.0` 时安装器会准备用户级 Node.js `22.23.1`，不替换系统 Node |
| 提示 FFmpeg 缺失 | 如果已有 Homebrew，同意安装器执行 `brew install ffmpeg`；否则先自行安装 FFmpeg，再重跑安装 |
| Pexels 显示 `action-required` | 到 Pexels 官网申请 Key，然后重新运行安装器；不要把 Key发进聊天 |
| Codex / Claude Code 找不到 Skill | 先彻底重启宿主，再运行 `node scripts/doctor.mjs`；同时确认安装后的仓库文件夹没有被移动或删除 |
| 已经有同名 Skill | 安装器会列出冲突，得到一次授权后备份旧安装，再原子替换；不会静默覆盖 |
| 同时检测到 HyperFrames 和 Remotion | Runtime Router 会停止，请明确指定本次使用 `hyperframes` 或 `remotion` |
| Remotion 项目提示依赖未就绪 | Onboarding 会汇总一次 Remotion 许可确认与项目内依赖安装授权；你确认后由新的修复 Agent 创建精确 package/lock、执行 `npm ci` 并验证 local CLI，不需要你手工安装，也不会全局安装或让 `npx` 临时下载 |
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

卸载默认保留私有配置、共享 HyperFrames runtime 和用户目标目录中的 Remotion 项目。完整行为与安全边界见[隐私说明](PRIVACY.md)和[安全策略](SECURITY.md)。

## 更新

### 从 0.3.x 旧名称升级

GitHub 会把旧仓库地址重定向到新仓库，但本地 clone 的文件夹名不会自动改变。拉取 `0.5.0` 后重新运行 `Install.command`：安装器会严格验证 schema 1/2/3/4 的历史所有权，升级到 schema 5，重新绑定十三个阶段 Skill，并保留冲突备份与回滚。目标被改动时安装器停止，不会删除。

为避免更名导致 Pexels 凭据、固定 HyperFrames runtime 和安装备份丢失，本地私有应用数据目录继续沿用 v0.3.x 的内部路径。该路径只承担兼容存储，不再是仓库、产品或 Skill 名称。

如果使用 Git 安装：

```bash
cd erduo-broll-loop-engineering
git pull --ff-only
./Install.command
```

如果使用 ZIP 安装，下载并解压新版到一个新的长期目录，再运行新版 `Install.command`。安装器会识别现有链接并按安全替换流程处理；确认新版本工作后，再决定是否保留旧目录。

## 支持范围

| 环境 | 当前状态 |
| --- | --- |
| macOS + Codex | supported；已有当前提示词架构的真实生产证据 |
| macOS + Claude Code | experimental；安装契约受测试覆盖，尚缺当前版本同输入端到端对照 |
| macOS 首次安装 | supported installer；具体机器仍须先运行 doctor |
| Remotion 后段 | project-local supported workflow；必须通过目标项目本地依赖与 CLI readiness |
| Windows | unverified |
| 剪映 / CapCut 桌面 GUI | unverified |

“有真实证据”不等于每台机器都已验证，也不等于审美一定符合你的要求。详细证据边界见[支持矩阵](SUPPORT-MATRIX.md)和[发布检查表](RELEASE-CHECKLIST.md)。

## 隐私、网络与安全

本仓库自身不采集或发送遥测。安装、诊断、打包和公共生产 Skills 对其启动的非 Pexels 子进程使用显式安全环境映射，并默认设置 `HYPERFRAMES_NO_TELEMETRY=1`。

当宿主不能直接注入或证明安全环境映射时，Skill 只允许通过随包提供的 `erduo-broll-loop-engineering/scripts/safe-spawn.mjs` 启动命令。这个边界启动器不打印环境，拒绝大小写冲突，移除所有 `PEXELS_API_KEY` 大小写变体，并以 `shell: false` 启动目标程序；它不替代官方 Skill 加载、doctor、check 或结果审查。

首次准备可能访问：

- `nodejs.org`：必要时下载固定 Node.js；
- npm registry：安装锁定的 HyperFrames 依赖；
- GitHub 上的 HyperFrames 官方 Skill 来源：安装器只拉取固定 commit，在隔离 staging 中安装并验证；日后用户明确执行官方远端更新命令时才检查更新；
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
      <img src="https://raw.githubusercontent.com/erduo1998-cell/erduo-broll-loop-engineering/main/docs/images/wechat-contact.jpg" alt="耳朵微信二维码" width="280">
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

`erduo-broll-loop-engineering` 0.5.0 is a stable, prompt-first parent/child Agent Skill for SRT-anchored B-roll with deterministic post-direction auto routing and independent HyperFrames and Remotion backends. New projects default to auto. Remotion uses only exact, project-local dependencies and CLI evidence; it is never installed globally by this installer. Hybrid integration exchanges frozen media only. Cross-runtime visual parity, Windows, and desktop CapCut/Jianying imports remain unverified.

```bash
git clone https://github.com/erduo1998-cell/erduo-broll-loop-engineering.git
cd erduo-broll-loop-engineering
./Install.command
```

Restart Codex or Claude Code, attach an SRT, and ask:

```text
Use erduo-broll-loop-engineering to turn this SRT into a faceless B-roll master.
Continue unattended until the final preview requires my approval.
```

Talking-head mode also needs the matching edited video. The installer provisions the pinned HyperFrames runtime, official HyperFrames Skills and browser, installs the parent plus thirteen stage Skills, and securely offers one-time Pexels configuration. It does not install Remotion globally, use `sudo`, or edit your shell profile.
