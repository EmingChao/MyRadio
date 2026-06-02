import assert from 'node:assert/strict';
import { mergeRadioCandidates, pickFallbackTracks } from '../src/agent/radio';

function item(id: number, sourceScope: 'library' | 'explore' = 'library') {
  return {
    track: {
      id,
      source_type: sourceScope === 'explore' ? 'NETEASE_EXPLORE' : 'NETEASE_PLAYLIST',
    },
    score: 100 - id,
    reason: sourceScope === 'explore' ? '主动探索' : '喜欢',
    sourceScope,
  };
}

const library = Array.from({ length: 30 }, (_, i) => item(i + 1, 'library'));
const explore = Array.from({ length: 6 }, (_, i) => item(101 + i, 'explore'));

const merged = mergeRadioCandidates(library, explore);
assert.deepEqual(
  merged.slice(8, 12).map(candidate => candidate.track.id),
  [101, 102, 103, 104],
  '探索候选需要进入候选集前段，避免被 24 首本地喜欢歌曲压住',
);

const fallback = pickFallbackTracks([...library, ...explore], 10);
assert.ok(
  fallback.some(candidate => candidate.sourceScope === 'explore'),
  'fallback 队列也需要保留探索歌曲，否则模型不可用时会退回喜欢列表',
);
assert.equal(fallback.length, 10, 'fallback 队列应保持目标长度');

console.log('radio candidate tests passed');
