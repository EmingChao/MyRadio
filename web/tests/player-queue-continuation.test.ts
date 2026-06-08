import assert from 'node:assert/strict'
import {
  mergeAppendedTracks,
  shouldApplyContinuationResult,
  shouldRequestQueueContinuation,
} from '../src/stores/player-queue-continuation'

const tracks = [
  { trackId: 1, title: 'A' },
  { trackId: 2, title: 'B' },
] as any[]

assert.equal(shouldRequestQueueContinuation(6, 2, 'near-end'), false, '还剩 3 首时不需要提前续播')
assert.equal(shouldRequestQueueContinuation(6, 3, 'near-end'), true, '还剩 2 首时应异步续播')
assert.equal(shouldRequestQueueContinuation(6, 5, 'ended'), true, '队列播放到末尾时应尝试续播')
assert.equal(shouldRequestQueueContinuation(0, 0, 'ended'), false, '空队列不能触发续播')

assert.equal(shouldApplyContinuationResult(57, 57, 5), true, '同一会话且有新增歌曲时可以应用续播结果')
assert.equal(shouldApplyContinuationResult(58, 57, 5), false, '用户已切到新会话时不能追加旧续播结果')
assert.equal(shouldApplyContinuationResult(57, 57, 0), false, '没有新增歌曲时不能应用续播结果')

assert.deepEqual(
  mergeAppendedTracks(tracks, [{ trackId: 2, title: 'B duplicate' }, { trackId: 3, title: 'C' }] as any[]).map(track => track.trackId),
  [1, 2, 3],
  'WebSocket 和接口同时返回时，追加队列必须按 trackId 去重',
)

console.log('player queue continuation tests passed')
