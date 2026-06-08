# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

My Radio — AI 驱动的私人电台应用。前端 Vue 3 + 后端 Node.js/Express，通过 Claude API 实现智能歌单编排、DJ 串场词生成，配合 TTS 语音合成打造沉浸式电台体验。

## Commands

```bash
# 一键启动/停止前后端
./start.sh                   # 杀旧进程 → 启动后端:15620 + 前端:3000
./stop.sh                    # 停止前后端

# 分别启动
cd server && npm run dev    # 后端 tsx watch，端口 15620
cd web && npm run dev       # 前端 Vite dev server，端口 3000

# 构建
cd server && npm run build  # tsc 编译到 dist/
cd web && npm run build     # vue-tsc + vite build

# 数据库操作（均在 server/ 目录下执行）
npm run db:init             # 建表 + 轻量迁移（新增列用 ALTER TABLE ... ADD COLUMN，已存在则静默跳过）
npm run db:import           # 导入网易云歌单（需先有 netease-export.json）
npm run netease:login       # 网易云扫码登录获取 cookie
npm run netease:fetch-urls  # 获取 VIP 歌曲播放地址

# TypeScript 类型检查
cd server && npx tsc --noEmit
cd web && npx vue-tsc --noEmit
```

## Architecture

### 数据流

用户选择场景/心情 → `recall.ts` 多维打分召回候选歌曲 → `claude.ts` 调用 Claude API 编排歌单 + 生成 DJ 串场词 → 保存到 SQLite → 通过 WebSocket (`ws/manager.ts`) 推送前端 → 前端 `player.ts` (Pinia) 管理播放队列和 TTS 播报序列

### TTS 语音合成架构

TTS 支持两种模式，通过 `radio_tts_config` 表配置，前端 `TtsConfigPanel.vue` 提供设置界面：

- **克隆模式** (`mimo-v2.5-tts-voiceclone`)：上传参考音频做音色克隆，默认使用内置参考音频
- **预设模式** (`mimo-v2.5-tts`)：从预设音色列表选择（冰糖/茉莉/苏打/白桦/Mia/Chloe/Milo/Dean），可选方言风格（东北话/四川话/河南话/粤语）

关键流程：`services/tts.ts` 的 `synthesizeSpeech()` 根据 config.mode 分流到不同模型，合成结果按文本+风格 hash 缓存到 `data/tts-cache/`。切换配置时通过 `clearTtsCache()` 清空缓存确保新音色立即生效。`services/tts-style.ts` 根据会话场景/情绪动态生成 TTS 播放风格参数。

### 后端 (`server/`)

- **入口**: `src/index.ts` — Express + WebSocket，启动时自动 `initDb()` 和天气缓存预热
- **agent/** — AI 核心编排层：
  - `radio.ts` — 电台会话创建，召回→Claude重排→校验→保存的完整流程
  - `recall.ts` — 候选歌曲召回算法（场景/心情/历史多维打分）
  - `explore.ts` — 探索性推荐（主动发现新歌）
  - `claude.ts` — Claude API 调用封装（含重试 + JSON 解析）
  - `chat.ts` — DJ 聊天意图识别
  - `dj-copy.ts` — DJ 串场词模板和 fallback 逻辑
  - `prompts.ts` — System Prompt 定义
  - `context.ts` / `queue-plan.ts` — 用户上下文和队列规划
- **api/** — REST 路由（radio, track, chat, tts, tts-config, netease, taste, device, weather, daily-plan）
- **services/** — TTS 合成（`tts.ts` 含克隆/预设双模型分流 + 缓存）、TTS 风格（`tts-style.ts`）、天气查询、每日计划、歌词获取、设备适配
- **stores/** — SQLite 数据层（`db.ts` 单例 + WAL 模式），`tts-config.ts` 管理 TTS 配置 CRUD，`init-db.ts` 含迁移逻辑
- **ws/manager.ts** — WebSocket 连接管理，按 sessionId 订阅推送
- **scripts/** — 数据导入和网易云登录等运维脚本

### 前端 (`web/`)

- **Vue 3 + TypeScript + Pinia + Vite**，无路由库（单页应用，`HomeView.vue` 为主视图）
- **Vite 代理配置**: `/api` → `localhost:15620`，`/ws` → `ws://localhost:15620`
- **stores/**: `player.ts`（核心播放状态，含 `restoreSession()` 页面加载自动恢复会话）、`tts-config.ts`（TTS 配置管理）、`device.ts`、`player-tts-volume.ts`、`player-tts-sequence.ts`
- **composables/**: `useWebSocket.ts`（实时事件订阅）、`useCoverBg.ts`（封面背景）、`media-keyboard-controls.ts`（媒体键）
- **components/**: `RadioPlayer.vue`（播放器）、`DjChat.vue`（DJ聊天）、`TrackQueue.vue`（队列）、`LyricsPanel.vue`（歌词）、`TtsConfigPanel.vue`（TTS 音色设置）、`NeteaseLogin.vue`（网易云登录）等
- **api/index.ts**: 基于 fetch 的 API 封装，统一错误处理

### 关键配置

- 后端 `.env` 配置见 `server/.env.example`，核心变量：`ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_MODEL`、`MIMO_TTS_API_KEY`、`DB_PATH`、`PORT`
- 数据库路径默认 `server/data/radio.db`，WAL 模式；迁移用 `ALTER TABLE ... ADD COLUMN` + try/catch 静默跳过已有列
- TTS 缓存目录 `server/data/tts-cache/`，按文本+风格 hash 存储 WAV 文件
- 根目录 `package.json` 仅包含 NeteaseCloudMusicApi 依赖（网易云音乐 API 服务）

### WebSocket 事件类型

`TRACK_CHANGED` / `QUEUE_UPDATED` / `DJ_CHAT` / `PLAYBACK_REPORT` / `TTS_READY` / `SLOT_CHANGED` — 客户端通过 `SUBSCRIBE` 消息绑定 sessionId 接收推送
