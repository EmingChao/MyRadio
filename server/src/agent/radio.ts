import db from '../stores/db';
import { callClaude } from './claude';
import { RADIO_DJ_SYSTEM_PROMPT, buildRadioPrompt } from './prompts';
import { recallCandidates, formatCandidatesForClaude } from './recall';
import { buildUserContext, buildMusicProfile } from './context';
import { AppError, ErrorCode, toAppError } from '../utils/errors';
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
    title: string;
    artist: string;
    album: string | null;
    coverUrl: string | null;
    playUrl: string | null;
    djScript: string;
    recommendReason: string;
    segue: string;
  }>;
}

/**
 * 创建电台会话
 */
export async function createRadioSession(params: CreateSessionParams): Promise<SessionResult> {
  const userId = 443961717;
  const totalStart = Date.now();

  // 1. 召回候选歌曲
  let t = Date.now();
  const scored = recallCandidates(userId, {
    scene: params.scene,
    mood: params.mood,
    limit: 100,
  });
  console.log(`[Radio] 召回完成 ${Date.now() - t}ms，候选 ${scored.length} 首`);

  if (scored.length === 0) {
    throw new Error('没有候选歌曲');
  }

  // 2. 组装上下文
  t = Date.now();
  const userContext = await buildUserContext({
    scene: params.scene,
    mood: params.mood,
    extraPrompt: params.extraPrompt,
  });
  const musicProfile = buildMusicProfile(userId);
  const candidates = formatCandidatesForClaude(scored);
  console.log(`[Radio] 上下文构建 ${Date.now() - t}ms`);

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
        claudeResult = buildFallbackResult(scored, params);
        isFallback = true;
      }
    } else {
      // 模型不可用，进入 fallback 模式
      console.warn('[Radio] Claude 调用失败，进入 fallback 模式:', err.message);
      claudeResult = buildFallbackResult(scored, params);
      isFallback = true;
    }
  }

  // 4. 后端校验
  t = Date.now();
  const validated = validateClaudeResult(claudeResult, scored);
  console.log(`[Radio] 校验完成 ${Date.now() - t}ms，有效歌曲 ${validated.tracks.length} 首${isFallback ? ' (fallback)' : ''}`);

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
      title: t.title,
      artist: t.artist,
      album: t.album,
      coverUrl: t.coverUrl,
      playUrl: t.playUrl,
      djScript: t.djScript,
      recommendReason: t.recommendReason,
      segue: t.segue,
    })),
  };
}

/**
 * 校验 Claude 返回结果
 */
function validateClaudeResult(result: any, scored: any[]): any {
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
  for (const t of result.tracks) {
    const trackId = Number(t.trackId);
    const track = candidateMap.get(trackId);

    if (!track) {
      console.warn(`跳过幻觉歌曲: trackId=${trackId} 不在候选集中`);
      continue;
    }

    if (!t.djScript || t.djScript.trim() === '') {
      t.djScript = `下一首，${track.title}`;
    }

    validTracks.push({
      ...t,
      trackId,
      title: track.title,
      artist: track.artists,
      album: track.album,
      coverUrl: track.cover_url,
      playUrl: track.play_url,
    });
  }

  if (validTracks.length < 5) {
    throw new Error(`有效歌曲不足（${validTracks.length}首），候选集可能不匹配`);
  }

  return {
    sessionTitle: result.sessionTitle || '私人电台',
    say: result.say || '',
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
 * 构建 fallback 结果（模型不可用时的本地编排）
 * 直接取召回 top 10，用模板生成文案
 */
function buildFallbackResult(scored: any[], params: CreateSessionParams): any {
  const top = scored.slice(0, 10);
  const sceneLabel = params.scene === 'coding' ? '编码'
    : params.scene === 'working' ? '工作'
    : params.scene === 'relaxing' ? '放松'
    : params.scene === 'sleeping' ? '入眠'
    : '日常';
  const moodLabel = params.mood || '随意';

  return {
    sessionTitle: `${sceneLabel}电台 · ${moodLabel}模式`,
    summary: '本地编排模式，基于你的听歌习惯自动生成。',
    say: `${sceneLabel}时间到了，为你准备了几首歌，慢慢听。`,
    tracks: top.map((s, i) => ({
      trackId: s.track.id,
      djScript: i === 0 ? '开始播放。' : `下一首，${s.track.title}。`,
      recommendReason: s.reason || '为你推荐',
      segue: i === 0 ? '开场' : '继续',
    })),
  };
}
