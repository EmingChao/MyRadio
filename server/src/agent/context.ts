import fs from 'fs';
import path from 'path';
import { getWeatherSummary } from '../services/weather';

/**
 * 组装 Claude 所需的上下文信息
 */

interface UserContext {
  scene: string;
  mood: string;
  time: string;
  weather: string;
  routine: string;
  calendar: string;
}

/**
 * 获取当前时间上下文
 */
export function getTimeContext(): { time: string; period: string } {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const time = `${hh}:${mm}`;

  const hour = now.getHours();
  let period = 'late_night';
  if (hour >= 6 && hour < 9) period = 'morning';
  else if (hour >= 9 && hour < 12) period = 'morning';
  else if (hour >= 12 && hour < 14) period = 'afternoon';
  else if (hour >= 14 && hour < 18) period = 'afternoon';
  else if (hour >= 18 && hour < 22) period = 'evening';

  return { time, period };
}

/**
 * 加载品味本体
 */
export function loadTasteProfile(): any {
  const tastePath = path.resolve(__dirname, '../../data/taste.json');
  if (!fs.existsSync(tastePath)) return null;
  return JSON.parse(fs.readFileSync(tastePath, 'utf-8'));
}

/**
 * 加载作息偏好
 */
export function loadRoutines(): any {
  const routinesPath = path.resolve(__dirname, '../../data/routines.json');
  if (!fs.existsSync(routinesPath)) return null;
  return JSON.parse(fs.readFileSync(routinesPath, 'utf-8'));
}

/**
 * 获取当前时段的作息偏好
 */
export function getCurrentRoutine(): string {
  const routines = loadRoutines();
  if (!routines) return '';

  const now = new Date();
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const schedule = isWeekend ? routines.weekend : routines.weekday;
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const currentTime = `${hh}:${mm}`;

  for (const slot of schedule) {
    const [start, end] = slot.timeRange.split('-');
    if (currentTime >= start && currentTime <= end) {
      return `${slot.scene}（${slot.timeRange}），${slot.mood}，${slot.preference}`;
    }
  }

  return '';
}

/**
 * 组装完整的用户上下文
 */
export async function buildUserContext(params: {
  scene?: string;
  mood?: string;
  extraPrompt?: string;
}): Promise<UserContext> {
  const { time } = getTimeContext();
  const routine = getCurrentRoutine();
  const weather = await getWeatherSummary();

  return {
    scene: params.scene || '通用',
    mood: params.mood || '随意',
    time,
    weather,
    routine,
    calendar: '', // 后续接入日程 API
  };
}

/**
 * 组装用户音乐画像（精简版，供 Claude 使用）
 */
export function buildMusicProfile(): any {
  const taste = loadTasteProfile();
  if (!taste) return {};

  return {
    favoriteArtists: taste.taste_profile?.favorite_artists?.slice(0, 10).map((a: any) => a.name) || [],
    signatures: taste.taste_profile?.signatures || [],
    byTimeOfDay: taste.taste_profile?.by_time_of_day || {},
    byMood: taste.taste_profile?.by_mood || {},
  };
}
