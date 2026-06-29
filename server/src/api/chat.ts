import { Router } from 'express';
import { acknowledgeChatRequest, handleChat } from '../agent/chat';
import { getSessionTracksWithDetail } from '../stores/session';
import { wsManager } from '../ws/manager';

const router = Router();

/**
 * POST /api/radio/session/chat — 电台聊天
 * Body: { sessionId: number, message: string }
 */
router.post('/session/chat', async (req, res) => {
  try {
    const { sessionId, message, currentIndex } = req.body;
    if (!sessionId || !message) {
      return res.status(400).json({ code: 400, message: '缺少 sessionId 或 message' });
    }
    const result = acknowledgeChatRequest(sessionId, message);

    if (result.asyncQueueUpdate) {
      runAsyncQueueUpdate(Number(sessionId), String(message), currentIndex);
    }

    // 广播 DJ 聊天消息
    wsManager.broadcast(sessionId, {
      type: 'DJ_CHAT',
      data: { sessionId, reply: result.reply, intent: result.intent },
    });

    res.json({ code: 0, data: result });
  } catch (err: any) {
    console.error('聊天处理失败:', err);
    res.status(500).json({ code: 500, message: err.message || '聊天处理失败' });
  }
});

/**
 * 后台执行聊天排歌，完成后通过 WebSocket 推送完整队列。
 */
function runAsyncQueueUpdate(sessionId: number, message: string, currentIndex: unknown): void {
  setTimeout(() => {
    handleChat(sessionId, message, Number(currentIndex))
      .then(result => {
        if (!result.queueChanged) {
          wsManager.broadcast(sessionId, {
            type: 'DJ_CHAT',
            data: { sessionId, reply: result.reply || '我找了一圈，暂时没有足够合适的歌可以插进来。', intent: result.intent },
          });
          return;
        }

        const updatedTracks = getUpdatedTracks(sessionId);
        wsManager.broadcast(sessionId, {
          type: 'QUEUE_UPDATED',
          data: {
            sessionId,
            tracks: updatedTracks,
            soft: result.queueUpdateMode === 'soft',
            insertedTrackIds: result.insertedTrackIds || [],
          },
        });
      })
      .catch((err: any) => {
        console.error('聊天异步排歌失败:', err);
        wsManager.broadcast(sessionId, {
          type: 'DJ_CHAT',
          data: { sessionId, reply: '我刚刚尝试调整队列失败了，稍后再试一次。', intent: 'REORDER_QUEUE' },
        });
      });
  }, 0);
}

/**
 * 获取前端需要的完整队列数据。
 */
function getUpdatedTracks(sessionId: number): any[] {
  return (getSessionTracksWithDetail(sessionId) as any[]).map(track => ({
    trackId: track.trackId,
    title: track.title || '未知',
    artist: track.artist || '未知',
    album: track.album || null,
    coverUrl: track.coverUrl || null,
    playUrl: track.playUrl || null,
    sourceTrackId: track.sourceTrackId || null,
    djScript: track.djScript || '',
    recommendReason: track.recommendReason || '',
    segue: track.segue || '',
    voiceIntro: track.voiceIntro || [track.segue, track.djScript, track.recommendReason].filter(Boolean).join(' ').trim(),
  }));
}

export default router;
