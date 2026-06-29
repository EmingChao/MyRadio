import { Router } from 'express';
import { getWeather } from '../services/weather';
import { resolveCoords } from '../services/ip-geo';

const router = Router();

/**
 * 获取客户端真实 IP（考虑反向代理）
 */
function getClientIp(req: import('express').Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '';
}

/**
 * GET /api/weather/current — 获取当前天气，根据客户端 IP 自动定位。
 */
router.get('/current', async (req, res) => {
  try {
    // 根据客户端 IP 解析经纬度，内网或失败时走兜底坐标
    const clientIp = getClientIp(req);
    const coords = await resolveCoords(clientIp);
    const weather = await getWeather(coords?.lat, coords?.lon);
    res.json({ code: 0, data: weather });
  } catch (err: any) {
    res.status(500).json({ code: 500, message: err.message || '获取天气失败' });
  }
});

export default router;
