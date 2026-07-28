# Changelog

本项目遵循 Semantic Versioning。候选版在全部发布门完成前不承诺稳定 API。

## Unreleased

- 重写中文 README，补充零基础安装、Pexels Key、三类使用提示词、运行停点、故障处理、更新、卸载和支持边界。
- 新增中文八步流程图与作者联系方式；两项文档图片作为仓库展示资产，不进入严格白名单发布归档。
- 保持发布归档 42 个源码文件、43 个 regular member 的确定性边界不变。

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
