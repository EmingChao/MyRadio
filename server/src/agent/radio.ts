import fs from 'fs';
import path from 'path';
import db from '../stores/db';
import { callClaude } from './claude';
import { RADIO_DJ_SYSTEM_PROMPT, buildRadioPrompt } from './prompts';
import { recallCandidates, formatCandidatesForClaude } from './recall';
import { recallExploreCandidates } from './explore';
import {
  mergeNeteaseSourceCandidates,
  pickNeteaseSimilarSeeds,
  pickNeteaseVectorSeeds,
  recallDailyRecommendCandidates,
  recallPersonalFmCandidates,
  recallSimilarSongCandidates,
  recallVectorSongCandidates,
} from './netease-sources';
import { buildUserContext, buildMusicProfile } from './context';
import { buildFallbackTrackCopy, buildOpeningCopy, buildTrackVoiceIntro, enrichTrackCopyIfNeeded, getSceneLabel } from './dj-copy';
import { AppError, ErrorCode, toAppError } from '../utils/errors';
import { getSession, getSessionTracks, getSessionTracksWithDetail, insertSessionTracks } from '../stores/session';
import { song_url } from 'NeteaseCloudMusicApi';
import type { Track } from '../types';
import { enrichTracksWithFacts } from '../services/track-facts';

/**
 * 兼容旧测试和旧调用点：保留原来的 mergeRadioCandidates 导出。
 */
export { mergeRadioCandidates } from './netease-sources';

/**
 * 电台核心编排：召回 → Claude 重排 → 校验 → 保存 → 返回
 */

interface CreateSessionParams {
  scene?: string;
  mood?: string;
  extraPrompt?: string;
  refreshMode?: 'new-session';
  avoidTrackIds?: number[];
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
    sourceScope?: string;
    source_type?: string;
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
  const dailyScored = await recallDailyRecommendCandidates(userId, 6);
  const similarSeeds = pickNeteaseSimilarSeeds(scored, 4);
  const similarScored = similarSeeds.length > 0
    ? await recallSimilarSongCandidates(userId, similarSeeds[0], 6)
    : [];
  const fmScored = await recallPersonalFmCandidates(userId, 3);
  const vectorSeedIds = pickNeteaseVectorSeeds(scored, 12);
  const vectorScored = vectorSeedIds
    ? await recallVectorSongCandidates(userId, vectorSeedIds, 4)
    : [];
  const restartContext = buildRestartContext(params);
  const mergedScored = prepareSessionCandidates(
    mergeNeteaseSourceCandidates({
      libraryScored: scored,
      dailyScored,
      similarScored,
      fmScored,
      vectorScored,
      exploreScored,
      limit: 100,
    }),
    restartContext,
  );
  const promptScored = selectPromptCandidates(mergedScored, 18);
  await enrichTracksWithFacts(promptScored, 6);
  const candidates = formatCandidatesForClaude(promptScored);
  console.log(`[Radio] 探索推荐 ${Date.now() - t}ms，新增候选 ${exploreScored.length} 首，合并候选 ${mergedScored.length} 首，模型候选 ${promptScored.length} 首`);

  // 3. 调用 Claude
  t = Date.now();
  const userMessage = buildRadioPrompt({
    userContext,
    musicProfile,
    candidates,
    trackCountRange: { min: 5, max: 6 },
    copyMode: 'selection',
    sessionDirective: restartContext.isRestart
      ? '这是用户主动重新开始电台。请保持当前场景和品味气质，但不要复刻上一组队列；优先从候选前段里选择没在上一组出现过的歌曲，像真正重新编排过的一期电台。'
      : undefined,
  });
  let claudeResult: any;
  let isFallback = false;

  try {
    claudeResult = await callClaude(RADIO_DJ_SYSTEM_PROMPT, userMessage, { maxTokens: 1200 });
  } catch (err: any) {
    console.log(`[Radio] Claude 调用耗时 ${Date.now() - t}ms`);
    // JSON 解析失败时重试一次
    if (err instanceof SyntaxError) {
      console.warn('[Radio] Claude 返回 JSON 解析失败，重试...');
      try {
        claudeResult = await callClaude(
          RADIO_DJ_SYSTEM_PROMPT,
          userMessage + '\n\n上次返回的 JSON 格式有误，请严格按格式返回。',
          { maxTokens: 1200 },
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
  const validated = validateClaudeResult(claudeResult, isFallback ? mergedScored : promptScored, params, userContext);
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
  const dailyScored = await recallDailyRecommendCandidates(userId, 4);
  const similarSeeds = pickNeteaseSimilarSeeds(scored, 3);
  const similarScored = similarSeeds.length > 0
    ? await recallSimilarSongCandidates(userId, similarSeeds[0], 4)
    : [];
  const fmScored = await recallPersonalFmCandidates(userId, 2);
  const vectorSeedIds = pickNeteaseVectorSeeds([
    ...existingDetails.map(track => ({
      track: { id: track.trackId, source_track_id: track.sourceTrackId },
      score: 100,
    })),
    ...scored,
  ], 16);
  const vectorScored = vectorSeedIds
    ? await recallVectorSongCandidates(userId, vectorSeedIds, 6)
    : [];
  const mergedScored = mergeNeteaseSourceCandidates({
    libraryScored: scored,
    dailyScored,
    similarScored,
    fmScored,
    vectorScored,
    exploreScored,
    limit: 100,
  })
    .filter(item => !existingIds.has(item.track.id));

  if (mergedScored.length < 3) {
    throw new Error('没有足够的新候选歌曲用于续播');
  }

  const promptScored = selectPromptCandidates(mergedScored, 18);
  await enrichTracksWithFacts(promptScored, 5);
  const candidates = formatCandidatesForClaude(promptScored);
  const continuationMax = 5;
  const prompt = buildRadioPrompt({
    userContext,
    musicProfile,
    candidates,
    trackCountRange: { min: 5, max: continuationMax },
    copyMode: 'selection',
  })
    + `\n\n这是当前 session 的异步续播请求，只返回 5-${continuationMax} 首即可。AI 仍需要负责选歌和排序，但不要生成过长队列。第一首必须自然承接上一首：${lastExistingTrack ? `${lastExistingTrack.title} - ${lastExistingTrack.artist}` : '当前队列末尾歌曲'}。不要重复已在当前 session 出现过的歌曲。`;

  let result: any;
  let isFallback = false;
  try {
    result = await callClaude(RADIO_DJ_SYSTEM_PROMPT, prompt, { maxTokens: 1000 });
  } catch (err: any) {
    console.warn('[Radio] 续播 Claude 调用失败，进入本地续播:', err.message);
    result = buildFallbackContinuationResult(mergedScored, session, userContext, lastExistingTrack, limit);
    isFallback = true;
  }

  const validated = validateClaudeResult(result, isFallback ? mergedScored : promptScored, {
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
    const scoredItem = scored.find(s => s.track.id === trackId);
    const enrichedCopy: typeof t = enrichTrackCopyIfNeeded(t, track, {
      index: validTracks.length,
      reason: scoredItem?.reason,
      sceneLabel,
      moodLabel,
      previousTrack,
      sourceScope: scoredItem?.sourceScope,
      weather: userContext.weather,
    });

    validTracks.push({
      ...enrichedCopy,
      trackId,
      sourceScope: scoredItem?.sourceScope,
      source_type: track.source_type,
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
  const top = pickFallbackTracks(scored, 10, buildRestartContext(params));
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
        sourceScope: s.sourceScope,
        source_type: s.track.source_type,
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
        sourceScope: s.sourceScope,
        source_type: s.track.source_type,
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
 * fallback 也要保留探索位，否则模型不可用时会退回“只播喜欢列表”。
 */
interface RestartContext {
  isRestart: boolean;
  avoidTrackIds: Set<number>;
}

/**
 * 解析重新开始电台的上下文，后端据此避开上一组歌。
 */
function buildRestartContext(params: Pick<CreateSessionParams, 'refreshMode' | 'avoidTrackIds'>): RestartContext {
  const avoidTrackIds = new Set(
    (params.avoidTrackIds || [])
      .map(id => Number(id))
      .filter(id => Number.isFinite(id) && id > 0),
  );
  return {
    isRestart: params.refreshMode === 'new-session' || avoidTrackIds.size > 0,
    avoidTrackIds,
  };
}

/**
 * 重新开始时先把上一组歌从候选前排移开，保留口味但减少复刻感。
 */
function prepareSessionCandidates(scored: any[], restart: RestartContext): any[] {
  if (!restart.isRestart || restart.avoidTrackIds.size === 0) return scored;

  const fresh = scored.filter(item => !restart.avoidTrackIds.has(Number(item?.track?.id)));
  const avoided = scored.filter(item => restart.avoidTrackIds.has(Number(item?.track?.id)));
  return [...fresh, ...avoided];
}

/**
 * 精选送入模型的候选，控制 prompt 体积，同时保留每日推荐、相似、FM、向量和探索来源。
 */
export function selectPromptCandidates(scored: any[], limit = 48): any[] {
  if (scored.length <= limit) return scored;

  const selected: any[] = [];
  const seen = new Set<number>();
  const priorityScopes = ['daily', 'similar', 'fm', 'vector', 'explore'];

  const pushUnique = (item: any) => {
    const id = Number(item?.track?.id);
    if (!Number.isFinite(id) || seen.has(id) || selected.length >= limit) return;
    seen.add(id);
    selected.push(item);
  };

  // 先保留候选前段的主线口味，避免精选后失去用户熟悉感。
  scored.slice(0, Math.max(8, limit - priorityScopes.length * 2)).forEach(pushUnique);

  // 再为每个外部来源补一个代表，防止接口增强后的信息没有进入模型视野。
  for (const scope of priorityScopes) {
    const matched = scored.find(item => getPromptCandidateScope(item) === scope);
    if (matched) pushUnique(matched);
  }

  // 最后按原始排序补齐，保持召回评分和混排顺序的影响。
  scored.forEach(pushUnique);

  return selected.slice(0, limit);
}

/**
 * 获取候选来源范围，用于 prompt 精选时做来源多样性保护。
 */
function getPromptCandidateScope(item: any): string {
  if (item?.sourceScope) return item.sourceScope;
  if (item?.track?.source_type === 'NETEASE_EXPLORE') return 'explore';
  return 'library';
}

export function pickFallbackTracks(scored: any[], limit: number, options?: { avoidTrackIds?: Iterable<number> }): any[] {
  const selected: any[] = [];
  const seen = new Set<number>();
  const avoidTrackIds = new Set(Array.from(options?.avoidTrackIds || []).map(Number));
  const explore = scored.filter(item => item.sourceScope === 'explore' || item.track?.source_type === 'NETEASE_EXPLORE');
  const library = scored.filter(item => !(item.sourceScope === 'explore' || item.track?.source_type === 'NETEASE_EXPLORE'));
  const freshLibrary = library.filter(item => !avoidTrackIds.has(Number(item.track.id)));
  const freshExplore = explore.filter(item => !avoidTrackIds.has(Number(item.track.id)));

  const pushUnique = (item: any) => {
    if (!item?.track?.id || seen.has(item.track.id) || selected.length >= limit) return;
    seen.add(item.track.id);
    selected.push(item);
  };

  freshLibrary.slice(0, 4).forEach(pushUnique);
  freshExplore.slice(0, Math.max(2, Math.floor(limit * 0.25))).forEach(pushUnique);
  freshLibrary.forEach(pushUnique);
  freshExplore.forEach(pushUnique);
  library.forEach(pushUnique);
  explore.forEach(pushUnique);

  return selected;
}
