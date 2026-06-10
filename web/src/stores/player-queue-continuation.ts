export type QueueContinuationReason = 'near-end' | 'ended'

/**
 * 判断当前播放位置是否应该触发异步续播。
 */
export function shouldRequestQueueContinuation(
  trackCount: number,
  currentIndex: number,
  reason: QueueContinuationReason,
  threshold = 2,
): boolean {
  if (trackCount <= 0) return false
  if (reason === 'ended') return true

  const remaining = trackCount - currentIndex - 1
  return remaining <= threshold
}

/**
 * 判断续播返回结果是否仍然属于当前会话。
 */
export function shouldApplyContinuationResult(
  activeSessionId: number | null | undefined,
  requestSessionId: number,
  appendedCount: number,
): boolean {
  return Number(activeSessionId) === Number(requestSessionId) && appendedCount > 0
}

/**
 * 合并续播队列，按 trackId 去重，避免接口响应和 WebSocket 推送重复追加。
 */
export function mergeAppendedTracks<T extends { trackId: number }>(existingTracks: T[], appendedTracks: T[]): T[] {
  const existing = new Set(existingTracks.map(track => track.trackId))
  const uniqueTracks = appendedTracks.filter(track => !existing.has(track.trackId))
  return [...existingTracks, ...uniqueTracks]
}

/**
 * 判断恢复接口返回空时，是否需要清理浏览器里仍保留的旧 session。
 */
export function shouldClearLocalSessionAfterRestore(
  activeSessionId: number | null | undefined,
  restoredSession: { sessionId?: number } | null | undefined,
): boolean {
  return Boolean(activeSessionId) && !restoredSession
}
