# 组件原子：页面相机框架

用途：把真实网页或产品界面作为可运镜的 2.5D 场景，而不是手画一个相似 UI。

- 适用：需要展示产品页面、文档、表格、后台、网页结果或具体界面状态。
- 约束：输入应包含高倍率页面截图、页面高度、元素坐标和必要的透明元素抠图；相机关键帧声明中心点、缩放、可选旋转和停留。文字区域优先保持正视或轻透视，不为了炫技牺牲清晰度。
- 验收：render evidence 记录截图资产 ID、layout 坐标真源、相机关键帧和局部叠加位置；pixel gate 与主 agent 检查关键文字和 UI 状态在 `entry/result/exit` 证据中可辨认，verify 只核验 receipt/hash 链。

外部吸收边界：吸收 video-shotcraft PageCam 的语义和坐标思路，不复制 Remotion `PageCam.tsx`。
