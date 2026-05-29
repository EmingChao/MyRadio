# Claudio 视频风格 V2 设计方案与开发实现计划

> 参考视频：`docs/v0/v2700fgi0000d7jpo5vog65mc3781dr0.MP4`  
> 当前实现截图：`/tmp/my-radio-ui-after/chrome-mobile-current.png`  
> 视频抽帧参考：`/tmp/my-radio-video-frames/contact.jpg`  
> 生成时间：2026-05-29  
> 目标：基于当前 UI 继续优化，不破坏已实现的播放、聊天、队列、计划、Taste 等功能。

## 1. 直接结论

当前 UI 的问题不是功能缺失，而是视觉语义跑偏了。

第一轮调整把页面做成了“黑底终端播放器”：强绿色、圆形唱片旋转、粗边框卡片、大块白色 DJ 纸片。这些元素本身都能解释得通，但组合后和视频里的 Claudio 气质不一致。视频里的 UI 更像一个“常驻手机里的 AI DJ 伴侣”：黑色是空间底色，信息层是柔和的玻璃、纸片、播放器条、波形和内容流，绿色只是在线状态和少量高亮，不是全局主色。

所以 V2 不建议继续小修小补。应该做一次视觉层重构，但范围仍然控制在前端 UI 和 CSS 动效，不动核心业务接口。

## 2. 视频 UI 重新观察

视频抽帧里有几类稳定出现的视觉语言：

1. **深色但不死黑**

   视频大量使用黑色手机界面，但画面不是纯黑终端。背景里经常有轻微蓝紫、青绿、星云、设备光、封面色扩散或玻璃层次。黑色只是舞台，真正的氛围来自背景光、透明层和内容层的对比。

2. **Claudio 是人格，不是播放器标题**

   顶部反复出现 Claudio、online、时间、头像、当前上下文。它不像普通音乐 App 的标题栏，而像一个“正在值班的 DJ”。当前实现虽然有 Claudio，但还是偏状态标签，没有把人格和陪伴感做成主视觉。

3. **波形是核心符号**

   视频里的播放区域、语音/音乐状态和内容底部多次出现横向波形。波形不是装饰，它表达“Claudio 正在听、正在播、正在说”。当前 UI 缺少这层声音状态，只剩进度条和旋转封面。

4. **白色纸片是内容媒介，不是大按钮**

   视频里的白色卡片像一张被 Claudio 递出来的 playlist / brief / article sheet，边角不夸张，排版更克制。当前 “DJ 开场” 白色块过亮、过圆、面积过大，像一个突兀的表单卡片。

5. **画面有节奏层次**

   视频不是只靠一个主播放器撑首屏，而是“顶部身份 + 时间/播放状态 + 内容卡/对话 + 波形/输入”的纵向节奏。当前 UI 的封面和 DJ 卡片占比过重，Feed 部分又偏硬边框列表。

## 3. V2 设计规格

### 3.1 Purpose Statement

Claudio 的首屏应该让用户感觉自己打开的不是一个普通歌单播放器，而是一个根据天气、时间、心情和偏好实时接管音乐氛围的 AI DJ。用户可以直接播放，也可以通过一句话改变当前 set，页面需要持续传达“它在线、懂我、正在组织声音”。

### 3.2 Aesthetic Direction

采用 **Luxury/refined + Retro-futuristic** 的混合方向。

- Luxury/refined：克制、留白、有质感，减少终端感和粗糙边框。
- Retro-futuristic：保留少量像素时间、波形、状态灯，让 Claudio 有实验性和未来感。

不采用“赛博终端”“黑绿控制台”“唱片机拟物”。

### 3.3 Color Palette

V2 色彩要从“黑绿终端”调整为“深色氛围 + 少量信号色 + 温润纸片”。

| 角色 | 色值 | 用途 |
| --- | --- | --- |
| Ambient Black | `#08090D` | 页面基底，比当前纯黑更柔 |
| Deep Glass | `rgba(18, 21, 27, 0.72)` | 玻璃面板、Feed 卡片 |
| Album Ember | `#C86F3D` | 从当前封面提取的暖色氛围光，可随封面变化 |
| Signal Green | `#38D978` | 仅用于 online、播放状态、小面积 active |
| Paper Warm | `#F1E9D8` | 白色纸片，降低亮度和冷白感 |
| Text Primary | `#F4EFE4` | 主文字 |
| Text Muted | `#8F8A83` | 次级信息 |

约束：

- 绿色不能再承担全局标题、边框、按钮、数字的主要视觉重量。
- `DJ 开场` 的白色纸片必须从纯白降为暖纸色，面积缩小，圆角降低。
- 背景允许有封面色、星云色、玻璃噪点，但不能变成大面积紫蓝渐变。

### 3.4 Typography

保留当前字体体系，但重新分配职责：

- `VT323`：只用于时间、短标签、少量品牌化状态。
- `JetBrains Mono`：用于英文/数字和精简 UI 标签。
- 中文正文：不继续强化像素感，使用更自然的 `PingFang SC` / `Noto Sans SC` / 系统中文字体栈，提升可读性。

这样能保留视频里的实验感，同时避免中文内容像 debug 面板。

### 3.5 Layout Strategy

首屏改成三层纵向舞台：

1. **Ambient Layer**

   封面色、星云/噪点、低透明玻璃背景、轻微呼吸动画。它负责氛围，不承载交互。

2. **DJ Stage Layer**

   顶部 Claudio 身份、当前 set、播放器、声波、DJ 语音。它是首屏视觉核心。

3. **Conversation Layer**

   Now / Next / Context / Chat 输入。它负责持续陪伴感，不再像硬质日志列表。

布局不做居中大卡片堆叠，而是让播放器、波形、DJ 语音、Feed 在同一个手机舞台里自然叠合。

## 4. 当前问题与 V2 改法

### 4.1 基调太暗

当前问题：

- `body` 和 `--stage-black` 接近纯黑。
- 中间内容缺少背景层次，视觉上像黑色空洞。
- 绿色边框和文字在黑底上很硬，放大了终端感。

V2 改法：

- 页面底色改为深炭黑，不再是纯黑。
- 在手机内部增加 `ambient-orbit` / `cover-aura` 背景层，用当前封面图的 blur、warm tint 和微弱颗粒感制造空气。
- Radio 首屏上半段增加柔和的 spotlight，底部 Feed 使用半透明玻璃，不用纯黑块。
- 绿色只保留在线点、播放态、当前输入发送按钮的小面积状态。

### 4.2 专辑封面转动低质

当前问题：

- 圆形封面 + 中心孔直接把封面变成唱片，质感接近廉价播放器皮肤。
- 旋转动画和 AI DJ 产品定位没有强关系。
- 视频里更强调波形和声音状态，而不是唱片机拟物。

V2 改法：

- 删除 `disc`、`disc-hole`、`spinning` 这套唱片表达。
- 改成 **album tile + floating cover**：
  - 封面保持方形或轻微圆角矩形。
  - 封面下方有柔光投影和微弱上下浮动。
  - 播放时不是旋转，而是 `breath`：亮度、阴影、背景 aura 轻微呼吸。
- 封面旁边或下方放 **music waveform**：
  - 播放中波形轻微跳动。
  - 暂停时波形停在低幅状态。
  - DJ speaking 时切换为更短、更快的 speaking bars。

### 4.3 “DJ 开场”配色突兀

当前问题：

- 白色块过亮，圆角过大，像从另一个产品里拿来的卡片。
- 面积太大，抢了播放器和 Feed 的层级。
- `DJ` 标签和正文的排版过空，缺少视频里的“内容纸片”感。

V2 改法：

- 把 `segue-bar` 改成 **DJ voice note**：
  - 背景 `rgba(241, 233, 216, 0.9)` 或深色玻璃版，依据位置决定。
  - 圆角控制在 10px 以内，不再用大胶囊。
  - 宽度不铺满，可与封面/波形形成局部叠层。
  - 左侧加小头像或短波形，表示是 Claudio 在说话。
- 文案从 `开场。` 这类裸文本，改为更自然的“今晚先用一首低频把状态铺开。”，如果后端没给足文案，前端提供 fallback。

### 4.4 缺少声音波形和 AI DJ 动效

当前问题：

- 只有进度条，没有“正在播放/正在说话”的声音符号。
- Header 里已有 speaking bars，但太小，不足以成为主视觉。
- DJ Feed 是静态消息，缺少状态感。

V2 改法：

- 在 `RadioPlayer` 增加三类 CSS 波形：
  - `track-waveform`：横向细波形，表示音乐能量。
  - `voice-waveform`：短竖条，表示 DJ 说话。
  - `ambient-wave`：底部微弱线性波，作为视频式动态背景。
- 动效全部先用 CSS 实现，不引入 canvas：
  - 播放中：bar 高度 staggered loop。
  - 暂停中：低幅静止。
  - DJ speaking：速度加快、颜色从 Paper Warm 到 Signal Green 轻微变化。
- 输入框发送时增加 `listening` 状态：按钮不再只是 `>`，而是一个小的 pulse dot / arrow icon。

### 4.5 Feed 卡片太像日志面板

当前问题：

- `NOW / NEXT / CONTEXT` 全是硬标签和边框，信息像控制台日志。
- `NEXT` 列表过直，缺少音乐产品的节奏。

V2 改法：

- Feed 改成“对话与策展混排”：
  - `NOW`：当前推荐理由，用深玻璃 + 小封面/声波。
  - `DJ`：语音气泡，暖色文字，不用大纸片。
  - `NEXT`：横向/纵向 mini queue，淡化边框，突出序号和歌名。
  - `CONTEXT`：作为小号 context chip，不再是大卡片。
- 聊天历史继续存在，但卡片边界更柔，减少绿色描边。

## 5. 组件级重构方案

### 5.1 `web/src/style.css`

改动目标：

- 重置视觉 token。
- 从黑绿终端改成深色玻璃氛围。
- 增加全局 motion token 和减少动态偏好。

建议新增/调整：

```css
--stage-black: #08090d;
--stage-deep: #0d1016;
--glass: rgba(18, 21, 27, 0.72);
--glass-soft: rgba(255, 255, 255, 0.045);
--paper: #f1e9d8;
--signal: #38d978;
--ember: #c86f3d;
--wave: rgba(241, 233, 216, 0.72);
--radius: 10px;
--radius-lg: 14px;
```

同时增加：

- `@keyframes cover-breathe`
- `@keyframes wave-rise`
- `@keyframes ambient-drift`
- `@media (prefers-reduced-motion: reduce)` 关闭大部分循环动效

### 5.2 `web/src/components/RadioPlayer.vue`

改动目标：

- 删除唱片视觉。
- 重建播放器为视频风格的声音舞台。

结构建议：

```text
Current Set
雨天下午电台
一场适合雨天下午编程的中文说唱与节奏精选。

[Album Tile]   "919"
               王齐铭WatchMe
               RUN MY CITY
               [animated waveform]

[Claudio voice note]
今晚先把节奏放低一点，等鼓点进来。

progress
controls
```

具体改动：

- `.disc-wrap` -> `.cover-stack`
- `.disc` -> `.album-tile`
- 删除 `.disc-hole`
- 删除 `spin` 动画
- 新增 `.waveform`，循环渲染 20 到 28 个 bar
- `segue-bar` 改为 `.voice-note`
- 播放控制按钮改成更细的玻璃按钮，播放按钮保留突出但不大绿圆

### 5.3 `web/src/components/DjChat.vue`

改动目标：

- 从日志 Feed 改成“DJ 内容流”。
- 缩小 Open 白纸片，避免突兀。

具体改动：

- `.msg-open` 改成 `.brief-sheet`：
  - 圆角 8-10px。
  - 纸色降低亮度。
  - 宽度/高度更克制。
  - 可加轻微纸张投影和顶部短波形。
- `.msg-now` 去掉绿色左粗边，改成玻璃面板 + 小 active dot。
- `.msg-next` 去掉硬边框，改成 mini list。
- `.msg-context` 从卡片降级为 context strip。
- 输入区从硬边框改成 glass command dock。

### 5.4 `web/src/components/ClaudioHeader.vue`

改动目标：

- 强化 Claudio 人格和在线感。
- 减少 PAUSED / ON AIR 标签的终端风。

具体改动：

- 头像从字母 C 改成柔和圆形 avatar，可先用封面色/渐变纹理，不引入新图片。
- `PAUSED` 标签改成小状态点 + `online` 文案。
- 时间保留像素风，但降低亮度，不抢主体。
- speaking bars 可保留，但同步到播放器主波形。

### 5.5 `web/src/components/BottomTabs.vue`

改动目标：

- 底部栏更像视频里的手机 App 工具栏，而不是控制台按钮。

具体改动：

- 图标区域使用更细的线性符号或 lucide 图标。如果项目不想新增依赖，先用 CSS 简化当前符号。
- Active 状态只显示小面积绿色，不整块高亮。
- Tab 文案亮度降低，避免和主内容抢层级。

### 5.6 `TrackQueue.vue` / `TodayPlan.vue` / `TastePanel.vue`

改动目标：

- 保持功能不变，但让子页面继承 V2 氛围。

具体改动：

- Queue：做成 `Tonight Setlist` 风格，序号、歌名、理由更像播放清单。
- Plan：做成一张 Claudio 日程 brief，减少卡片堆叠。
- Taste：保留 `I have taste.` 但不要大纸片铺满，改成小型 manifesto + 偏好标签。

## 6. 动效设计

V2 动效只做四类，避免复杂和不稳定。

### 6.1 封面呼吸

- 播放中：封面阴影和背景 aura 缓慢呼吸。
- 暂停中：静态，仅保留微弱阴影。
- 不再旋转。

### 6.2 音乐波形

- 播放中：20-28 个 bar staggered 动画。
- 暂停中：bar 高度固定为 2-5px。
- 切歌时：允许通过 CSS transition 产生一次轻微闪动。

### 6.3 DJ 说话波形

- `store.djSpeaking` 为 true 时，Header 和 RadioPlayer 的 voice waveform 同步变快。
- 颜色使用 `Paper Warm` 到 `Signal Green` 的低饱和变化，不使用大面积绿光。

### 6.4 背景氛围漂移

- `stage-bg` 保留封面 blur，但亮度提高一点，透明度降低硬边。
- 增加一层 `noise` 或 `radial-light`，制造视频里的空间感。
- 动画非常慢，不能影响阅读。

## 7. 开发实现计划

### 阶段 1：视觉 Token 与全局氛围

涉及文件：

- `web/src/style.css`
- `web/src/views/HomeView.vue`

任务：

1. 重置色彩 token，减少黑绿终端感。
2. 增加玻璃、纸片、波形、氛围光变量。
3. 给手机内部或 Radio 页增加 ambient background layer。
4. 增加 `prefers-reduced-motion` 兜底。

验收标准：

- 页面不再是纯黑洞。
- 绿色只作为状态点和少量 active 色。
- 即使没有封面图，也有柔和深色层次。

### 阶段 2：播放器重构

涉及文件：

- `web/src/components/RadioPlayer.vue`

任务：

1. 删除圆形唱片和中心孔。
2. 改为方形/圆角 album tile。
3. 增加 `track-waveform`。
4. 把 `segue-bar` 改为 `voice-note`。
5. 重新调整播放器高度，保证首屏 Feed 仍可见。

验收标准：

- 不再出现唱片旋转。
- 播放中能看到柔和波形跳动。
- DJ 开场不再像突兀大白块。

### 阶段 3：DJ Feed 重构

涉及文件：

- `web/src/components/DjChat.vue`

任务：

1. `Open` 改成小型 brief sheet。
2. `Now` 改成玻璃推荐卡。
3. `Next` 改成 mini setlist。
4. `Context` 改成窄条上下文说明。
5. 输入区改成 glass command dock。

验收标准：

- Feed 不再像日志面板。
- 卡片层次更接近视频里的内容流。
- 首屏仍能看到 Now / DJ / Next 中至少两类内容。

### 阶段 4：Header 与底部导航精修

涉及文件：

- `web/src/components/ClaudioHeader.vue`
- `web/src/components/BottomTabs.vue`

任务：

1. Header 去掉强标签感，改为在线状态点和自然状态文案。
2. speaking bars 与主波形视觉统一。
3. Bottom Tabs 减少绿色高亮面积。
4. 调整 hit area，不影响可用性。

验收标准：

- Claudio 更像人格化 DJ，而不是标题。
- 底部导航不抢主舞台。

### 阶段 5：Queue / Plan / Taste 风格统一

涉及文件：

- `web/src/components/TrackQueue.vue`
- `web/src/components/TodayPlan.vue`
- `web/src/components/TastePanel.vue`

任务：

1. Queue 改成 setlist 语义。
2. Plan 改成 brief 语义。
3. Taste 改成 manifesto + preference chips。
4. 统一玻璃、纸片和文字层级。

验收标准：

- 切换 Tab 后仍属于同一个 Claudio 产品。
- 不影响已有数据展示和交互。

### 阶段 6：构建与浏览器验证

命令：

```bash
cd /Users/liumingchao/develop/private/my-redio-by-mimo/web
npm run build
```

浏览器验证：

- 使用 Chrome DevTools MCP 打开本地页面。
- 验证尺寸：
  - `390x844`
  - `430x932`
  - `720x900`
  - `1280x800`

检查项：

- 文案不溢出。
- 底部输入框和 Tabs 不重叠。
- 波形可见且不遮挡内容。
- 封面不再旋转。
- `DJ 开场` 卡片不突兀。
- Radio / Queue / Plan / Taste 都能正常切换。

## 8. 建议的提交边界

建议分两次提交，降低回滚成本：

1. **V2 Radio 首屏重构**

   包含：

   - `style.css`
   - `HomeView.vue`
   - `RadioPlayer.vue`
   - `DjChat.vue`
   - `ClaudioHeader.vue`
   - `BottomTabs.vue`

2. **子页面风格统一**

   包含：

   - `TrackQueue.vue`
   - `TodayPlan.vue`
   - `TastePanel.vue`

如果时间有限，优先做第一次提交。因为用户对当前效果的不满主要集中在 Radio 首屏。

## 9. 不做的事情

本轮 V2 不建议做以下事情：

- 不引入 Three.js 或复杂 canvas 音频频谱。
- 不改后端生成逻辑。
- 不调整 MiMo / Claude / 模型调用链路。
- 不新增大型 UI 组件库。
- 不用唱片旋转、霓虹大绿边框、夸张圆角白卡继续加强当前方向。

## 10. 最小可落地版本

如果只做一个最小版本，优先顺序是：

1. 删除唱片旋转，改 album tile。
2. 增加播放波形。
3. 缩小并重做 DJ voice note。
4. 降低全局绿色占比。
5. 给背景增加封面色氛围层。

这五项完成后，页面观感会从“黑绿播放器”明显转向“视频里的 Claudio AI DJ”。

