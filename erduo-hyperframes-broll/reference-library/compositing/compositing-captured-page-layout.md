# 合成原子：截图布局坐标

用途：让界面类镜头使用真实截图和元素坐标进行合成，避免低清放大和假布局漂浮。

- 适用：网页、产品 UI、文档、表格、控制台、仪表盘和任何需要保真展示的页面。
- 约束：截图至少应支持最终画面清晰度；元素高亮、标注、抠图和卡片叠加必须落在真实坐标系中。没有真实页面时，要在 director brief 中说明这是概念化 UI，不能冒充产品截图。
- 验收：assets receipt 记录截图/裁片资产角色；render evidence 记录 layout 坐标映射；pixel gate 与主 agent 检查重要文字不因 transform 放大而糊掉，verify 只核验 evidence/receipt 哈希绑定。

外部吸收边界：吸收 video-shotcraft 页面采集管线的方法论，不复制 Puppeteer 脚本或示例素材。
