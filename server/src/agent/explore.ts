import fs from 'fs';
import path from 'path';
import { cloudsearch } from 'NeteaseCloudMusicApi';
import db from '../stores/db';
import type { Track } from '../types';

interface ExploreContext {
  scene?: string;
  mood?: string;
  musicProfile?: Record<string, any>;
  limit?: number;
}

interface ExploreSong {
  sourceTrackId: string;
  title: string;
  artist: string;
  album: string | null;
  releaseYear: number | null;
  coverUrl: string | null;
}

interface ExploreTrackDb {
  prepare(sql: string): {
    get?: (...args: any[]) => any;
    run?: (...args: any[]) => any;
  };
}

interface UpsertExploreParams {
  userId: number;
  songs: ExploreSong[];
  existingSourceIds: Set<string>;
  db?: ExploreTrackDb;
  reasonHint?: string;
}

interface ExploreCandidate {
  track: Track;
  score: number;
  reason: string;
  sourceScope: 'explore';
}

const COOKIE_FILE = path.resolve(__dirname, '../../data/netease-cookie.txt');

/**
 * 主动探索网易云新歌候选，并写入本地曲库供电台统一排播。
 */
export async function recallExploreCandidates(userId: number, ctx: ExploreContext): Promise<ExploreCandidate[]> {
  if (!fs.existsSync(COOKIE_FILE)) {
    console.warn('[Explore] 无网易云 cookie，跳过主动探索推荐');
    return [];
  }

  const queries = buildExploreQueries(ctx);
  if (queries.length === 0) return [];

  const cookie = fs.readFileSync(COOKIE_FILE, 'utf-8').trim();
  const existingSourceIds = getExistingSourceIds(userId);
  const candidates: ExploreCandidate[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    if (candidates.length >= (ctx.limit || 8)) break;

    try {
      // 每组关键词只取少量结果，避免探索歌曲压过用户原有曲库。
      const result = await cloudsearch({ keywords: query, type: 1, limit: 6, offset: 0, cookie });
      const rawSongs = (result as any)?.body?.result?.songs || [];
      const songs = normalizeCloudSearchSongs(rawSongs)
        .filter(song => !seen.has(song.sourceTrackId));

      songs.forEach(song => seen.add(song.sourceTrackId));
      const stored = upsertExploreTracks({
        userId,
        songs,
        existingSourceIds,
        reasonHint: `主动探索：${query}`,
      });
      candidates.push(...stored);
    } catch (err: any) {
      console.warn(`[Explore] 搜索失败 query=${query}:`, err.message);
    }
  }

  return candidates.slice(0, ctx.limit || 8);
}

/**
 * 根据用户画像、场景和心情生成探索搜索词。
 */
export function buildExploreQueries(ctx: ExploreContext): string[] {
  const profile = ctx.musicProfile || {};
  const scene = ctx.scene || '';
  const mood = ctx.mood || '';
  const signatures = asStringArray(profile.signatures);
  const favoriteArtists = asStringArray(profile.favoriteArtists).slice(0, 4);
  const topArtists = asStringArray(profile.topArtistsByLibrary).slice(0, 3);
  const lifelongTop = asStringArray(profile.lifelongTop).slice(0, 3);

  const queries = [
    ...favoriteArtists.map(artist => `${artist} ${mood || scene}`.trim()),
    ...topArtists.map(artist => `${artist} 相似 ${mood || '推荐'}`.trim()),
    ...signatures.map(signature => `${signature} ${mood || scene || '私人电台'}`.trim()),
    ...lifelongTop.map(item => `${item.split('-')[0].trim()} 相似歌曲`),
    [scene, mood, signatures[0]].filter(Boolean).join(' '),
  ];

  return Array.from(new Set(queries.map(q => q.trim()).filter(q => q.length >= 2)))
    .slice(0, ctx.limit || 8);
}

/**
 * 将网易云 cloudsearch 返回体标准化成内部歌曲结构。
 */
export function normalizeCloudSearchSongs(rawSongs: any[]): ExploreSong[] {
  return rawSongs
    .map(song => {
      const artists = Array.isArray(song.ar)
        ? song.ar.map((a: any) => a?.name).filter(Boolean).join(', ')
        : '';
      const releaseYear = song.publishTime && song.publishTime > 0
        ? new Date(song.publishTime).getFullYear()
        : null;

      return {
        sourceTrackId: String(song.id || ''),
        title: song.name || '',
        artist: artists || '未知艺人',
        album: song.al?.name || null,
        releaseYear,
        coverUrl: song.al?.picUrl || null,
      };
    })
    .filter(song => song.sourceTrackId && song.title);
}

/**
 * 将探索歌曲写入 radio_track，并返回可参与后续排播的候选。
 */
export function upsertExploreTracks(params: UpsertExploreParams): ExploreCandidate[] {
  const trackDb = params.db || db;
  const selectTrack = trackDb.prepare('SELECT * FROM radio_track WHERE user_id = ? AND source_track_id = ?');
  const insertTrack = trackDb.prepare(`
    INSERT INTO radio_track
    (user_id, title, artist, album, release_year, genre_tags, mood_tags,
     source_type, source_track_id, cover_url, play_url, play_count, liked)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'NETEASE_EXPLORE', ?, ?, NULL, 0, 0)
  `);

  const stored: ExploreCandidate[] = [];
  for (const song of params.songs) {
    if (params.existingSourceIds.has(song.sourceTrackId)) continue;

    const existing = selectTrack.get?.(params.userId, song.sourceTrackId) as Track | undefined;
    let track = existing;

    if (!track) {
      const result = insertTrack.run?.(
        params.userId,
        song.title,
        song.artist,
        song.album,
        song.releaseYear,
        null,
        null,
        song.sourceTrackId,
        song.coverUrl,
      );
      track = selectTrack.get?.(params.userId, song.sourceTrackId) as Track | undefined;

      // 测试桩没有完整 SQLite 查询能力时，使用 lastInsertRowid 构造返回对象。
      if (!track && result?.lastInsertRowid) {
        track = {
          id: Number(result.lastInsertRowid),
          user_id: params.userId,
          title: song.title,
          artist: song.artist,
          album: song.album,
          release_year: song.releaseYear,
          genre_tags: null,
          mood_tags: null,
          source_type: 'NETEASE_EXPLORE',
          source_track_id: song.sourceTrackId,
          cover_url: song.coverUrl,
          play_url: null,
          play_count: 0,
          liked: 0,
          skipped_count: 0,
          create_time: '',
          modified_time: '',
          create_user_no: null,
          modified_user_no: null,
        };
      }
    }

    if (track) {
      params.existingSourceIds.add(song.sourceTrackId);
      stored.push({
        track,
        score: 18,
        reason: params.reasonHint || '主动探索：根据你的品味延展推荐的新歌',
        sourceScope: 'explore',
      });
    }
  }

  return stored;
}

/**
 * 获取用户本地已有歌曲的源 ID，用于避免探索推荐重复入库。
 */
function getExistingSourceIds(userId: number): Set<string> {
  const rows = db.prepare(`
    SELECT source_track_id FROM radio_track
    WHERE user_id = ? AND source_track_id IS NOT NULL
  `).all(userId) as Array<{ source_track_id: string }>;

  return new Set(rows.map(row => String(row.source_track_id)));
}

/**
 * 将画像字段转成字符串数组，兼容对象数组和字符串数组。
 */
function asStringArray(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => typeof item === 'string' ? item : item?.name || item?.title)
    .filter(Boolean)
    .map(String);
}
