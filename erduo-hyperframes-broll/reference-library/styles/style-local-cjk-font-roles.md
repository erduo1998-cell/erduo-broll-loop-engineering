# 风格原子：本地中文字体角色

用途：在没有用户 design 或产品 CSS 指定字体时，为中文 B-roll 选择可验证的本地字体角色，避免回到 AI 味默认字体栈。

- 适用：镜头包含中文标题、金句、标签、注释、数字说明或字幕外文字。
- 约束：禁止把 `Inter`、`ui-sans-serif`、`system-ui`、`-apple-system`、`BlinkMacSystemFont`、`Segoe UI`、`Arial`、`Helvetica`、`Roboto`、`Poppins`、`Montserrat` 作为内部默认。优先按角色选择本地 CJK 字体：标题可用黑体/宋体显示角色，正文用清晰中文正文字体，数字用具备 tabular nums 的字体或单独数字角色。
- 验收：render 私有状态记录 actual font family、role、weight、scale step、line-height、glyph coverage 和 source reason；未验证中文字符覆盖不得通过。

边界：这是 advisory atom。用户 design、产品 CSS 或截图证据优先；采用或拒绝都必须写入 reference_atom_trace。
