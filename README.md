# My Radio

一个由 AI 驱动的私人电台应用。选择场景和心情，AI 为你编排一整套歌单，配合 DJ 串场词、TTS 语音合成，打造沉浸式的电台体验。

## 功能特性

- **AI 电台编排** — 基于 Claude API，根据场景（编码/工作/放松/睡眠）和心情智能选歌、编排顺序
- **DJ 串场词** — 每首歌之间有 AI 生成的串场词，配合 TTS 语音合成，模拟真实电台 DJ
- **智能召回** — 基于用户画像的歌曲召回算法，综合场景匹配、心情匹配、播放历史等多维度打分
- **聊天互动** — 与 DJ 对话，支持重新排歌、保存偏好等意图识别
- **网易云集成** — 通过网易云音乐 API 获取歌曲数据，支持扫码登录获取 VIP 播放地址
- **天气感知** — 自动获取天气信息，影响 AI 选歌策略
- **每日计划** — 根据时间段自动生成每日电台计划
- **WebSocket 实时推送** — TTS 就绪、队列更新、DJ 聊天等事件实时推送
- **PWA 支持** — 可安装为桌面/移动端应用

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + TypeScript + Pinia + Vite |
| 后端 | Node.js + Express + TypeScript |
| 数据库 | SQLite (better-sqlite3) |
| AI | Claude API (Anthropic SDK) |
| TTS | MiMo TTS VoiceClone |
| 音乐数据 | NeteaseCloudMusicApi |
| 实时通信 | WebSocket (ws) |
| 天气 | Open-Meteo API |

## 项目结构

```
my-radio/
├── server/                 # 后端服务
│   ├── src/
│   │   ├── index.ts        # Express + WebSocket 入口
│   │   ├── agent/          # AI 编排（召回、Claude 调用、聊天）
│   │   ├── api/            # REST API 路由
│   │   ├── services/       # TTS、天气、每日计划服务
│   │   ├── stores/         # SQLite 数据层
│   │   └── ws/             # WebSocket 管理器
│   └── .env.example        # 环境变量模板
├── web/                    # 前端应用
│   ├── src/
│   │   ├── components/     # 播放器、DJ 聊天、队列等组件
│   │   ├── composables/    # WebSocket 组合式函数
│   │   ├── stores/         # Pinia 状态管理
│   │   └── views/          # 页面视图
│   └── vite.config.ts      # Vite 配置（含 API 代理）
├── scripts/                # 数据导入脚本
└── start.sh                # 一键启动脚本
```

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 1. 安装依赖

```bash
# 根目录（网易云 API）
npm install

# 后端
cd server && npm install

# 前端
cd ../web && npm install
```

### 2. 配置环境变量

```bash
cd server
cp .env.example .env
```

编辑 `.env`，填入你的 API Key：

```env
# Claude API（支持 Anthropic 直连或 MiMo 代理）
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_AUTH_TOKEN=your-api-key
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# TTS API Key（可选，默认使用 ANTHROPIC_AUTH_TOKEN）
MIMO_TTS_API_KEY=your-tts-key

# 位置（用于天气，可选）
LATITUDE=31.23
LONGITUDE=121.47

# 服务端口
PORT=15620
```

### 3. 初始化数据库并导入歌曲

```bash
cd server

# 建表
npm run db:init

# 导入网易云歌单数据（需要先有 netease-export.json）
npm run db:import
```

### 4. 启动服务

方式一：一键启动

```bash
./start.sh
```

方式二：分别启动

```bash
# 终端 1 — 后端
cd server && npm run dev

# 终端 2 — 前端
cd web && npm run dev
```

浏览器打开 http://localhost:3000

### 5. 登录网易云（可选）

点击界面右上角 **NETEASE** 按钮，使用网易云音乐 APP 扫码登录，即可获取 VIP 歌曲完整播放地址。

## 使用方式

1. 在底部选择 **场景**（CODE / WORK / CHILL / SLEEP）和 **心情**
2. 可选填写备注（如"不想听太吵的"）
3. 点击 **START RADIO**，等待 AI 编排歌单
4. 音乐自动播放，DJ 串场词通过语音播报
5. 右侧可以与 DJ 聊天，请求换歌或保存偏好

## API 文档

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/radio/session/create` | POST | 创建电台会话 |
| `/api/radio/session/:id/tracks` | GET | 刷新会话歌曲 |
| `/api/radio/session/chat` | POST | 与 DJ 聊天 |
| `/api/radio/playback/report` | POST | 播放行为上报 |
| `/api/track/list` | GET | 歌曲列表 |
| `/api/track/stats` | GET | 歌曲统计 |
| `/api/tts/synthesize` | POST | TTS 语音合成 |
| `/api/plan/today` | GET | 今日电台计划 |
| `/api/netease/login/status` | GET | 网易云登录状态 |
| `/api/netease/qr/create` | POST | 生成登录二维码 |
| `/api/netease/qr/check` | GET | 检查扫码状态 |
| `/api/netease/fetch-urls` | POST | 获取播放地址 |
| `/api/health` | GET | 健康检查 |

## License

MIT
