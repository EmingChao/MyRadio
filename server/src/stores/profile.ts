import db from './db';

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
 * - 完整播放的歌曲：其 genre 标签加权重
 * - 跳过的歌曲：其 genre 标签记入不喜欢
 */
export function autoUpdateProfile(userId: number, trackId: number, action: 'COMPLETE' | 'SKIP') {
  const track = db.prepare('SELECT genre_tags, mood_tags FROM radio_track WHERE id = ?').get(trackId) as
    | { genre_tags: string | null; mood_tags: string | null }
    | undefined;

  if (!track) return;

  if (action === 'COMPLETE' && track.genre_tags) {
    // 完整播放 → 加入喜欢风格
    const genres = track.genre_tags.split(',').map(s => s.trim()).filter(Boolean);
    for (const genre of genres.slice(0, 3)) {
      appendFavoriteGenres(userId, genre);
    }
  }

  // 注意：不自动将跳过的歌曲加入 do_not_play，
  // 因为偶尔跳过不代表不喜欢。只有用户明确表达才记录。
}
