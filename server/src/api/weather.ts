import { Router } from 'express';
import { getWeather } from '../services/weather';

const router = Router();

/**
 * GET /api/weather/current — 获取当前天气，用于播放器顶部氛围信息。
 */
router.get('/current', async (_req, res) => {
  try {
    const weather = await getWeather();
    res.json({ code: 0, data: weather });
  } catch (err: any) {
    res.status(500).json({ code: 500, message: err.message || '获取天气失败' });
  }
});

export default router;
