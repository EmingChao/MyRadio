import { personal_fm, recommend_songs, simi_song } from 'NeteaseCloudMusicApi';
import type { Track } from '../types';
import { normalizeCloudSearchSongs, upsertExploreTracks } from './explore';
import db from '../stores/db';
import { compactTrackFactText, normalizeTrackFactText } from '../services/track-facts';

const { playmode_song_vector } = require('NeteaseCloudMusicApi') as any;

interface ScoredCandidate {
  track: Track;
  score: number;
  reason: string;
  sourceScope?: string;
}

interface MergeSourceCandidatesParams {
  libraryScored: ScoredCandidate[];
  dailyScored: ScoredCandidate[];
  similarScored: ScoredCandidate[];
  fmScored?: ScoredCandidate[];
  vectorScored?: ScoredCandidate[];
  exploreScored: ScoredCandidate[];
  limit: number;
}

interface SourceTrackLike {
  id?: number;
  source_track_id?: string | null;
}

interface NeteaseSourceSong {
  sourceTrackId: string;
  title: string;
  artist: string;
  album: string | null;
  releaseYear: number | null;
  coverUrl: string | null;
}

/**
 * 从一组候选里提取相似歌曲的种子，保留高分歌曲并去重。
 */
export function pickNeteaseSimilarSeeds(scored: Array<{ track: SourceTrackLike; score: number }>, limit = 6): string[] {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const seeds: string[] = [];
  const seen = new Set<string>();

  for (const item of sorted) {
    if (seeds.length >= limit) break;
    const id = String(item.track?.source_track_id || item.track?.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    seeds.push(id);
  }

  return seeds;
}

/**
 * 生成云随机/向量续播接口需要的种子 ID 字符串。
 */
export function pickNeteaseVectorSeeds(scored: Array<{ track: SourceTrackLike; score: number }>, limit = 12): string {
  return pickNeteaseSimilarSeeds(scored, limit).join(',');
}

/**
 * 将每日推荐和相似歌曲纳入统一候选池，保留电台感而不是简单拼接。
 */
export function mergeNeteaseSourceCandidates(params: MergeSourceCandidatesParams): ScoredCandidate[] {
  const selected: ScoredCandidate[] = [];
  const seen = new Set<number>();

  const push = (item: ScoredCandidate) => {
    const id = Number(item?.track?.id);
    if (!Number.isFinite(id) || seen.has(id) || selected.length >= params.limit) return;
    seen.add(id);
    selected.push(item);
  };

  const introLibrary = Math.max(3, Math.min(6, params.limit - 4));
  const introDaily = Math.min(2, Math.max(1, Math.floor((params.limit - introLibrary) / 4)));
  const introSimilar = Math.min(2, Math.max(1, Math.floor((params.limit - introLibrary - introDaily) / 3)));
  const introFm = Math.min(1, Math.max(0, params.limit - introLibrary - introDaily - introSimilar - 2));
  const introVector = Math.min(1, Math.max(0, params.limit - introLibrary - introDaily - introSimilar - introFm - 1));
  const introExplore = Math.min(2, Math.max(1, params.limit - introLibrary - introDaily - introSimilar - introFm - introVector));

  params.libraryScored.slice(0, introLibrary).forEach(push);
  params.dailyScored.slice(0, introDaily).forEach(push);
  params.similarScored.slice(0, introSimilar).forEach(push);
  params.fmScored?.slice(0, introFm).forEach(push);
  params.vectorScored?.slice(0, introVector).forEach(push);
  params.exploreScored.slice(0, introExplore).forEach(push);

  params.libraryScored.slice(introLibrary, introLibrary + 8).forEach(push);
  params.dailyScored.slice(introDaily, introDaily + 3).forEach(push);
  params.similarScored.slice(introSimilar, introSimilar + 3).forEach(push);
  params.fmScored?.slice(introFm, introFm + 2).forEach(push);
  params.vectorScored?.slice(introVector, introVector + 2).forEach(push);
  params.exploreScored.slice(introExplore, introExplore + 3).forEach(push);

  params.libraryScored.slice(introLibrary + 8).forEach(push);
  params.dailyScored.slice(introDaily + 3).forEach(push);
  params.similarScored.slice(introSimilar + 3).forEach(push);
  params.fmScored?.slice(introFm + 2).forEach(push);
  params.vectorScored?.slice(introVector + 2).forEach(push);
  params.exploreScored.slice(introExplore + 3).forEach(push);

  return selected.slice(0, params.limit);
}

/**
 * 兼容旧的探索混排入口，保留原有调用点。
 */
export function mergeRadioCandidates(libraryScored: ScoredCandidate[], exploreScored: ScoredCandidate[]): ScoredCandidate[] {
  const selected: ScoredCandidate[] = [];
  const seen = new Set<number>();

  const pushUnique = (item: ScoredCandidate) => {
    const id = Number(item?.track?.id);
    if (!Number.isFinite(id) || seen.has(id)) return;
    seen.add(id);
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
 * 从网易云每日推荐拉取可进入候选池的歌曲。
 */
export async function recallDailyRecommendCandidates(userId: number, limit = 8): Promise<ScoredCandidate[]> {
  try {
    const result = await recommend_songs({});
    const songs = (result as any)?.body?.data?.dailySongs || [];
    const normalized = normalizeCloudSearchSongs(songs).slice(0, limit);
    return upsertSourceTracks(userId, normalized, 'daily', '每日推荐：来自网易云当天推荐');
  } catch (err: any) {
    console.warn('[NeteaseSources] recommend_songs 获取失败:', err.message);
    return [];
  }
}

/**
 * 从某首歌曲拉取相似歌曲候选。
 */
export async function recallSimilarSongCandidates(userId: number, sourceTrackId: string | number, limit = 8): Promise<ScoredCandidate[]> {
  const id = Number(sourceTrackId);
  if (!Number.isFinite(id) || id <= 0) return [];

  try {
    const result = await simi_song({ id, limit });
    const songs = (result as any)?.body?.songs || (result as any)?.body?.data?.songs || [];
    const normalized = normalizeCloudSearchSongs(songs).slice(0, limit);
    return upsertSourceTracks(userId, normalized, 'similar', `相似歌曲：围绕 ${id} 延展出的候选`);
  } catch (err: any) {
    console.warn('[NeteaseSources] simi_song 获取失败:', err.message);
    return [];
  }
}

/**
 * 拉取私人 FM 候选，作为更有发现感的少量来源。
 */
export async function recallPersonalFmCandidates(userId: number, limit = 4): Promise<ScoredCandidate[]> {
  try {
    const result = await personal_fm({});
    const songs = normalizeNeteaseSourceSongs((result as any)?.body?.data || (result as any)?.body?.songs || []);
    return upsertSourceTracks(userId, songs.slice(0, limit), 'fm', '私人 FM：顺着最近听感发现的新候选');
  } catch (err: any) {
    console.warn('[NeteaseSources] personal_fm 获取失败:', err.message);
    return [];
  }
}

/**
 * 使用一批种子歌生成云随机/向量续播候选。
 */
export async function recallVectorSongCandidates(userId: number, seedIds: string, limit = 6): Promise<ScoredCandidate[]> {
  if (!seedIds.trim()) return [];

  try {
    const result = await playmode_song_vector({ ids: seedIds });
    const rawSongs = (result as any)?.body?.data?.songs
      || (result as any)?.body?.data
      || (result as any)?.body?.songs
      || [];
    const songs = normalizeNeteaseSourceSongs(rawSongs);
    return upsertSourceTracks(userId, songs.slice(0, limit), 'vector', '向量续播：顺着这一组歌共同气质延展');
  } catch (err: any) {
    console.warn('[NeteaseSources] playmode_song_vector 获取失败:', err.message);
    return [];
  }
}

/**
 * 将外部来源歌曲写入本地曲库，作为可参与电台排播的候选。
 */
function upsertSourceTracks(
  userId: number,
  songs: NeteaseSourceSong[],
  sourceScope: 'daily' | 'similar' | 'fm' | 'vector',
  reasonHint: string,
): ScoredCandidate[] {
  const existingSourceIds = getExistingSourceIds(userId);
  const stored = upsertExploreTracks({
    userId,
    songs,
    existingSourceIds,
    reasonHint,
  });

  return stored.map(item => ({
    ...item,
    sourceScope,
    reason: compactTrackFactText(normalizeTrackFactText(item.reason), 120) || reasonHint,
  }));
}

/**
 * 兼容不同网易云接口返回的歌曲结构，统一成内部候选结构。
 */
export function normalizeNeteaseSourceSongs(rawPayload: any): NeteaseSourceSong[] {
  const rawSongs = extractNeteaseSongArray(rawPayload);
  return normalizeCloudSearchSongs(rawSongs.map(song => song?.song || song?.data || song));
}

/**
 * 提取网易云接口中可能被 data/songs/list/result 包裹的歌曲数组。
 */
function extractNeteaseSongArray(rawPayload: any): any[] {
  if (Array.isArray(rawPayload)) return rawPayload;
  if (!rawPayload || typeof rawPayload !== 'object') return [];

  const candidates = [
    rawPayload.songs,
    rawPayload.list,
    rawPayload.result,
    rawPayload.data?.songs,
    rawPayload.data?.list,
    rawPayload.data?.result,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  // 个别接口会直接返回单首歌曲对象，这里转成单元素数组继续归一化。
  if (rawPayload.id || rawPayload.song?.id || rawPayload.data?.id) {
    return [rawPayload];
  }

  return [];
}

/**
 * 获取本地已存在的源歌曲 ID，避免重复入库。
 */
function getExistingSourceIds(userId: number): Set<string> {
  const rows = db.prepare(`
    SELECT source_track_id FROM radio_track
    WHERE user_id = ? AND source_track_id IS NOT NULL
  `).all(userId) as Array<{ source_track_id: string }>;

  return new Set(rows.map(row => String(row.source_track_id)));
}
