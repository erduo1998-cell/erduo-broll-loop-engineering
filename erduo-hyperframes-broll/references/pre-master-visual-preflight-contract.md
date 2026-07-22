# Final-master 前的视觉预审合同

`broll-master-build` 在最终 4K master 前，从当前冻结 source 为每镜生成 target-raster `entry`、`result`、`exit` 高保真 still。它们是内部 hard-gate 与主 agent contact-sheet 审片证据，不是用户预览、缩略图分镜板或额外交付视频。

## 证据

私有 evidence 使用 schema v1：每镜含 `shot_id`，三态各含严格递增的 `timestamp_ms`、实际字节的 `frame_sha256` 和只在私有 artifact store 解析的 `frame_artifact_id`。任何 source、asset、font、timing 或 raster 改变都会使证据失效。文件名、DOM、元数据、镜头标签或不同 hash 不能代替实际像素。

首审 scope 必须覆盖完整时间线并比较每一对相邻 result。一次聚合所有发现，包括：

- 黑空、亮底低信息、大面积单色、过小文字和巨大死区；
- 相邻 result 的像素、显著变动区域与空间分布都近似；
- 焦点/hero 缺失、字体字形或 CJK 不可读、素材未融合、动作没有可读结果；
- Pexels/生成素材启用与禁用时声明区域没有有效像素贡献。

运行 `scripts/visual-preflight-pixels.mjs` 校验 frozen bytes 并输出 path-free report。非零退出或 `revision_required` 都禁止 final render。主 agent 再实际查看 contact sheet；只有 hard gate 通过且 `html_preview_review` 绑定当前 master-build manifest，才能渲染。

如主 agent 拒绝，master-build 只接受一份聚合返工包，批量修复并重建受影响镜头及相邻比较。第二次仍失败即停止，不创建 visual-review 子 agent 或逐问题微修上下文。
