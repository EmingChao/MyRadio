import db from './db';
import fs from 'fs';
import path from 'path';

/**
 * 用户画像数据操作层
 */

interface UserProfile {
  id: number;
  userId: number;
  profileName: string;
  favoriteGenres: string | null;
  favoriteArtists: string | null;
  favoriteYears: string | null;
  languagePreference: string | null;
  scenePreference: string | null;
  doNotPlay: string | null;
  lifelongTop: string | null;
  signatures: string | null;
}

/**
 * 获取用户画像（默认画像）
 */
export function getUserProfile(userId: number): UserProfile | undefined {
  return db.prepare(
    'SELECT * FROM radio_user_profile WHERE user_id = ? LIMIT 1'
  ).get(userId) as UserProfile | undefined;
}

/**
 * 更新用户画像中的不喜欢标签
 */
export function appendDoNotPlay(userId: number, tag: string) {
  const existing = getUserProfile(userId);
  if (existing) {
    const current = existing.doNotPlay || '';
    // 避免重复
    if (current.split(',').map(s => s.trim()).includes(tag)) return;
    const updated = current ? `${current},${tag}` : tag;
    db.prepare(`
      UPDATE radio_user_profile
      SET do_not_play = ?, modified_time = datetime('now','localtime')
      WHERE id = ?
    `).run(updated, existing.id);
  } else {
    db.prepare(`
      INSERT INTO radio_user_profile (user_id, profile_name, do_not_play)
      VALUES (?, 'default', ?)
    `).run(userId, tag);
  }
}

/**
 * 更新用户画像中的喜欢风格标签
 */
export function appendFavoriteGenres(userId: number, genre: string) {
  const existing = getUserProfile(userId);
  if (existing) {
    const current = existing.favoriteGenres || '';
    if (current.split(',').map(s => s.trim()).includes(genre)) return;
    const updated = current ? `${current},${genre}` : genre;
    db.prepare(`
      UPDATE radio_user_profile
      SET favorite_genres = ?, modified_time = datetime('now','localtime')
      WHERE id = ?
    `).run(updated, existing.id);
  } else {
    db.prepare(`
      INSERT INTO radio_user_profile (user_id, profile_name, favorite_genres)
      VALUES (?, 'default', ?)
    `).run(userId, genre);
  }
}

/**
 * 根据播放行为自动更新用户画像
 * - 完整播放的歌曲：其 genre 标签加权重，艺人加入最爱
 * - 跳过的歌曲：其 genre 标签记入不喜欢
 */
export function autoUpdateProfile(userId: number, trackId: number, action: 'COMPLETE' | 'SKIP') {
  const track = db.prepare('SELECT genre_tags, mood_tags, artist FROM radio_track WHERE id = ?').get(trackId) as
    | { genre_tags: string | null; mood_tags: string | null; artist: string }
    | undefined;

  if (!track) return;

  if (action === 'COMPLETE') {
    // 完整播放 → 加入喜欢风格
    if (track.genre_tags) {
      const genres = track.genre_tags.split(',').map(s => s.trim()).filter(Boolean);
      for (const genre of genres.slice(0, 3)) {
        appendFavoriteGenres(userId, genre);
      }
    }
    // 完整播放 → 艺人加入最爱列表
    if (track.artist) {
      appendFavoriteArtist(userId, track.artist.split(',')[0].trim());
    }
  }

  // 注意：不自动将跳过的歌曲加入 do_not_play，
  // 因为偶尔跳过不代表不喜欢。只有用户明确表达才记录。
}

/**
 * 向最爱艺人列表追加艺人（带计数）
 */
function appendFavoriteArtist(userId: number, artist: string) {
  const existing = getUserProfile(userId);
  if (!existing) {
    db.prepare(`
      INSERT INTO radio_user_profile (user_id, profile_name, favorite_artists)
      VALUES (?, 'default', ?)
    `).run(userId, JSON.stringify([{ name: artist, count: 1 }]));
    return;
  }

  let artists: Array<{ name: string; count: number }> = [];
  try {
    artists = JSON.parse(existing.favoriteArtists || '[]');
  } catch { artists = []; }

  const found = artists.find(a => a.name === artist);
  if (found) {
    found.count = (found.count || 0) + 1;
  } else {
    artists.push({ name: artist, count: 1 });
  }
  // 保留 top 50
  artists.sort((a, b) => b.count - a.count);
  artists = artists.slice(0, 50);

  db.prepare(`
    UPDATE radio_user_profile
    SET favorite_artists = ?, modified_time = datetime('now','localtime')
    WHERE id = ?
  `).run(JSON.stringify(artists), existing.id);
}

/**
 * 通用字段更新（白名单校验）
 */
const ALLOWED_FIELDS = [
  'favorite_genres', 'favorite_artists', 'favorite_years',
  'language_preference', 'scene_preference', 'do_not_play',
  'lifelong_top', 'signatures',
];

export function updateProfileField(userId: number, field: string, value: string) {
  if (!ALLOWED_FIELDS.includes(field)) {
    throw new Error(`不允许更新字段: ${field}`);
  }

  const existing = getUserProfile(userId);
  if (existing) {
    db.prepare(`
      UPDATE radio_user_profile
      SET ${field} = ?, modified_time = datetime('now','localtime')
      WHERE id = ?
    `).run(value, existing.id);
  } else {
    db.prepare(`
      INSERT INTO radio_user_profile (user_id, profile_name, ${field})
      VALUES (?, 'default', ?)
    `).run(userId, value);
  }
}

/**
 * 获取完整品味画像（DB 动态数据 + taste.json 静态数据合并）
 */
export function getFullProfile(userId: number) {
  const dbProfile = getUserProfile(userId);

  // 读取 taste.json 静态数据
  let tasteJson: any = {};
  try {
    const tastePath = path.resolve(__dirname, '../../data/taste.json');
    if (fs.existsSync(tastePath)) {
      tasteJson = JSON.parse(fs.readFileSync(tastePath, 'utf-8'));
    }
  } catch {}

  const tasteProfile = tasteJson.taste_profile || {};

  // DB 动态数据优先，fallback 到 taste.json
  let favoriteGenres: string[] = [];
  try {
    favoriteGenres = (dbProfile?.favoriteGenres || '').split(',').filter(Boolean);
  } catch {}

  // 合并 taste.json 中的静态偏好
  const signatures: string[] = (() => {
    try {
      if (dbProfile?.signatures) return JSON.parse(dbProfile.signatures);
    } catch {}
    return tasteProfile.signatures || [];
  })();

  const lifelongTop: any[] = (() => {
    try {
      if (dbProfile?.lifelongTop) return JSON.parse(dbProfile.lifelongTop);
    } catch {}
    return tasteProfile.lifelong_top || [];
  })();

  let favoriteArtists: any[] = [];
  try {
    if (dbProfile?.favoriteArtists) {
      favoriteArtists = JSON.parse(dbProfile.favoriteArtists);
    }
  } catch {}
  // 合并 taste.json 的静态艺人数据
  if (favoriteArtists.length === 0 && tasteProfile.favorite_artists) {
    favoriteArtists = tasteProfile.favorite_artists;
  }

  let doNotPlay: string[] = [];
  try {
    doNotPlay = (dbProfile?.doNotPlay || '').split(',').filter(Boolean);
  } catch {}

  return {
    userId,
    signatures,
    favoriteGenres,
    favoriteArtists: favoriteArtists.slice(0, 15),
    lifelongTop: lifelongTop.slice(0, 30),
    doNotPlay,
    byTimeOfDay: tasteProfile.by_time_of_day || {},
    byMood: tasteProfile.by_mood || {},
    byScene: tasteProfile.by_scene || {},
    topArtistsByLibrary: tasteProfile.top_artists_by_library || [],
    playlists: tasteJson.playlists || [],
  };
}
