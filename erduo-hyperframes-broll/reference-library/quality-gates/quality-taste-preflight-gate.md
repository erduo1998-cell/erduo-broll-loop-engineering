# 质量门：Taste 预检

用途：把设计读数、字体计划、AI 味清扫和视觉密度变成可验证的前置门。

- 适用：director 完成设计方向后、render 前的全部文字/组件/实拍融合项目。
- 约束：必须记录 design read、视觉差异档、运动强度档、视觉密度档、字体/标题计划、AI 味禁用项清扫和真实素材使用策略。默认紫蓝渐变、三等分卡片、玻璃拟态、无来源 Inter/system sans、假 UI、图片上贴标签、无限循环动效和只有气氛没有语义的 stock 画面都必须被显式排除或由用户来源覆盖。
- 验收：`taste-preflight` gate 通过后，render 才能开始。若字体计划为空、三档拨盘缺失、AI 味清扫未完成，或与用户 design/reference 冲突，返回 director 修正。

边界：这是 advisory atom。抽象吸收自 MIT 来源 `Leonxlnx/taste-skill`；用户明确指定的品牌规范优先。
