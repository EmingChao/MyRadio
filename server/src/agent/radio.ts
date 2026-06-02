import fs from 'fs';
import path from 'path';
import db from '../stores/db';
import { callClaude } from './claude';
import { RADIO_DJ_SYSTEM_PROMPT, buildRadioPrompt } from './prompts';
import { recallCandidates, formatCandidatesForClaude } from './recall';
import { recallExploreCandidates } from './explore';
import { buildUserContext, buildMusicProfile } from './context';
import { buildFallbackTrackCopy, buildOpeningCopy, buildTrackVoiceIntro, enrichTrackCopyIfNeeded, getSceneLabel } from './dj-copy';
import { AppError, ErrorCode, toAppError } from '../utils/errors';
import { getSession, getSessionTracks, getSessionTracksWithDetail, insertSessionTracks } from '../stores/session';
import { song_url } from 'NeteaseCloudMusicApi';
import type { Track } from '../types';

/**
 * 电台核心编排：召回 → Claude 重排 → 校验 → 保存 → 返回
 */

interface CreateSessionParams {
  scene?: string;
  mood?: string;
  extraPrompt?: string;
}

interface SessionResult {
  sessionId: number;
  sessionTitle: string;
  aiSummary: string;
  say: string;
  fallback?: boolean;
  tracks: Array<{
    trackId: number;
    sourceTrackId: string;
    title: string;
    artist: string;
    album: string | null;
    coverUrl: string | null;
    playUrl: string | null;
    djScript: string;
    recommendReason: string;
    segue: string;
    voiceIntro: string;
  }>;
}

/**
 * 创建电台会话
 */
export async function createRadioSession(params: CreateSessionParams): Promise<SessionResult> {
  const userId = 443961717;
  const totalStart = Date.now();

  // 1. 先组装上下文，天气和时间要参与召回，而不是只写进 prompt。
  let t = Date.now();
  const userContext = await buildUserContext({
    scene: params.scene,
    mood: params.mood,
    extraPrompt: params.extraPrompt,
  });
  const musicProfile = buildMusicProfile(userId);
  console.log(`[Radio] 上下文构建 ${Date.now() - t}ms`);

  // 2. 召回用户曲库候选歌曲
  t = Date.now();
  const scored = recallCandidates(userId, {
    scene: params.scene,
    mood: params.mood,
    weather: userContext.weather,
    time: userContext.time,
    limit: 100,
  });
  console.log(`[Radio] 召回完成 ${Date.now() - t}ms，候选 ${scored.length} 首`);

  if (scored.length === 0) {
    throw new Error('没有候选歌曲');
  }

  // 2.5 主动探索少量新歌，让电台不只局限在用户原始歌单里。
  t = Date.now();
  const exploreScored = await recallExploreCandidates(userId, {
    scene: params.scene,
    mood: params.mood,
    musicProfile,
    limit: 6,
  });
  const mergedScored = mergeRadioCandidates(scored, exploreScored);
  const candidates = formatCandidatesForClaude(mergedScored);
  console.log(`[Radio] 探索推荐 ${Date.now() - t}ms，新增候选 ${exploreScored.length} 首，合并候选 ${mergedScored.length} 首`);

  // 3. 调用 Claude
  t = Date.now();
  const userMessage = buildRadioPrompt({ userContext, musicProfile, candidates });
  let claudeResult: any;
  let isFallback = false;

  try {
    claudeResult = await callClaude(RADIO_DJ_SYSTEM_PROMPT, userMessage);
  } catch (err: any) {
    console.log(`[Radio] Claude 调用耗时 ${Date.now() - t}ms`);
    // JSON 解析失败时重试一次
    if (err instanceof SyntaxError) {
      console.warn('[Radio] Claude 返回 JSON 解析失败，重试...');
      try {
        claudeResult = await callClaude(
          RADIO_DJ_SYSTEM_PROMPT,
          userMessage + '\n\n上次返回的 JSON 格式有误，请严格按格式返回。'
        );
      } catch {
        console.warn('[Radio] 重试失败，进入 fallback 模式');
        claudeResult = buildFallbackResult(mergedScored, params, userContext);
        isFallback = true;
      }
    } else {
      // 模型不可用，进入 fallback 模式
      console.warn('[Radio] Claude 调用失败，进入 fallback 模式:', err.message);
      claudeResult = buildFallbackResult(mergedScored, params, userContext);
      isFallback = true;
    }
  }

  // 4. 后端校验
  t = Date.now();
  const validated = validateClaudeResult(claudeResult, mergedScored, params, userContext);
  console.log(`[Radio] 校验完成 ${Date.now() - t}ms，有效歌曲 ${validated.tracks.length} 首${isFallback ? ' (fallback)' : ''}`);

  // 4.5 刷新播放地址（CDN 链接过期后需要重新获取）
  await refreshPlayUrlsForTracks(validated.tracks);

  // 5. 保存到数据库
  t = Date.now();
  const sessionId = saveSession(userId, params, userContext, validated);
  console.log(`[Radio] 保存完成 ${Date.now() - t}ms，sessionId=${sessionId}`);
  console.log(`[Radio] 总耗时 ${Date.now() - totalStart}ms`);

  return {
    sessionId,
    sessionTitle: validated.sessionTitle,
    aiSummary: validated.summary || '',
    say: validated.say,
    fallback: isFallback || undefined,
    tracks: validated.tracks.map((t: any) => ({
      trackId: t.trackId,
      sourceTrackId: t.sourceTrackId,
      title: t.title,
      artist: t.artist,
      album: t.album,
      coverUrl: t.coverUrl,
      playUrl: t.playUrl,
      djScript: t.djScript,
      recommendReason: t.recommendReason,
      segue: t.segue,
      voiceIntro: t.voiceIntro,
    })),
  };
}

/**
 * 为当前会话追加下一段队列，避免播放到末尾后突然停止。
 */
export async function continueRadioSession(sessionId: number, limit = 8): Promise<SessionResult['tracks']> {
  const session = getSession(sessionId);
  if (!session) throw new Error('会话不存在');

  const existingSessionTracks = getSessionTracks(sessionId);
  const existingIds = new Set(existingSessionTracks.map(track => track.trackId));
  const existingDetails = getSessionTracksWithDetail(sessionId) as any[];
  const lastExistingTrack = existingDetails[existingDetails.length - 1] || null;
  const userId = session.userId;

  const userContext = await buildUserContext({
    scene: session.scene || undefined,
    mood: session.mood || undefined,
    extraPrompt: [
      '当前队列即将播放完，请继续追加下一段私人电台队列。',
      '不要重复当前 session 已经出现过的歌曲。',
      lastExistingTrack ? `上一首/当前队列末尾是：${lastExistingTrack.title} - ${lastExistingTrack.artist}。新队列第一首要自然承接它。` : '',
    ].filter(Boolean).join('\n'),
  });
  const musicProfile = buildMusicProfile(userId);

  const scored = recallCandidates(userId, {
    scene: session.scene || undefined,
    mood: session.mood || undefined,
    weather: userContext.weather,
    time: userContext.time,
    limit: 100,
  }).filter(item => !existingIds.has(item.track.id));

  const exploreScored = await recallExploreCandidates(userId, {
    scene: session.scene || undefined,
    mood: session.mood || undefined,
    musicProfile,
    limit: 6,
  });
  const mergedScored = mergeRadioCandidates(scored, exploreScored)
    .filter(item => !existingIds.has(item.track.id));

  if (mergedScored.length < 3) {
    throw new Error('没有足够的新候选歌曲用于续播');
  }

  const candidates = formatCandidatesForClaude(mergedScored);
  const prompt = buildRadioPrompt({ userContext, musicProfile, candidates })
    + `\n\n这是当前 session 的续播请求，只返回 ${Math.max(5, limit)} 首左右即可。第一首必须自然承接上一首：${lastExistingTrack ? `${lastExistingTrack.title} - ${lastExistingTrack.artist}` : '当前队列末尾歌曲'}。不要重复已在当前 session 出现过的歌曲。`;

  let result: any;
  try {
    result = await callClaude(RADIO_DJ_SYSTEM_PROMPT, prompt);
  } catch (err: any) {
    console.warn('[Radio] 续播 Claude 调用失败，进入本地续播:', err.message);
    result = buildFallbackContinuationResult(mergedScored, session, userContext, lastExistingTrack, limit);
  }

  const validated = validateClaudeResult(result, mergedScored, {
    scene: session.scene || undefined,
    mood: session.mood || undefined,
  }, userContext);
  const appended = validated.tracks.slice(0, limit);

  await refreshPlayUrlsForTracks(appended);

  const startSort = existingSessionTracks.length;
  insertSessionTracks(sessionId, appended.map((track: any, index: number) => ({
    trackId: track.trackId,
    sortNo: startSort + index,
    djScript: track.djScript,
    recommendReason: track.recommendReason,
    segue: track.segue,
  })));

  return appended.map((track: any) => ({
    trackId: track.trackId,
    sourceTrackId: track.sourceTrackId,
    title: track.title,
    artist: track.artist,
    album: track.album,
    coverUrl: track.coverUrl,
    playUrl: track.playUrl,
    djScript: track.djScript,
    recommendReason: track.recommendReason,
    segue: track.segue,
    voiceIntro: track.voiceIntro,
  }));
}

/**
 * 校验 Claude 返回结果
 */
function validateClaudeResult(result: any, scored: any[], params: CreateSessionParams, userContext: any): any {
  // 构建候选集 ID 映射
  const candidateMap = new Map<number, any>();
  for (const s of scored) {
    candidateMap.set(s.track.id, s.track);
  }

  // 校验 tracks
  if (!result.tracks || !Array.isArray(result.tracks) || result.tracks.length === 0) {
    throw new Error('Claude 未返回有效的播放队列');
  }

  const validTracks = [];
  const sceneLabel = getSceneLabel(params.scene);
  const moodLabel = params.mood || '随意';

  for (const t of result.tracks) {
    const trackId = Number(t.trackId);
    const track = candidateMap.get(trackId);

    if (!track) {
      console.warn(`跳过幻觉歌曲: trackId=${trackId} 不在候选集中`);
      continue;
    }

    const previousTrack = validTracks.length > 0 ? candidateMap.get(validTracks[validTracks.length - 1].trackId) : null;
    const enrichedCopy: typeof t = enrichTrackCopyIfNeeded(t, track, {
      index: validTracks.length,
      reason: scored.find(s => s.track.id === trackId)?.reason,
      sceneLabel,
      moodLabel,
      previousTrack,
      sourceScope: scored.find(s => s.track.id === trackId)?.sourceScope,
      weather: userContext.weather,
    });

    validTracks.push({
      ...enrichedCopy,
      trackId,
      sourceTrackId: track.source_track_id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      coverUrl: track.cover_url,
      playUrl: track.play_url,
      voiceIntro: buildTrackVoiceIntro(enrichedCopy),
    });
  }

  if (validTracks.length < 5) {
    throw new Error(`有效歌曲不足（${validTracks.length}首），候选集可能不匹配`);
  }

  return {
    sessionTitle: result.sessionTitle || '私人电台',
    say: result.say && String(result.say).trim().length >= 40
      ? result.say
      : buildOpeningCopy(params, validTracks.length),
    summary: result.summary || '',
    tracks: validTracks.slice(0, 20),
  };
}

/**
 * 保存会话到数据库
 */
function saveSession(
  userId: number,
  params: CreateSessionParams,
  userContext: any,
  validated: any
): number {
  // 插入会话
  const sessionResult = db.prepare(`
    INSERT INTO radio_session (user_id, session_title, scene, mood, weather_summary, calendar_summary, ai_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    validated.sessionTitle,
    params.scene || null,
    params.mood || null,
    userContext.weather || null,
    userContext.calendar || null,
    validated.summary
  );

  const sessionId = Number(sessionResult.lastInsertRowid);

  // 插入队列
  const insertTrack = db.prepare(`
    INSERT INTO radio_session_track (session_id, track_id, sort_no, dj_script, recommend_reason, segue, play_status)
    VALUES (?, ?, ?, ?, ?, ?, 'WAITING')
  `);

  for (let i = 0; i < validated.tracks.length; i++) {
    const t = validated.tracks[i];
    insertTrack.run(sessionId, t.trackId, i, t.djScript, t.recommendReason, t.segue || null);
  }

  return sessionId;
}

/**
 * 刷新会话中歌曲的播放地址
 * 网易云 CDN 链接有时效性，过期后需重新获取
 */
async function refreshPlayUrlsForTracks(tracks: any[]): Promise<void> {
  const COOKIE_FILE = path.resolve(__dirname, '../../data/netease-cookie.txt');
  if (!fs.existsSync(COOKIE_FILE)) {
    console.warn('[Radio] 无网易云 cookie，跳过播放地址刷新');
    return;
  }

  // 刷新所有歌曲的播放地址（CDN 链接有时效性，可能已过期）
  const needRefresh = tracks;
  if (needRefresh.length === 0) return;

  const cookie = fs.readFileSync(COOKIE_FILE, 'utf-8').trim();
  const sourceIds = tracks.map(t => Number(t.sourceTrackId)).filter(id => !isNaN(id));
  if (sourceIds.length === 0) return;

  console.log(`[Radio] 刷新 ${sourceIds.length} 首歌的播放地址...`);
  try {
    const result = await song_url({ id: sourceIds.join(','), br: 999000, cookie });
    const urlData = (result.body?.data || []) as any[];
    const urlMap = new Map<number, string>();
    for (const item of urlData) {
      if (item.url) urlMap.set(item.id, item.url);
    }

    // 更新内存中的 tracks
    for (const t of tracks) {
      const url = urlMap.get(Number(t.sourceTrackId));
      if (url) {
        t.playUrl = url;
        // 同步更新数据库
        db.prepare('UPDATE radio_track SET play_url = ? WHERE source_track_id = ?').run(url, String(t.sourceTrackId));
      }
    }
    console.log(`[Radio] 播放地址刷新完成: ${urlMap.size}/${sourceIds.length} 成功`);
  } catch (err: any) {
    console.error('[Radio] 刷新播放地址失败:', err.message);
  }
}

/**
 * 构建 fallback 结果（模型不可用时的本地编排）
 * 保留少量探索歌曲，避免模型不可用时退回全喜欢列表。
 */
function buildFallbackResult(scored: any[], params: CreateSessionParams, userContext?: any): any {
  const top = pickFallbackTracks(scored, 10);
  const sceneLabel = getSceneLabel(params.scene);
  const moodLabel = params.mood || '随意';

  return {
    sessionTitle: `${sceneLabel}电台 · ${moodLabel}模式`,
    summary: `本地编排模式，基于你的听歌习惯为${sceneLabel}和“${moodLabel}”状态组织一组歌。`,
    say: buildOpeningCopy(params, top.length),
    tracks: top.map((s, i) => {
      const previous = i > 0 ? top[i - 1].track : null;
      return {
        trackId: s.track.id,
        ...buildFallbackTrackCopy(s.track, {
          index: i,
          reason: s.reason,
          sceneLabel,
          moodLabel,
          previousTrack: previous,
          sourceScope: s.sourceScope,
          weather: userContext?.weather,
        }),
      };
    }),
  };
}

/**
 * 构建本地续播结果，模型不可用时也能继续播下去。
 */
function buildFallbackContinuationResult(scored: any[], session: any, userContext: any, lastExistingTrack: any, limit: number): any {
  const top = pickFallbackTracks(scored, limit);
  const sceneLabel = getSceneLabel(session.scene || undefined);
  const moodLabel = session.mood || '随意';

  return {
    sessionTitle: `${sceneLabel}电台 · ${moodLabel}续播`,
    summary: `顺着当前${sceneLabel}和“${moodLabel}”状态继续追加一段队列。`,
    say: '',
    tracks: top.map((s, i) => {
      const previous = i > 0 ? top[i - 1].track : lastExistingTrack;
      return {
        trackId: s.track.id,
        ...buildFallbackTrackCopy(s.track, {
          index: i,
          reason: s.reason,
          sceneLabel,
          moodLabel,
          previousTrack: previous,
          sourceScope: s.sourceScope,
          weather: userContext?.weather,
        }),
      };
    }),
  };
}

/**
 * 合并本地曲库候选和主动探索候选。
 * 探索歌曲只占少量位置，保证有新鲜感但不破坏用户原有品味。
 */
export function mergeRadioCandidates(libraryScored: any[], exploreScored: any[]): any[] {
  const selected: any[] = [];
  const seen = new Set<number>();

  const pushUnique = (item: any) => {
    if (!item?.track?.id || seen.has(item.track.id)) return;
    seen.add(item.track.id);
    selected.push(item);
  };

  libraryScored.slice(0, 8).forEach(pushUnique);
  exploreScored.slice(0, 4).forEach(pushUnique);
  libraryScored.slice(8, 28).forEach(pushUnique);
  exploreScored.slice(4, 8).forEach(pushUnique);
  libraryScored.slice(28, 100).forEach(pushUnique);

  return selected.slice(0, 100);
}

/**
 * fallback 也要保留探索位，否则模型不可用时会退回“只播喜欢列表”。
 */
export function pickFallbackTracks(scored: any[], limit: number): any[] {
  const selected: any[] = [];
  const seen = new Set<number>();
  const explore = scored.filter(item => item.sourceScope === 'explore' || item.track?.source_type === 'NETEASE_EXPLORE');
  const library = scored.filter(item => !(item.sourceScope === 'explore' || item.track?.source_type === 'NETEASE_EXPLORE'));

  const pushUnique = (item: any) => {
    if (!item?.track?.id || seen.has(item.track.id) || selected.length >= limit) return;
    seen.add(item.track.id);
    selected.push(item);
  };

  library.slice(0, 4).forEach(pushUnique);
  explore.slice(0, Math.max(2, Math.floor(limit * 0.25))).forEach(pushUnique);
  library.forEach(pushUnique);
  explore.forEach(pushUnique);

  return selected;
}
