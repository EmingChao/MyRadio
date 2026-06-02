import assert from 'node:assert/strict';
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

console.log('chat soft reorder tests passed');
