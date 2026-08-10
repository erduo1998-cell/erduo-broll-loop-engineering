# Changelog

本项目遵循 Semantic Versioning。稳定版本冻结公开的 Skill、目录、查询与发布包契约；运行时支持等级仍以支持矩阵的实际证据为准。

## Unreleased

## 0.2.0 — 2026-08-10

- 新增 runtime-adapter foundation：用运行时无关 Shot Recipe、能力矩阵、映射文档和零依赖校验器冻结 HyperFrames/Remotion 的适配边界。
- HyperFrames 继续作为默认且唯一具有本项目生产证据的运行时；Remotion 仅为实验性契约，不捆绑、不安装，也不代表已完成双端渲染或全自动转换。
- 从固定的 `video-shotcraft@41ee360d82f4c491ba9d88a24a4add7d8ff1cf8b` 收录 152 张 byte-identical Markdown 卡片原文，并生成 209 个全局唯一 style 索引；保留 Apache-2.0、来源路径、逐文件字节数与 SHA-256。
- 新增渐进式 Shotcraft 查询命令：stats、list、search 只返回摘要，card 才读取单卡全文；`--style` 只能随 `--card` 限定卡内 style。
- 明确不复制上游 TSX、Remotion 工程、媒体和运行时依赖；152 张能力卡不等于 152 个已验证 HyperFrames 组件。
- 首次安装把 HyperFrames 官方核心 Skill 固定到与 CLI 0.7.104 对应的 commit；锁定 `skills@1.5.22`，只在隔离 staging 中安装并验证，再与本项目 Skill 一起执行可回滚事务，避开官方 `skills update --full-depth` 在新机上的无进度克隆风险。
- Director、Assets 与 Builder 接入卡片查询和运行时中立意图，保持 Parent、Integrator 与 Render 的既有职责边界。
- 消除预览批准输入循环：预览 Agent 停止后，由新的 Render Agent 绑定未变更 composition 的批准证据并复检后渲染。
- 更新中文 README，补充 Shotcraft 能力边界、查询示例、许可证、零基础安装、三类使用提示词与支持范围。
- 新增中文八步流程图与作者联系方式；两项文档图片作为仓库展示资产，不进入严格白名单发布归档。
- 发布归档纳入 catalog、manifest、查询器、归因、152 张卡片和完整 Apache-2.0 文本；以显式白名单与 manifest 哈希闭集继续保持确定性发布边界。
- 新增公开 CI，执行完整测试与 Skill quick validation。

## 0.1.0-rc.2 — 2026-07-28

- 禁用 macOS `copyfile` 在发布 tar 中隐式加入 AppleDouble 成员，并让归档创建忽略扩展属性。
- 发布归档固定为无 PAX/GNU 元数据的纯 ustar；uid/gid、owner/group、mode 和 mtime 全部归一化，gzip header 不允许 comment、filename、extra 等可隐藏私密信息的可选字段。
- gzip 验证只接受一个 raw-deflate member，显式核验 footer CRC32/ISIZE 并拒绝拼接 member 或尾随字节；每个 tar 正文后的 512 字节对齐区必须全零。
- 发布验收改为先对压缩文件做有界 regular-file 读取，再由 Node 直接解析 gzip 后的原始 tar header、成员类型、路径闭集和内容哈希，不再信任可能隐藏成员的归档列表输出。
- 新增 AppleDouble、PAX/xattr、gzip metadata、owner 泄露、路径碰撞、特殊类型、摘要篡改及压缩炸弹回归矩阵，并对解包后的文件类型和完整成员闭集做二次验证。

## 0.1.0-rc.1 — 2026-07-27

- 建立提示词型父级监督与独立阶段 Agent 链。
- 正常运行不再依赖独立视觉规格文件。
- 固定 Assets/Pexels 素材阶段。
- Builder、Integrator、Render/Delivery 强制真实加载官方 HyperFrames Skill。
- 新增 macOS 一键安装、用户级 Node.js 引导、官方 HyperFrames 环境准备、Pexels 安全配置和可恢复卸载。
- 新增开源隐私、安全、贡献、支持矩阵与发布门。
