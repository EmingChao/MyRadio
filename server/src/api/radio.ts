import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import db from '../stores/db';
import { continueRadioSession, createRadioSession } from '../agent/radio';
import { getSession, getRecentSession, getSessionTracksWithDetail, updateTrackPlayStatus } from '../stores/session';
import { incrementPlayCount, incrementSkipCount } from '../stores/track';
import { autoUpdateProfile } from '../stores/profile';
import { buildTtsBatchPlan, synthesizeSpeech, getTextHash, getTtsFilePath, getTtsConfigKey } from '../services/tts';
import { resolveTtsStyle } from '../services/tts-style';
import { getTtsConfig } from '../stores/tts-config';
import { wsManager } from '../ws/manager';
import { getCurrentSceneAndMood } from '../services/daily-plan';
import { getOrCreateSessionContinuationTask } from '../services/session-continuation-task';
import { song_url } from 'NeteaseCloudMusicApi';

const router = Router();
const USER_ID = 443961717;
const continuationTasks = new Map<number, Promise<Awaited<ReturnType<typeof continueRadioSession>>>>();

/**
 * POST /api/radio/session/create — 创建电台会话
 * Body: { scene?: string, mood?: string, extraPrompt?: string, refreshMode?: string, avoidTrackIds?: number[] }
 */
router.post('/session/create', async (req, res) => {
  try {
    const { scene, mood, extraPrompt, refreshMode, avoidTrackIds } = req.body;
    const result = await createRadioSession({ scene, mood, extraPrompt, refreshMode, avoidTrackIds });

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
 * POST /api/radio/session/:id/continue — 为当前会话追加续播队列
 * Body: { limit?: number }
 */
router.post('/session/:id/continue', async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const limit = Math.max(5, Math.min(10, Number(req.body?.limit || 8)));
    const continuationTask = getOrCreateSessionContinuationTask(
      continuationTasks,
      sessionId,
      () => continueRadioSession(sessionId, limit),
    );
    const appendedTracks = await continuationTask.promise;

    res.json({ code: 0, data: { appendedTracks, shared: !continuationTask.owner } });

    if (continuationTask.owner) {
      generateTtsForSession(sessionId, '', appendedTracks).catch(err => {
        console.error('[TTS] 续播后台生成失败:', err.message);
      });

      wsManager.broadcast(sessionId, {
        type: 'QUEUE_UPDATED',
        data: { sessionId, tracks: appendedTracks, append: true },
      });
    }
  } catch (err: any) {
    console.error('续播队列失败:', err);
    res.status(500).json({ code: 500, message: err.message || '续播队列失败' });
  }
});

interface SessionTtsItem {
  text: string;
  hash: string;
  audioUrl: string;
  style: ReturnType<typeof resolveTtsStyle>;
  configKey: string;
}

/**
 * 收集会话中需要合成的 DJ 文案，并按播放顺序附加风格上下文。
 */
function collectSessionTtsItems(
  sessionId: number,
  say: string,
  tracks: Array<{ trackId: number; title?: string; artist?: string; segue: string; voiceIntro?: string; sourceScope?: string; source_type?: string }>
): Array<{ text: string; style: ReturnType<typeof resolveTtsStyle> }> {
  const session = getSession(sessionId) as any;
  const scene = session?.scene || session?.sceneLabel || session?.radioScene;
  const mood = session?.mood || session?.radioMood;
  const textsToSynthesize: Array<{
    text: string;
    style: ReturnType<typeof resolveTtsStyle>;
  }> = [];

  // 收集需要合成的文本
  if (say) {
    textsToSynthesize.push({
      text: say,
      style: resolveTtsStyle({ scene, mood, isOpening: true }),
    });
  }
  for (const track of tracks) {
    const spokenText = track.voiceIntro || track.segue;
    if (spokenText) {
      textsToSynthesize.push({
        text: spokenText,
        style: resolveTtsStyle({
          scene,
          mood,
          title: track.title,
          artist: track.artist,
          sourceScope: track.sourceScope || (track.source_type === 'NETEASE_EXPLORE' ? 'explore' : 'library'),
          kind: track.sourceScope === 'explore' || track.source_type === 'NETEASE_EXPLORE' ? 'explorePick' : 'trackIntro',
        }),
      });
    }
  }

  return textsToSynthesize;
}

/**
 * 推送单段 TTS 就绪事件。
 * 后端每合成完一段就推送，避免前几首已经生成却被整批任务拖住。
 */
function broadcastTtsReady(sessionId: number, item: SessionTtsItem) {
  wsManager.broadcast(sessionId, {
    type: 'TTS_READY',
    data: { sessionId, ttsItems: [item] },
  });
}

/**
 * 异步生成会话的 TTS 音频
 * 只对 say（开场白）和 voiceIntro（歌曲前完整独白）做 TTS。
 */
async function generateTtsForSession(
  sessionId: number,
  say: string,
  tracks: Array<{ trackId: number; title?: string; artist?: string; segue: string; voiceIntro?: string; sourceScope?: string; source_type?: string }>
) {
  const ttsConfig = getTtsConfig(USER_ID);
  const textsToSynthesize = collectSessionTtsItems(sessionId, say, tracks);

  console.log(`[TTS] 开始生成 ${textsToSynthesize.length} 段语音...`);

  // 前几段先生成保证马上能播，后续段落慢速后台续跑，避免一次新会话打爆 TTS 限流。
  const ttsPlan = buildTtsBatchPlan(textsToSynthesize, {
    foregroundCount: 3,
    backgroundDelayMs: 4500,
  });

  // 逐个合成，配合批次间隔控制外部 TTS 服务压力。
  let successCount = 0;
  for (const planItem of ttsPlan) {
    const item = planItem.item;
    try {
      if (planItem.delayBeforeMs > 0) {
        console.log(`[TTS] 后台慢速生成等待 ${planItem.delayBeforeMs}ms: ${planItem.index + 1}/${textsToSynthesize.length}`);
        await sleep(planItem.delayBeforeMs);
      }
      const filePath = await synthesizeSpeech(item.text, item.style, ttsConfig);
      if (filePath) {
        const hash = getTextHash(item.text, item.style, ttsConfig);
        const readyItem = {
          text: item.text,
          hash,
          audioUrl: `/api/tts/audio/${hash}`,
          style: item.style,
          configKey: getTtsConfigKey(ttsConfig),
        };
        successCount++;
        broadcastTtsReady(sessionId, readyItem);
        console.log(`[TTS] 已推送第 ${successCount}/${textsToSynthesize.length} 段语音到会话 #${sessionId}`);
      }
    } catch (err: any) {
      // 单个失败不影响其他
      console.warn('[TTS] 单段语音生成失败:', err?.message || err);
    }
  }
}

/**
 * Promise 形式的等待工具，用于 TTS 后台批次节流。
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
 * GET /api/radio/session/:id/tts — 查询当前配置下已可用的会话 TTS。
 * 用于页面刷新、WebSocket 错过事件和切歌前补拉。
 */
router.get('/session/:id/tts', (req, res) => {
  try {
    // TTS 文件会在后台逐段生成，接口结果不能被浏览器缓存成旧的空列表。
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const sessionId = Number(req.params.id);
    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({ code: 404, message: '会话不存在' });
    }

    const say = typeof req.query.say === 'string' ? req.query.say : '';
    const tracks = getSessionTracksWithDetail(sessionId) as any[];
    const ttsConfig = getTtsConfig(USER_ID);
    const readyItems: SessionTtsItem[] = [];

    for (const item of collectSessionTtsItems(sessionId, say, tracks)) {
      const hash = getTextHash(item.text, item.style, ttsConfig);
      const filePath = getTtsFilePath(hash);
      if (!filePath) continue;
      readyItems.push({
        text: item.text,
        hash,
        audioUrl: `/api/tts/audio/${hash}`,
        style: item.style,
        configKey: getTtsConfigKey(ttsConfig),
      });
    }

    res.json({ code: 0, data: { sessionId, ttsItems: readyItems } });
  } catch (err: any) {
    res.status(500).json({ code: 500, message: err.message || '查询 TTS 失败' });
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
