# 质量门：字体来源与字形覆盖

用途：拦截无来源字体、浏览器默认字体和中文字符覆盖不足的文字镜头。

- 适用：任一镜头包含可读文本、数字、标签、UI 字段或文档模拟。
- 约束：字体必须来自用户 design、产品 CSS/截图证据、或参考库字体角色规则；不能从内部模板继承 `Inter` 或无来源系统 sans 默认栈。多语言文本必须逐角色验证字符覆盖，数字滚动必须验证等宽或 tabular nums。
- 验收：verify 确定性检查 render 私有状态中的 font proof、actual family、source reason、glyph coverage 与 hash；pixel gate 与主 agent 检查实际帧中的文字模糊或丢字。任一失败都阻断，但 verify 不得自证画面可读。

边界：这是 advisory atom。用户显式提供的品牌字体可覆盖，但必须写明授权/来源和覆盖理由。
