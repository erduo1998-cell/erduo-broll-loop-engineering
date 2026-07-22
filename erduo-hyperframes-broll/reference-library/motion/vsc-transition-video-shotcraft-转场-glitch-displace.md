# video-shotcraft 转场：glitch-displace

来源：video-shotcraft 批量审计的脱敏抽象原子。具体证据见 handoff/VIDEO-SHOTCRAFT-*.json；本文件不复制 Remotion TSX、示例素材或音频。

- 用途：页面切 16 条水平条带 ±70px 抖动 + 2 份明暗错位重影（+12px 暗/-12px 反相），58f 抖动中硬切到新景
- 语义：电子撕裂/数据损坏风格的转场
- 约束：幅度包络：起势 out-cubic + 消散线性；底垫完整页防条带间露底色缝；重影用 brightness(0.45) 压暗 + invert(1) 反相代替 RGB 分离；归位后条带/重影全部条件卸载
- 验收：抖动幅度峰值可感（±70px），重影偏移可见，归位后无残留
- HyperFrames 改写：transition: {type: 'glitch', strips: 16, amp: 70, ghostOffset: 12, ghostLayers: 2, hardCutAt: 58, settleFrame: 62}

边界：这是 advisory atom。用户 design、真实素材、当期语义优先；采用或拒绝都必须写入 reference_atom_trace。
