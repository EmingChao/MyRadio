import assert from 'node:assert/strict';
import { formatCandidatesForClaude } from '../src/agent/recall';

const formatted = formatCandidatesForClaude([
  {
    track: {
      id: 1,
      title: 'Rain Tune',
      artist: 'Cloud Artist',
      album: 'Weather Album',
      release_year: 2024,
      genre_tags: '氛围,电子',
      mood_tags: '雨天,专注',
      liked: 0,
      source_type: 'NETEASE_EXPLORE',
    },
    score: 26,
    reason: '主动探索：雨天氛围匹配',
    sourceScope: 'explore',
  } as any,
]);

assert.equal(formatted[0].sourceScope, 'explore', '候选摘要需要保留探索来源');
assert.equal(formatted[0].releaseYear, 2024, '候选摘要需要带上发行年份供 DJ 介绍使用');
assert.match(formatted[0].reason || '', /雨天|探索/, '候选摘要需要把推荐原因交给模型');
assert.match(formatted[0].sourceHint || '', /主动探索/, '探索歌曲需要给模型明确提示');

const sourceFormatted = formatCandidatesForClaude([
  {
    track: {
      id: 2,
      title: 'Daily Tune',
      artist: 'Morning Artist',
      album: 'Daily Album',
      release_year: 2025,
      genre_tags: '流行',
      mood_tags: '清晨',
      liked: 0,
      source_type: 'NETEASE_DAILY_RECOMMEND',
    },
    score: 40,
    reason: '每日推荐：来自网易云当天推荐',
    sourceScope: 'daily',
  } as any,
  {
    track: {
      id: 3,
      title: 'Similar Tune',
      artist: 'Nearby Artist',
      album: 'Similar Album',
      release_year: 2022,
      genre_tags: '电子',
      mood_tags: '夜晚',
      liked: 0,
      source_type: 'NETEASE_SIMI_SONG',
    },
    score: 38,
    reason: '相似歌曲：围绕 123 延展出的候选',
    sourceScope: 'similar',
  } as any,
  {
    track: {
      id: 4,
      title: 'FM Tune',
      artist: 'Discovery Artist',
      album: 'FM Album',
      release_year: 2026,
      genre_tags: '独立',
      mood_tags: '发现',
      liked: 0,
      source_type: 'NETEASE_PERSONAL_FM',
    },
    score: 36,
    reason: '私人 FM：顺着最近听感发现的新候选',
    sourceScope: 'fm',
  } as any,
]);

assert.match(sourceFormatted[0].sourceHint || '', /今日|每天|当天/, '每日推荐候选需要给模型自然来源提示');
assert.match(sourceFormatted[1].sourceHint || '', /相似|延展|接近/, '相似歌曲候选需要给模型自然来源提示');
assert.match(sourceFormatted[2].sourceHint || '', /发现|最近听感|自然冒出来/, '私人 FM 候选需要给模型自然来源提示');

console.log('recall weather candidate tests passed');
