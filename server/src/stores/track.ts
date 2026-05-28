import db from './db';
import type { Track } from '../types';

/**
 * 歌曲数据操作层
 */

/** 查询参数 */
export interface TrackQuery {
  userId: number;
  keyword?: string;
  playlistId?: number;
  liked?: number;
  sourceType?: string;
  page?: number;
  pageSize?: number;
}

/** 分页结果 */
export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 分页查询歌曲
 */
export function queryTracks(params: TrackQuery): PageResult<Track> {
  const { userId, keyword, playlistId, liked, sourceType } = params;
  const page = params.page || 1;
  const pageSize = params.pageSize || 20;
  const offset = (page - 1) * pageSize;

  let where = 'WHERE t.user_id = ?';
  const values: any[] = [userId];

  if (keyword) {
    where += ' AND (t.title LIKE ? OR t.artist LIKE ?)';
    values.push(`%${keyword}%`, `%${keyword}%`);
  }

  if (liked !== undefined) {
    where += ' AND t.liked = ?';
    values.push(liked);
  }

  if (sourceType) {
    where += ' AND t.source_type = ?';
    values.push(sourceType);
  }

  let from = 'FROM radio_track t';
  if (playlistId) {
    from = `FROM radio_track t
      JOIN radio_playlist_track pt ON pt.track_id = t.id AND pt.playlist_id = ?`;
    values.splice(1, 0, playlistId); // 插入到 userId 之后
  }

  const countSql = `SELECT COUNT(*) as total ${from} ${where}`;
  const total = (db.prepare(countSql).get(...values) as { total: number }).total;

  // 修正 offset/limit 的参数位置
  const querySql = `SELECT t.* ${from} ${where} ORDER BY t.id DESC LIMIT ? OFFSET ?`;
  const list = db.prepare(querySql).all(...values, pageSize, offset) as Track[];

  return { list, total, page, pageSize };
}

/**
 * 获取歌曲详情
 */
export function getTrackById(id: number): Track | undefined {
  return db.prepare('SELECT * FROM radio_track WHERE id = ?').get(id) as Track | undefined;
}

/**
 * 更新歌曲标签
 */
export function updateTrackTags(id: number, genreTags: string | null, moodTags: string | null): boolean {
  const result = db.prepare(`
    UPDATE radio_track
    SET genre_tags = ?, mood_tags = ?, modified_time = datetime('now','localtime')
    WHERE id = ?
  `).run(genreTags, moodTags, id);
  return result.changes > 0;
}

/**
 * 更新喜欢状态
 */
export function updateTrackLiked(id: number, liked: number): boolean {
  const result = db.prepare(`
    UPDATE radio_track SET liked = ?, modified_time = datetime('now','localtime')
    WHERE id = ?
  `).run(liked, id);
  return result.changes > 0;
}

/**
 * 记录播放次数
 */
export function incrementPlayCount(id: number): boolean {
  const result = db.prepare(`
    UPDATE radio_track SET play_count = play_count + 1, modified_time = datetime('now','localtime')
    WHERE id = ?
  `).run(id);
  return result.changes > 0;
}

/**
 * 记录跳过次数
 */
export function incrementSkipCount(id: number): boolean {
  const result = db.prepare(`
    UPDATE radio_track SET skipped_count = skipped_count + 1, modified_time = datetime('now','localtime')
    WHERE id = ?
  `).run(id);
  return result.changes > 0;
}

/**
 * 获取歌单列表
 */
export function queryPlaylists(userId: number) {
  return db.prepare(`
    SELECT * FROM radio_playlist WHERE user_id = ? ORDER BY track_count DESC
  `).all(userId);
}

/**
 * 获取歌曲统计
 */
export function getTrackStats(userId: number) {
  const total = (db.prepare('SELECT COUNT(*) as cnt FROM radio_track WHERE user_id = ?').get(userId) as { cnt: number }).cnt;
  const liked = (db.prepare('SELECT COUNT(*) as cnt FROM radio_track WHERE user_id = ? AND liked = 1').get(userId) as { cnt: number }).cnt;
  const playlistCount = (db.prepare('SELECT COUNT(*) as cnt FROM radio_playlist WHERE user_id = ?').get(userId) as { cnt: number }).cnt;
  return { total, liked, playlistCount };
}
