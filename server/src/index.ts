import express from 'express';
import cors from 'cors';
import http from 'http';
import crypto from 'crypto';
import dotenv from 'dotenv';
import trackRouter from './api/track';
import radioRouter from './api/radio';
import chatRouter from './api/chat';
import ttsRouter from './api/tts';
import dailyPlanRouter from './api/daily-plan';
import neteaseRouter from './api/netease';
import tasteRouter from './api/taste';
import deviceRouter from './api/device';
import weatherRouter from './api/weather';
import ttsConfigRouter from './api/tts-config';
import { wsManager } from './ws/manager';
import { errorHandler } from './middleware/error-handler';
import { startScheduler } from './services/scheduler';
import { initDb } from './stores/init-db';
import { getWeatherSummary } from './services/weather';

dotenv.config();

// 服务启动前先执行数据库初始化和轻量迁移，避免旧库缺字段导致接口恢复失败。
initDb();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// requestId 中间件
app.use((req, _res, next) => {
  (req as any).requestId = crypto.randomUUID().slice(0, 8);
  next();
});

// 请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = (req as any).requestId;
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[HTTP][${requestId}] ${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
  });
  next();
});

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

// 品味画像接口
app.use('/api/taste', tasteRouter);

// 设备接口
app.use('/api/device', deviceRouter);

// 天气接口
app.use('/api/weather', weatherRouter);

// TTS 配置接口
app.use('/api/tts-config', ttsConfigRouter);

// 统一错误处理（必须放在所有路由之后）
app.use(errorHandler);

// 创建 HTTP 服务并挂载 WebSocket
const server = http.createServer(app);
wsManager.init(server);

server.listen(PORT, () => {
  console.log(`My Radio 服务已启动: http://localhost:${PORT}`);
  console.log(`WebSocket 已启动: ws://localhost:${PORT}/ws`);
  startScheduler();
  // 预热天气缓存，避免首次创建会话时等待网络请求
  getWeatherSummary().then(w => console.log(`[Weather] 缓存预热完成: ${w}`)).catch(() => {});
});
