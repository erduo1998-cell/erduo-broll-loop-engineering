# 风格原子：标题与关键文字品味门

用途：让标题、金句、章节字和 UI 字段摆脱 AI 味默认字体与散乱层级。

- 适用：标题镜头、金句镜头、章节过渡、UI/文档模拟、数据标签和任何被观众主动阅读的文字。
- 约束：标题文字必须有字体角色、字重、行高、每行字数、留白、强调方式和结果停留预算。禁止无来源默认 `Inter`、system/browser sans、Arial、Helvetica、Roboto、Poppins、Montserrat；也禁止把 Fraunces、Instrument Serif 等常见“AI 海报感”衬线字体当无来源默认。中文标题优先使用可验证 CJK 字体角色；英文/数字只在有来源或角色理由时独立设定。
- 验收：标题不超过可读行宽，长词/中文不断裂，字重差异服务信息层级；render 私有状态记录 actual font family、role、glyph coverage、line-height 和 override reason；pixel gate 与主 agent 用 `result` 帧检查标题完整可读，verify 只核验字体与 main review ref 的确定性绑定。

边界：这是 advisory atom。用户提供的品牌字体或产品源可覆盖，但必须在 trace 中写明来源和授权边界。
