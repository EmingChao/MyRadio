import fs from 'fs';
import path from 'path';
import db from '../stores/db';
import { comment_music, lyric, song_detail, song_wiki_summary } from 'NeteaseCloudMusicApi';
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

interface RuntimeLoggerLike {
  info(scope: string, title: string, message?: string, extra?: { durationMs?: number; meta?: Record<string, any>; detail?: any }): void;
  success(scope: string, title: string, message?: string, extra?: { durationMs?: number; meta?: Record<string, any>; detail?: any }): void;
  warn(scope: string, title: string, message?: string, extra?: { durationMs?: number; meta?: Record<string, any>; detail?: any }): void;
  error(scope: string, title: string, message?: string, extra?: { durationMs?: number; meta?: Record<string, any>; detail?: any }): void;
}

interface ListenerCommentLike {
  content?: string | null;
  likedCount?: number | null;
  liked_count?: number | null;
}

const LISTENER_IMPRESSION_THEMES = [
  { label: '深夜', keywords: ['深夜', '夜里', '凌晨', '半夜', '晚上', '夜晚'] },
  { label: '雨天', keywords: ['雨天', '下雨', '雨声', '雨夜'] },
  { label: '独处', keywords: ['一个人', '独处', '孤独', '自己听'] },
  { label: '通勤', keywords: ['下班', '上班', '地铁', '公交', '路上', '走在路上'] },
  { label: '回忆', keywords: ['回忆', '想起', '以前', '青春', '那年', '过去'] },
  { label: '释怀', keywords: ['释怀', '放下', '和解', '慢慢好', '不难过'] },
  { label: '失恋', keywords: ['失恋', '分手', '错过', '前任'] },
  { label: '治愈', keywords: ['治愈', '安慰', '被抱住', '温暖'] },
  { label: '安静', keywords: ['安静', '平静', '静下来', '放空'] },
  { label: '现场感', keywords: ['现场', 'live', '演唱会'] },
  { label: '循环播放', keywords: ['单曲循环', '循环', '反复听'] },
];

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
 * 从网易云评论中提炼听众印象，保留真实共鸣主题，但不把原评论原样塞进独白。
 */
export function buildListenerImpressionSummary(comments: ListenerCommentLike[]): string {
  const usableComments = comments
    .map(comment => ({
      content: cleanListenerComment(comment.content),
      likedCount: Number(comment.likedCount ?? comment.liked_count ?? 0),
    }))
    .filter(comment => isUsableListenerComment(comment.content))
    .sort((a, b) => b.likedCount - a.likedCount)
    .slice(0, 12);

  if (usableComments.length === 0) return '';

  const themeScores = LISTENER_IMPRESSION_THEMES.map(theme => {
    const score = usableComments.reduce((sum, comment) => {
      const hitCount = theme.keywords.filter(keyword => comment.content.includes(keyword)).length;
      return sum + hitCount * (1 + Math.log10(Math.max(1, comment.likedCount + 1)));
    }, 0);
    return { label: theme.label, score };
  })
    .filter(theme => theme.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(theme => theme.label);

  if (themeScores.length > 0) {
    return compactTrackFactText(`听众反馈集中在${themeScores.join('、')}，常把它当作一段能安放情绪的歌。`, 86);
  }

  // 没有命中稳定主题时，只保留最能代表评论语气的短片段，并继续清理隐私和平台噪声。
  const representative = usableComments
    .slice(0, 3)
    .map(comment => compactTrackFactText(comment.content, 18))
    .join('、');
  return compactTrackFactText(`听众评论更常提到${representative}。`, 86);
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
export async function enrichTracksWithFacts<T extends { track: Track }>(scored: T[], limit = MAX_FACT_FETCH_COUNT, runLog?: RuntimeLoggerLike): Promise<T[]> {
  const selected = scored
    .map(item => item.track)
    .filter(track => track?.id && track.source_track_id)
    .slice(0, limit);

  if (selected.length === 0) return scored;

  await ensureTrackFacts(selected, runLog);
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
export async function ensureTrackFacts(tracks: TrackWithSource[], runLog?: RuntimeLoggerLike): Promise<void> {
  const targets = tracks
    .filter(track => track.source_track_id && Number.isFinite(Number(track.source_track_id)))
    .slice(0, MAX_FACT_FETCH_COUNT);
  if (targets.length === 0) return;

  const existing = getTrackFactsForTracks(targets);
  const missing = targets.filter(track => {
    const fact = existing.get(track.id);
    return fact?.fact_status !== 'READY' || !normalizeTrackFactText(fact.comment_summary);
  });
  if (missing.length === 0) return;

  const cookie = loadNeteaseCookie();
  if (!cookie) {
    runLog?.warn('netease', '跳过歌曲事实增强', '未找到网易云 cookie，无法调用歌曲详情/百科/评论接口');
    upsertFactStatus(missing, 'SKIPPED_NO_COOKIE');
    return;
  }

  const factStart = Date.now();
  runLog?.info('netease', '开始补充歌曲事实', `准备处理 ${missing.length} 首，包含 song_detail、song_wiki_summary、lyric、comment_music`);
  const detailMap = await fetchSongDetails(missing, cookie);
  runLog?.success('netease', 'song_detail 完成', `成功返回 ${detailMap.size}/${missing.length} 首详情`);
  for (const track of missing) {
    const sourceTrackId = String(track.source_track_id);
    const currentFact = existing.get(track.id);
    const detail = detailMap.get(sourceTrackId);
    let wikiSummary = normalizeTrackFactText(currentFact?.wiki_summary);
    let lyricSummary = normalizeTrackFactText(currentFact?.lyric_summary);
    let commentSummary = normalizeTrackFactText(currentFact?.comment_summary);
    const musicQualitySummary = buildMusicQualitySummary(detail) || normalizeTrackFactText(currentFact?.music_quality_summary);

    try {
      const start = Date.now();
      wikiSummary = await fetchWikiSummary(sourceTrackId, cookie);
      runLog?.success('netease', 'song_wiki_summary 完成', `歌曲 ${sourceTrackId} 百科摘要 ${wikiSummary ? '可用' : '为空'}`, { durationMs: Date.now() - start });
    } catch (err: any) {
      console.warn(`[TrackFacts] song_wiki_summary 获取失败 id=${sourceTrackId}:`, err.message);
      runLog?.warn('netease', 'song_wiki_summary 失败', `歌曲 ${sourceTrackId}: ${err.message}`);
    }

    try {
      const start = Date.now();
      lyricSummary = await fetchLyricSummary(sourceTrackId, cookie);
      runLog?.success('netease', 'lyric 完成', `歌曲 ${sourceTrackId} 歌词摘要 ${lyricSummary ? '可用' : '为空'}`, { durationMs: Date.now() - start });
    } catch (err: any) {
      console.warn(`[TrackFacts] lyric 获取失败 id=${sourceTrackId}:`, err.message);
      runLog?.warn('netease', 'lyric 失败', `歌曲 ${sourceTrackId}: ${err.message}`);
    }

    try {
      const start = Date.now();
      commentSummary = await fetchListenerImpressionSummary(sourceTrackId, cookie);
      runLog?.success('netease', 'comment_music 完成', `歌曲 ${sourceTrackId} 听众印象 ${commentSummary ? '可用' : '为空'}`, { durationMs: Date.now() - start });
    } catch (err: any) {
      console.warn(`[TrackFacts] comment_music 获取失败 id=${sourceTrackId}:`, err.message);
      runLog?.warn('netease', 'comment_music 失败', `歌曲 ${sourceTrackId}: ${err.message}`);
    }

    upsertTrackFact({
      trackId: track.id,
      sourceTrackId,
      detailJson: detail ? JSON.stringify(detail) : currentFact?.detail_json || null,
      wikiSummary,
      lyricSummary,
      commentSummary,
      musicQualitySummary,
      factStatus: 'READY',
    });
  }
  runLog?.success('netease', '歌曲事实增强完成', `完成 ${missing.length} 首，耗时 ${Date.now() - factStart}ms`, { durationMs: Date.now() - factStart });
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
 * 获取歌曲评论并提炼成听众印象摘要。
 */
async function fetchListenerImpressionSummary(sourceTrackId: string, cookie: string): Promise<string> {
  const result = await comment_music({ id: sourceTrackId, limit: 30, cookie });
  const body = (result as any).body || {};
  const comments = [
    ...(Array.isArray(body.hotComments) ? body.hotComments : []),
    ...(Array.isArray(body.comments) ? body.comments : []),
  ];
  return buildListenerImpressionSummary(comments);
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
  commentSummary: string;
  musicQualitySummary: string;
  factStatus: string;
}) {
  db.prepare(`
    INSERT INTO radio_track_fact
    (track_id, source_track_id, detail_json, wiki_summary, lyric_summary, comment_summary, music_quality_summary, fact_status, last_fetch_time, modified_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))
    ON CONFLICT(track_id) DO UPDATE SET
      source_track_id = excluded.source_track_id,
      detail_json = excluded.detail_json,
      wiki_summary = excluded.wiki_summary,
      lyric_summary = excluded.lyric_summary,
      comment_summary = excluded.comment_summary,
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
    params.commentSummary || null,
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
 * 清理评论内容，去掉链接、@、话题和平台表情等不适合进入 DJ 事实卡的信息。
 */
function cleanListenerComment(text: string | null | undefined): string {
  return normalizeTrackFactText(text)
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/@\S+/g, ' ')
    .replace(/#([^#]{1,30})#/g, '$1')
    .replace(/\[[^\]]{1,12}\]/g, ' ')
    .replace(/[~～]{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 判断评论是否有足够的信息密度，过滤求赞、打卡、链接和过短泛评。
 */
function isUsableListenerComment(text: string): boolean {
  if (text.length < 8 || text.length > 120) return false;
  if (/求赞|互赞|点赞|沙发|第一|打卡|路过|好听$|^好听|网易云|http|@\S+/i.test(text)) return false;
  if (/^([哈啊呀哇呜哦嗯嘻嘿]{1,3})+$/.test(text)) return false;
  if (new Set(text.replace(/\s/g, '').split('')).size <= 3) return false;
  return /[\u4e00-\u9fa5a-zA-Z]/.test(text);
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
