import { Router } from 'express';
import { handleChat } from '../agent/chat';
import { getSessionTracks } from '../stores/session';
import { getTrackById } from '../stores/track';
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
    const result = await handleChat(sessionId, message, currentIndex);

    // 如果队列有变化，返回更新后的完整队列
    if (result.queueChanged) {
      const updatedTracks = getSessionTracks(sessionId).map(st => {
        const track = getTrackById(st.trackId);
        return {
          trackId: st.trackId,
          title: track?.title || '未知',
          artist: track?.artist || '未知',
          album: track?.album || null,
          coverUrl: track?.cover_url || null,
          playUrl: track?.play_url || null,
          sourceTrackId: track?.source_track_id || null,
          djScript: st.djScript || '',
          recommendReason: st.recommendReason || '',
          segue: st.segue || '',
          voiceIntro: [st.segue, st.djScript, st.recommendReason].filter(Boolean).join(' ').trim(),
        };
      });
      result.updatedTracks = updatedTracks;

      // 广播队列更新
      wsManager.broadcast(sessionId, {
        type: 'QUEUE_UPDATED',
        data: {
          sessionId,
          tracks: updatedTracks,
          soft: result.queueUpdateMode === 'soft',
          insertedTrackIds: result.insertedTrackIds || [],
        },
      });
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

export default router;
