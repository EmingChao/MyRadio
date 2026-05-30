# AI DJ 体验优化落地方案

## 背景

当前产品的核心体验不是“能播放音乐”，而是让用户感觉有一个懂自己品味的私人 DJ 在陪伴。用户反馈集中在四点：

- 音乐播放前没有稳定开场，切歌时也很少听到 DJ 声音。
- DJ 波形像固定动画，不对应真实 TTS 音频。
- 独白内容过短，缺少歌曲介绍、推荐理由和情绪承接。
- 推荐范围局限在用户已有歌单，不会基于场景和品味主动探索新歌。

本轮改动围绕“用户体验和情绪价值优先”落地，目标是让开场、切歌、主动推荐和 UI 反馈形成闭环。

## 体验目标

1. 启动电台后，先听到有情绪铺垫的开场白，再进入第一首歌。
2. 每次进入新歌前，DJ 先完成一次完整独白：承接上一首、介绍当前歌曲、说明推荐理由。
3. DJ 说话时才显示波形，且波形来自真实 TTS 音频采样。
4. 推荐不只来自用户歌单，也可以少量穿插基于用户画像主动搜索的新歌。
5. 主动推荐新歌时，DJ 要解释“为什么是这首”，不能只说“为你推荐”。

## 已落地链路

### 1. DJ 播放顺序

前端播放链路改为：

1. 创建或恢复会话。
2. 判断当前歌曲前是否需要 DJ 语音。
3. 如果是新会话，优先播放 `say` 开场白。
4. 如果是切歌，播放当前歌曲的 `voiceIntro`。
5. TTS 结束后再播放音乐。
6. 如果 TTS 生成超过兜底时间仍未就绪，先播放音乐，避免卡死。

相关文件：

- `web/src/stores/player.ts`
- `web/src/stores/player-tts-sequence.ts`

### 2. 完整歌曲前独白

后端不再只把短 `segue` 当作 TTS 内容。每首歌会生成：

- `segue`：从上一首到当前歌曲的情绪过渡。
- `djScript`：歌曲、艺人或声音气质介绍。
- `recommendReason`：为什么适合当前场景、心情和用户品味。
- `voiceIntro`：真正用于 TTS 播放的完整独白，由前三段组合而成。

这样用户在切歌时听到的是完整的 DJ 解说，而不是几个提示词。

相关文件：

- `server/src/agent/dj-copy.ts`
- `server/src/agent/radio.ts`
- `server/src/api/radio.ts`
- `web/src/components/RadioPlayer.vue`
- `web/src/components/NowPlayingCard.vue`

### 3. DJ 文案质量兜底

模型不可用或返回内容过短时，本地模板会自动补齐体验型文案。兜底文案必须覆盖：

- 歌曲名或艺人。
- 当前场景和心情。
- 推荐原因。
- 情绪价值和承接关系。
- 如果是探索歌曲，要说明它是基于品味延展而来。

相关文件：

- `server/src/agent/dj-copy.ts`
- `server/tests/dj-copy.test.ts`

### 4. TTS 风格

TTS 生成风格调整为私人电台 DJ：

- 温暖、克制、低沉。
- 语速中慢，停顿自然。
- 像懂用户品味的朋友介绍歌曲。
- 避免播音腔、营销腔和系统通知感。

相关文件：

- `server/src/services/tts.ts`

### 5. 真实 TTS 波形

前端波形不再是固定动画：

- DJ 没说话时，波形回到静默低位。
- DJ TTS 播放时，通过 Web Audio `AnalyserNode` 从 TTS 音频采样。
- `DjChat` 和 `RadioPlayer` 共用 `store.djWaveform` 展示真实语音波形。

相关文件：

- `web/src/stores/player.ts`
- `web/src/components/DjChat.vue`
- `web/src/components/RadioPlayer.vue`

### 6. 主动探索新歌

后端新增探索推荐模块：

1. 从用户画像中读取签名风格、最爱艺人、曲库高频艺人、终身最爱。
2. 结合当前场景和心情生成网易云搜索关键词。
3. 使用网易云 `cloudsearch` 搜索新歌。
4. 过滤用户本地已有 `source_track_id`，避免重复推荐。
5. 将探索歌曲以 `source_type = NETEASE_EXPLORE` 写入 `radio_track`。
6. 和本地曲库候选合并，探索歌曲控制在少量比例，避免破坏用户品味。
7. Prompt 中标记 `sourceScope=explore`，要求模型解释主动推荐理由。

相关文件：

- `server/src/agent/explore.ts`
- `server/src/agent/recall.ts`
- `server/src/agent/prompts.ts`
- `server/src/agent/radio.ts`
- `server/tests/explore.test.ts`

## 当前策略

### 本地曲库与探索歌曲比例

当前策略偏保守：

- 先取本地高分候选前 24 首。
- 再插入最多 6 首探索候选。
- 再补足其余本地候选。

这样 Claude 可以看到探索歌曲，但不会让电台突然变成陌生歌单。

### 探索歌曲表达方式

DJ 不直接说“算法推荐”或“系统搜索到”，而是用更自然的表达：

- “这首不一定在你原来的歌单里，我是顺着你的品味往外多走了一步。”
- “它和你的常听气质有连接，又不会只是重复旧歌单。”
- “把它放进来，是想给熟悉的口味一点新鲜空气。”

## 验证方式

已通过：

```bash
cd server && ./node_modules/.bin/tsx tests/dj-copy.test.ts
cd server && ./node_modules/.bin/tsx tests/explore.test.ts
node --import /Users/liumingchao/develop/private/my-redio-by-mimo/server/node_modules/tsx/dist/loader.mjs /Users/liumingchao/develop/private/my-redio-by-mimo/web/tests/player-tts-sequence.test.ts
cd web && npm run build
```

服务端 `npm run build` 当前仍失败，失败项是既有类型问题，主要集中在网易云 SDK 返回类型、TTS 返回体、weather 和 better-sqlite3 类型导出。本轮新增探索推荐和 DJ 文案文件没有出现在失败列表中。

## 后续建议

1. 增加 `voiceIntro` 字段持久化，避免未来只依赖 `segue + djScript + recommendReason` 动态拼接。
2. 给探索歌曲加“曝光但未播放 / 播放完成 / 跳过”的反馈闭环，用播放行为调整探索比例。
3. 把 TTS 生成结果加上 `kind` 和 `trackId`，避免未来出现相同文本 hash 冲突时难以排查。
4. 将聊天重排也接入主动探索候选，让用户说“换点新的”时可以真正搜索新歌。
5. 修复服务端既有 TypeScript 类型债，避免后续 build 结果无法直接作为回归门禁。
