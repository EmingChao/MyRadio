import fs from 'fs';
import path from 'path';
import db from '../stores/db';
import { callClaude } from './claude';
import { CHAT_SYSTEM_PROMPT, buildChatPrompt } from './prompts';
import { getSession, getSessionTracks, insertSessionTracks } from '../stores/session';
import { getTrackById } from '../stores/track';
import { recallCandidates, formatCandidatesForClaude } from './recall';
import { appendDoNotPlay, appendFavoriteGenres } from '../stores/profile';
import { buildSoftReorderPlan } from './queue-plan';
import { recallSimilarSongCandidates } from './netease-sources';
import { appendRuntimeLog } from '../services/runtime-logs';
import { song_url } from 'NeteaseCloudMusicApi';

interface SimilarContinuationTrackLike {
  title?: string;
  artist?: string;
}

interface SimilarContinuationParams {
  currentTrack: SimilarContinuationTrackLike | null | undefined;
  similarScored: any[];
  fallbackScored: any[];
  existingTrackIds: Set<number>;
  limit?: number;
}

/**
 * 处理聊天消息
 */
export async function handleChat(sessionId: number, message: string, currentIndexOverride?: number): Promise<any> {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error('会话不存在');
  }

  const sessionTracks = getSessionTracks(sessionId);

  // 找到当前播放的歌曲（PLAYING 状态，或最后一首 PLAYED）
  const playingIdx = sessionTracks.findIndex(t => t.playStatus === 'PLAYING');
  const waitingIdx = sessionTracks.findIndex(t => t.playStatus === 'WAITING');
  const currentIndex = resolveCurrentIndex(sessionTracks.length, currentIndexOverride, playingIdx, waitingIdx);
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
    limit: 150,
  });

  if (isSimilarContinuationMessage(message) && currentTrack) {
    return handleSimilarContinuation({
      sessionId,
      userId: session.userId,
      currentIndex: currentIndex >= 0 ? currentIndex : 0,
      currentTrack,
      sessionTracks,
      scored,
    });
  }

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
    result = buildLocalChatFallback(message, currentTrackStr);
  }

  const intent = result.intent || 'CHAT';
  let queueChanged = false;
  let queueUpdateMode: 'none' | 'soft' = 'none';
  let insertedTrackIds: number[] = [];

  // 处理音乐方向输入：不硬切当前歌，保留 1-2 首过渡后静默接入新队列。
  if (intent === 'REORDER_QUEUE' || isListeningDirectionMessage(message)) {
    const requestedTracks = Array.isArray(result.tracks) && result.tracks.length > 0
      ? result.tracks
      : buildLocalSoftReorderTracks(message, scored);
    const reorderResult = await handleReorderQueue(sessionId, currentIndex >= 0 ? currentIndex : 0, requestedTracks, scored);
    queueChanged = reorderResult.queueChanged;
    queueUpdateMode = reorderResult.queueChanged ? 'soft' : 'none';
    insertedTrackIds = reorderResult.insertedTrackIds;
  }

  // 处理 SAVE_PREFERENCE
  if (intent === 'SAVE_PREFERENCE' && result.preference) {
    handleSavePreference(session.userId, result.preference);
  }

  return {
    reply: result.reply || '抱歉，我没有理解你的意思。',
    intent,
    queueChanged,
    queueUpdateMode,
    insertedTrackIds,
  };
}

/**
 * 判断用户是否想“顺着当前歌曲继续”。
 * 这类请求应直接使用 simi_song，不必等待 Claude 先判断意图。
 */
export function isSimilarContinuationMessage(message: string): boolean {
  return /顺着这首|顺着当前|类似这首|像这首|按这个感觉|这个感觉继续|就这个感觉|more like this|similar to this|like this/i.test(message.trim());
}

/**
 * 构造“顺着这首继续”的软插入歌曲列表。
 * 相似歌曲优先，本地候选补位，并过滤当前队列中已经出现过的歌曲。
 */
export function buildSimilarContinuationTracks(params: SimilarContinuationParams): Array<{
  trackId: number;
  segue: string;
  djScript: string;
  recommendReason: string;
}> {
  const limit = Math.max(3, params.limit ?? 8);
  const currentTitle = params.currentTrack?.title || '这首歌';
  const currentArtist = params.currentTrack?.artist || '当前艺人';
  const selected: Array<{ track: any; source: 'similar' | 'local'; reason?: string }> = [];
  const seen = new Set<number>(params.existingTrackIds);

  /**
   * 追加候选时做统一去重，避免过渡窗口后又听到当前队列里的旧歌。
   */
  function pushCandidate(item: any, source: 'similar' | 'local'): void {
    const trackId = Number(item?.track?.id);
    if (!Number.isFinite(trackId) || seen.has(trackId) || selected.length >= limit) return;
    seen.add(trackId);
    selected.push({ track: item.track, source, reason: item.reason });
  }

  params.similarScored.forEach(item => pushCandidate(item, 'similar'));
  params.fallbackScored.forEach(item => pushCandidate(item, 'local'));

  return selected.map((item, index) => {
    const track = item.track;
    const isFirst = index === 0;
    const sourceText = item.source === 'similar'
      ? `它是从《${currentTitle}》的相近听感里延展出来的`
      : `它来自你自己的曲库，但和《${currentTitle}》现在留下的质地能接上`;

    return {
      trackId: Number(track.id),
      segue: isFirst
        ? `好，我会让后面慢慢靠近《${currentTitle}》的质地，不直接复制它，先用《${track.title}》往旁边走一步。`
        : `这一首继续顺着《${currentTitle}》留下的听感往外延展。`,
      djScript: `《${track.title}》来自 ${track.artist || '这位音乐人'}${track.album ? ` 的《${track.album}》` : ''}，我会把它放在过渡之后，让队列自然靠近 ${currentArtist} 这首歌的声音方向。`,
      recommendReason: `${sourceText}；我选它不是因为“相似”两个字，而是想保留刚才那首歌的情绪惯性，同时给耳朵一个新的角度。`,
    };
  });
}

/**
 * 处理“顺着这首继续”：调用网易云相似歌曲，再用现有软重排机制接入后续队列。
 */
async function handleSimilarContinuation(params: {
  sessionId: number;
  userId: number;
  currentIndex: number;
  currentTrack: any;
  sessionTracks: Array<{ trackId: number }>;
  scored: any[];
}): Promise<any> {
  const start = Date.now();
  const sourceTrackId = params.currentTrack.source_track_id || params.currentTrack.sourceTrackId || params.currentTrack.id;
  appendRuntimeLog(params.sessionId, {
    scope: 'chat',
    level: 'info',
    title: '开始顺着当前歌曲续播',
    message: `种子歌曲：${params.currentTrack.title || '未知'} - ${params.currentTrack.artist || '未知'}`,
    detail: {
      seedTrack: {
        trackId: params.currentTrack.id,
        sourceTrackId,
        title: params.currentTrack.title,
        artist: params.currentTrack.artist,
      },
    },
  });

  const similarScored = await recallSimilarSongCandidates(params.userId, sourceTrackId, 10);
  const existingTrackIds = new Set(params.sessionTracks.map(track => Number(track.trackId)));
  const requestedTracks = buildSimilarContinuationTracks({
    currentTrack: params.currentTrack,
    similarScored,
    fallbackScored: params.scored,
    existingTrackIds,
    limit: 8,
  });
  const combinedScored = mergeScoredCandidates(params.scored, similarScored);
  const reorderResult = await handleReorderQueue(params.sessionId, params.currentIndex, requestedTracks, combinedScored);
  await refreshPlayUrlsForInsertedTracks(params.sessionId, reorderResult.insertedTrackIds);

  appendRuntimeLog(params.sessionId, {
    scope: 'netease',
    level: reorderResult.queueChanged ? 'success' : 'warn',
    title: 'simi_song 相似续播完成',
    message: `返回 ${similarScored.length} 首，插入 ${reorderResult.insertedTrackIds.length} 首`,
    durationMs: Date.now() - start,
    detail: {
      seedTrackId: sourceTrackId,
      similarCount: similarScored.length,
      requestedTracks,
      insertedTrackIds: reorderResult.insertedTrackIds,
    },
  });

  return {
    reply: reorderResult.queueChanged
      ? `好，我会让后面慢慢靠近《${params.currentTrack.title}》的质地，不直接复制它，而是顺着这个感觉往外走一点。`
      : `我试着顺着《${params.currentTrack.title}》找了一圈，但暂时没有足够合适的新歌；这首先继续听，我不会硬塞不合适的相似歌。`,
    intent: 'SIMILAR_CONTINUE',
    queueChanged: reorderResult.queueChanged,
    queueUpdateMode: reorderResult.queueChanged ? 'soft' : 'none',
    insertedTrackIds: reorderResult.insertedTrackIds,
  };
}

/**
 * 为聊天插入的新歌刷新播放地址。
 * 相似歌曲可能是刚从网易云写入本地的候选，入库时还没有短期 CDN 播放 URL。
 */
async function refreshPlayUrlsForInsertedTracks(sessionId: number, trackIds: number[]): Promise<void> {
  const ids = Array.from(new Set(trackIds.map(Number).filter(Number.isFinite)));
  if (ids.length === 0) return;

  const cookieFile = path.resolve(__dirname, '../../data/netease-cookie.txt');
  if (!fs.existsSync(cookieFile)) {
    appendRuntimeLog(sessionId, {
      scope: 'netease',
      level: 'warn',
      title: '相似续播播放地址未刷新',
      message: '未找到网易云 cookie，新插入歌曲可能暂时没有播放地址',
    });
    return;
  }

  const rows = db.prepare(`
    SELECT id, source_track_id AS sourceTrackId
    FROM radio_track
    WHERE id IN (${ids.map(() => '?').join(',')})
      AND source_track_id IS NOT NULL
  `).all(...ids) as Array<{ id: number; sourceTrackId: string }>;
  const sourceIds = rows.map(row => String(row.sourceTrackId)).filter(Boolean);
  if (sourceIds.length === 0) return;

  const start = Date.now();
  try {
    const cookie = fs.readFileSync(cookieFile, 'utf-8').trim();
    const result = await song_url({ id: sourceIds.join(','), br: 999000, cookie });
    const urlData = ((result as any).body?.data || []) as any[];
    const sourceToUrl = new Map<string, string>();
    for (const item of urlData) {
      if (item?.id && item?.url) sourceToUrl.set(String(item.id), item.url);
    }

    const update = db.prepare('UPDATE radio_track SET play_url = ?, modified_time = datetime(\'now\',\'localtime\') WHERE id = ?');
    let updated = 0;
    for (const row of rows) {
      const url = sourceToUrl.get(String(row.sourceTrackId));
      if (!url) continue;
      update.run(url, row.id);
      updated++;
    }

    appendRuntimeLog(sessionId, {
      scope: 'netease',
      level: 'success',
      title: '相似续播播放地址刷新完成',
      message: `${updated}/${rows.length} 首成功`,
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    appendRuntimeLog(sessionId, {
      scope: 'netease',
      level: 'warn',
      title: '相似续播播放地址刷新失败',
      message: err.message || '未知错误',
      durationMs: Date.now() - start,
    });
  }
}

/**
 * 合并本地候选和网易云相似候选，供后续校验插入歌曲是否可信。
 */
function mergeScoredCandidates(primary: any[], extra: any[]): any[] {
  const merged: any[] = [];
  const seen = new Set<number>();
  for (const item of [...extra, ...primary]) {
    const trackId = Number(item?.track?.id);
    if (!Number.isFinite(trackId) || seen.has(trackId)) continue;
    seen.add(trackId);
    merged.push(item);
  }
  return merged;
}

/**
 * Claude 不可用时的本地兜底回复，避免前端出现像系统错误一样的反馈。
 */
function buildLocalChatFallback(message: string, currentTrack: string): any {
  const normalized = message.trim();

  if (/安静|轻一点|轻柔|别太吵|柔和|小声/.test(normalized)) {
    return {
      reply: `收到，我会把后面的气质往更安静、更留白的方向收一点。当前这首是 ${currentTrack}，先让它稳住这一段。`,
      intent: 'REORDER_QUEUE',
      queueChanged: false,
    };
  }

  if (/专注|工作|写代码|coding|效率/.test(normalized)) {
    return {
      reply: '收到，我会让后面的歌慢慢靠向这个方向。',
      intent: 'REORDER_QUEUE',
      queueChanged: false,
    };
  }

  if (/放松|松弛|休息|chill/.test(normalized)) {
    return {
      reply: '收到，后面的队列会慢慢松下来。',
      intent: 'REORDER_QUEUE',
      queueChanged: false,
    };
  }

  if (/深夜|夜里|睡前|晚/.test(normalized)) {
    return {
      reply: '收到，我会把后面调成更深夜一点。',
      intent: 'REORDER_QUEUE',
      queueChanged: false,
    };
  }

  return {
    reply: '收到，我会悄悄调整后面的歌。',
    intent: isListeningDirectionMessage(normalized) ? 'REORDER_QUEUE' : 'CHAT',
    queueChanged: false,
  };
}

/**
 * 解析前端真实播放索引，避免只靠数据库播放状态误判当前歌曲。
 */
function resolveCurrentIndex(total: number, override: unknown, playingIdx: number, waitingIdx: number): number {
  const explicitIndex = Number(override);
  if (Number.isInteger(explicitIndex) && explicitIndex >= 0 && explicitIndex < total) {
    return explicitIndex;
  }
  if (playingIdx >= 0) return playingIdx;
  if (waitingIdx >= 0) return waitingIdx;
  return 0;
}

/**
 * 判断用户是否在表达“想听某种歌/歌手/风格”，这类输入应触发软队列更新。
 */
function isListeningDirectionMessage(message: string): boolean {
  return /想听|放点|来点|换成|多放|少放|不要|别放|歌手|风格|类型|周杰伦|陈奕迅|林俊杰|王菲|爵士|摇滚|说唱|民谣|电子|R&B|r&b|hiphop|hip-hop|lofi|chill/i.test(message);
}

/**
 * 模型不可用或没有给出队列时，按用户原话从候选集中本地挑一组后续歌曲。
 */
function buildLocalSoftReorderTracks(
  message: string,
  scored: any[],
): Array<{ trackId: number; segue: string; djScript: string; recommendReason: string }> {
  const normalized = message.toLowerCase();
  const ranked = scored
    .map(item => {
      const track = item.track;
      const haystack = [
        track.title,
        track.artist,
        track.album,
        track.genre_tags,
        track.mood_tags,
      ].filter(Boolean).join(' ').toLowerCase();
      const artist = String(track.artist || '').toLowerCase();
      const directHit = artist && normalized.includes(artist)
        ? 8
        : 0;
      const tagHit = haystack.split(/[,，\s]+/).some((token: string) => token && normalized.includes(token.toLowerCase())) ? 5 : 0;
      const titleHit = track.title && normalized.includes(track.title.toLowerCase()) ? 10 : 0;
      return {
        item,
        score: Number(item.score || 0) + directHit + tagHit + titleHit,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return ranked.map(({ item }, index) => {
    const track = item.track;
    const request = message.length > 24 ? `${message.slice(0, 24)}...` : message;
    return {
      trackId: track.id,
      segue: index === 0
        ? `我会让你刚才说的方向慢慢进来，先用《${track.title}》把气质带过去。`
        : `这一首继续顺着刚才的请求往前走，但不把节奏切得太硬。`,
      djScript: `《${track.title}》来自 ${track.artist}${track.album ? ` 的《${track.album}》` : ''}，它的声音线条和现在的电台氛围有连接，可以自然承接前面一两首歌。`,
      recommendReason: `你刚刚说“${request}”，所以我把它排在过渡之后：它既回应了这个方向，也不会突然打断当前正在播放的情绪。`,
    };
  });
}

/**
 * 处理队列重排：保留已播放的歌曲，用新歌曲替换后续队列
 */
async function handleReorderQueue(
  sessionId: number,
  currentIndex: number,
  newTracks: Array<{ trackId: number; segue?: string; djScript?: string; recommendReason?: string }>,
  scored: any[]
): Promise<{ queueChanged: boolean; insertedTrackIds: number[] }> {
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
    return { queueChanged: false, insertedTrackIds: [] }; // 有效歌曲太少，不执行重排
  }

  const sessionTracks = getSessionTracks(sessionId);
  const plan = buildSoftReorderPlan({
    currentQueue: sessionTracks.map(track => ({ trackId: track.trackId, sortNo: track.sortNo })),
    currentIndex,
    requestedTracks: validTracks,
    transitionCount: 2,
  });

  if (plan.insertTracks.length < 3) {
    return { queueChanged: false, insertedTrackIds: [] };
  }

  // 只删除过渡窗口之后的歌曲，让用户请求自然接入，不打断当前播放。
  db.prepare(`
    DELETE FROM radio_session_track
    WHERE session_id = ? AND sort_no > ?
  `).run(sessionId, plan.replaceAfterSortNo);

  // 从过渡窗口后开始插入新歌曲。
  insertSessionTracks(sessionId, plan.insertTracks.map(t => ({
    trackId: Number(t.trackId),
    sortNo: t.sortNo,
    djScript: t.djScript || null,
    recommendReason: t.recommendReason || null,
    segue: t.segue || null,
  })));

  return {
    queueChanged: true,
    insertedTrackIds: plan.insertTracks.map(track => track.trackId),
  };
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
