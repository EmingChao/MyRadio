import assert from 'node:assert/strict';
import { mergeRadioCandidates, pickFallbackTracks, selectPromptCandidates } from '../src/agent/radio';

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

const restartedFallback = pickFallbackTracks([...library, ...explore], 10, {
  avoidTrackIds: fallback.map(candidate => candidate.track.id),
});
const repeatedAfterRestart = restartedFallback.filter(candidate =>
  fallback.some(previous => previous.track.id === candidate.track.id)
);
assert.equal(repeatedAfterRestart.length, 0, '重新开始电台时 fallback 应优先避开上一组歌曲');
assert.equal(restartedFallback.length, 10, '避开上一组歌曲后仍应保持目标长度');

const promptCandidates = selectPromptCandidates(
  [
    ...Array.from({ length: 60 }, (_, i) => item(i + 1, 'library')),
    { ...item(201, 'explore'), sourceScope: 'daily' },
    { ...item(202, 'explore'), sourceScope: 'similar' },
    { ...item(203, 'explore'), sourceScope: 'fm' },
    { ...item(204, 'explore'), sourceScope: 'vector' },
    item(205, 'explore'),
  ],
  24,
);

assert.equal(promptCandidates.length, 24, '给模型的候选需要被限制，避免 prompt 过大导致 AI 超时');
assert.ok(promptCandidates.some(candidate => candidate.sourceScope === 'daily'), 'prompt 精选不能丢失每日推荐候选');
assert.ok(promptCandidates.some(candidate => candidate.sourceScope === 'similar'), 'prompt 精选不能丢失相似歌曲候选');
assert.ok(promptCandidates.some(candidate => candidate.sourceScope === 'fm'), 'prompt 精选不能丢失私人 FM 候选');
assert.ok(promptCandidates.some(candidate => candidate.sourceScope === 'vector'), 'prompt 精选不能丢失向量续播候选');
assert.ok(promptCandidates.some(candidate => candidate.sourceScope === 'explore'), 'prompt 精选不能丢失探索候选');

console.log('radio candidate tests passed');
