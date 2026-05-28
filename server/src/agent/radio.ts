import db from '../stores/db';
import { callClaude } from './claude';
import { RADIO_DJ_SYSTEM_PROMPT, buildRadioPrompt } from './prompts';
import { recallCandidates, formatCandidatesForClaude } from './recall';
import { buildUserContext, buildMusicProfile } from './context';
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

  // 1. 召回候选歌曲
  const scored = recallCandidates(userId, {
    scene: params.scene,
    mood: params.mood,
    limit: 100,
  });

  if (scored.length === 0) {
    throw new Error('没有候选歌曲');
  }

  // 2. 组装上下文
  const userContext = await buildUserContext({
    scene: params.scene,
    mood: params.mood,
    extraPrompt: params.extraPrompt,
  });

  const musicProfile = buildMusicProfile();
  const candidates = formatCandidatesForClaude(scored);

  // 3. 调用 Claude
  const userMessage = buildRadioPrompt({ userContext, musicProfile, candidates });
  let claudeResult: any;

  try {
    claudeResult = await callClaude(RADIO_DJ_SYSTEM_PROMPT, userMessage);
  } catch (err: any) {
    // JSON 解析失败时重试一次
    if (err instanceof SyntaxError) {
      console.warn('Claude 返回 JSON 解析失败，重试...');
      claudeResult = await callClaude(
        RADIO_DJ_SYSTEM_PROMPT,
        userMessage + '\n\n上次返回的 JSON 格式有误，请严格按格式返回。'
      );
    } else {
      throw err;
    }
  }

  // 4. 后端校验
  const validated = validateClaudeResult(claudeResult, scored);

  // 5. 保存到数据库
  const sessionId = saveSession(userId, params, userContext, validated);

  return {
    sessionId,
    sessionTitle: validated.sessionTitle,
    aiSummary: validated.summary || '',
    say: validated.say,
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
