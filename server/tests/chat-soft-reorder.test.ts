import assert from 'node:assert/strict';
import { buildSimilarContinuationTracks, isSimilarContinuationMessage } from '../src/agent/chat';
import { buildSoftReorderPlan } from '../src/agent/queue-plan';

const currentQueue = [
  { trackId: 1, sortNo: 0 },
  { trackId: 2, sortNo: 1 },
  { trackId: 3, sortNo: 2 },
  { trackId: 4, sortNo: 3 },
  { trackId: 5, sortNo: 4 },
];

const requestedTracks = [
  { trackId: 9 },
  { trackId: 10 },
  { trackId: 11 },
];

const plan = buildSoftReorderPlan({
  currentQueue,
  currentIndex: 1,
  requestedTracks,
  transitionCount: 2,
});

assert.equal(plan.replaceAfterSortNo, 3, '软更新应保留当前歌曲和后面两首过渡歌曲');
assert.deepEqual(
  plan.preservedTrackIds,
  [1, 2, 3, 4],
  '当前播放位置之前、当前歌和过渡歌都应继续保留',
);
assert.deepEqual(
  plan.insertTracks.map(track => ({ trackId: track.trackId, sortNo: track.sortNo })),
  [
    { trackId: 9, sortNo: 4 },
    { trackId: 10, sortNo: 5 },
    { trackId: 11, sortNo: 6 },
  ],
  '新偏好歌曲应从过渡窗口后自然接入',
);

const nearEndPlan = buildSoftReorderPlan({
  currentQueue,
  currentIndex: 4,
  requestedTracks,
  transitionCount: 2,
});

assert.equal(nearEndPlan.replaceAfterSortNo, 4, '队列末尾也不能删除当前正在播放的歌');
assert.equal(nearEndPlan.insertTracks[0].sortNo, 5, '队尾软更新应直接追加新偏好歌曲');

assert.equal(isSimilarContinuationMessage('顺着这首继续'), true, '中文快捷指令应触发相似歌曲续播');
assert.equal(isSimilarContinuationMessage('来点类似这首的'), true, '自然语言“类似这首”应触发相似歌曲续播');
assert.equal(isSimilarContinuationMessage('more like this'), true, '英文 more like this 应触发相似歌曲续播');
assert.equal(isSimilarContinuationMessage('来点轻柔的'), false, '普通风格请求仍应走一般聊天软重排');

const similarScored = [
  { track: { id: 2, title: '已保留', artist: 'A' }, reason: '相似歌曲', sourceScope: 'similar' },
  { track: { id: 9, title: '相似一', artist: 'A' }, reason: '相似歌曲', sourceScope: 'similar' },
  { track: { id: 10, title: '相似二', artist: 'B' }, reason: '相似歌曲', sourceScope: 'similar' },
  { track: { id: 11, title: '相似三', artist: 'C' }, reason: '相似歌曲', sourceScope: 'similar' },
] as any[];
const localScored = [
  { track: { id: 12, title: '本地补位', artist: 'D' }, reason: '本地补位' },
] as any[];
const similarTracks = buildSimilarContinuationTracks({
  currentTrack: { title: '当前歌', artist: 'Seed' },
  similarScored,
  fallbackScored: localScored,
  existingTrackIds: new Set([1, 2, 3]),
});

assert.deepEqual(
  similarTracks.map(track => track.trackId),
  [9, 10, 11, 12],
  '顺着这首继续应优先使用相似候选，过滤当前队列已有歌曲，再用本地候选补足',
);
assert.match(similarTracks[0].recommendReason || '', /顺着|相似|当前歌/, '相似续播推荐理由需要说明它是从当前歌自然延展');

console.log('chat soft reorder tests passed');
