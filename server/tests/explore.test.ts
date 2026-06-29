import assert from 'node:assert/strict';
import {
  buildExploreQueries,
  normalizeCloudSearchSongs,
  upsertExploreTracks,
} from '../src/agent/explore';

const profile = {
  signatures: ['英伦摇滚', '夜晚电子'],
  favoriteArtists: ['Radiohead', 'M83'],
  topArtistsByLibrary: ['陈奕迅'],
  lifelongTop: ['Midnight City - M83'],
  doNotPlay: ['吵闹金属'],
};

const queries = buildExploreQueries({
  scene: 'coding',
  mood: '专注',
  musicProfile: profile,
  limit: 4,
});

assert.ok(queries.length >= 3, '探索推荐需要生成多组搜索关键词');
assert.ok(queries.some(q => q.includes('专注') || q.includes('coding')), '搜索关键词需要结合当前场景或心情');
assert.ok(queries.some(q => q.includes('Radiohead') || q.includes('M83')), '搜索关键词需要结合用户偏好的艺人');
assert.equal(new Set(queries).size, queries.length, '搜索关键词需要去重');

const songs = normalizeCloudSearchSongs([
  {
    id: 101,
    name: 'Everything In Its Right Place',
    ar: [{ name: 'Radiohead' }],
    al: { name: 'Kid A', picUrl: 'https://example.com/kid-a.jpg' },
    publishTime: 968515200000,
  },
  {
    id: 102,
    name: 'Bad Song',
    ar: [],
    al: {},
  },
]);

assert.equal(songs[0].sourceTrackId, '101');
assert.equal(songs[0].artist, 'Radiohead');
assert.equal(songs[0].releaseYear, 2000);
assert.equal(songs[0].album, 'Kid A');

const collaborationSongs = normalizeCloudSearchSongs([
  {
    id: 103,
    name: '合作歌曲',
    artists: [{ name: '歌手甲' }, { name: '歌手乙' }],
    album: { name: '合作专辑', picUrl: 'https://example.com/collab.jpg' },
    publishTime: 1700000000000,
  },
]);

assert.equal(collaborationSongs[0].artist, '歌手甲, 歌手乙', 'artists 结构里的合作艺人需要完整展示');
assert.equal(collaborationSongs[0].album, '合作专辑', 'album 结构里的专辑名需要被兼容');
assert.equal(collaborationSongs[0].coverUrl, 'https://example.com/collab.jpg', 'album 结构里的封面需要被兼容');

const stored = upsertExploreTracks({
  userId: 7,
  songs,
  existingSourceIds: new Set(['102']),
  db: createMemoryTrackDb(),
});

assert.equal(stored.length, 1, '已在本地曲库中的搜索结果不应重复入库');
assert.equal(stored[0].track.source_type, 'NETEASE_EXPLORE');
assert.equal(stored[0].reason.includes('主动探索'), true, '探索候选需要带上可解释的推荐来源');
assert.equal(stored[0].track.title, 'Everything In Its Right Place');

console.log('explore tests passed');

function createMemoryTrackDb() {
  let nextId = 1;
  const rows: any[] = [];

  return {
    prepare(sql: string) {
      if (sql.includes('SELECT * FROM radio_track WHERE user_id = ? AND source_track_id = ?')) {
        return {
          get(userId: number, sourceTrackId: string) {
            return rows.find(row => row.user_id === userId && row.source_track_id === sourceTrackId);
          },
        };
      }

      if (sql.includes('INSERT INTO radio_track')) {
        return {
          run(
            userId: number,
            title: string,
            artist: string,
            album: string | null,
            releaseYear: number | null,
            genreTags: string | null,
            moodTags: string | null,
            sourceTrackId: string,
            coverUrl: string | null,
          ) {
            const row = {
              id: nextId++,
              user_id: userId,
              title,
              artist,
              artists: artist,
              album,
              release_year: releaseYear,
              genre_tags: genreTags,
              mood_tags: moodTags,
              source_type: 'NETEASE_EXPLORE',
              source_track_id: sourceTrackId,
              cover_url: coverUrl,
              play_url: null,
              play_count: 0,
              liked: 0,
              skipped_count: 0,
            };
            rows.push(row);
            return { lastInsertRowid: row.id };
          },
        };
      }

      throw new Error(`未覆盖的 SQL: ${sql}`);
    },
  };
}
