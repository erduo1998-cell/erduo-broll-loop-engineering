<div align="center">

# Erduo B-roll Loop Engineering

**把一份 SRT 和可选口播视频交给协作 Agent：先做运行时中立分镜，再按镜头证据自动分配 HyperFrames / Remotion，得到可编辑、可复查的 B-roll Master。**

[![Version](https://img.shields.io/badge/version-0.8.1-16a34a)](CHANGELOG.md)
[![Platform](https://img.shields.io/badge/platform-macOS-111827)](SUPPORT-MATRIX.md)
[![Hosts](https://img.shields.io/badge/hosts-Codex%20%7C%20Claude%20Code-2563eb)](#支持范围)
[![License](https://img.shields.io/badge/license-MIT-16a34a)](LICENSE)

**简体中文** · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [繁體中文](README.zh-TW.md)

[真实成片](#真实成片演示) · [一分钟上手](#一分钟看懂怎么用) · [三分钟安装](#三分钟安装) · [支持范围](#支持范围) · [常见问题](#常见问题)

</div>

> [!IMPORTANT]
> `0.4.0` 起项目正式更名为 **Erduo B-roll Loop Engineering**，公开仓库与父 Skill 统一使用 `erduo-broll-loop-engineering`。双后端能力保持不变；稳定不表示同一镜头在 HyperFrames 与 Remotion 中天然视觉一致，也不表示任意既有工程都能自动修复。请先看[支持范围](#支持范围)。

## 真实成片演示

<p align="center">
  <img src="https://raw.githubusercontent.com/erduo1998-cell/erduo-broll-loop-engineering/main/docs/images/demos/infinite-canvas-pipeline.gif" alt="同一无限画布中从 SRT 时间锚点连续移动到语义分镜、双后端路由和批准后的 4K Master" width="100%">
</p>

这条 12 秒样片不是四页内容切换，而是一次连续空间穿行：摄影机沿同一条铜色时间轨道，依次经过 **SRT 时间锚 → 语义分镜与素材冻结 → HyperFrames / Remotion 路由 → 预览批准与技术验证后的 4K Master**。前一个阶段始终留在同一世界中并退入景深；全片没有换背景、卡片翻页或 PPT 式转场。

环境与装置素材由内置图像生成能力按统一美术设定制作，文字、空间运动、景深与光线由 HyperFrames 确定性编排。它用来演示本项目的生产路径和动画能力，不把概念样片冒充某个用户 SRT 的真实交付，也不构成 HyperFrames 与 Remotion 的视觉一致性声明。

## 一分钟看懂怎么用

<p align="center">
  <img src="https://raw.githubusercontent.com/erduo1998-cell/erduo-broll-loop-engineering/main/docs/images/demos/quick-start.gif" alt="从 SRT 到预览批准和 4K Master 的操作动画" width="100%">
</p>

1. 准备一份 SRT；口播模式再附上与字幕匹配的已剪视频。
2. 把文件交给 Codex 或 Claude Code，并点名使用 `erduo-broll-loop-engineering`。
3. Agent 自动完成语义分镜、素材冻结、后端路由、区块构建与整合。
4. 你只在完整预览出现后决定是否批准正式渲染；批准后交付经过技术验证的 4K Master。

最短提示词：

```text
使用 erduo-broll-loop-engineering，把这份 SRT 做成无人出镜 B-roll。
持续执行，直到完整预览需要我批准时再停下。
```

## 它解决什么问题

做口播 B-roll，难点通常不是“生成一个画面”，而是让整条片子的分镜、素材、动效、时间和交付持续对齐。这个 Skill 把工作拆给一个共用前段和两套独立后段：

- 读懂 SRT，按语义分镜，而不是一句字幕配一个镜头；
- 优先使用你的图片、视频、Logo 和截图；只有镜头声明真实素材需求时，才评估可控生成、Pexels 或对应事实来源；
- Director 一次冻结叙事包络和共享视觉系统，再用紧凑 Recipe v2 描述每镜差量、hero frame、micro-beats 与素材需求；
- 把后端连续区块进一步拆成完整镜头组成的 `authoringUnits`：默认 1–3 镜且绝不超过 40 秒，由聚焦的 Builder 并行构建；
- Builder 先完成最大可见状态，再编排进入、因果动作、跟随、settle 与 readable hold；优先查询小型 craft 索引和已锁定的运行时能力，命中后只加载必要参考；
- 安装或升级时一次完成深度环境排查；每条视频只运行轻量 preflight，正常生产不再派 Onboarding Agent；
- Builder/Integrator 从真实运行时逐帧采集 geometry，并用代码检查进出场、settle、遮挡、积压、构图层级和运动焦点；通过时不抽帧，只有异常才生成定点证据；
- 分镜后按 capability 与实测/来源证据逐镜选择后端，再把相邻同后端镜头合并为区块；
- HyperFrames 使用锁定的官方 Skill；Remotion 只使用目标项目本地锁定的 CLI 与依赖；
- 整合后先给你看最终预览，得到明确同意才正式渲染；
- 默认交付一个经过分辨率、时长、连续覆盖和解码检查的 4K Master。

它不是一键“审美保证器”。代码筛查只能发现可测的运动与构图风险，不能证明故事感染力、重量感、弧线、夸张或 appeal；最终完整动态预览仍是唯一默认审美决定。`v0.7.0` 的冻结 first-pass benchmark 继续作为历史基线，不外推到所有输入。

### v0.8 Production Slim

这一版只抓三件事：首次安装/升级一次性排查环境，日常制片只做轻检；重复抽帧改为运行时 `motion-layout` 代码筛查，异常才取证；父 Skill 和核心阶段删除重复合同，按需加载 reference。确定性 Prompt-load 字节代理相对 v0.7.0 降低：父默认 `95.89%`，HyperFrames `79.93%`，Remotion `79.87%`，Hybrid `82.58%`。复跑命令：`npm run measure:context -- --baseline v0.7.0`。

这些数字是默认 Prompt 文件的可重复代理，不等于真实宿主 token 或端到端产物 I/O。HyperFrames 无可信 geometry hook 的元素会标记为 `unmeasured`；Remotion 的真实捕获依赖目标项目本地浏览器和精确依赖；本版不声明跨后端视觉一致性。

### v0.7 的第一次预览 craft 升级（历史基线）

`0.7.0` 没有增加 stage、审查 Agent、逐镜审批、审美评分或 lookdev 停点。其默认生产链唯一的审美决定也是完整 composition preview。

这一版把跨镜重复的颜色、字体、材料、空间、构图家族、运动性格和禁用默认项集中到一个 `visual-system.json`；`narrative-envelope.json` 只保存一次全片上下文；每份 Recipe v2 只描述该镜的可见状态变化和边界。Builder 只接收自己的 authoring unit、相邻接缝摘要、共享 artifact locator、冻结素材和实际命中的 0–2 份参考，不应读取全片所有 Recipe 或完整目录。

长镜通过 `microBeats[]` 规划主体、拓扑、景别、空间层级、材料状态、关系或注意力位置的真实发展。单纯透明度、轻微位移或同构卡片换字不算新的可见 beat。普通媒体也需要通过焦点几何、裁切、mask、路径、标注、取色或前后景关系参与构图，不能只贴进通用白卡。

HyperFrames 的 seek canary 不是新增 stage、审查 Agent、审批点或永久证据包。它只在当前机制没有同环境 witness 时运行，用来在写完整 unit 之前发现缺失依赖、错误 adapter 或不可 seek 的墙钟动画；失败时在 Builder 内改选已存在的机制，不为通过测试临时安装依赖。

Recipe schema v1 和 Runtime Plan schema v1 继续可读；旧 run 不要求迁移。v2 才使用共享 artifact 和 `authoringUnits`，两代合同都保留 SRT 整数毫秒、完整覆盖、来源与字体闭包、运行时隔离、身份绑定和媒体验证底线。

历史 benchmark 记录：v0.7 Director + Builder 实际 Markdown/JSON I/O 只减少 `5.20%`，handoff prose 减少 `73.59%`。v0.8 的 Prompt 代理另行记录，不能替代真实端到端 Agent I/O。

本版对 `vibe-motion/auto-motion@17ead629d010f7e5495f645d46fafd6876482c32` 做过设计思想审计；审计时未发现 LICENSE。本仓库只 clean-room 重建设计能力与可观察行为，没有复制其代码、Prompt、范例、素材或文字。对应机器可读边界随 craft attribution manifest 一起进入发布包。

## 一张图看懂完整流程

<p align="center">
  <img src="https://raw.githubusercontent.com/erduo1998-cell/erduo-broll-loop-engineering/main/docs/images/workflow-zh.svg" alt="Erduo B-roll Loop Engineering 中文工作流程：输入、安装、分镜、素材、构建、整合、预览、渲染" width="100%">
</p>

你实际只需要做三件事：

1. 准备 SRT；口播模式再准备与字幕匹配的已剪视频。
2. 安装或升级时完成一次必要环境授权；需要 Pexels 素材时再配置 Key。
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

仓库先用运行时无关的 Shot Recipe 冻结镜头意图，再由确定性 Runtime Planner 逐镜选择后端，把相邻同后端镜头合并为连续区块，并生成默认 1–3 镜、最大 40 秒的完整镜头 `authoringUnits`。

- 用户明确说 `hyperframes` 或 `remotion` 时，强制整片单后端；也可明确选择 `auto` 或 `hybrid`。
- 现有项目按真实特征判断；同时命中两类特征时停止并请用户选择，不静默猜测。
- 空白新项目且用户未指定时默认 `auto`。
- `hyperframes` 走现有 Master Build → Integrate → Render 链路。
- `remotion` 走 Remotion Build → Integrate → Render 链路；已有项目必须能证明本地精确版本和 local CLI，新项目由该后段显式 scaffold 并生成 lockfile。
- 发行版不固定单一 Remotion 版本；targeted preflight 按项目的 package/lock/local CLI 身份验证一个具体稳定版本。HTML-in-canvas 镜头只在真实需要该能力时执行 still canary，失败时仅关闭该能力。
- `auto` 可落到单后端或 hybrid；hybrid 只交换带 hash、FFprobe 和完整解码证据的冻结区块媒体，不实时嵌套两套运行时。
- 安装器不会把 Remotion 加入共享 runtime 或全局安装。Remotion 的许可、依赖与执行范围属于用户选择的目标项目。
- 运行时选择不构成视觉一致性声明，也不表示任意 Remotion Composition 可以自动转换成 HyperFrames。

可直接检查一个项目的路由结果：

```bash
node erduo-broll-loop-engineering/scripts/detect-runtime.mjs --project <项目目录> --json
```

也可显式追加 `--runtime auto|hybrid|hyperframes|remotion`。Director 完成后用 `plan-runtime.mjs` 生成并校验后端区块计划。详细证据边界见[支持矩阵](SUPPORT-MATRIX.md)。

开发者可以对 Director 生成的逐镜头 Recipe 目录运行零依赖校验。校验器按 `schemaVersion` 同时接受 v1 和 v2；v2 还会验证共享 narrative/visual artifact：

```bash
node erduo-broll-loop-engineering/scripts/validate-shot-recipes.mjs <shot-recipes-directory>
```

## 镜头能力目录

`0.7.0` 继续收录 **152 张上游 Markdown 镜头卡原文**，覆盖目录中的 **209 个 style 条目**。本项目另外生成带 `adaptationNotice` 的检索目录和完整性 manifest。它们是按需查询的技法辞典，不是每镜必经的选型菜单：Director 必须先独立完成创意，只有遇到具体未解技法问题或用户明确要求时才查询；整片 0 次查询、0 张卡也是完整有效的结果。

请准确理解这里的“吸收”：

- 已验证的是卡片数量、style 覆盖、唯一 ID、来源 commit、逐文件哈希、查询闭集和发布包闭集；
- 上游卡片正文用于两个后端的镜头语义；Remotion Builder 还可以只读取所选卡片 manifest 绑定的固定 TSX 来源作为改编参考，但必须替换 fixture/媒体并写入独立目标项目，不能在运行时直接导入参考树；
- **152 张卡片不等于 152 个已经渲染验证的 HyperFrames 组件**，也不等于 Remotion TSX 可以自动转换；
- 镜头卡不提供用户素材；图片、视频、Logo、UI 与字体仍独立走用户素材 → 可控生成 → Pexels → 运行时原生结构路由；
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

`0.7.0` 另有一个原创、短小、运行时中立的 craft 索引，用来定位 hero-frame、motion grammar、素材前提和后端实现方向，不是现成模板或审美评分器：

```bash
# 查看 craft 摘要与分类
node erduo-broll-loop-engineering/scripts/query-craft.mjs --summary

# 搜索后只读取一个命中条目
node erduo-broll-loop-engineering/scripts/query-craft.mjs --search 'asset fusion'
node erduo-broll-loop-engineering/scripts/query-craft.mjs --entry <craft-id>
```

## 使用前准备

### 必须准备

- 一台 Mac；
- Codex 或 Claude Code，且宿主支持 Skill、文件读写、命令执行和真正独立的子 Agent/任务；
- 一份 `.srt` 字幕；
- 口播模式下，与 SRT 时间一致的已剪视频；
- 可访问 Node.js 官方发布目录、npm registry、GitHub 官方 Skill 来源和 HyperFrames 官方浏览器源的网络；实际镜头需要 Pexels 时还需访问 Pexels。

### 可选准备

- 你的图片、视频、Logo、产品截图、网页截图或品牌素材；
- 特殊输出比例、分辨率、帧率、音频、品牌或隐私要求。

### 不用提前准备

- 不用自己安装 Node.js：缺失或低于 `22.20.0` 时，安装器会安装固定版本到用户目录；
- 不用写 `design.md`：Director 会根据本期 SRT、目标和素材建立视觉方向；
- 不用手工复制十四个 Skill：安装器会同时安装父 Skill和十三个阶段 Skill；
- 不用为了纯原生 MG 提前申请 Pexels Key；镜头确实需要 Pexels 时再通过安装器的不回显输入配置，Key 不能发进聊天。

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
8. 可选地安全配置 Pexels Key，并在保存前做真实轻量验证；不配置不会迫使纯原生 MG 搜索素材。

它不会使用 `sudo`，不会修改 shell profile，也不会让第三方安装器直接写真实 HOME。发现不同的已有 Skill 时，它会先列出冲突、请求一次授权，再做可恢复备份；任一步失败都会逆序恢复已改变的目标。

首次冷安装需要下载 HyperFrames 的完整锁定依赖、固定 Skill 源和浏览器，在普通网络下可能需要 10–20 分钟；每个网络阶段都有硬超时，固定 Git 拉取最多重试三次。失败后可直接重新运行，已完成的 npm 缓存和应用自有运行时会复用，安装器不会把半成品 Skill 链接进宿主。

如果缺少 FFmpeg/FFprobe，只有在本机已经安装 Homebrew 且你明确同意时，安装器才会执行 `brew install ffmpeg`；它不会擅自安装 Homebrew。

### 获取 Pexels API Key

Pexels 是条件式素材来源，不是每条片的固定消耗。只有实际 Recipe 声明普通媒体需求且路由命中 Pexels 时才需要 Key；纯原生 MG 可以不配置。

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

正常情况下只有一个生产停点：

1. **正式渲染批准**：整合完成后先给出唯一一次完整动态预览。你需要观看并明确回复“同意正式渲染”，Render 才会开始。

首次安装或升级时由安装器一次性完成深度环境检查并保存结果。日常制片只跑轻量 preflight；只有缓存失效或真实工具故障才进入定点诊断与授权，不是每条视频的固定停点。

Pexels 账号注册、API Key 获取、系统权限、管理员批准、磁盘清理和云服务登录都必须由你本人完成，Agent 不会冒充。

## 这套 Agent 链怎么分工

| 角色 | 负责什么 | 明确不做什么 |
| --- | --- | --- |
| Parent Producer | 明确目标、派发、读交接、审查、把返工交回责任阶段 | 不亲自生产文件或假装子 Agent |
| Onboarding（异常路径） | 只诊断缓存指出的安装/工具故障并执行获批修复 | 不进入正常制片链，不做分镜和创作 |
| Runtime Selector + Planner | 开工前冻结选择意图，分镜后按 capability/pattern evidence 逐镜规划、连续分块并生成聚焦 authoring units | 不读语义关键词，不制造无证据切换 |
| Director | 理解 SRT，冻结共享视觉系统、叙事包络和紧凑 Recipe v2 | 不下载素材、不写最终工程 |
| Assets | 检查用户素材，只为真实 material need 路由并冻结媒体/字体/融合几何 | 不为履行流程无条件搜索 Pexels |
| HyperFrames Build / Integrate / Render | 用锁定的官方 Skill 构建、整合、预览与交付 | 不接管已选择的 Remotion 项目 |
| Remotion Build / Integrate / Render | 用目标项目本地锁定依赖构建 Composition、整合并交付 | 不全局安装 Remotion，不调用 HyperFrames 代渲染 |
| Hybrid Integrate / Render | 校验冻结区块媒体、检查跨后端接缝、绑定批准并用 FFmpeg 交付 | 不实时嵌套运行时，不互导生成源码 |
| Shot Export | 按需从已验证 Master 导出逐镜头文件 | 不重新独立渲染镜头 |

发生普通媒体需求时的素材优先级：

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
| Remotion 项目提示依赖未就绪 | targeted preflight 返回缺失的项目依赖事实；确认许可与项目内安装后创建精确 package/lock 并验证 local CLI，不进行全量环境复查，也不会全局安装或让 `npx` 临时下载 |
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

GitHub 会把旧仓库地址重定向到新仓库，但本地 clone 的文件夹名不会自动改变。拉取 `0.8.1` 后重新运行 `Install.command`：安装器会严格验证 schema 1/2/3/4 的历史所有权，升级到 schema 5，重新绑定十三个阶段 Skill，并保留冲突备份与回滚。目标被改动时安装器停止，不会删除。

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

## 多语言说明

本仓库提供 [English](README.en.md)、[日本語](README.ja.md)、[한국어](README.ko.md) 和[繁體中文](README.zh-TW.md)快速指南。生产输入不限定中文，但实际语言质量取决于宿主模型能否理解该语种，以及项目字体是否覆盖对应字形；默认 B-roll 仍不会烧录整段字幕。
