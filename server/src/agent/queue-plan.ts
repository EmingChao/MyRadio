interface QueueTrackRef {
  trackId: number;
  sortNo: number;
}

interface RequestedTrackRef {
  trackId: number;
  segue?: string;
  djScript?: string;
  recommendReason?: string;
}

interface SoftReorderPlanParams {
  currentQueue: QueueTrackRef[];
  currentIndex: number;
  requestedTracks: RequestedTrackRef[];
  transitionCount?: number;
}

interface SoftReorderInsertTrack extends RequestedTrackRef {
  sortNo: number;
}

interface SoftReorderPlan {
  replaceAfterSortNo: number;
  preservedTrackIds: number[];
  insertTracks: SoftReorderInsertTrack[];
}

interface ChatTransitionCountParams {
  totalTracks: number;
  currentIndex: number;
  requestedCount: number;
}

/**
 * 解析聊天插队的过渡窗口。
 * 队列较短时保留自然过渡；队列已经很长或用户当前位置后面堆了很多歌时，让点名内容更快出现。
 */
export function resolveChatTransitionCount(params: ChatTransitionCountParams): number {
  const safeTotal = Math.max(0, params.totalTracks);
  const safeIndex = Math.max(0, Math.min(params.currentIndex, Math.max(0, safeTotal - 1)));
  const remainingAfterCurrent = Math.max(0, safeTotal - safeIndex - 1);
  const requestedCount = Math.max(0, params.requestedCount);

  if (requestedCount === 0 || remainingAfterCurrent <= 0) return 0;
  if (safeIndex >= 8) return 0;
  if (safeTotal >= 12 || remainingAfterCurrent >= 5) return 1;
  return 2;
}

/**
 * 生成聊天输入触发的软重排计划：保留当前播放和 1-2 首过渡歌，再接入新偏好队列。
 */
export function buildSoftReorderPlan(params: SoftReorderPlanParams): SoftReorderPlan {
  const transitionCount = Math.max(0, params.transitionCount ?? 2);
  const safeCurrentIndex = Math.max(0, Math.min(params.currentIndex, params.currentQueue.length - 1));
  const replaceAfterIndex = Math.min(params.currentQueue.length - 1, safeCurrentIndex + transitionCount);
  const replaceAfterSortNo = params.currentQueue[replaceAfterIndex]?.sortNo ?? safeCurrentIndex;
  const preservedTrackIds = params.currentQueue
    .slice(0, replaceAfterIndex + 1)
    .map(track => track.trackId);
  const preservedIdSet = new Set(preservedTrackIds);

  // 新队列不能重复当前已保留的歌曲，否则过渡结束后会听到重复内容。
  const insertTracks = params.requestedTracks
    .filter(track => !preservedIdSet.has(Number(track.trackId)))
    .map((track, index) => ({
      ...track,
      trackId: Number(track.trackId),
      sortNo: replaceAfterSortNo + 1 + index,
    }));

  return {
    replaceAfterSortNo,
    preservedTrackIds,
    insertTracks,
  };
}
