# 分块与整合阶段的静帧补充事实合同

每个 `broll-master-build` 块可在七类即时验证中从冻结 source
生成 target-raster `entry`、`result`、`exit` still；integrator 可聚合这些
事实重新运行全片像素门。它们不是动画质量审批、用户预览、缩略图分镜板
或额外交付视频。

## 证据

私有 evidence 使用当前 style contract：每镜含 `shot_id`，三态各绑定
block/source/shot/phase、共享 projection 的 projected frame 与
`timestamp_ms`、renderer/capture receipt、review generation、实际编码字节与
decoded pixel hash。每个 locator 及其全部祖先必须非 symlink。任何
source、asset、font、timing、projection、renderer 或 raster 改变都会使证据
失效。文件名、DOM、元数据、镜头标签或不同 hash 不能代替实际像素。

确定性 scope 覆盖完整时间线并比较相邻 result，一次聚合：

- 黑空、亮底低信息、大面积单色、过小文字和巨大死区；
- 相邻 result 的像素、显著变动区域与空间分布都近似；
- 字体没有加载、文字被裁切、主体/素材不可见或结果区没有素材贡献；
- Pexels/生成素材启用与禁用时声明区域没有有效像素贡献。

运行确定性像素门校验 frozen bytes 并输出 path-free report。随后主 agent
必须读取全部当前 block source、actual compact shared directive、scoped
recipes、still 与 facts generation，签发静态限定的
`style_conformance_review`。未批准或 `revision_required` 都禁止进入
integrator；integrator 还必须对当前字节独立重跑 validator。静帧不得出现
`animation_approved`、节奏、transition、生命周期或 seek 批准。

动画的位置、顺序、时长、生命周期和错误由最终 render 前的实际源码
`source_code_review` 判断。问题归属某块时只向该块返回一份聚合返工包；
第二次仍失败即停止，integrator 无权修改块源码。
