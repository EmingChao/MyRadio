import express from 'express';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';
import trackRouter from './api/track';
import radioRouter from './api/radio';
import chatRouter from './api/chat';
import ttsRouter from './api/tts';
import dailyPlanRouter from './api/daily-plan';
import neteaseRouter from './api/netease';
import { wsManager } from './ws/manager';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 歌曲接口
app.use('/api/track', trackRouter);

// 电台接口
app.use('/api/radio', radioRouter);

// 聊天接口
app.use('/api/radio', chatRouter);

// TTS 接口
app.use('/api/tts', ttsRouter);

// 今日计划接口
app.use('/api/plan', dailyPlanRouter);

// 网易云登录接口
app.use('/api/netease', neteaseRouter);

// 创建 HTTP 服务并挂载 WebSocket
const server = http.createServer(app);
wsManager.init(server);

server.listen(PORT, () => {
  console.log(`My Radio 服务已启动: http://localhost:${PORT}`);
  console.log(`WebSocket 已启动: ws://localhost:${PORT}/ws`);
});
