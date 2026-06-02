import db from '../stores/db';
import type { Track } from '../types';
import fs from 'fs';
import path from 'path';
import { getUserProfile } from '../stores/profile';

/**
 * 候选歌曲召回算法
 * 从用户曲库中按评分公式召回候选歌曲
 */

interface RecallContext {
  scene?: string;     // 场景：coding, working, relaxing...
  mood?: string;      // 心情：专注, 放松, 高兴, 低落...
  time?: string;      // 当前时间 HH:mm
  weather?: string;   // 天气描述
  limit?: number;     // 召回数量，默认 100
}

interface ScoredTrack {
  track: Track;
  score: number;
  reason: string;
  sourceScope?: 'library' | 'explore';
}

/**
 * 召回候选歌曲
 */
export function recallCandidates(userId: number, ctx: RecallContext): ScoredTrack[] {
  const limit = ctx.limit || 100;

  // 加载用户画像（do_not_play + favorite_genres）
  const profile = getUserProfile(userId);
  const doNotPlayTags: string[] = (profile?.doNotPlay || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const favoriteGenres: string[] = (profile?.favoriteGenres || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  // 获取所有歌曲
  const tracks = db.prepare(`
    SELECT * FROM radio_track WHERE user_id = ?
  `).all(userId) as Track[];

  // 加载心情规则
  const moodRules = loadMoodRules();
  const sceneRules = moodRules?.sceneRules || {};
  const moodRule = moodRules?.moodRules?.[ctx.mood || ''] || null;

  // 场景映射到心情
  const effectiveMood = ctx.mood || sceneRules[ctx.scene || '']?.moodMapping || '';
  const weatherMood = getWeatherMoodWeights(ctx.weather);

  // 评分
  const scored: ScoredTrack[] = tracks
    .filter(track => {
      // 过滤 do_not_play：歌曲标签命中黑名单则排除
      if (doNotPlayTags.length === 0) return true;
      const trackTags = [
        ...(track.genre_tags || '').split(','),
        ...(track.mood_tags || '').split(','),
      ].map(t => t.trim()).filter(Boolean);
      return !trackTags.some(tag =>
        doNotPlayTags.some(dnp => tag.includes(dnp) || dnp.includes(tag))
      );
    })
    .map(track => {
      let score = 0;
      const reasons: string[] = [];

      // 1. 喜欢加分：保留用户品味，但不能压过场景、天气和探索候选。
      if (track.liked) {
        score += 16;
        reasons.push('喜欢');
      }

      // 2. 风格匹配 (+20)
      if (moodRule && track.genre_tags) {
        const tags = track.genre_tags.split(',').map(t => t.trim());
        const matched = moodRule.preferredGenres.some((g: string) =>
          tags.some(t => t.includes(g) || g.includes(t))
        );
        if (matched) {
          score += 20;
          reasons.push('风格匹配');
        }
      }

      // 3. 用户偏好风格加分 (+10)
      if (favoriteGenres.length > 0 && track.genre_tags) {
        const tags = track.genre_tags.split(',').map(t => t.trim());
        const matched = favoriteGenres.some(fg =>
          tags.some(t => t.includes(fg) || fg.includes(t))
        );
        if (matched) {
          score += 10;
          reasons.push('用户偏好');
        }
      }

      // 4. 心情匹配 (+20) — 基于标签
      if (moodRule && track.mood_tags) {
        const moods = track.mood_tags.split(',').map(t => t.trim());
        const matched = moodRule.keywords?.some((k: string) =>
          moods.some(m => m.includes(k) || k.includes(m))
        );
        if (matched) {
          score += 20;
          reasons.push('心情匹配');
        }
      }

      // 5. 场景匹配 (+20) — 基于歌单来源
      if (ctx.scene === 'coding' || ctx.scene === 'working') {
        // 工作场景偏好说唱/纯音乐
        if (track.genre_tags?.includes('说唱') || track.genre_tags?.includes('纯音乐')) {
          score += 20;
          reasons.push('工作场景匹配');
        }
      }

      // 6. 最近播放扣分 (-10~-30)
      // 简化：按 play_count 越高扣分越多
      if (track.play_count > 10) {
        score -= Math.min(30, track.play_count);
        reasons.push('播放较多');
      }

      // 7. 跳过扣分 (-30)
      if (track.skipped_count > 3) {
        score -= 30;
        reasons.push('经常跳过');
      }

      // 8. 天气偏好加分 (+0~16)
      if (weatherMood && track.genre_tags) {
        const tags = track.genre_tags.split(',').map(t => t.trim()).filter(Boolean);
        const weatherMatched = weatherMood.preferredGenres.some((g: string) =>
          tags.some(t => t.includes(g) || g.includes(t))
        );
        if (weatherMatched) {
          score += weatherMood.bonus;
          reasons.push(`天气匹配${weatherMood.label}`);
        }
      }

      return {
        track,
        score,
        reason: reasons.join(', ') || '默认',
      };
    });

  // 排序并取 top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * 加载心情规则
 */
function loadMoodRules(): any {
  const rulesPath = path.resolve(__dirname, '../../data/mood-rules.json');
  if (!fs.existsSync(rulesPath)) return null;
  return JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
}

/**
 * 为 Claude 准备候选歌曲摘要（精简字段，减少 token）
 */
export function formatCandidatesForClaude(scored: ScoredTrack[]) {
  return scored.map(s => ({
    trackId: s.track.id,
    title: s.track.title,
    artist: s.track.artist,
    album: s.track.album,
    releaseYear: s.track.release_year || undefined,
    tags: [
      s.track.genre_tags,
      s.track.mood_tags,
    ].filter(Boolean).join(', ') || undefined,
    liked: s.track.liked === 1,
    sourceScope: s.sourceScope || (s.track.source_type === 'NETEASE_EXPLORE' ? 'explore' : 'library'),
    reason: s.reason,
    sourceHint: s.sourceScope === 'explore' || s.track.source_type === 'NETEASE_EXPLORE'
      ? '主动探索候选：这首可能不在用户原歌单里，需要说明和用户品味、当前场景的连接。'
      : undefined,
  }));
}

/**
 * 根据天气描述提取适合的音乐气质权重。
 */
function getWeatherMoodWeights(weather?: string): { preferredGenres: string[]; bonus: number; label: string } | null {
  if (!weather) return null;

  if (/雨|雷|降水|湿/.test(weather)) {
    return { preferredGenres: ['氛围', '电子', 'R&B', '民谣', '慢歌', 'lofi'], bonus: 16, label: '雨天' };
  }

  if (/晴|太阳|明亮|少云/.test(weather)) {
    return { preferredGenres: ['流行', '明亮', '独立', 'city pop', '摇滚'], bonus: 12, label: '晴天' };
  }

  if (/热|高温|闷/.test(weather)) {
    return { preferredGenres: ['轻快', '清爽', '电子', '流行', 'chill'], bonus: 10, label: '炎热' };
  }

  if (/冷|寒|雪/.test(weather)) {
    return { preferredGenres: ['民谣', '钢琴', '氛围', '抒情', '慢歌'], bonus: 12, label: '寒冷' };
  }

  if (/夜|晚/.test(weather)) {
    return { preferredGenres: ['夜晚', '氛围', '电子', '爵士', 'R&B'], bonus: 10, label: '夜晚' };
  }

  return null;
}
