import db from '../stores/db';
import { callClaude } from './claude';
import { CHAT_SYSTEM_PROMPT, buildChatPrompt } from './prompts';
import { getSession, getSessionTracks, insertSessionTracks } from '../stores/session';
import { getTrackById } from '../stores/track';
import { recallCandidates, formatCandidatesForClaude } from './recall';
import { appendDoNotPlay, appendFavoriteGenres } from '../stores/profile';

/**
 * 处理聊天消息
 */
export async function handleChat(sessionId: number, message: string): Promise<any> {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error('会话不存在');
  }

  const sessionTracks = getSessionTracks(sessionId);

  // 找到当前播放的歌曲（PLAYING 状态，或最后一首 PLAYED）
  const playingIdx = sessionTracks.findIndex(t => t.playStatus === 'PLAYING');
  const currentIndex = playingIdx >= 0 ? playingIdx : sessionTracks.findIndex(t => t.playStatus === 'WAITING');
  const currentSessionTrack = sessionTracks[currentIndex >= 0 ? currentIndex : 0];
  const currentTrack = currentSessionTrack ? getTrackById(currentSessionTrack.trackId) : null;

  // 获取后续队列
  const upcomingTracks = sessionTracks.slice((currentIndex >= 0 ? currentIndex : 0) + 1).map(st => {
    const track = getTrackById(st.trackId);
    return {
      title: track?.title || '未知',
      artist: track?.artist || '未知',
    };
  });

  // 构建上下文
  const sessionContext = `${session.sessionTitle}，场景：${session.scene || '通用'}，心情：${session.mood || '随意'}`;
  const currentTrackStr = currentTrack
    ? `${currentTrack.title} - ${currentTrack.artist}`
    : '无';
  const upcomingTracksStr = upcomingTracks.length > 0
    ? upcomingTracks.map(t => `${t.title} - ${t.artist}`).join('、')
    : '无';

  // 召回候选集（用于重排场景）
  const scored = recallCandidates(session.userId, {
    scene: session.scene || undefined,
    mood: session.mood || undefined,
    limit: 50,
  });
  const candidates = formatCandidatesForClaude(scored);

  // 调用 Claude
  const prompt = buildChatPrompt({
    sessionContext,
    currentTrack: currentTrackStr,
    upcomingTracks: upcomingTracksStr,
    message,
    candidates: JSON.stringify(candidates),
  });

  let result: any;
  try {
    result = await callClaude(CHAT_SYSTEM_PROMPT, prompt);
  } catch (err: any) {
    console.error('[Chat] Claude 调用失败:', err.message);
    return {
      reply: 'DJ 暂时不在服务区，稍后再聊吧。',
      intent: 'CHAT',
      queueChanged: false,
    };
  }

  const intent = result.intent || 'CHAT';
  let queueChanged = false;

  // 处理 REORDER_QUEUE
  if (intent === 'REORDER_QUEUE' && Array.isArray(result.tracks) && result.tracks.length > 0) {
    queueChanged = await handleReorderQueue(sessionId, currentIndex >= 0 ? currentIndex : 0, result.tracks, scored);
  }

  // 处理 SAVE_PREFERENCE
  if (intent === 'SAVE_PREFERENCE' && result.preference) {
    handleSavePreference(session.userId, result.preference);
  }

  return {
    reply: result.reply || '抱歉，我没有理解你的意思。',
    intent,
    queueChanged,
  };
}

/**
 * 处理队列重排：保留已播放的歌曲，用新歌曲替换后续队列
 */
async function handleReorderQueue(
  sessionId: number,
  currentIndex: number,
  newTracks: Array<{ trackId: number; segue?: string; djScript?: string; recommendReason?: string }>,
  scored: any[]
): Promise<boolean> {
  // 构建候选集映射
  const candidateMap = new Map<number, any>();
  for (const s of scored) {
    candidateMap.set(s.track.id, s.track);
  }

  // 校验并过滤新歌曲
  const validTracks = newTracks
    .filter(t => {
      const id = Number(t.trackId);
      return !isNaN(id) && candidateMap.has(id);
    })
    .slice(0, 10);

  if (validTracks.length < 3) {
    return false; // 有效歌曲太少，不执行重排
  }

  // 删除当前索引之后的所有歌曲
  db.prepare(`
    DELETE FROM radio_session_track
    WHERE session_id = ? AND sort_no > ?
  `).run(sessionId, currentIndex);

  // 插入新歌曲
  insertSessionTracks(sessionId, validTracks.map((t, i) => ({
    trackId: Number(t.trackId),
    sortNo: currentIndex + 1 + i,
    djScript: t.djScript || null,
    recommendReason: t.recommendReason || null,
    segue: t.segue || null,
  })));

  return true;
}

/**
 * 处理偏好保存：根据结构化偏好写入对应字段
 */
function handleSavePreference(userId: number, preference: { preferenceType: string; category: string; value: string }) {
  const { preferenceType, category, value } = preference;
  if (!value) return;

  console.log(`[Chat] 保存偏好: ${preferenceType} ${category}=${value}`);

  if (preferenceType === 'negative') {
    // 负向偏好 → 写入 do_not_play
    appendDoNotPlay(userId, value);
  } else if (preferenceType === 'positive') {
    // 正向偏好 → 根据 category 写入对应字段
    if (category === 'genre' || category === 'mood') {
      appendFavoriteGenres(userId, value);
    } else if (category === 'artist') {
      // 艺人偏好追加到 favorite_genres（作为标签）
      appendFavoriteGenres(userId, value);
    }
    // scene 暂不处理，后续可扩展
  }
}
