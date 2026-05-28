import db from '../stores/db';
import { loadRoutines, getTimeContext } from '../agent/context';
import { getWeatherSummary } from './weather';

/**
 * 今日计划服务
 * 根据作息偏好和天气生成一天的电台计划
 */

interface PlanItem {
  startTime: string;
  endTime: string;
  scene: string;
  mood: string;
  strategySummary: string;
  sourcePlaylist: string;
}

interface DailyPlan {
  planId: number;
  planTitle: string;
  weatherSummary: string;
  aiSummary: string;
  items: PlanItem[];
}

const USER_ID = 443961717;

/**
 * 获取或生成今日计划
 */
export async function getOrGenerateDailyPlan(): Promise<DailyPlan | null> {
  const today = new Date().toISOString().slice(0, 10);

  // 检查是否已有今日计划
  const existing = db.prepare(`
    SELECT * FROM radio_daily_plan WHERE user_id = ? AND plan_date = ?
  `).get(USER_ID, today) as any;

  if (existing) {
    const items = db.prepare(`
      SELECT * FROM radio_daily_plan_item WHERE plan_id = ? ORDER BY start_time
    `).all(existing.id) as any[];

    return {
      planId: existing.id,
      planTitle: existing.plan_title,
      weatherSummary: existing.weather_summary || '',
      aiSummary: existing.ai_summary || '',
      items: items.map(item => ({
        startTime: item.start_time,
        endTime: item.end_time,
        scene: item.scene,
        mood: item.mood || '',
        strategySummary: item.strategy_summary || '',
        sourcePlaylist: item.source_playlist || '',
      })),
    };
  }

  // 生成新计划
  return generateDailyPlan(today);
}

/**
 * 根据作息偏好生成今日计划
 */
async function generateDailyPlan(date: string): Promise<DailyPlan> {
  const routines = loadRoutines();
  const weather = await getWeatherSummary();
  const now = new Date();
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const schedule = isWeekend ? routines?.weekend : routines?.weekday;

  const planTitle = isWeekend ? `周末电台计划` : `工作日电台计划`;

  // 插入计划
  const planResult = db.prepare(`
    INSERT INTO radio_daily_plan (user_id, plan_date, plan_title, weather_summary, ai_summary)
    VALUES (?, ?, ?, ?, ?)
  `).run(USER_ID, date, planTitle, weather, `基于作息偏好自动生成，天气：${weather}`);

  const planId = Number(planResult.lastInsertRowid);

  // 根据作息生成计划明细
  const items: PlanItem[] = [];

  if (schedule && Array.isArray(schedule)) {
    for (const slot of schedule) {
      const [startTime, endTime] = slot.timeRange.split('-');
      const item: PlanItem = {
        startTime,
        endTime,
        scene: slot.scene || '通用',
        mood: slot.mood || '随意',
        strategySummary: slot.preference || '',
        sourcePlaylist: '',
      };
      items.push(item);

      db.prepare(`
        INSERT INTO radio_daily_plan_item (plan_id, start_time, end_time, scene, mood, strategy_summary, source_playlist)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(planId, startTime, endTime, item.scene, item.mood, item.strategySummary, item.sourcePlaylist);
    }
  }

  // 如果没有作息数据，生成默认计划
  if (items.length === 0) {
    const defaults = [
      { start: '07:00', end: '09:00', scene: 'morning', mood: '放松', pref: '轻快的早晨音乐' },
      { start: '09:00', end: '12:00', scene: 'working', mood: '专注', pref: '无歌词纯音乐，帮助集中注意力' },
      { start: '12:00', end: '14:00', scene: 'relaxing', mood: '放松', pref: '午休时段，轻松舒缓' },
      { start: '14:00', end: '18:00', scene: 'working', mood: '专注', pref: '下午工作，节奏平稳' },
      { start: '18:00', end: '22:00', scene: 'relaxing', mood: '放松', pref: '晚间放松，随心情切换' },
      { start: '22:00', end: '01:00', scene: 'sleeping', mood: '深夜', pref: '深夜电台，低音量，慵懒氛围' },
    ];

    for (const d of defaults) {
      items.push({
        startTime: d.start,
        endTime: d.end,
        scene: d.scene,
        mood: d.mood,
        strategySummary: d.pref,
        sourcePlaylist: '',
      });

      db.prepare(`
        INSERT INTO radio_daily_plan_item (plan_id, start_time, end_time, scene, mood, strategy_summary)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(planId, d.start, d.end, d.scene, d.mood, d.pref);
    }
  }

  return {
    planId,
    planTitle,
    weatherSummary: weather,
    aiSummary: `基于作息偏好自动生成，天气：${weather}`,
    items,
  };
}

/**
 * 获取当前时段应该使用的场景和心情
 */
export function getCurrentSceneAndMood(): { scene: string; mood: string } {
  const { time } = getTimeContext();
  const today = new Date().toISOString().slice(0, 10);

  // 从今日计划中查找当前时段
  const plan = db.prepare(`
    SELECT id FROM radio_daily_plan WHERE user_id = ? AND plan_date = ?
  `).get(USER_ID, today) as any;

  if (plan) {
    const item = db.prepare(`
      SELECT scene, mood FROM radio_daily_plan_item
      WHERE plan_id = ? AND start_time <= ? AND end_time > ?
      ORDER BY start_time DESC LIMIT 1
    `).get(plan.id, time, time) as any;

    if (item) {
      return { scene: item.scene, mood: item.mood || '随意' };
    }
  }

  // 默认值
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return { scene: 'morning', mood: '放松' };
  if (hour >= 12 && hour < 18) return { scene: 'working', mood: '专注' };
  if (hour >= 18 && hour < 22) return { scene: 'relaxing', mood: '放松' };
  return { scene: 'sleeping', mood: '深夜' };
}
