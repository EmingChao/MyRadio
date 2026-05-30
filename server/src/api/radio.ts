import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import db from '../stores/db';
import { createRadioSession } from '../agent/radio';
import { getSession, getRecentSession, getSessionTracksWithDetail, updateTrackPlayStatus } from '../stores/session';
import { incrementPlayCount, incrementSkipCount } from '../stores/track';
import { autoUpdateProfile } from '../stores/profile';
import { synthesizeSpeech, getTextHash } from '../services/tts';
import { wsManager } from '../ws/manager';
import { getCurrentSceneAndMood } from '../services/daily-plan';
import { song_url } from 'NeteaseCloudMusicApi';

const router = Router();

/**
 * POST /api/radio/session/create — 创建电台会话
 * Body: { scene?: string, mood?: string, extraPrompt?: string }
 */
router.post('/session/create', async (req, res) => {
  try {
    const { scene, mood, extraPrompt } = req.body;
    const result = await createRadioSession({ scene, mood, extraPrompt });

    // 先返回响应，不阻塞 TTS 生成
    res.json({ code: 0, data: result });

    // 异步生成 TTS 音频
    generateTtsForSession(result.sessionId, result.say, result.tracks).catch(err => {
      console.error('[TTS] 后台生成失败:', err.message);
    });
  } catch (err: any) {
    console.error('创建电台失败:', err);
    res.status(500).json({ code: 500, message: err.message || '创建电台失败' });
  }
});

/**
 * POST /api/radio/session/create-from-plan — 从当前计划时段创建会话
 */
router.post('/session/create-from-plan', async (req, res) => {
  try {
    const { scene, mood } = getCurrentSceneAndMood();
    console.log(`[Radio] 从计划启动: scene=${scene}, mood=${mood}`);
    const result = await createRadioSession({ scene, mood });

    res.json({ code: 0, data: result });

    generateTtsForSession(result.sessionId, result.say, result.tracks).catch(err => {
      console.error('[TTS] 后台生成失败:', err.message);
    });
  } catch (err: any) {
    console.error('从计划创建电台失败:', err);
    res.status(500).json({ code: 500, message: err.message || '创建电台失败' });
  }
});

/**
 * 异步生成会话的 TTS 音频
 * 只对 say（开场白）和 voiceIntro（歌曲前完整独白）做 TTS
 */
async function generateTtsForSession(
  sessionId: number,
  say: string,
  tracks: Array<{ trackId: number; segue: string; voiceIntro?: string }>
) {
  const textsToSynthesize: string[] = [];

  // 收集需要合成的文本
  if (say) textsToSynthesize.push(say);
  for (const track of tracks) {
    const spokenText = track.voiceIntro || track.segue;
    if (spokenText) textsToSynthesize.push(spokenText);
  }

  console.log(`[TTS] 开始生成 ${textsToSynthesize.length} 段语音...`);

  // 逐个合成（避免并发过多）
  const results: Array<{ text: string; hash: string; audioUrl: string }> = [];
  for (const text of textsToSynthesize) {
    try {
      const filePath = await synthesizeSpeech(text);
      if (filePath) {
        results.push({
          text,
          hash: getTextHash(text),
          audioUrl: `/api/tts/audio/${getTextHash(text)}`,
        });
      }
    } catch {
      // 单个失败不影响其他
    }
  }

  // 通过 WebSocket 推送 TTS 就绪事件
  if (results.length > 0) {
    wsManager.broadcast(sessionId, {
      type: 'TTS_READY',
      data: { sessionId, ttsItems: results },
    });
    console.log(`[TTS] 已推送 ${results.length} 段语音到会话 #${sessionId}`);
  }
}

/**
 * GET /api/radio/now — 获取用户最近的会话（用于页面刷新恢复）
 */
router.get('/now', (_req, res) => {
  try {
    const userId = 443961717;
    const session = getRecentSession(userId);
    if (!session) {
      return res.json({ code: 0, data: null });
    }
    const tracks = getSessionTracksWithDetail(session.id);
    // SQLite 返回 snake_case 字段名
    const s = session as any;
    res.json({
      code: 0,
      data: {
        sessionId: s.id,
        sessionTitle: s.session_title || s.sessionTitle || '',
        aiSummary: s.ai_summary || s.aiSummary || '',
        say: '',
        tracks,
      },
    });
  } catch (err: any) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

/**
 * GET /api/radio/session/:id/tracks — 刷新会话歌曲（获取最新播放地址）
 */
router.get('/session/:id/tracks', async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({ code: 404, message: '会话不存在' });
    }

    // 先从数据库获取当前数据
    let tracks = getSessionTracksWithDetail(sessionId) as any[];

    // 刷新播放地址（CDN 链接有时效性）
    const COOKIE_FILE = path.resolve(__dirname, '../../data/netease-cookie.txt');
    if (fs.existsSync(COOKIE_FILE)) {
      const cookie = fs.readFileSync(COOKIE_FILE, 'utf-8').trim();
      const sourceIds = tracks.map(t => Number(t.sourceTrackId)).filter(id => !isNaN(id));

      if (sourceIds.length > 0) {
        try {
          const result = await song_url({ id: sourceIds.join(','), br: 999000, cookie });
          const urlData = (result.body?.data || []) as any[];
          const urlMap = new Map<number, string>();
          for (const item of urlData) {
            if (item.url) urlMap.set(item.id, item.url);
          }

          // 更新数据库和返回数据
          const updateStmt = db.prepare('UPDATE radio_track SET play_url = ? WHERE source_track_id = ?');
          for (const t of tracks) {
            const url = urlMap.get(Number(t.sourceTrackId));
            if (url) {
              t.playUrl = url;
              updateStmt.run(url, String(t.sourceTrackId));
            }
          }
        } catch (err: any) {
          console.error('[Radio] 刷新播放地址失败:', err.message);
        }
      }
    }

    res.json({ code: 0, data: tracks });
  } catch (err: any) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

/**
 * POST /api/radio/playback/report — 播放行为上报
 * Body: { sessionId: number, trackId: number, action: 'PLAY'|'SKIP'|'COMPLETE', playSeconds?: number }
 */
router.post('/playback/report', async (req, res) => {
  try {
    const { sessionId, trackId, action, playSeconds } = req.body;

    if (!sessionId || !trackId || !action) {
      res.status(400).json({ code: 400, message: '缺少必要参数' });
      return;
    }

    // 更新会话队列中的播放状态
    if (action === 'PLAY' || action === 'COMPLETE') {
      updateTrackPlayStatus(sessionId, trackId, 'PLAYED');
      incrementPlayCount(trackId);
    } else if (action === 'SKIP') {
      updateTrackPlayStatus(sessionId, trackId, 'SKIPPED');
      incrementSkipCount(trackId);
    }

    // 自动更新用户画像
    const session = getSession(sessionId);
    if (session && (action === 'COMPLETE' || action === 'SKIP')) {
      autoUpdateProfile(session.userId, trackId, action);
    }

    // 广播播放状态变更
    wsManager.broadcast(sessionId, {
      type: 'PLAYBACK_REPORT',
      data: { sessionId, trackId, action },
    });

    res.json({ code: 0, data: { sessionId, trackId, action, playSeconds } });
  } catch (err: any) {
    console.error('播放上报失败:', err);
    res.status(500).json({ code: 500, message: err.message || '播放上报失败' });
  }
});

export default router;
