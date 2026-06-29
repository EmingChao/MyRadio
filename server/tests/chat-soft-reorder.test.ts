import assert from 'node:assert/strict';
import { buildSimilarContinuationTracks, isSimilarContinuationMessage, selectChatRequestedTracks } from '../src/agent/chat';
import { buildSoftReorderPlan, resolveChatTransitionCount } from '../src/agent/queue-plan';

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

assert.equal(
  resolveChatTransitionCount({ totalTracks: 6, currentIndex: 1, requestedCount: 3 }),
  2,
  '短队列应保留两首过渡歌，让用户请求自然接入',
);
assert.equal(
  resolveChatTransitionCount({ totalTracks: 18, currentIndex: 1, requestedCount: 3 }),
  1,
  '长队列应减少过渡窗口，让用户点名的歌曲更快插队出现',
);
assert.equal(
  resolveChatTransitionCount({ totalTracks: 18, currentIndex: 12, requestedCount: 3 }),
  0,
  '当前播放位置后面已经排了很多时，应允许直接插到当前歌后面',
);

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

const claudeOldCandidateTracks = [
  { trackId: 1 },
  { trackId: 2 },
  { trackId: 3 },
];
const enrichedScored = [
  { track: { id: 1, title: '旧候选一', artist: '旧艺人' }, score: 200 },
  { track: { id: 2, title: '旧候选二', artist: '旧艺人' }, score: 190 },
  { track: { id: 3, title: '旧候选三', artist: '旧艺人' }, score: 180 },
  { track: { id: 21, title: '江南', artist: '林俊杰' }, score: 80 },
  { track: { id: 22, title: '修炼爱情', artist: '林俊杰' }, score: 80 },
  { track: { id: 23, title: '她说', artist: '林俊杰' }, score: 80 },
] as any[];
const requestedBySearch = selectChatRequestedTracks('想听林俊杰', claudeOldCandidateTracks, enrichedScored, 3);
assert.deepEqual(
  requestedBySearch.slice(0, 3).map(track => track.trackId),
  [21, 22, 23],
  '聊天搜索补到目标歌手后，应优先按用户原话从补充候选里选歌，而不是继续沿用旧候选的 Claude 结果',
);

console.log('chat soft reorder tests passed');
