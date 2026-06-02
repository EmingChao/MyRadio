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

console.log('recall weather candidate tests passed');
