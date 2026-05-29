import { lyric } from 'NeteaseCloudMusicApi';
import db from '../stores/db';
import fs from 'fs';
import path from 'path';

export interface LyricLine {
  time: number; // 秒
  text: string;
}

export interface LyricsData {
  lrc: LyricLine[];
  tlyric?: LyricLine[];
  raw: string;
}

const COOKIE_FILE = path.resolve(__dirname, '../../data/netease-cookie.txt');

/**
 * 读取网易云 cookie
 */
function getCookie(): string | undefined {
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      return fs.readFileSync(COOKIE_FILE, 'utf-8').trim();
    }
  } catch {}
  return undefined;
}

/**
 * 解析 LRC 格式歌词
 * 格式: [mm:ss.xx] text
 */
export function parseLrc(lrcText: string): LyricLine[] {
  if (!lrcText) return [];
  const lines: LyricLine[] = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/;

  for (const rawLine of lrcText.split('\n')) {
    const match = rawLine.match(regex);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const ms = parseInt(match[3], 10);
      const time = min * 60 + sec + ms / (match[3].length === 3 ? 1000 : 100);
      const text = match[4].trim();
      if (text) {
        lines.push({ time, text });
      }
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

/**
 * 获取歌曲歌词（缓存优先）
 */
export async function getTrackLyrics(trackId: number): Promise<LyricsData | null> {
  // 先查缓存
  const track = db.prepare(`SELECT source_track_id, lyrics FROM radio_track WHERE id = ?`).get(trackId) as any;
  if (!track) return null;

  // 如果已有缓存歌词
  if (track.lyrics) {
    return {
      lrc: parseLrc(track.lyrics),
      raw: track.lyrics,
    };
  }

  // 从网易云获取
  if (!track.source_track_id) return null;

  try {
    const cookie = getCookie();
    const res = await lyric({ id: track.source_track_id, cookie } as any);
    const body = res.body || res;

    const lrcText = (body as any).lrc?.lyric || '';
    const tlyricText = (body as any).tlyric?.lyric || '';

    if (!lrcText) return null;

    // 缓存到数据库
    db.prepare(`UPDATE radio_track SET lyrics = ?, modified_time = datetime('now','localtime') WHERE id = ?`).run(lrcText, trackId);

    return {
      lrc: parseLrc(lrcText),
      tlyric: tlyricText ? parseLrc(tlyricText) : undefined,
      raw: lrcText,
    };
  } catch (e: any) {
    console.error(`[Lyrics] 获取歌词失败 trackId=${trackId}:`, e.message);
    return null;
  }
}
