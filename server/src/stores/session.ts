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

interface RecentSessionOptions {
  createdAfter?: string;
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
export function getRecentSession(userId: number, options: RecentSessionOptions = {}): Session | undefined {
  const createdAfter = normalizeSentence(options.createdAfter);
  const createTimeFilter = createdAfter ? 'AND create_time >= ?' : '';
  const params = createdAfter ? [userId, createdAfter] : [userId];
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
      ${createTimeFilter}
    ORDER BY create_time DESC
    LIMIT 1
  `).get(...params) as Session | undefined;
}

/**
 * 判断某个 session 是否属于本次服务启动后的可恢复会话。
 */
export function shouldRestoreSessionCreatedInCurrentBoot(sessionCreateTime: string, serviceStartedAt: string): boolean {
  const createTime = normalizeSentence(sessionCreateTime);
  const bootTime = normalizeSentence(serviceStartedAt);
  if (!createTime || !bootTime) return false;
  return createTime >= bootTime;
}

/**
 * 把 JS Date 格式化为 SQLite datetime('now','localtime') 一致的本地时间格式。
 */
export function formatSqliteLocalDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const hour = padDatePart(date.getHours());
  const minute = padDatePart(date.getMinutes());
  const second = padDatePart(date.getSeconds());
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * 日期字段补零，保证字符串比较和 SQLite 时间格式一致。
 */
function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * 清理可选字符串，避免空值进入 SQL 条件。
 */
function normalizeSentence(text: string | undefined): string {
  return text?.trim() || '';
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
