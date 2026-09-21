<div align="center">

# Erduo B-roll Loop Engineering

**给完整原始 SRT 与 design，独立 Director、连续章节 Creator、Parent 脚本与独立审美 Reviewer 接力完成可编辑 B-roll、逐镜成片与完整预览。**

[![Version](https://img.shields.io/badge/version-1.1.0-c87842)](CHANGELOG.md)
[![Platform](https://img.shields.io/badge/platform-macOS-17120e)](SUPPORT-MATRIX.md)
[![Hosts](https://img.shields.io/badge/hosts-Codex%20%7C%20Claude%20Code-c87842)](#支持范围)
[![License](https://img.shields.io/badge/license-MIT-17120e)](LICENSE)

**简体中文** · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [繁體中文](README.zh-TW.md)

[看成片](#40-秒真实成片) · [看操作](#四步完成) · [安装](#安装) · [真实边界](#真实边界) · [支持范围](#支持范围)

</div>

## 只想给自己的口播视频加动效？建议从 Agent Motion 开始

**如果你是看了介绍视频过来的，想为自己的口播视频制作动效，建议直接使用 [Agent Motion](https://github.com/erduo1998-cell/agent-motion/blob/main/README.zh-CN.md#start)。**

本项目采用多角色接力和多阶段 B-roll 工程流程，整体偏重，安装、理解与维护的门槛也更高。对于日常口播创作，Agent Motion 更贴近这个需求：把原片、完整 SRT 和制作要求交给编程智能体，制作动效视频并交付 MP4 与可编辑工程。

**[前往 Agent Motion，查看效果与安装步骤 →](https://github.com/erduo1998-cell/agent-motion/blob/main/README.zh-CN.md#start)**

Agent Motion 支持下载 ZIP 后启动安装，仍需准备 Node.js 22+ 和一个编程智能体，首次安装需要联网。它是独立项目，不是本项目的原地升级；本仓库的源码、文档与历史版本继续保留，供已有用户使用和工程研究。

许可区别：本项目采用 MIT；Agent Motion 采用非商业许可，商用须事先取得书面授权，详见其[使用许可](https://github.com/erduo1998-cell/agent-motion/blob/main/LICENSE)。

## 40 秒真实成片

<p align="center">
  <img src="docs/images/demos/homepage-showcase.gif" alt="Erduo B-roll Loop Engineering 40 秒真实成片：SRT 输入、语义分镜、素材融合、双后端构建与 Master 交付" width="100%">
</p>

> README 中是完整成片的轻量 GIF 版。原始 Master 为 3840 × 2160、30 fps、40 秒；它展示真实视觉能力，不代表所有输入都会得到相同画面，也不构成 HyperFrames 与 Remotion 的视觉一致性保证。

## 四步完成

<p align="center">
  <img src="docs/images/demos/quick-start.gif" alt="安装 Skill、把 SRT 交给 Agent、批准正式渲染的 HyperFrames 动画演示" width="100%">
</p>

| 01 一次安装 | 02 一句话开工 | 03 独立创作 | 04 审美返修与交付 |
| --- | --- | --- | --- |
| 安装或升级时准备固定运行环境 | 拖入完整原始 SRT 与 design；可附已剪视频和品牌素材 | Director 定方向，新上下文 Creator 按连续章节制作 | Reviewer 看真实画面；问题回到原 Creator 局部返修，再交付完整预览 |

最短提示词：

```text
使用 erduo-broll-loop-engineering，把这份原始 SRT 与 design 做成 B-roll。
保留完整原始输入，让独立 Director 定方向，用新上下文按连续章节制作，由 Parent 渲染，再让独立 Reviewer 看实际画面。发现问题交回原 Creator 局部返修，交付逐镜文件、可编辑源码与完整预览。
```

## 它替你完成什么

| 你交给它 | Agent 完成 | 你收到 |
| --- | --- | --- |
| 原始 SRT 与原始 design；可选口播视频、Logo、截图和品牌要求 | 独立导演、连续章节创作、脚本渲染、独立审美看片与原作者局部返修 | 可编辑 HTML、素材与来源、逐镜成片、检查图、完整预览和真实输出记录 |

- 时间严格锚定完整原始 SRT，镜头按意义划分，不按“一句字幕配一个镜头”机械切片。
- 新项目与已有 `broll-plan.json` 项目默认走 v1.1.0 的质量优先接力流程；完整原始 SRT、design 与已知素材始终留在同一个项目中。
- 独立 Director 先决定视觉世界、镜头边界、素材、动作发展和相邻承接；它交付精简总方向与逐镜卡，不编写动画源码。
- 每名 Creator 在新的创作上下文中负责一段连续章节。它收到完整原始输入、共用方向、自己的镜头卡和相邻接缝，避免背负 Parent 全部会话与无关 Skill。
- 不再固定“开头/信息密集段/后段三类样片”、固定 5 镜 canary 或每章 5–8 镜。只有风格不确定或共享转场复杂时，才先做有代表性的片段并观看。
- SVG 用来表达可读关系、遮罩或路径，不能拿抽象线条替代看不懂的主体；素材、构图、层级与动作都必须服务口播含义。
- Parent 统一运行计划校验、逐镜渲染、完整解码、检查图和预览装配。Creator 不重复找脚本、装环境或制造技术证明。
- Creator 先看自己的真实渲染；随后由独立 Reviewer 读取原始输入、方向和实际媒体，在不了解 Creator 解释与成本的情况下判断画面与动态承接。
- 问题交回原 Creator，只重渲染改变的镜头，并复查受影响镜头与接缝。没有变化的成片使用本地缓存，不整片重做。
- 默认交付按顺序排列的 shot 文件、可编辑 HTML、素材与来源、完整 preview、真实输出信息和剩余限制；部分预览必须明确缺哪些镜头。
- 默认规格为 4K、30 fps；明确的竖屏或其他画幅、帧率写入 `broll-plan.json`。Draft 与 final 分开，draft 不能冒充最终媒体。
- 时间和 Token 只能报告宿主实际记录；不能用文件大小推算，也不能把局部缓存直接宣传成整体节省。

## v1.1.0：质量优先的创作接力

v1.1.0 把当前新项目主链改为：**独立 Director → fresh 连续章节 Creator → Parent 脚本渲染 → 独立审美 Reviewer → 原 Creator 局部返修**。创作角色各自获得足够但精简的输入，完整原始 SRT 与 design 始终保留；Parent 负责机械执行，审美结论来自实际画面而不是“渲染成功”。

每个 Creator 继续拥有自己的源码和后续返修。修改一镜时，脚本只重做受影响媒体并复用本地已验证结果；复杂接缝会连同相邻镜头复查。该流程以画面质量为第一目标，**尚未证明整条生产一定更省时间或 Token**。任务准备工具只整理必要输入，不能自动清除宿主注入的全部上下文，也不强制沙箱。详细实测见[开发验证记录](docs/LEAN-WORKFLOW-VALIDATION.md)。

v1.0.1 的 Recipe/runtime-plan v1–v4、明确 Remotion/hybrid 或明确要求五镜版本对照的项目继续走[兼容流程](erduo-broll-loop-engineering/references/legacy-production.md)，不自动迁移，也不把旧审批规则混进 v1.1.0 新主链。

## v1.0.1：恢复 Chapter Builder 创作闭环

v1.0.1 已正式发布。语义与最终媒体边界仍是一镜一份独立 H.264；创作边界改为一个 Chapter Builder 负责通常 5–8 个连续镜头。它直接读取完整原始 SRT 与 design，保留不可修改的 `truth`，可以用一句理由修改 `creativeProposal`，并对整章的构图变化、素材、节奏和相邻承接负责。

Assets 只冻结已知共享素材、字体与授权，不再提前关闭镜头专项 `search`、`generate` 或 `mixed` 路线。Lead 必须交付原生图形/文字、真实或生成素材融合、信息密集界面/流程/数据三类真样片，并落实 design 指定的 signature motion、素材融合能力和一页以内能力索引。Chapter Builder 完成源码后必须真正打开每镜 6 格图和 chapter preview，修掉低级错误，再返回简短的 `accepted` 或 `revised`；通过 trace、inspection 或 diagnostics 不再构成完成。

生产源码不再要求 `inspection.tsx`、DOM trace 标记、人工 motion window 或通过态密集 diagnostics。Parent 只负责确定性的逐镜渲染、FFprobe、完整解码、hash、媒体合同、6 格图和 preview 装配。正向十二原则以短锚点进入角色提示，每镜只选 2–4 条相关 `craftIntent`，不逐条评分或造证明。

默认生产后端为 HyperFrames；Remotion 仅限明确指定或 canary，`auto` 为实验模式。先完成 5 镜头 canary：5/5 直出解码、Builder 真正看片、至少三种构图、至少两镜素材融合、design 能量与两种 signature motion 可见、用户至少选择本版 3/5，且首版不超过 45 分钟。用户未作选择前不得启动完整长片。本版发布前已用同一份 `179.866` 秒、`124` 条 cue 的原始 SRT/design 完成全新 canary，5/5 技术与观看闭环通过；用户观看盲测后明确认可效果，并明确选择不继续剩余镜头或全片预览。该决定只批准 v1.0.1 机制与 canary 画面，不冒充完整长片验收。

2026-08-18 的 `179.866` 秒 Remotion 技术实测仍作为失败依据保留：虽然 20/20 shot、完整解码和媒体合同通过，但它产生 20 个创作 unit、缺少原始 design 直达、素材使用不足，且技术检查通过没有带来合格视觉结果；`203m13s / 54m17s / 63m13s` 也未达目标。它不证明本次创作闭环已经通过，也不证明双后端等价。

## v1.0.0：先锁定视觉，再批量生产

- 视觉锁定成为默认生产门：三个代表场景、选择理由、字体/颜色/栅格/motion token、真实动态结果、每后端共享源码、Director 见证和用户决定共同绑定身份。
- Runtime Plan v3 把短语义镜头和 Builder 工作包分开；普通约 180 秒单后端任务以 2–3 个 Builder 为规划目标，但复杂镜头、后端边界和连续转场可以形成例外。
- 默认轻量冻结媒体改为 H.264，不再默认生成 4K FFV1；预览和 Master 均从已验证片段稳定装配，保留源码、hash、FFprobe、完整解码和批准身份。
- 生产计量与分层 motion/layout 检查进入公开合同。技术测试不能替用户判断审美；视觉锁定和最终完整预览是两个不同的用户决定点。

[v1.0.0 公开生产基准](docs/V1.0.0-BENCHMARK.md)已完成一次同一 SRT 的 Codex 真实生产：`179.866` 秒、`124` 条 cue、`20` 个 Shot Recipe v3、`1` 名 Lead + `3` 名 production Builder、`10` 次 Agent 调用、`0` 次 full-history 调用，且没有外部素材。最终目录为 `213` 个文件、磁盘占用 `156,980 KiB`；完整 preview 和 Master 均通过完整解码。Director 开始到首次 preview 约 `242.05` 分钟，未达到 `≤120` 分钟目标；Lead `62.90` 分钟，也未达到 `≤45` 分钟目标。Director 对 visual lock 拒绝一次后定点返修通过，但用户没有观看或审美批准，状态为 `skipped`；宿主 Token 未知，音画同步未测，Claude Code 同输入对照仍为 pending。

## v0.9.2：创作不变，安装更容易通过审查

v0.9.2 只调整发行和安装入口。Director、Assets、多 Builder、152 张镜头卡、8 种图解 grammar、HyperFrames / Remotion 路由、预览审批和正式交付标准与 v0.9.1 相同。标准 Skill 包不含一键环境安装器、测试夹具或发布工具；完整环境包继续提供固定版本的一键准备。

## v0.9.1：创作保留，图解更容易看懂

- 保留 Director、Assets 和多 Builder 的创作分工，不把镜头收缩成固定模板，也不限制抽象、构图或动画复杂度。
- Director 先明确口播含义和画面任务，再自由设计视觉语言，避免风格替代内容表达。
- 非创作步骤交给确定性脚本，共用依赖与素材；Builder 交付可编辑源码和统一规格的已验证视频片段，返工只回到原责任 Builder。
- 节拍验证不仅检查计划和时间，还要检查对应时段是否出现计划中的可见发展；长镜头不能只靠线条、粒子或背景循环支撑。
- 当口播必须解释流程、因果、时间顺序、层级、循环、依赖、系统路径或同标准对比时，Director 可以按需选择 8 种轻量图解关系；没有图解数量要求，也不会加载外部完整 Skill 或套用固定视觉皮肤。
- Builder 仍按全片视觉系统自由设计空间、材质和动画。脚本只根据真实渲染结果检查连线穿过无关节点、文字压线/压节点、连线路径重叠和画面越界，不评价图解风格。

这些检查能发现计划未落地、长时间无主要发展和可测的构图风险，不能判断动画是否高级或替用户作审美决定。唯一完整动态预览仍由用户决定是否正式渲染。

## 工作流

<p align="center">
  <img src="docs/images/workflow-zh.svg" alt="从 SRT 到最终 Master 的 Agent 工作流" width="100%">
</p>

```text
SRT / 已剪视频 / 用户素材
  → 保留完整原始输入与已知素材
  → 独立 Director 定视觉世界、镜头与接缝
  → fresh Creator 按连续章节制作可编辑 HTML
  → Parent 统一校验、逐镜渲染、解码、检查图与预览
  → Creator 查看实际成片并自修
  → 独立 Reviewer 审美看片与检查动态承接
  → 具体问题交回原 Creator 局部返修
  → 只重渲染改动镜头，本地复用未变结果
  → 交付有序 shot、源码/素材、完整 preview 与真实限制
```

## 152 张 Shotcraft 卡不会限制创作

v0.8.1 已把 Shotcraft 从“逐镜必查菜单”改成真正按需使用的技法辞典：

- Director 必须先独立完成整片创意；
- 只有遇到具名、尚未解决的技法问题，或用户明确要求时才查询；
- 整片 0 次查询、0 个 `patternRef` 是完整有效结果；
- 镜头卡不是素材库，不能代替图片、视频、Logo、UI 或字体；
- **152 张卡片不等于 152 个已经渲染验证的 HyperFrames 组件**。

仓库固定收录 152 张上游 Markdown 卡片、209 个 style 和来源哈希，来源为 [`Vincentwei1021/video-shotcraft`](https://github.com/Vincentwei1021/video-shotcraft)。Agent 只渐进读取真正命中的单张卡，不会把整个卡库塞进上下文。

## 安装

> 以下是本项目的安装方法。只想制作自己的口播动效，请优先按 [Agent Motion 的入门步骤](https://github.com/erduo1998-cell/agent-motion/blob/main/README.zh-CN.md#start)安装。

### 标准 Skill 安装

适合已经准备好本项目固定 HyperFrames 环境、只需要向一个宿主注册 14 个项目 Skill 的用户。标准包不含一键环境安装器、测试夹具或发布工具，也不会静默安装 Node、浏览器或 FFmpeg。

从 [v1.1.0 Release](https://github.com/erduo1998-cell/erduo-broll-loop-engineering/releases/tag/v1.1.0) 下载 `erduo-broll-loop-engineering-skills-v1.1.0.tar.gz`，解压到长期保留的目录，然后选择一个宿主：

```bash
npx -y skills@1.5.22 add ./erduo-broll-loop-engineering-skills-1.1.0 --skill '*' --agent codex --global --full-depth
# 或把 codex 改成 claude-code
```

这条路径通过 Skills CLI 的宿主通用 Skill 目录注册项目 Skill，不直接运行本仓库的一键环境安装器；它不会降低能力，也不负责准备运行环境。Node 22.20+、FFmpeg/FFprobe、固定 HyperFrames runtime、八个官方 HyperFrames Skill 或浏览器缺失时，生产前检查会明确停止；此时使用下面的完整环境安装。

### 完整环境安装

适合首次安装或不确定本机环境的用户：

```bash
git clone https://github.com/erduo1998-cell/erduo-broll-loop-engineering.git
cd erduo-broll-loop-engineering
./Install.command
```

安装完成后重启 Codex 或 Claude Code。不会 Git 时，可从 v1.1.0 Release 下载 `erduo-broll-loop-engineering-v1.1.0.tar.gz`，解压到长期保留的目录，再双击 `Install.command`。

> [!IMPORTANT]
> 安装器会让宿主 Skill 指向当前仓库目录。安装成功后不要随意移动或删除它；确需移动时，在新位置重新运行 `Install.command`。

<details>
<summary><strong>安装器具体做什么</strong></summary>

1. 检查 Node.js；低于 `22.20.0` 时准备用户级固定版本，不修改系统 Node 或 shell profile。
2. 安装锁定的 HyperFrames runtime 和官方 Skill，准备浏览器、FFmpeg 与 FFprobe。
3. 以事务方式注册父 Skill 和十三个阶段 Skill；冲突先备份，失败自动回滚。
4. Pexels 只在镜头确实需要普通媒体时配置；Key 不进入聊天、项目和日志。

首次冷安装可能需要 10–20 分钟。网络中断后可直接重跑，已完成的缓存会复用。

</details>

<details>
<summary><strong>更新、诊断与卸载</strong></summary>

```bash
git pull --ff-only
./Install.command
node scripts/doctor.mjs
```

卸载本项目 Skill 链接并恢复安装器备份：

```bash
node scripts/uninstall.mjs
```

卸载默认保留私有配置、共享 HyperFrames runtime 和用户目标目录中的工程。

</details>

## 真实边界

- v1.1.0 新流程先支持固定版本 HyperFrames。新项目和已有 `broll-plan.json` 使用该流程；已有 Recipe/runtime-plan v1–v4、Remotion/hybrid 与明确五镜版本对照使用兼容流程。
- 独立 Director、Creator 与 Reviewer 需要宿主真的启动新上下文；如果宿主不能独立委派，就必须说明无法按该标准完成，不能把同一上下文自评称作独立审美。
- Creator 收到完整原始输入与必要交接，但任务工具不能保证删除宿主自己的全局提示或形成沙箱。
- Draft 最多 15 fps、最长边按正式规格减半；final 使用计划中的完整规格。现有固定 HyperFrames 版本即使做 1080p draft，仍会先按源画幅捕获再缩小。
- 检查图是看片入口，不等于完整播放。Reviewer 没有连续看完整 preview 时，必须写明仍有动态不确定性。
- 没有固定样片数、镜头数、素材配额或装饰元素数。代表片段只在风格不确定、复杂共享转场或用户明确要求时制作。
- 局部缓存已能避免无变化镜头重复渲染，但现有对照混有环境故障和无效搜索，尚不能证明端到端时间或 Token 降低。
- Remotion、hybrid、旧合同与旧 Master 仍受 v1.0.1 兼容规则约束；HyperFrames 与 Remotion 的视觉一致性不作保证。
- Windows、剪映 / CapCut GUI 和任意旧项目自动修复尚未验证。

详细证据见[支持矩阵](SUPPORT-MATRIX.md)，版本变化见[更新记录](CHANGELOG.md)。

## 支持范围

| 环境 | 状态 |
| --- | --- |
| macOS + Codex | supported；已有真实生产、v1.1.0 同输入对照与局部返修验证 |
| macOS + Claude Code | experimental；安装契约已验证，尚缺当前版本同输入完整对照 |
| HyperFrames | v1.1.0 新项目默认；质量优先接力、逐镜渲染与局部缓存已验证 |
| Remotion | v1.0.1 兼容路线；不全局安装，不声明视觉等价 |
| Windows | unverified |
| 剪映 / CapCut GUI | unverified |

## 常见问题

<details>
<summary><strong>Codex / Claude Code 找不到 Skill</strong></summary>

彻底重启宿主，再运行 `node scripts/doctor.mjs`；同时确认仓库目录没有被移动或删除。

</details>

<details>
<summary><strong>预览不满意怎么办</strong></summary>

指出镜头、时间点和具体问题。Parent 会把反馈交回原 Creator，只重渲染变化的镜头，再复查该镜与相邻接缝。

</details>

<details>
<summary><strong>可以只用 HyperFrames 或 Remotion 吗</strong></summary>

可以。v1.1.0 新流程使用固定 HyperFrames；明确要求 Remotion 或 hybrid 时转入 v1.0.1 兼容路线，不自动混用两套流程。

</details>

<details>
<summary><strong>可以导出每个镜头吗</strong></summary>

新生产默认已经交付逐镜直出的 shot 文件，不需要再从 Master 切割。旧 Master 才使用兼容导出工具。

</details>

## 隐私与网络

本仓库自身不采集或发送遥测，子进程默认设置 `HYPERFRAMES_NO_TELEMETRY=1`。首次准备可能访问 Node.js 官方目录、npm registry、GitHub 上的 HyperFrames 官方 Skill 来源，以及 HyperFrames 官方浏览器源执行 `browser ensure`；实际使用 Pexels 时才访问其 API 与 CDN。

SRT、视频、用户素材、阶段记录和渲染产物默认留在本机。Key 不进入项目、产物、命令行或日志。本仓库只能约束自己启动的进程；如果在发行包之外直接调用 HyperFrames，其网络和隐私行为受 HyperFrames 自身实现与政策约束。

完整说明：[隐私](PRIVACY.md) · [安全](SECURITY.md) · [第三方声明](THIRD-PARTY-NOTICES.md)

## 开发与贡献

[精简制作契约与命令](erduo-broll-loop-engineering/references/lean-production.md) · [动效参考](erduo-broll-loop-engineering/references/motion-patterns.md) · [v1.0.1 兼容流程](erduo-broll-loop-engineering/references/legacy-production.md)

```bash
npm test
npm run task:creative -- --project /path/to/project --role director
```

提交 PR 前请运行测试和 Skill 校验。不要提交 API Key、Cookie、私人路径、用户 SRT、用户素材或未脱敏日志。贡献规则见 [CONTRIBUTING.md](CONTRIBUTING.md)，项目采用 [MIT License](LICENSE)。

## 联系作者

<table>
  <tr>
    <td width="260" align="center">
      <img src="docs/images/wechat-contact.jpg" alt="耳朵微信二维码" width="220">
    </td>
    <td>
      <strong>刘冉 / 耳朵</strong><br><br>
      AI 咨询顾问 · 前影视导演 · 开源 Agent 工具实践者<br><br>
      GitHub：<a href="https://github.com/erduo1998-cell">@erduo1998-cell</a><br>
      主页：<a href="https://erduo.art">erduo.art</a><br>
      微信：扫描左侧二维码
    </td>
  </tr>
</table>

<div align="center">

[English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [繁體中文](README.zh-TW.md)

</div>
