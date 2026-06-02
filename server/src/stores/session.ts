import db from './db';

/**
 * 会话数据操作层
 */

interface Session {
  id: number;
  userId: number;
  sessionTitle: string;
  scene: string | null;
  mood: string | null;
  weatherSummary: string | null;
  calendarSummary: string | null;
  aiSummary: string | null;
  createTime: string;
}

interface SessionTrack {
  id: number;
  sessionId: number;
  trackId: number;
  sortNo: number;
  djScript: string | null;
  recommendReason: string | null;
  playStatus: string;
  segue: string | null;
}

/**
 * 获取会话信息
 */
export function getSession(sessionId: number): Session | undefined {
  return db.prepare(`
    SELECT
      id,
      user_id AS userId,
      session_title AS sessionTitle,
      scene,
      mood,
      weather_summary AS weatherSummary,
      calendar_summary AS calendarSummary,
      ai_summary AS aiSummary,
      create_time AS createTime
    FROM radio_session
    WHERE id = ?
  `).get(sessionId) as Session | undefined;
}

/**
 * 获取会话中的歌曲列表
 */
export function getSessionTracks(sessionId: number): SessionTrack[] {
  return db.prepare(`
    SELECT
      id,
      session_id AS sessionId,
      track_id AS trackId,
      sort_no AS sortNo,
      dj_script AS djScript,
      recommend_reason AS recommendReason,
      play_status AS playStatus,
      segue
    FROM radio_session_track
    WHERE session_id = ?
    ORDER BY sort_no ASC
  `).all(sessionId) as SessionTrack[];
}

/**
 * 获取会话歌曲详情（含播放地址）
 */
export function getSessionTracksWithDetail(sessionId: number) {
  return db.prepare(`
    SELECT
      st.track_id AS trackId,
      t.source_track_id AS sourceTrackId,
      t.title,
      t.artist,
      t.album,
      t.cover_url AS coverUrl,
      t.play_url AS playUrl,
      t.lyrics,
      st.dj_script AS djScript,
      st.recommend_reason AS recommendReason,
      st.segue,
      TRIM(
        COALESCE(st.segue, '') || ' ' ||
        COALESCE(st.dj_script, '') || ' ' ||
        COALESCE(st.recommend_reason, '')
      ) AS voiceIntro
    FROM radio_session_track st
    JOIN radio_track t ON t.id = st.track_id
    WHERE st.session_id = ?
    ORDER BY st.sort_no ASC
  `).all(sessionId);
}

/**
 * 更新歌曲播放状态
 */
export function updateTrackPlayStatus(sessionId: number, trackId: number, status: string): boolean {
  const result = db.prepare(`
    UPDATE radio_session_track
    SET play_status = ?
    WHERE session_id = ? AND track_id = ?
  `).run(status, sessionId, trackId);
  return result.changes > 0;
}

/**
 * 获取用户最近的会话
 */
export function getRecentSession(userId: number): Session | undefined {
  return db.prepare(`
    SELECT
      id,
      user_id AS userId,
      session_title AS sessionTitle,
      scene,
      mood,
      weather_summary AS weatherSummary,
      calendar_summary AS calendarSummary,
      ai_summary AS aiSummary,
      create_time AS createTime
    FROM radio_session
    WHERE user_id = ?
    ORDER BY create_time DESC
    LIMIT 1
  `).get(userId) as Session | undefined;
}

/**
 * 批量插入会话歌曲（用于队列重排）
 */
export function insertSessionTracks(sessionId: number, tracks: Array<{
  trackId: number;
  sortNo: number;
  djScript?: string | null;
  recommendReason?: string | null;
  segue?: string | null;
}>) {
  const stmt = db.prepare(`
    INSERT INTO radio_session_track (session_id, track_id, sort_no, dj_script, recommend_reason, segue, play_status)
    VALUES (?, ?, ?, ?, ?, ?, 'WAITING')
  `);
  for (const t of tracks) {
    stmt.run(sessionId, t.trackId, t.sortNo, t.djScript || null, t.recommendReason || null, t.segue || null);
  }
}
