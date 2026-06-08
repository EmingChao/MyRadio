# 网易云 API 能力补强与 MyRadio 体验升级方案

## 1. 结论

当前 MyRadio 的网易云能力已经覆盖了“登录、导入、播放、基础探索”四类场景，但还没有充分利用网易云提供的歌曲事实、百科、相似歌曲、私人推荐和用户行为数据。

你提到的 DJ 独白模板化问题，核心原因不是模型不会写，而是模型拿到的歌曲事实太少。现在传给模型的候选摘要主要是歌名、艺人、专辑、年份、标签和召回理由，缺少：

- 歌曲百科摘要。
- 歌曲别名、专辑发布时间、流行度、版权和音质信息。
- 歌词、热门评论、相似歌曲、用户真实听歌行为。
- 每日推荐或私人 FM 给出的“平台认为此刻适合你”的信号。

因此，`song_detail`、`song_music_detail`、`song_wiki_summary` 可以直接缓解独白痛点；`personal_fm`、`recommend_songs`、`history_recommend_songs`、`simi_song`、`user_record` 可以明显增强候选召回和个性化解释。

推荐优先级：

1. **先做歌曲事实增强层**：接入 `song_detail`、`song_wiki_summary`、`lyric`、`comment_music`，让 DJ 有真实材料可讲。
2. **再做候选召回扩展层**：接入 `personal_fm`、`recommend_songs`、`history_recommend_songs_detail`、`simi_song`，让电台不只在本地曲库里打转。
3. **补上艺人、专辑和风格语义层**：接入 `artist_desc`、`artist_detail`、`album_detail`、`style_song` 等接口，让 DJ 不只认识单曲，也认识音乐人的脉络和曲风空间。
4. **最后做反馈闭环层**：把 `user_record`、最近播放、本地播放完成、跳过、喜欢等行为整合成动态权重。

## 2. 当前已使用的网易云 API

根据代码扫描，当前项目已经使用或脚本中使用了这些接口：

| 接口 | 当前位置 | 当前用途 | 价值评价 |
| --- | --- | --- | --- |
| `login_qr_key` / `login_qr_create` / `login_qr_check` / `login_status` | `server/src/api/netease.ts`、`scripts/export-netease.cjs` | 扫码登录、保存 cookie | 已覆盖基础登录 |
| `song_url` | `server/src/api/netease.ts`、`server/src/api/radio.ts`、`server/src/agent/radio.ts`、`server/src/scripts/fetch-play-urls.ts` | 获取歌曲播放地址 | 核心播放能力已使用 |
| `user_playlist` | `scripts/export-netease.cjs` | 导出用户歌单列表 | 已用于初始化曲库 |
| `playlist_track_all` | `scripts/export-netease.cjs` | 导出歌单内歌曲 | 已用于初始化曲库 |
| `likelist` | `scripts/export-netease.cjs` | 导出喜欢歌曲 ID | 已用于 liked 标记 |
| `recommend_songs` | `scripts/export-netease.cjs` | 导出每日推荐 | 只在离线导出阶段使用，还没有成为实时候选来源 |
| `user_record` | `scripts/export-netease.cjs` | 导出听歌排行 | 只用于导入，还没有形成动态权重 |
| `record_recent_song` | `scripts/export-netease.cjs` | 导出最近播放 | 只用于导入，还没有和电台反馈闭环打通 |
| `cloudsearch` | `server/src/agent/explore.ts` | 根据画像关键词主动搜索探索歌曲 | 已开始做探索推荐，但信息偏薄 |

当前实现方向是对的，尤其是 `cloudsearch` 探索候选已经把“歌单外发现”做出了雏形。下一步要解决的是：候选多了以后，为什么推荐、如何介绍、如何控制新鲜感。

## 3. 高价值未充分使用接口

### 3.1 歌曲事实增强类

| 接口 | 可补充信息 | 对 DJ 独白的价值 | 建议 |
| --- | --- | --- | --- |
| `song_detail` | 歌曲详情、别名、艺人、专辑、发行时间、热度、封面、时长等 | 给模型稳定事实，避免只靠歌名和标签发挥 | 必做，批量接口，适合入库和缓存 |
| `song_music_detail` | 歌曲音乐详情、音质、播放相关信息 | 主要用于播放质量和可播性判断，对文案价值中等 | 可做，用于过滤不可播或低质量版本 |
| `song_wiki_summary` | 歌曲百科基础信息 | 对独白价值最高，能提供真实背景、主题和介绍素材 | 必做，按播放队列懒加载 |
| `lyric` / `lyric_new` | 歌词 | 可提取主题词、情绪、叙事视角，但要避免大段引用歌词 | 必做，但只做摘要，不把歌词原文大量传给模型 |
| `comment_music` / `comment_hot` | 用户评论、热门评论 | 可提取大众听感和共鸣点，增强“这首歌被怎样听见” | 可做，需过滤低质评论和隐私化表达 |
| `song_chorus` | 副歌片段信息 | 可帮助 DJ 讲“高潮/记忆点/进入点” | 可选 |
| `song_creators` | 创作者信息 | 可讲制作人、词曲作者，适合重点歌曲 | 可选 |
| `starpick_comments_summary` | 云村星评馆简要评论 | 可获得更“被认真听过”的评论素材 | 探索性接入，先评估返回质量 |
| `song_red_count` | 歌曲红心数量等热度信号 | 可辅助判断大众热度，但不应主导推荐 | 可选 |
| `ugc_song_get` | UGC 歌曲资料 | 可补充非标准歌曲资料 | 可选 |

### 3.2 候选召回增强类

| 接口 | 可补充候选 | 适合场景 | 建议 |
| --- | --- | --- | --- |
| `personal_fm` | 网易云实时私人 FM 推荐 | “不知道听什么”“懒人模式”“探索一点新东西” | 必做，作为少量高新鲜度候选 |
| `recommend_songs` | 当日每日推荐 | 每日启动、早晚第一次打开、电台开场 | 必做，作为当日推荐池 |
| `history_recommend_songs` | 历史每日推荐日期列表 | 建立长期推荐记忆 | 可做 |
| `history_recommend_songs_detail` | 某日历史每日推荐明细 | 补齐历史推荐池，避免每日推荐错过后消失 | 推荐做 |
| `simi_song` | 某首歌的相似歌曲 | 当前歌曲续播、用户说“类似这首”、探索扩展 | 必做 |
| `recommend_resource` | 推荐歌单 | 扩展歌单级主题候选 | 可选 |
| `playlist_detail_rcmd_get` / `related_playlist` | 相似歌单、相关歌单 | 建立场景歌单候选池 | 可选 |
| `artist_top_song` / `artist_songs` | 艺人热门或全部歌曲 | 用户偏好艺人召回 | 推荐做 |
| `playmode_song_vector` | 基于一批歌曲生成云随机/向量续播 | 根据当前队列或用户 Top 歌生成“顺着品味继续”的候选 | 高价值探索，需先实测返回结构 |
| `personalized` / `personalized_newsong` | 个性化歌单、新歌推荐 | 扩大新歌和主题发现面 | 可选 |
| `top_song` / `artist_new_song` / `album_new` | 新歌、新专辑、新艺人作品 | 做“今日新鲜空气”或新歌模式 | 可选 |

### 3.3 艺人、专辑和风格语义类

这类接口不是单纯扩充候选，而是提升 DJ 的“音乐理解感”。它们可以让独白从“这首歌适合你”升级为“这首歌在这个艺人、专辑、风格脉络里为什么值得听”。

| 接口 | 可补充信息 | 用法 | 建议 |
| --- | --- | --- | --- |
| `artist_desc` | 艺人介绍、经历、补充说明 | 给高频艺人建立背景卡，DJ 可以自然讲音乐人气质 | 推荐做 |
| `artist_detail` / `artist_detail_dynamic` | 艺人详情、动态热度 | 辅助识别艺人类型、热度和活跃状态 | 可选 |
| `artist_top_song` | 艺人热门歌曲 | 用户喜欢某艺人时补充代表作候选 | 推荐做 |
| `simi_artist` | 相似艺人 | 做艺人维度探索，比单曲相似更有“品味延展” | 推荐做 |
| `album` / `album_detail` | 专辑详情、曲目、介绍 | 给专辑型歌曲补上下文，适合 DJ 讲“这首在专辑里的位置” | 推荐做 |
| `album_detail_dynamic` | 专辑动态数据 | 辅助热度判断 | 可选 |
| `style_detail` | 曲风详情 | 把标签变成可解释的风格语义 | 推荐做 |
| `style_song` | 某曲风下歌曲 | 用于按风格补候选，替代粗糙关键词搜索 | 推荐做 |
| `style_artist` / `style_album` / `style_playlist` | 曲风下艺人、专辑、歌单 | 建立风格空间，适合“多放点 city pop / 爵士 / 电子” | 可选 |
| `playlist_catlist` / `playlist_highquality_tags` | 官方歌单分类和精品标签 | 帮助把用户自然语言映射到可召回的风格分类 | 可选 |

### 3.4 用户行为和偏好类

| 接口 | 可补充信息 | 用法 |
| --- | --- | --- |
| `user_record` | 长期和最近一周听歌排行 | 区分“长期偏好”和“最近正在上头” |
| `record_recent_song` | 最近播放 | 避免短期重复，也能识别近期兴趣漂移 |
| `recent_listen_list` | PC 最近听歌列表 | 和 `record_recent_song` 互补，验证近期播放轨迹 |
| `listen_data_today_song` | 今日听歌数据 | 识别当天已经听过什么，避免同日重复 |
| `song_like_check` | 单曲是否喜欢 | 给探索候选补 liked 事实 |
| `recommend_songs_dislike` / `fm_trash` | 对推荐歌曲负反馈 | 如果未来要反向同步到网易云，可做 |

## 4. DJ 独白痛点如何用 API 解决

### 4.1 当前问题

现有 prompt 已经明确要求：

- 不要模板化。
- 不确定背景不要编造。
- `djScript` 要讲歌曲声音、艺人、专辑、表达方式。
- `recommendReason` 要回答“为什么现在、为什么给这个用户”。

但候选摘要没有给足真实材料，所以模型容易退回到安全表达：

- “这首歌有某种气质。”
- “适合当前状态。”
- “承接上一首情绪。”
- “给这段时间一点空间。”

这些话不一定错，但会让每首歌听起来像同一套文案。

### 4.2 推荐的数据增强结构

建议新增一层“歌曲事实卡”，不要把 API 原始返回直接塞进 prompt，而是清洗成稳定、短小、可信的摘要。

建议表结构可以独立于 `radio_track`：

```sql
CREATE TABLE radio_track_fact (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER NOT NULL,
  source_track_id TEXT NOT NULL,
  detail_json TEXT,
  wiki_summary TEXT,
  lyric_summary TEXT,
  comment_summary TEXT,
  music_quality_summary TEXT,
  fact_status TEXT NOT NULL DEFAULT 'PENDING',
  last_fetch_time TEXT,
  create_time TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  modified_time TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
```

传给模型时，不传原始大 JSON，而传类似：

```json
{
  "trackId": 123,
  "title": "歌曲名",
  "artist": "艺人",
  "album": "专辑",
  "releaseYear": 2021,
  "songFacts": {
    "alias": ["别名"],
    "wiki": "百科摘要，最多 120 字",
    "lyricTheme": "歌词主题摘要，最多 80 字",
    "listenerImpression": "热门评论提炼出的听感，最多 80 字",
    "musicDetail": "版本/音质/可播性摘要"
  },
  "recallReason": "召回原因",
  "sourceScope": "library | explore | daily | fm | similar"
}
```

### 4.3 独白生成策略

每首歌的独白材料应分层使用：

1. **事实层**：来自 `song_detail`、`song_wiki_summary`、歌词摘要、评论摘要。
2. **创作层**：来自 `song_creators`、`artist_desc`、`album_detail`，说明艺人、专辑和创作者背景。
3. **听感层**：来自标签、歌词主题、评论共识、专辑/艺人风格。
4. **推荐层**：来自召回来源、场景、心情、天气、用户画像。
5. **转场层**：来自上一首与当前歌曲的节奏、年代、艺人、情绪差异。

新的 prompt 可以要求：

- `djScript` 至少引用一个 `songFacts` 中的可信事实或听感摘要。
- 如果 `songFacts.wiki` 存在，优先使用百科事实，但不能照抄。
- 如果只有歌词摘要，就讲表达主题，不编造创作背景。
- 如果事实为空，才退回声音气质和推荐逻辑。
- `recommendReason` 必须说明候选来源：本地喜欢、每日推荐、私人 FM、相似歌曲、历史高频、探索搜索。

这样模型有材料可写，模板化会自然下降。

### 4.4 版权和文本风险

歌词和评论不建议原文大段进入 prompt，也不建议在 UI 中大段展示。合理做法是：

- 歌词只做主题摘要和关键词，不长篇引用。
- 评论只提炼共识，不引用个人隐私化表达。
- 百科摘要可以用于事实提炼，但也应压缩成自己的摘要。

## 5. 召回算法升级方案

### 5.1 候选池分层

当前候选主要是：

- `library`：用户本地曲库。
- `explore`：基于画像关键词 `cloudsearch` 的主动探索。

建议扩展为：

| 候选来源 | 接口 | sourceScope | 建议占比 | 说明 |
| --- | --- | --- | --- | --- |
| 本地曲库 | 已入库歌单 | `library` | 55%-70% | 保持熟悉感和稳定品味 |
| 每日推荐 | `recommend_songs` | `daily` | 10%-20% | 网易云当天推荐，适合开场和日常启动 |
| 私人 FM | `personal_fm` | `fm` | 5%-15% | 更实时、更探索，数量要少 |
| 相似歌曲 | `simi_song` | `similar` | 10%-20% | 围绕当前歌或用户高频歌延展 |
| 云随机/向量续播 | `playmode_song_vector` | `vector` | 5%-15% | 用当前队列或 Top 歌作为种子，生成更自然的延展候选 |
| 艺人扩展 | `artist_top_song` / `simi_artist` | `artist_expand` | 5%-10% | 用户喜欢某艺人时补代表作或相似艺人 |
| 风格扩展 | `style_song` | `style` | 5%-10% | 用户明确要某种曲风时，比关键词搜索更准 |
| 主动搜索 | `cloudsearch` | `explore` | 5%-15% | 兜底探索和主题搜索 |
| 历史推荐 | `history_recommend_songs_detail` | `history_daily` | 5%-10% | 补长期推荐记忆 |

比例不是固定值，应按场景动态调整：

- **专注/工作**：本地曲库更高，探索更低，避免打扰。
- **放松/通勤**：每日推荐、相似歌曲提高。
- **探索/换点新的**：私人 FM、相似歌曲、主动搜索提高。
- **深夜/入眠**：过滤高能量歌曲，事实增强用于温柔介绍，不追求新鲜度。

### 5.2 打分模型建议

每首候选的最终分数可以由这些部分组成：

```text
finalScore =
  libraryTasteScore
  + sceneMoodScore
  + behaviorScore
  + sourceFreshnessScore
  + factCompletenessScore
  - repeatPenalty
  - skipPenalty
  - riskPenalty
```

解释：

- `libraryTasteScore`：喜欢歌曲、常听艺人、常听风格加分。
- `sceneMoodScore`：场景、心情、天气匹配加分。
- `behaviorScore`：`user_record` 长期高频、最近一周高频、最近播放趋势。
- `sourceFreshnessScore`：每日推荐、私人 FM、相似歌曲适度加分。
- `factCompletenessScore`：有百科、歌词摘要、评论摘要的歌曲更适合生成高质量 DJ 独白，可轻微加分。
- `repeatPenalty`：最近播放过、上一组电台出现过的歌曲扣分。
- `skipPenalty`：本地跳过多、用户负反馈扣分。
- `riskPenalty`：不可播、无播放地址、音质差、信息不完整时扣分。

### 5.3 不同接口的具体用法

#### `personal_fm`

适合做“即时灵感源”，不适合完全接管队列。

建议：

- 每次创建电台时拉取 3-6 首。
- 只选择 1-2 首进入最终队列。
- 标记为 `sourceScope=fm`。
- DJ 解释方式：不要说“私人 FM 接口推荐”，而是说“这首是我顺着你最近的听感多探了一步”。

#### `recommend_songs`

适合做每日推荐池。

建议：

- 每天首次启动时拉取并缓存。
- 进入 `radio_recommend_cache` 或独立候选表。
- 与本地曲库去重。
- 推荐理由如果接口返回 `reason`，可以进入 `recallReason`，但不要直接展示。

#### `history_recommend_songs` / `history_recommend_songs_detail`

适合补充“最近几天网易云连续推荐过但用户没听到”的歌曲。

建议：

- 每天后台同步最近 7-14 天。
- 如果同一艺人、同一风格反复出现，说明平台推荐趋势稳定，可提高权重。
- 对已跳过或已听腻的歌曲降权。

#### `simi_song`

适合两类场景：

- 当前播放时，续播下一段相似但不重复的歌。
- 用户聊天说“来点类似这首的”。

建议：

- 对当前歌、用户长期 Top 歌、最近一周 Top 歌分别拉相似歌曲。
- 入库时标记 `seedTrackId`，方便解释“为什么相似”。
- 队列中相似歌曲不要连续超过 2 首，避免变成单一风格。

#### `playmode_song_vector`

适合做“比相似歌曲更像真实续播”的候选来源。

它的价值在于输入可以是一批歌曲 ID，而不是单首歌。这样可以用当前队列前几首、用户长期 Top、最近一周 Top 作为种子，让网易云返回一批更贴近整体品味向量的歌曲。

建议：

- 先用 10-30 首种子歌小流量实测返回结构和质量。
- 如果质量稳定，可作为 `simi_song` 之外的第二延展来源。
- 标记为 `sourceScope=vector`。
- DJ 解释方式可以是“这首不是只像上一首，而是更像你最近这组歌共同的气质”。

#### `artist_desc` / `artist_top_song` / `simi_artist`

适合做艺人维度的理解和探索。

建议：

- 对用户长期高频艺人缓存 `artist_desc`。
- 用户说“多放点某某”时，用 `artist_top_song` 补代表作，用 `artist_songs` 补长尾歌曲。
- 用户说“类似某某这种人声/气质”时，用 `simi_artist` 扩展相似艺人，再从这些艺人取歌。
- DJ 独白可以讲“这位音乐人的表达方式”，而不是只讲单曲标签。

#### `album` / `album_detail`

适合让 DJ 讲专辑上下文。

建议：

- 对入队歌曲补专辑信息。
- 如果同一专辑中多首歌进入候选，要避免同队列重复过多。
- 对概念专辑、现场专辑、精选集做不同处理。
- DJ 可以讲“这首歌在专辑里更像一个转折/收束/入口”，提升真实 DJ 感。

#### `style_detail` / `style_song`

适合把用户自然语言偏好变成更稳定的曲风召回。

建议：

- 建一张曲风映射表，把用户说的“轻一点、电子点、city pop、爵士、氛围、lofi”等映射到网易云 style tag。
- 用户聊天重排时，如果识别到明确曲风，优先走 `style_song`，再用本地画像过滤。
- 比 `cloudsearch` 更适合稳定召回某种风格。

#### `user_record`

适合建立画像和行为权重。

建议：

- `type=0` 代表长期偏好，用于 favorite artists、lifelong top。
- `type=1` 代表近期兴趣，用于最近口味漂移。
- 长期高频不等于每次都要放，需结合最近播放和重复惩罚。
- 最近一周上升明显的艺人或歌曲，可以作为“现在的你”权重。

## 6. 功能与体验升级方案

### 6.1 “真实歌曲故事”DJ 独白

目标：每首歌不再像套模板，而像 DJ 真的知道这首歌。

功能表现：

- 歌曲详情页增加“DJ 了解到了什么”：
  - 百科摘要。
  - 歌词主题。
  - 听众印象。
  - 推荐给你的原因。
- DJ 独白中自然使用这些信息：
  - “这首歌收在……”
  - “它真正抓人的不是副歌，而是……”
  - “歌词里更像是在讲……”
  - “很多人听它时会把注意力放在……”

技术方案：

- 新增 `track-facts` 服务，负责按歌曲 ID 拉取和缓存事实。
- 创建电台后，对最终队列前 3 首立即补事实，后续歌曲后台预取。
- prompt 只接收压缩后的 `songFacts`。

### 6.2 “每日雷达”推荐入口

目标：把网易云每日推荐变成 MyRadio 的一组可解释电台。

功能表现：

- 首页增加“今日雷达”或“今天网易云也觉得你会喜欢”。
- 一键生成基于每日推荐的电台。
- DJ 开场说明今天推荐的整体气质，而不是逐首念推荐来源。

技术方案：

- 每天缓存 `recommend_songs`。
- 根据用户场景二次排序。
- 每日推荐最多占队列 20%，除非用户主动选择“只听今日推荐”。

### 6.3 “顺着这首继续”相似歌曲续播

目标：让用户喜欢当前歌时，可以自然延展。

功能表现：

- 当前歌曲面板增加“顺着这首继续”。
- 用户聊天说“类似这首”时，调用 `simi_song` 召回。
- DJ 回复：“我会让后面慢慢靠近这首的质地。”

技术方案：

- 当前歌 `source_track_id` 调 `simi_song`。
- 过滤本地黑名单、最近播放、不可播歌曲。
- 合并本地曲库中相似风格歌曲，避免全是陌生歌。

### 6.4 “私人 FM 混入”

目标：保留网易云私人 FM 的发现感，但由 MyRadio 重新解释和编排。

功能表现：

- 设置里增加探索强度：稳一点 / 平衡 / 多发现。
- “多发现”时提高 `personal_fm` 和 `simi_song` 候选占比。
- DJ 对 FM 歌曲的解释更像“我替你淘出来的”，而不是系统推荐。

技术方案：

- 创建会话时拉取 `personal_fm`。
- 私人 FM 歌曲进入候选池，不直接播放。
- 由 Claude 和本地评分共同决定是否入队。

### 6.5 “近期口味漂移”画像

目标：让电台知道用户最近变了，而不是永远按历史最爱推荐。

功能表现：

- 用户最近一周反复听某类歌，电台会更快靠近。
- DJ 可以说：“你最近好像更常回到这种声线，所以这里我放一首……”

技术方案：

- 定期同步 `user_record(type=1)`。
- 和 `user_record(type=0)` 做差异分析。
- 给最近上升的艺人、风格、年代、语言加临时权重。

### 6.6 “歌曲事实质量”后台任务

目标：把高质量独白需要的事实提前准备好。

功能表现：

- 用户无感。
- 电台启动和切歌更快，文案更具体。

技术方案：

- 对 liked、长期 Top、最近 Top、每日推荐、FM 候选优先补事实。
- 缓存过期策略：
  - `song_detail`：长期缓存。
  - `song_wiki_summary`：长期缓存，30 天刷新即可。
  - `artist_desc` / `album_detail`：长期缓存，30 天刷新即可。
  - `style_detail`：长期缓存。
  - `lyric`：长期缓存。
  - `comment_music`：7-14 天刷新。
  - `song_url`：短期刷新，仍沿用现有逻辑。

### 6.7 “音乐人脉络”DJ 介绍

目标：让 DJ 能讲出用户喜欢的艺人为什么被推荐，而不是只讲某首歌。

功能表现：

- 用户常听艺人进入队列时，DJ 可以简短提及这位艺人的声音气质或作品脉络。
- 用户说“多放点类似陈奕迅/Radiohead/落日飞车这种”，系统能从相似艺人和艺人热门曲里扩展。

技术方案：

- 高频艺人缓存 `artist_desc`。
- 使用 `artist_top_song` 补代表作候选。
- 使用 `simi_artist` 做艺人相似扩展。
- prompt 增加 `artistFacts`，但只给当前队列相关艺人，避免 token 膨胀。

### 6.8 “曲风导航”模式

目标：用户说具体风格时，不再只靠关键词搜索，而是进入网易云曲风体系。

功能表现：

- “来点 city pop / 爵士 / 氛围电子 / lofi”能生成更稳定的风格电台。
- DJ 可以解释这组歌的风格边界，而不是机械重复用户词。

技术方案：

- 同步 `playlist_catlist`、`playlist_highquality_tags` 或手工维护常用风格映射。
- 用 `style_detail` 补风格说明。
- 用 `style_song` 召回风格候选，再和用户画像、本地黑名单、可播性过滤合并。

### 6.9 “向量续播”实验

目标：做一个比“相似这首歌”更高级的续播能力。

功能表现：

- 用户点击“顺着这组继续”，系统不是只找当前歌相似，而是理解当前 5-10 首的共同气质。
- 适合一组电台播完后的自动续播。

技术方案：

- 将当前队列已播放歌曲或用户 Top 歌 ID 输入 `playmode_song_vector`。
- 返回歌曲进入 `sourceScope=vector` 候选池。
- 先灰度使用，只在返回质量稳定时提高占比。

## 7. 推荐落地路线

### 阶段一：DJ 独白事实增强

优先级最高，直接解决“文案没感情、像模板”的痛点。

任务：

1. 新增 `radio_track_fact` 表。
2. 新增 `track-facts.ts` 服务：
   - 批量 `song_detail`。
   - 单曲 `song_wiki_summary`。
   - 单曲 `lyric`。
   - 可选 `comment_music`。
   - 可选 `song_creators`。
3. 修改 `formatCandidatesForClaude`：
   - 给候选补 `songFacts`。
   - 控制每首事实摘要长度。
4. 修改 prompt：
   - 要求优先使用事实卡。
   - 禁止事实缺失时编造。
5. 对最终队列前几首做同步补事实，其余后台补。

验收标准：

- 随机抽 20 首歌，至少 70% 的 `djScript` 能提到具体歌曲事实、歌词主题、专辑或听众印象。
- 同一队列中不再反复出现固定句式。
- 没有百科的歌曲也不会编造创作背景。

### 阶段二：召回候选来源扩展

任务：

1. 新增推荐候选缓存表，记录候选来源、seed 歌曲、分数和过期时间。
2. 接入 `recommend_songs`，每天缓存。
3. 接入 `personal_fm`，创建电台时少量拉取。
4. 接入 `simi_song`，支持当前歌续播和聊天重排。
5. 小流量验证 `playmode_song_vector`，如果质量稳定则纳入“顺着这组继续”。
6. 合并候选时按 `sourceScope` 控制比例。

验收标准：

- “重新开始电台”不再高频复刻上一组队列。
- 每组队列有 2-4 首新鲜候选，但整体仍像用户的电台。
- 用户说“类似这首”时，后续队列确实靠近当前歌。

### 阶段三：行为闭环和画像升级

任务：

1. 定期同步 `user_record(type=0/type=1)`。
2. 计算长期偏好和近期漂移。
3. 本地播放完成、跳过、喜欢、聊天负反馈进入权重。
4. 探索歌曲播放后的反馈影响后续探索比例。

验收标准：

- 最近一周常听艺人或风格能影响推荐。
- 用户连续跳过某类探索候选后，探索比例下降。
- 用户喜欢探索候选后，相似候选权重上升。

### 阶段四：艺人、专辑和风格语义升级

任务：

1. 高频艺人接入 `artist_desc`、`artist_top_song`、`simi_artist`。
2. 入队歌曲接入 `album_detail`，补专辑上下文。
3. 常用风格接入 `style_detail`、`style_song`。
4. 聊天重排中增加艺人相似、专辑上下文、曲风召回策略。

验收标准：

- 用户说“类似某个艺人”时，不只是返回该艺人歌曲，也能扩展相似艺人。
- 用户说“某种风格”时，候选质量比 `cloudsearch` 更稳定。
- DJ 独白能讲出艺人、专辑或风格脉络，但不会变成长篇百科。

## 8. 需要注意的边界

1. **不要让网易云推荐完全接管 MyRadio**
   MyRadio 的差异化是“AI DJ 编排和解释”，网易云接口只是候选和事实来源。

2. **不要把 API 原始字段直接塞给模型**
   原始数据又长又脏，会增加 token 和幻觉风险。必须先清洗摘要。

3. **不要为了独白具体而编造**
   prompt 和事实卡都要明确：事实缺失时讲听感、歌词主题、专辑信息和推荐逻辑。

4. **不要过度探索**
   专注、工作、入眠场景里，新歌比例要低。用户主动说“换点新的”时再放开。

5. **播放地址仍要短期刷新**
   `song_url` 和事实缓存不是一类数据。播放 URL 有时效，事实信息可以长期缓存。

## 9. 建议的最终产品形态

升级后，MyRadio 应该从“AI 根据歌单排歌”变成：

> 一个会读取网易云音乐记忆、理解歌曲事实、知道用户近期口味变化，并能像私人 DJ 一样解释为什么此刻播放这首歌的电台。

用户能感受到的变化：

- 每首歌的介绍更具体，不再像套模板。
- 推荐理由更可信，能说清“为什么是我、为什么现在”。
- 队列更有新鲜感，但不会陌生到失控。
- 聊天指令更有用，“类似这首”“换点新的”“今天听推荐”都能真实改变候选来源。
- MyRadio 的 DJ 人格更稳：不是单纯播歌，而是在组织一段有来由的聆听体验。

## 10. 建议优先实施清单

短期先做这 8 件事：

1. `song_detail` + `song_wiki_summary` 入库缓存。
2. `formatCandidatesForClaude` 增加 `songFacts`。
3. prompt 要求 `djScript` 使用事实卡，不足时讲听感，不编造。
4. `recommend_songs` 从离线导出升级为每日候选池。
5. `simi_song` 接入聊天重排和“顺着这首继续”。
6. `artist_desc` 给高频艺人补背景卡。
7. `style_song` 给明确曲风请求提供稳定候选。
8. `playmode_song_vector` 做小流量实验，用于“顺着这组继续”。

前五项完成后，DJ 独白质量和推荐新鲜度会有最明显提升；后三项会继续把 MyRadio 从“会选歌”推到“懂音乐脉络”。
