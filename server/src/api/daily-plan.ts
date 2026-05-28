import { Router } from 'express';
import { getOrGenerateDailyPlan } from '../services/daily-plan';

const router = Router();

/**
 * GET /api/plan/today — 获取今日电台计划
 */
router.get('/today', async (_req, res) => {
  try {
    const plan = await getOrGenerateDailyPlan();
    res.json({ code: 0, data: plan });
  } catch (err: any) {
    console.error('获取今日计划失败:', err);
    res.status(500).json({ code: 500, message: err.message || '获取今日计划失败' });
  }
});

export default router;
