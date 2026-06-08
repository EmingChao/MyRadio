import fs from 'fs';
import path from 'path';
import db from '../stores/db';
import { lyric, song_detail, song_wiki_summary } from 'NeteaseCloudMusicApi';
import type { Track } from '../types';

const COOKIE_FILE = path.resolve(__dirname, '../../data/netease-cookie.txt');
const MAX_FACT_FETCH_COUNT = 24;

export interface TrackFactRow {
  id?: number;
  track_id?: number;
  source_track_id?: string;
  detail_json?: string | null;
  wiki_summary?: string | null;
  lyric_summary?: string | null;
  comment_summary?: string | null;
  music_quality_summary?: string | null;
  fact_status?: string | null;
  last_fetch_time?: string | null;
}

export interface PromptSongFacts {
  alias?: string[];
  wiki?: string;
  lyricTheme?: string;
  listenerImpression?: string;
  musicDetail?: string;
}

interface TrackWithSource {
  id: number;
  source_track_id?: string | null;
}

/**
 * 清理事实文本，避免换行和多余空白进入模型上下文。
 */
export function normalizeTrackFactText(text: string | null | undefined): string {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .trim();
}

/**
 * 将长文本压缩到适合 prompt 的长度，保留完整语义而不是粗暴透传原始内容。
 */
export function compactTrackFactText(text: string | null | undefined, maxLength: number): string {
  const normalized = normalizeTrackFactText(text);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

/**
 * 将缓存中的歌曲事实整理成给模型使用的短事实卡。
 */
export function buildSongFactsForPrompt(fact?: TrackFactRow | null): PromptSongFacts | undefined {
  if (!fact) return undefined;

  const alias = extractAliasFromDetail(fact.detail_json).slice(0, 3);
  const wiki = compactTrackFactText(fact.wiki_summary, 120);
  const lyricTheme = compactTrackFactText(stripMusicCreditMetadata(fact.lyric_summary), 80);
  const listenerImpression = compactTrackFactText(fact.comment_summary, 80);
  const musicDetail = compactTrackFactText(fact.music_quality_summary, 60);

  const facts: PromptSongFacts = {};
  if (alias.length > 0) facts.alias = alias;
  if (wiki) facts.wiki = wiki;
  if (lyricTheme) facts.lyricTheme = lyricTheme;
  if (listenerImpression) facts.listenerImpression = listenerImpression;
  if (musicDetail) facts.musicDetail = musicDetail;

  return Object.keys(facts).length > 0 ? facts : undefined;
}

/**
 * 从歌词主题摘要中剔除作词、作曲、编曲、制作人等职员表元数据。
 */
function stripMusicCreditMetadata(text: string | null | undefined): string {
  let cleaned = normalizeTrackFactText(text);
  if (!cleaned) return '';

  const creditLabel = '(?:作词|作曲|编曲|制作人|配唱制作人|和声编写|录音|录音师|混音|混音工程师|母带|母带处理工程师|出品人|监制|OP|SP)';
  const nextCreditOrLyric = `(?=${creditLabel}\\s*[:：]|(?:真正的歌词|歌词(?:围绕|把|里|写|讲)|这首歌|主题)|$)`;
  const creditPattern = new RegExp(`${creditLabel}\\s*[:：]\\s*[\\s\\S]*?${nextCreditOrLyric}`, 'gi');

  cleaned = cleaned.replace(creditPattern, ' ');
  return normalizeTrackFactText(cleaned);
}

/**
 * 为一组候选歌曲补齐本地事实缓存，避免模型只能根据歌名套模板。
 */
export async function enrichTracksWithFacts<T extends { track: Track }>(scored: T[], limit = MAX_FACT_FETCH_COUNT): Promise<T[]> {
  const selected = scored
    .map(item => item.track)
    .filter(track => track?.id && track.source_track_id)
    .slice(0, limit);

  if (selected.length === 0) return scored;

  await ensureTrackFacts(selected);
  const facts = getTrackFactsForTracks(selected);

  for (const item of scored) {
    const fact = facts.get(item.track.id);
    if (fact) {
      (item.track as any).track_fact = fact;
    }
  }

  return scored;
}

/**
 * 确保候选歌曲已有事实缓存；已完成的缓存不会重复请求。
 */
export async function ensureTrackFacts(tracks: TrackWithSource[]): Promise<void> {
  const targets = tracks
    .filter(track => track.source_track_id && Number.isFinite(Number(track.source_track_id)))
    .slice(0, MAX_FACT_FETCH_COUNT);
  if (targets.length === 0) return;

  const existing = getTrackFactsForTracks(targets);
  const missing = targets.filter(track => existing.get(track.id)?.fact_status !== 'READY');
  if (missing.length === 0) return;

  const cookie = loadNeteaseCookie();
  if (!cookie) {
    upsertFactStatus(missing, 'SKIPPED_NO_COOKIE');
    return;
  }

  const detailMap = await fetchSongDetails(missing, cookie);
  for (const track of missing) {
    const sourceTrackId = String(track.source_track_id);
    const detail = detailMap.get(sourceTrackId);
    let wikiSummary = '';
    let lyricSummary = '';

    try {
      wikiSummary = await fetchWikiSummary(sourceTrackId, cookie);
    } catch (err: any) {
      console.warn(`[TrackFacts] song_wiki_summary 获取失败 id=${sourceTrackId}:`, err.message);
    }

    try {
      lyricSummary = await fetchLyricSummary(sourceTrackId, cookie);
    } catch (err: any) {
      console.warn(`[TrackFacts] lyric 获取失败 id=${sourceTrackId}:`, err.message);
    }

    upsertTrackFact({
      trackId: track.id,
      sourceTrackId,
      detailJson: detail ? JSON.stringify(detail) : null,
      wikiSummary,
      lyricSummary,
      musicQualitySummary: buildMusicQualitySummary(detail),
      factStatus: 'READY',
    });
  }
}

/**
 * 读取歌曲事实缓存，按内部 trackId 返回。
 */
export function getTrackFactsForTracks(tracks: TrackWithSource[]): Map<number, TrackFactRow> {
  const ids = tracks.map(track => track.id).filter(Boolean);
  if (ids.length === 0) return new Map();

  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT * FROM radio_track_fact
    WHERE track_id IN (${placeholders})
  `).all(...ids) as TrackFactRow[];

  return new Map(rows.map(row => [Number(row.track_id), row]));
}

/**
 * 批量获取网易云歌曲详情。
 */
async function fetchSongDetails(tracks: TrackWithSource[], cookie: string): Promise<Map<string, any>> {
  const ids = tracks.map(track => String(track.source_track_id)).filter(Boolean);
  if (ids.length === 0) return new Map();

  try {
    const result = await song_detail({ ids: ids.join(','), cookie });
    const songs = ((result as any).body?.songs || []) as any[];
    return new Map(songs.map(song => [String(song.id), song]));
  } catch (err: any) {
    console.warn('[TrackFacts] song_detail 批量获取失败:', err.message);
    return new Map();
  }
}

/**
 * 获取并压缩歌曲百科摘要。
 */
async function fetchWikiSummary(sourceTrackId: string, cookie: string): Promise<string> {
  const result = await song_wiki_summary({ id: sourceTrackId, cookie });
  const body = (result as any).body;
  return compactTrackFactText(findFirstText(body, ['summary', 'text', 'content', 'desc', 'description']), 300);
}

/**
 * 获取歌词并提炼成短主题摘要。
 */
async function fetchLyricSummary(sourceTrackId: string, cookie: string): Promise<string> {
  const result = await lyric({ id: sourceTrackId, cookie });
  const rawLyric = (result as any).body?.lrc?.lyric || '';
  const cleanLyric = rawLyric
    .split('\n')
    .map((line: string) => line.replace(/\[[^\]]+\]/g, '').trim())
    .filter(Boolean)
    .slice(0, 18)
    .join(' ');
  return compactTrackFactText(cleanLyric, 220);
}

/**
 * 更新事实缓存。
 */
function upsertTrackFact(params: {
  trackId: number;
  sourceTrackId: string;
  detailJson: string | null;
  wikiSummary: string;
  lyricSummary: string;
  musicQualitySummary: string;
  factStatus: string;
}) {
  db.prepare(`
    INSERT INTO radio_track_fact
    (track_id, source_track_id, detail_json, wiki_summary, lyric_summary, music_quality_summary, fact_status, last_fetch_time, modified_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))
    ON CONFLICT(track_id) DO UPDATE SET
      source_track_id = excluded.source_track_id,
      detail_json = excluded.detail_json,
      wiki_summary = excluded.wiki_summary,
      lyric_summary = excluded.lyric_summary,
      music_quality_summary = excluded.music_quality_summary,
      fact_status = excluded.fact_status,
      last_fetch_time = excluded.last_fetch_time,
      modified_time = excluded.modified_time
  `).run(
    params.trackId,
    params.sourceTrackId,
    params.detailJson,
    params.wikiSummary || null,
    params.lyricSummary || null,
    params.musicQualitySummary || null,
    params.factStatus,
  );
}

/**
 * 没有登录态时记录跳过状态，避免同一批歌曲反复尝试。
 */
function upsertFactStatus(tracks: TrackWithSource[], status: string) {
  const stmt = db.prepare(`
    INSERT INTO radio_track_fact
    (track_id, source_track_id, fact_status, last_fetch_time, modified_time)
    VALUES (?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))
    ON CONFLICT(track_id) DO UPDATE SET
      fact_status = excluded.fact_status,
      last_fetch_time = excluded.last_fetch_time,
      modified_time = excluded.modified_time
  `);

  const transaction = db.transaction(() => {
    for (const track of tracks) {
      stmt.run(track.id, String(track.source_track_id || ''), status);
    }
  });
  transaction();
}

/**
 * 从歌曲详情中抽取别名。
 */
function extractAliasFromDetail(detailJson?: string | null): string[] {
  if (!detailJson) return [];
  try {
    const detail = JSON.parse(detailJson);
    return Array.isArray(detail.alia)
      ? detail.alia.map((item: any) => normalizeTrackFactText(item)).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

/**
 * 生成可播放和热度相关的短摘要。
 */
function buildMusicQualitySummary(detail: any): string {
  if (!detail) return '';
  const parts: string[] = [];
  if (typeof detail.pop === 'number') parts.push(`热度 ${Math.round(detail.pop)}`);
  if (detail.dt) parts.push(`时长约 ${Math.round(Number(detail.dt) / 1000)} 秒`);
  return parts.join('，');
}

/**
 * 读取网易云 cookie，兼容新旧两个文件名。
 */
function loadNeteaseCookie(): string {
  const candidates = [
    COOKIE_FILE,
    path.resolve(__dirname, '../../../data/.netease-cookie'),
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf-8').trim();
  }
  return '';
}

/**
 * 在未知返回结构中查找最可能的文本字段。
 */
function findFirstText(value: any, keys: string[]): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstText(item, keys);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';

  for (const key of keys) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key];
  }

  for (const item of Object.values(value)) {
    const found = findFirstText(item, keys);
    if (found) return found;
  }

  return '';
}
