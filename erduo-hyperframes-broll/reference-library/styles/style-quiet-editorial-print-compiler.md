# Quiet Editorial Print 风格编译器

状态：`draft / calibration-only`。本条目只提供作者校准候选，不是全局默认，不得绕过模板生产晋级、当前 HyperFrames 实渲染与作者正反例复核。

来源边界：本编译器从 `LiamGvchi/gc-minimal-zine-poster` 的固定提交 `d2768f2a3488856af08ae5b2a3f8970d59197fdd` 提炼“身份 / 反身份 → 稳定共性 → 变化轴 → 有序编译 → 质量门”的方法。只保留可观察的抽象设计规则；不复制上游示例图片、示例文案、对象配方、品牌表达、竖版比例或文化风格标签。上游许可见 `assets/licenses/gc-minimal-zine-poster-MIT.txt`。

## 编译目标

把一条 SRT 语义编译为一个 16:9、全屏、不透明、平面印刷编辑页。输出应当像“信息经过纸面编辑和印刷过程后形成的可读结论”，而不是把竖版海报放大、把旧纸纹理贴到任意标题卡，或把若干纸片堆成拼贴。

本风格的身份：

- 负空间承担停顿与主次，而不是空白装饰；空白比例必须随语义密度分档。
- 每镜必须按 `user-media → image-generation → Pexels` 的不可变顺序冻结一个 ordinary-primary 材料，并证明它在结果区有可测像素贡献。
- 每镜只有一个语义锚点。文字主导时，真实排字是语义焦点，但普通主材仍由纸、印刷品或扫描素材承担；对象主导时，普通主材本身承载对象，排字退为证据或注释。
- 事实性文字、数字、名称与引用必须由 HTML 文本或 SVG `<text>` 真实排版，内容来自 SRT、用户材料或已批准文案；HTML/CSS/SVG 只做排字、结构、标记、裁切和辅助纹理，不能成为唯一或 primary material。
- 全镜只选择一个高色度强调色；它必须表达当前语义焦点，并在缩略图尺度仍可识别。
- 材质预算最多两项：纸基底固定占一项，只能再选扫描噪点、网点、轻微套印错位或墨渗中的一项。
- 动作来自印刷因果：进纸、压印、套准、吸墨或网点显影；动作完成后留下稳定、可读的结果。

本风格的反身份：

- 不是商业广告版式、产品宣传页、CTA、logo lockup 或社交媒体海报模板。
- 不是竖版 zine 仿制，不使用固定 3:5 比例，也不把 70%–90% 空白机械移植到所有 16:9 镜头。
- 不是复古素材拼贴、满版 scrapbook、随机撕纸、贴纸墙或“旧化滤镜合集”。
- 不是纯 HTML/CSS/SVG 标题卡、程序纸纹页或原生矢量 specimen；没有 ordinary-primary 材料的 native-only 页面不兼容本 profile。
- 不是 glossy mockup、摄影棚纸张阴影、电影灯光、景深、3D、霓虹或空间镜头。
- 不是以地域、民族或语言文化标签替代设计说明；只使用可观察的构图、排字、色彩与印刷约束。
- 不是“微型照片 + 蓝点 + 档案微字”的固定配方；同一视觉配方不得连续复制。

## 稳定共性

以下规则在所有 variation 中保持不变：

1. 画面比例仅为 16:9，使用单一不透明平面页面；不派生额外合成构件。
2. 每镜恰好冻结一个 ordinary-primary 材料，路由顺序固定为 `user-media → image-generation → Pexels`；选择后冻结 route、asset identity、provenance、具体材质用途与结果区像素贡献。
3. 每镜只有一个语义锚点，禁止两个并列主视觉；ordinary primary 与语义锚点可以是同一个对象，也可以在 type-led 镜头中分别是纸面材料与排字焦点。
4. 所有事实文字由 HTML/SVG 真排字；禁止让图像生成模型生成、补全或重绘事实文字，也禁止把 native 排字当作 ordinary primary。
5. 强调色只有一个高色度色相，其他纸色、黑灰墨和辅助标记保持低色度。
6. 纸基底加可选缺陷的材质过程总数不超过两项；ordinary-primary 素材已带的扫描、网点、套印或墨渗计入预算。
7. 动效必须有“物理印刷动作 → 可见状态变化 → 可读结果”的因果链，并由确定性局部时间驱动。
8. 动作不得侵占阅读停留；无法在固定 SRT 窗口内完成时，简化动作而不是延长时间线。
9. 负空间由语义密度决定；不能为了“看起来极简”删掉必要事实，也不能用虚构微字填空。
10. 相邻镜头必须在真实构图语法上产生差异，不能只换颜色、位置或文案。

## 16:9 密度分档

先判断本镜必须同时成立的独立事实单元数，再选密度档。百分比指整幅 16:9 画面中可读为空白纸面的面积，不把细微纸纹视为信息。

| 档位 | 语义条件 | 负空间 | 锚点占幅 | 排字上限 |
| --- | --- | --- | --- | --- |
| `low` | 1 个结论、短引用、单一情绪或单一对象 | 58%–72% | 8%–18% | 1 个主短句 + 1 个来源/注释组 |
| `medium` | 2–3 个互相依赖的事实、定义加限定、一步因果 | 44%–58% | 12%–24% | 1 个主句 + 最多 2 个支持组 |
| `high` | 4–6 个必须同屏比较或核验的事实 | 30%–44% | 16%–30% | 结构化为 2–3 个文本带；仍只有一个主锚点 |

若超过 `high` 的容量，拆镜或改用其他 profile；不得缩小成不可读微字。锚点不得贴边，四周保留约 5%–7% 的安全呼吸区。负空间可以集中在一侧或上下分配，不要求中心对称。

## WFR ordinary-primary 兼容不变式

这是 profile 级硬门，不是第八个 variation axis：

1. 每镜先检查 `user-media`。只要存在语义与画幅可用、权利边界明确的纸张、印刷品、照片、扫描件、文档裁片或 specimen，就冻结该资产为 ordinary primary。
2. 没有可用 user media 时，走 `image-generation` 生成一个不含文字、logo、水印、事实标记的纸 / 印刷 / 照片 / 扫描 / specimen 材料；事实内容随后由 HTML/SVG 排入。
3. image generation 不可用或不适合时，才走 `Pexels`，并冻结可许可、可追溯、与语义相关的普通材料。
4. 使用后置路线时必须记录前序路线为什么被拒绝；不能把偏好写成跳过顺序的理由。
5. Director / asset packet 必须冻结 `primary_route`、稳定 `asset_id`、provenance、裁切 / 色彩 / 材质用途和 result-region contribution 预期；authoring 后由像素门证明普通主材真实可见，不得透明、离屏或被 native 元素完全遮住。
6. HTML/CSS/SVG 只能承担真实排字、结构、标记、裁切、遮罩几何与辅助纹理。它们不能成为 ordinary-primary 路由，也不能在视觉结果中取代已冻结普通主材。
7. `type-led statement` 也不例外：其 ordinary primary 是可见的纸、印刷品或扫描材料，真实排字只是语义焦点。

## 单锚点编译

按语义选择一种锚点类型：

- `type-led statement`：短结论、定义或引用。先路由一个可见纸 / 印刷 / 扫描 ordinary primary，真实排字再成为语义焦点；不增加第二图像主角。
- `single specimen`：一个经路由的照片、印刷、扫描或 specimen ordinary primary 承载概念；SVG 只能做裁切、结构或标记，文字只作命名或证据。
- `evidence fragment`：一个真实文档片段、数据片段或引文区承载核验；若源外观本身是事实证据，必须由 user-media 提供，生成或图库材料不得冒充证据。
- `state imprint`：同一个经路由的 ordinary-primary 材料从输入态变为结果态，任一时刻不出现两个并列主角；HTML/SVG 只标记状态。

复杂主题先抽取一个可视化判断，而不是把整段叙述画成场景。image-generation 是 user-media 不可用后的第二 ordinary-primary 路线，不是可随意跳过的装饰选项；其输出只能是无文字、logo、水印与事实标记的非文本材料，真实文字随后由 HTML/SVG 排入。若使用 Pexels，必须记录前两条路线的拒绝理由。

## 真实排字

- 主句、数字、名称、引用、日期、来源与单位都必须是可选择、可核验的 HTML 文本或 SVG `<text>`。
- 文案只来自固定 SRT、用户材料或明确批准的 copy。不得凭空生成档案日期、地点、天气、编号或引语来制造氛围。
- 使用本地项目字体并验证实际 glyph coverage；禁止依赖远程字体或系统 / generic fallback。
- 允许 serif、typewriter-like serif 或 monospace 作为角色关系，但字体角色必须服务语义：结论、正文、来源/编号。
- 可做紧邻锚点、沿基线错位、局部字距变化或压印边缘，但不能降低事实文字的完整可读性。
- 微字只能承载真实、可核验的次级信息；没有次级信息时宁可保留空白。

## 色彩与材质预算

先从用户明确色值、品牌规范、真实素材或已批准项目调色板中选一个有证据的高色度色相。若这些来源都没有可用色，Director 必须根据本镜内容语义选择一个高色度色相，并在 director / authoring 规则中记录“所选色相 → 当前主张、校正或锚点”的映射理由；不能因为缺少明确色值就让请求失效。高色度区域通常占整幅 16:9 的约 1.5%–5%，或锚点面积的 15%–35%，以缩略图可辨识为验收，不机械追求数值。

强调色可作为锚点本体、实色印块、关键词、单条校正线或局部照片色域，但只能承担一种语义角色。没有来源色时也不得退回默认紫蓝渐变、预设科技蓝紫组合或第二个竞争色；不要用“陈旧、褪色、低饱和”削弱强调色。

材质过程按以下预算选择：

1. `paper substrate`：必选，由已冻结的 ordinary-primary 素材提供可见纸、印刷、照片、扫描或 specimen 材质；CSS/SVG 只能补充纯色支撑、裁切或辅助纹理，不能代替素材。
2. 从以下最多再选一项：`scan noise`、`halftone`、`slight misregistration`、`ink bleed`。

禁止把扫描、网点、套印、墨渗同时叠加。ordinary-primary 素材已经显现的扫描、网点、套印或墨渗占用第二项预算，不能再叠加一种。若可选过程不能表达当前语义或动作因果，只保留普通主材提供的纸基底。

## 印刷因果型 motion grammar

选择动作前先写清“为什么动”。动作必须对应已选择的材质过程：

- `pressure-imprint`：新结论被确认。在普通主材上让压印边界推进，真实排字从浅墨到稳定墨色；结果是完整可读的句子，普通主材始终可见。
- `paper-feed-reveal`：叙述进入下一证据或步骤。一个进纸边界带出目标镜冻结的 ordinary-primary 材料与新内容，边界离场后页面完全稳定。
- `registration-settle`：两个说法被校正、对齐或归一。只对同一 ordinary-primary 锚点做短距离辅助色版偏移并套准；不是持续抖动。
- `halftone-resolve`：模糊证据变得可辨。辅助 SVG/CSS 网点密度或遮罩从粗到清晰，最终停在可核验的 ordinary-primary 资产上。
- `absorption-spread`：概念扩散、影响扩大或边界渗透。辅助墨色沿一个受控方向在 ordinary-primary 材料上扩张并揭示结果；不得用作无语义转场。

任一镜头最多一个主动作，完成后至少保留内容所需阅读时间。长镜头不做永久漂移、纸纹游动或循环套印抖动。native 动作必须始终从属于 ordinary-primary 材料。转场默认硬切；只有前后语义存在“进纸连续”或“同版套准”关系时才复用印刷动作。

## Variation axes

每镜从各轴选择一项，并把选择写入 director / authoring 规则：

- `density_tier`：low / medium / high
- `anchor_form`：type-led / specimen / evidence-fragment / state-imprint
- `anchor_quadrant`：left-field / right-field / upper-band / lower-band / centered-island
- `type_relation`：edge-pressed / baseline-offset / annotation-tail / type-as-anchor / narrow-column
- `accent_form`：solid-anchor / keyword-ink / correction-rule / partial-color-region
- `material_process`：paper-only / paper-plus-scan / paper-plus-halftone / paper-plus-misregistration / paper-plus-ink-bleed
- `motion_cause`：imprint / feed / registration / halftone-resolve / absorption / static-hold

`paper-only` 必须指经 WFR 路由的 ordinary-primary 纸 / 印刷 / 扫描素材没有再叠加程序缺陷，不能解释为纯 CSS/SVG 纸纹。随机性必须改变视觉语法，而不只是换象限。选择必须由语义和前后镜差异共同决定。

模板通过可选根字段 `visual_grammar_constraints` 把七轴无损映射到 VGP authoring fields，并把相邻差异从建议提升为机器约束：

```json
{
  "axis_authoring_fields": [
    { "axis_id": "density-tier", "authoring_field": "surface" },
    { "axis_id": "anchor-form", "authoring_field": "semantic_anchor" },
    { "axis_id": "anchor-quadrant", "authoring_field": "attention_geometry" },
    { "axis_id": "type-relation", "authoring_field": "typography" },
    { "axis_id": "accent-form", "authoring_field": "color" },
    { "axis_id": "material-process", "authoring_field": "material_texture" },
    { "axis_id": "motion-cause", "authoring_field": "motion_causality" }
  ],
  "adjacent_min_axis_changes": 3,
  "adjacent_required_any_axis_ids": ["anchor-form", "motion-cause"]
}
```

数组顺序必须与 `adaptation_knobs` 完全一致；每个 axis 只映射一个不同的 variable authoring field。VGP 必须据此验证 `changed_axis_ids` 与 `changed_authoring_fields`，不能退化为“任意一轴变化即通过”。

## 相邻差异策略

用七轴向量记录每镜选择。相邻镜头至少改变 3 个轴，且 `anchor_form` 或 `motion_cause` 至少改变 1 个。以下情况直接判定重复：

- 只换强调色色相、位置或文字内容；
- 连续使用相同锚点形态 + 排字关系 + 动作因果；
- 连续两镜都以同样的套印错位或墨渗作为开场；
- 连续三镜都保持同一负空间方向；
- 一个段落重复出现“微型照片 + 色点 + 档案微字”组合。

若语义要求连续展示同一证据，保持锚点身份，但改变信息裁切、排字关系和 motion cause；不要凭空加入第二锚点制造差异。

## Motif exhaustion

- `tiny-photo-dot-microtext`：默认耗尽；除非三者分别有真实语义证据，否则整组禁用。
- `decorative-misregistration`：默认耗尽；只有“校正、对齐、偏差”语义可启用，每段最多一次。
- `ink-bleed-every-cut`：默认耗尽；只有“扩散、渗透、边界变化”语义可启用。
- `title-card-chain`：禁用；两个连续镜头都只有居中大标题即判定模板化。
- `full-bleed-paper-photo`：禁用；它消除负空间与单锚点关系。
- `invented-archive-metadata`：禁用；不得伪造日期、编号、地点或来源制造编辑感。
- `fact-text-in-raster`：禁用；不得把事实文字交给图像生成或烘焙进不可核验位图。

## 适用与禁用语义

适用：

- 单一结论、定义、短引用、原则或方法判断；
- 回忆、档案、阅读、写作、文化研究等需要安静停顿的内容；
- 一步因果、一次校正、一个证据片段或一个前后状态；
- 可按 WFR 顺序冻结一个 ordinary-primary 纸、印刷、照片、扫描或 specimen 材料，并让其保持可见像素贡献的镜头；
- 有真实短文案、真实数据或已授权单一素材可作为语义锚点的镜头；
- 需要从高能段落切换到可读、可核验结论的节奏节点。

禁用：

- 实时监控、多节点网络、复杂流程图、超过 6 个同屏事实；
- 依赖真实产品 UI 操作、代码执行、地图导航或空间演示的内容；
- 需要多主体行动、人物表演、沉浸式场景或摄影纵深的内容；
- 强商业 CTA、价格促销、logo 展示或必须遵循既有品牌广告模板的内容；
- 没有真实文案却要求大量“档案微字”的内容；
- 无法通过 user-media、image-generation 或 Pexels 冻结一个权利与来源可接受的 ordinary-primary 材料的内容；
- 要求纯 HTML/CSS/SVG、程序纸纹或原生矢量作为唯一 / primary material 的内容；
- 需要让图像生成模型准确生成事实文字、表格、数字或商标的内容。

## 编译顺序

1. 从 SRT 与已批准材料提取本镜唯一判断、事实集合和必需文字。
2. 计算独立事实单元数，选择 `density_tier`；超出 high 容量则拆镜或换 profile。
3. 严格检查 `user-media → image-generation → Pexels`，冻结一个 ordinary-primary 素材；记录 route、asset identity、provenance、前序拒绝理由、具体材质用途与 result-region contribution 预期。
4. 选择一个 `anchor_form`，明确它如何承载语义以及与 ordinary primary 的关系；删除无关对象。
5. 冻结 HTML/SVG 真实文案与字体角色，再确定版面；native 内容只做辅助，不得取代 ordinary primary。
6. 选择一个高色度色相和唯一语义角色：优先记录用户 / 品牌 / 素材证据；无来源色时记录 Director 的内容语义映射理由。
7. 把 ordinary-primary 素材提供的纸基底记为材质过程一，再决定是否需要一个额外材质过程；素材自带缺陷也计入预算。
8. 选择与语义及材质过程对应的 `motion_cause`，写出 Entry → Action → Result → Hold → Exit。
9. 与前一镜比对七轴向量，满足至少 3 轴差异和锚点 / 动作差异。
10. 执行下列校准门；失败则换构图或重选普通主材，不用增加 native 纹理补救。

## 校准门

- `status gate`：仍为 draft / calibration-only，未被默认选择。
- `ordinary-primary gate`：每镜恰好冻结一个 ordinary-primary 素材；route 顺序为 user-media → image-generation → Pexels，后置路线带前序拒绝理由，并记录稳定 asset identity、provenance 与具体材质用途。
- `material-contribution gate`：冻结的 ordinary primary 在 result region 有可测像素贡献，阅读 hold 期间可见，未透明、离屏或被 HTML/CSS/SVG 完全替代。
- `semantic gate`：锚点能独立回答本镜讲什么，装饰元素不能冒充语义。
- `density gate`：负空间落在所选档位，所有必需信息在目标分辨率可读。
- `type gate`：所有事实文字来自批准来源并由 HTML/SVG 真实渲染；无远程 / 系统 / generic fallback，且 native 排字只作辅助信息系统，不被记为 ordinary primary。
- `color gate`：只有一个高色度色相，缩略图仍可辨识；已记录用户 / 品牌 / 素材证据或 Director 的内容语义映射理由，且没有默认紫蓝渐变或第二竞争色。
- `material gate`：ordinary-primary 素材提供纸基底，最多再加一项；素材已带的扫描、网点、套印或墨渗计入第二项，材质过程总数不超过两项。
- `motion gate`：动作有印刷因果，确定性 seek-safe，结果停稳且保留阅读时间。
- `difference gate`：VGP 按 `visual_grammar_constraints.axis_authoring_fields` 核对 axis 与 authoring field；相邻镜至少 3 个 variation axes 不同，且 `anchor-form` / `motion-cause` 至少一项不同。
- `anti-identity gate`：无商业广告、满版拼贴、立体空间、随机旧化、文化标签或上游示例复刻。
- `rights gate`：未包含上游图片、示例文案、字体、品牌表达；仅分发抽象规则与 MIT notice。

边界：本条目是 advisory calibration atom。用户设计、真实素材、当期语义与项目级不变规则优先；采用或拒绝都应写入 reference atom trace。晋级前必须补逐镜 ordinary-primary 路由 / identity / provenance / result-region contribution 证据、当前 HyperFrames 16:9 fullscreen 实渲染、边界帧 / 关键帧检查与作者正反例校准。
