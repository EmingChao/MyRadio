import db from '../stores/db';
import { wsManager } from '../ws/manager';

const USER_ID = 443961717;
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 分钟

let lastScene: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * 获取当前时段的完整信息（场景、心情、时间范围）
 */
function getCurrentSlot(): { scene: string; mood: string; startTime: string; endTime: string } | null {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const time = `${hh}:${mm}`;

  const plan = db.prepare(
    `SELECT id FROM radio_daily_plan WHERE user_id = ? AND plan_date = ?`
  ).get(USER_ID, today) as any;

  if (plan) {
    const item = db.prepare(`
      SELECT scene, mood, start_time, end_time FROM radio_daily_plan_item
      WHERE plan_id = ? AND start_time <= ? AND end_time > ?
      ORDER BY start_time DESC LIMIT 1
    `).get(plan.id, time, time) as any;

    if (item) {
      return {
        scene: item.scene,
        mood: item.mood || '随意',
        startTime: item.start_time,
        endTime: item.end_time,
      };
    }
  }

  return null;
}

/**
 * 检查时段是否发生变化，若变化则广播通知
 */
function checkSlotChange() {
  const slot = getCurrentSlot();
  if (!slot) return;

  if (lastScene !== null && lastScene !== slot.scene) {
    console.log(`[Scheduler] 时段切换: ${lastScene} → ${slot.scene} (${slot.startTime}-${slot.endTime})`);
    wsManager.broadcastAll({
      type: 'SLOT_CHANGED',
      data: {
        scene: slot.scene,
        mood: slot.mood,
        startTime: slot.startTime,
        endTime: slot.endTime,
      },
    });
  }

  lastScene = slot.scene;
}

/**
 * 启动时段检查调度器
 */
export function startScheduler() {
  // 首次运行，记录当前时段
  const slot = getCurrentSlot();
  if (slot) {
    lastScene = slot.scene;
    console.log(`[Scheduler] 当前时段: ${slot.scene} (${slot.startTime}-${slot.endTime})`);
  }

  timer = setInterval(checkSlotChange, CHECK_INTERVAL);
  console.log(`[Scheduler] 时段检查已启动，每 ${CHECK_INTERVAL / 1000 / 60} 分钟检查一次`);
}

/**
 * 停止调度器
 */
export function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
