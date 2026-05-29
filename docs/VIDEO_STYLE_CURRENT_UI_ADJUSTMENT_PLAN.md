# 基于当前 UI 的视频风格调增方案

> 参考视频：`docs/v0/v2700fgi0000d7jpo5vog65mc3781dr0.MP4`
> 当前实现：`web/src/views/HomeView.vue` + Claudio 手机壳 UI
> 目标：不推翻当前功能结构，在现有 UI 基础上调到更接近视频里的 Claudio 产品风格。
> 生成时间：2026-05-28

## 1. 结论

当前 UI 已经完成了从桌面控制台到手机 PWA 的第一轮重构：有黑色舞台、手机壳、Claudio Header、播放器、DJ Feed、Command Dock、底部 Tabs。这个方向是对的，不建议推翻重做。

但当前效果仍偏“黑底播放器”，视频里的感觉更像“一个有性格、会陪伴、会说话的 AI DJ 常驻在手机里”。差距主要不在功能数量，而在首屏叙事、信息密度、内容卡片、人格表达和视频式视觉细节。

本方案采用“调增”而不是“重构”：

- 保留现有 `HomeView`、`RadioPlayer`、`DjChat`、`TrackQueue`、`TodayPlan`、`TastePanel`、`BottomTabs`。
- 不改变后端接口主流程。
- 不新增复杂动效或大组件库。
- 优先把当前页面调成视频里那种 Claudio 手机 PWA 气质。

## 2. 当前 UI 状态

当前页面已经具备：

- 黑色舞台背景。
- 居中手机壳。
- 顶部 `CLAUDIO`、状态和时间。
- 当前播放封面、歌名、艺人、专辑、进度条和播放控制。
- DJ 当前推荐理由和一句解说。
- 底部聊天输入、快捷心情、Radio/Queue/Plan/Taste Tabs。
- 设置入口、设备选择、歌曲详情、歌词、Taste 页面等组件雏形。

当前主要问题：

- 首屏中段大面积空黑，内容不够像视频里的“持续对话和内容流”。
- Claudio 人格表达弱，只有 `CLAUDIO` 和状态，没有稳定出现 `Your mood is my prompt. I hate algorithm. I have taste.` 这一类产品语气。
- 当前播放区域偏唱片播放器，视频更像“系统播放器 + AI DJ 内容流”。
- 已有 `NowPlayingCard.vue` 的人格化能力没有接入主页面。
- 底部 Tab 使用 Unicode 符号，质感不如视频里的 App 工具栏。
- Queue、Plan、Taste 还是功能页面，缺少视频里的主题卡、白色纸片和人格化说明。

## 3. 视频风格提炼

视频里的 Claudio UI 可以拆成几个明确特征：

### 3.1 黑色手机舞台

- 背景几乎是纯黑。
- 内容靠弱光、白色卡片、绿色在线状态建立层级。
- 不是炫技型大渐变，不是普通后台深色模式。

### 3.2 Claudio 身份强提示

- 顶部 `Claudio` 是主角。
- 有头像、online 状态、当前时间。
- 页面文案强调人格：`Your mood is my prompt. I hate algorithm. I have taste.`

### 3.3 播放器只是入口，不是全部

- 播放器条存在，但不是唯一主体。
- AI DJ 的话、主题、今日计划、推荐理由和用户聊天同样重要。

### 3.4 白色纸片内容

- 视频中多次出现白色卡片承载歌单、主题、文章式内容。
- 这种白色纸片是 Claudio “递给用户的一张内容单”，非常有识别度。

### 3.5 常驻陪伴感

- 页面不是“点一下启动再播放”，而像一个持续在线的 DJ。
- 当前时段、天气、心情、计划应该在首屏持续存在。

## 4. 调增原则

1. **不改业务主流程**

   当前启动、播放、聊天、队列、计划都先保持不变。UI 调增只重排和增强呈现。

2. **Radio 首屏优先**

   视频风格主要体现在第一屏。先把 Radio 首页做像，再处理 Queue、Plan、Taste。

3. **少做装饰，多做内容**

   空白区域不要用无意义纹理填充，优先用当前时段、天气、推荐理由、队列预告、Claudio 语气填充。

4. **保留黑色舞台，增加白色纸片**

   黑色是底色，白色纸片只用于重点内容：开场白、当前主题、Taste 摘要、计划建议。

5. **弱化像素风正文**

   当前 `VT323` 用在时间和品牌可以保留，但中文正文不要过度像素化，避免不像视频里的精致 PWA。

## 5. Radio 首屏调增方案

### 5.1 Header 调整

当前：

```text
C  CLAUDIO  PAUSED               17:40  ⚙
```

建议：

```text
[avatar] Claudio        17:40   settings
online · paused
Your mood is my prompt.
```

调整点：

- `CLAUDIO` 改成大小写 `Claudio`，更接近视频里人格化名字。
- 状态从单独标签变成 `online · paused` 的自然状态行。
- 增加一句人格短句，默认展示：
  - `Your mood is my prompt.`
  - 播放中可切换为 `I have taste.`
  - DJ 说话时显示 `Speaking between tracks.`
- 头像从字母 `C` 升级为圆形头像。可以先用当前项目里的封面图或简单本地头像占位，不要继续只显示字母。

涉及文件：

- `web/src/components/ClaudioHeader.vue`

### 5.2 当前播放区调整

当前：

- 大圆形封面。
- 歌名、艺人、专辑。
- DJ segue。
- 进度和控制按钮。

问题：

- 信息偏播放器。
- 缺少“当前 set”概念。
- 视频里的 Claudio 更像在经营一个主题电台。

建议结构：

```text
Current Set
雨天下午 · 专注 · 13 songs

[cover]  “919”
         王齐铭 WatchMe
         RUN MY CITY

DJ opening paper
雨天下午，需要点节奏带带脑子。

progress + controls
```

调整点：

- 播放器上方增加 `Current Set` 小标题，内容来自 `scene/mood/weather/trackCount`。
- 当前 `DJ 开场。` 不要放成窄条，改成白色或米白色纸片。
- 封面可以略缩小，让更多空间给主题和 DJ 文案。
- 进度条和控制按钮保持，但视觉更接近系统播放器，减少像素终端感。

涉及文件：

- `web/src/components/RadioPlayer.vue`
- 可吸收 `web/src/components/NowPlayingCard.vue` 里已写好的 `Your mood is my prompt.` 和封面背景逻辑。

### 5.3 DJ Feed 填充空白

当前首屏在 `NOW` 和 `DJ` 两条消息后出现大面积空黑。

建议增加三种默认内容卡：

1. **Now Reason Card**

   展示当前歌为什么被选中。

   ```text
   NOW
   “919”
   这首的鼓点比较直接，适合把下午的注意力拉回来。
   ```

2. **Up Next Preview**

   展示后续 2 到 3 首歌。

   ```text
   NEXT
   02  God's Plan
   03  a lot
   04  PASS OUT
   ```

3. **Context Brief**

   展示当前天气、时段和策略。

   ```text
   CONTEXT
   小毛毛雨，25.8°C。下午工作时段，默认选择节奏稳定的中文说唱。
   ```

展示规则：

- 有聊天历史时，聊天流自然填充。
- 没聊天历史时，自动展示 `Now / Next / Context` 三块。
- 不要把这些放到别的 Tab，Radio 首屏就要像一个正在运行的 DJ。

涉及文件：

- `web/src/components/DjChat.vue`
- `web/src/stores/player.ts`

### 5.4 Command Dock 调整

当前：

- 有会话时显示输入框、发送按钮和心情 chips。
- 无会话时显示场景 chips 和启动输入。

建议：

- 有会话时快捷按钮从纯心情改成视频式指令：
  - `BGM`
  - `QUIETER`
  - `EXPLAIN`
  - `NEXT SET`
- 中文显示可以放在 tooltip 或次级文案，不要让主按钮过长。
- 输入框 placeholder 改得更像 Claudio：
  - `Tell Claudio what you need...`
  - 或中文：`告诉 Claudio 现在想听什么...`

涉及文件：

- `web/src/views/HomeView.vue`
- `web/src/components/DjChat.vue`

## 6. Queue 页面调增

当前 Queue 是普通列表。

视频风格目标：像 Claudio 给出的一组主题歌单，而不是后台队列。

建议：

```text
TONIGHT'S SET
13 tracks · built from your taste

01  “919”
    王齐铭 WatchMe
    why: 节奏强，适合拉回注意力

02  God's Plan
    Drake
    why: 稳定律动，延续能量
```

调整点：

- 顶部增加当前电台标题和摘要。
- 当前播放项置顶或高亮成主卡。
- 每首歌显示一句推荐理由摘要。
- 点击条目展开显示 `segue / djScript / recommendReason`。
- 列表不要太密，视频里内容有呼吸感。

涉及文件：

- `web/src/components/TrackQueue.vue`

## 7. Plan 页面调增

当前 Plan 是时间段列表。

视频风格目标：让 Claudio 看起来会主动安排一天，而不是只展示规则。

建议：

```text
TODAY PLAN
小毛毛雨，25.8°C

CURRENT
13:30-18:00 下午工作
专注 · 中文说唱 / 纯音乐 / 稳定节奏
[Start this set]

LATER
18:00-20:00 下班放松
20:00-23:00 晚间自由
23:00-01:00 深夜
```

调整点：

- 当前时段做成白色纸片或高亮主卡。
- 增加 `Start this set`，从计划直接创建电台。
- 其余时段变成更轻的时间线。
- 天气和当前策略放顶部，不要藏在小字里。

涉及文件：

- `web/src/components/TodayPlan.vue`
- 后续如需完整闭环，再补 `POST /api/radio/session/create-from-plan`。

## 8. Taste 页面调增

当前 Taste 已有 `TASTE DNA` 和分 tab，但视频里的重点是“我有 taste”，需要更有记忆感。

建议顶部增加一张白色纸片：

```text
I HAVE TASTE.

5962 songs · 34 playlists
Built from your Netease memory.

Signature:
中文说唱 / 深夜 / 专注 / 雨天
```

然后再展示：

- Signatures。
- Favorite artists。
- Lifelong top。
- Playlists with memory。

调整点：

- `overview` 首屏先讲“这个人是谁”，再列数据。
- 歌单如果没有 memory，也要显示可编辑入口或提示 `add memory`。
- 视频里的“多年歌单和回忆”是关键，不要只做数据榜单。

涉及文件：

- `web/src/components/TastePanel.vue`

## 9. Settings 调整

当前 Settings 已有设备和网易云登录。

建议按照视频产品的三件事组织：

```text
SETTINGS

1. Music Source
   Netease connected / reconnect

2. Voice
   MiMo voiceclone / test voice

3. Speaker
   Web Audio / mock speaker / future UPnP
```

调整点：

- 不要只放按钮，要展示连接状态。
- 设备选择保留。
- 后续加 TTS 测试按钮，但不作为本次 UI 调增必做项。

涉及文件：

- `web/src/views/HomeView.vue`
- `web/src/components/DeviceSelector.vue`
- `web/src/components/NeteaseLogin.vue`

## 10. 视觉细节调增

### 10.1 颜色

保留当前变量：

- `--stage-black`
- `--panel-black`
- `--paper`
- `--signal`
- `--warm`

建议增强：

- `paper-card` 用于重点内容，不要全黑到底。
- `signal` 只用于在线、当前播放、主动状态。
- `warm` 只用于 DJ 开口、计划提示。

### 10.2 字体

保留：

- 时间和品牌使用 `VT323`。
- 控件和正文使用 `JetBrains Mono`。

调整：

- 中文正文不要继续使用 `VT323`。
- 歌名可以用正常字重，不要过度像素化。
- 大段 DJ 文案行高增加到 `1.65` 左右。

### 10.3 图标

当前底部 Tab 使用 Unicode：

- `▶`
- `☰`
- `◷`
- `♡`

建议替换为 `lucide-vue-next`：

- `Radio`: `Play`
- `Queue`: `ListMusic`
- `Plan`: `Clock3`
- `Taste`: `Heart`
- `Settings`: `Settings`

如果暂时不加依赖，也至少给按钮增加：

- `aria-label`
- `data-tab`
- 更大的点击区域。

### 10.4 动效

只保留低成本动效：

- online 绿点呼吸。
- DJ speaking 波形。
- 切歌时封面背景渐变。
- Toast 入场。

不建议：

- 大面积粒子。
- 复杂 canvas。
- 过度滚动动画。

## 11. 推荐实施顺序

### 阶段 1：首屏视频感增强

目标：一打开页面就更像视频里的 Claudio。

任务：

- Header 增加人格短句。
- `RadioPlayer` 吸收 `NowPlayingCard` 的 identity/tagline/背景能力。
- DJ 开场和当前 context 改成白色纸片。
- 增加 `Next` 和 `Context` 默认卡，消除首屏空白。

验收：

- 390x844 下首屏不再大片空黑。
- 首屏能清楚看到 Claudio 人格、当前主题、当前播放、推荐理由。
- 播放控制不受影响。

### 阶段 2：底部 Tab 和内容页调增

目标：Queue/Plan/Taste 像视频里的内容模块。

任务：

- Bottom Tabs 换专业图标或补可访问属性。
- Queue 顶部增加当前 set 摘要。
- Plan 当前时段做主卡。
- Taste 顶部增加 `I HAVE TASTE` 白色纸片。

验收：

- 每个 Tab 的首屏都有明确主内容。
- Taste 页面一眼能看出是“品味本体”，不是普通统计页。

### 阶段 3：视频质感细化

目标：统一视觉语言。

任务：

- 统一圆角、边框、纸片、文本层级。
- 减少中文正文像素风。
- 增加状态文案：thinking、speaking、on air、paused。
- 截图比对视频关键帧。

验收：

- `390x844`、`430x932`、`720x900` 截图均无溢出。
- 页面像手机 PWA，而不是桌面控制台缩小版。

## 12. 开发影响范围

优先修改：

- `web/src/components/ClaudioHeader.vue`
- `web/src/components/RadioPlayer.vue`
- `web/src/components/DjChat.vue`
- `web/src/components/BottomTabs.vue`
- `web/src/components/TrackQueue.vue`
- `web/src/components/TodayPlan.vue`
- `web/src/components/TastePanel.vue`
- `web/src/views/HomeView.vue`
- `web/src/style.css`

不建议本轮修改：

- 后端模型调用主流程。
- 网易云导入逻辑。
- 播放地址获取逻辑。
- 数据库结构。

## 13. 验证清单

每一轮调增后都要验证：

- `npm run build`。
- `390x844` 截图。
- `430x932` 截图。
- `720x900` 截图。
- `1280x800` 桌面手机壳截图。
- 启动电台。
- 播放、暂停、上一首、下一首。
- 发送聊天。
- 切换 Queue、Plan、Taste。

重点视觉验收：

- 首屏是否像 Claudio，而不是普通播放器。
- 是否有视频里的黑色舞台和白色纸片。
- 中部是否还有无意义大空白。
- 文本是否可读、不重叠、不溢出。
- 底部输入和 Tabs 是否稳定可点。

## 14. 最小改动版本

如果只做一轮最小调增，建议只做 5 件事：

1. Header 加 `Your mood is my prompt.`。
2. 当前 DJ 开场改成白色纸片。
3. DJ Feed 增加 `NEXT` 和 `CONTEXT` 两块默认内容。
4. Taste 首页加 `I HAVE TASTE` 白色纸片。
5. BottomTabs 增加 `aria-label` 和更大点击区域。

这 5 件事不需要改后端，也不会影响现有播放功能，但能显著拉近视频风格。
