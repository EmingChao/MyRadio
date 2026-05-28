import db from '../stores/db';
import fs from 'fs';
import path from 'path';
import type { NeteasePlaylist, NeteaseTrack } from '../types';

/**
 * 从 netease-export.json 导入数据到 SQLite
 */
function importNeteaseData() {
  const exportPath = path.resolve(__dirname, '../../../data/netease-export.json');

  if (!fs.existsSync(exportPath)) {
    console.error('找不到导出文件:', exportPath);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
  const userId = data.userId;
  const playlists: NeteasePlaylist[] = data.playlists;
  const likedSongIds: number[] = data.likedSongIds || [];
  const dailyRecommend: NeteaseTrack[] = data.dailyRecommend || [];
  const topRecords = data.topRecords || { allTime: [], recentWeek: [] };
  const recentPlays: NeteaseTrack[] = data.recentPlays || [];

  console.log(`开始导入，用户ID: ${userId}`);
  console.log(`歌单: ${playlists.length}，喜欢: ${likedSongIds.length}，每日推荐: ${dailyRecommend.length}`);

  // 收集所有去重歌曲
  const trackMap = new Map<number, NeteaseTrack & { source: string }>();

  // 从歌单中收集
  for (const playlist of playlists) {
    for (const track of playlist.tracks) {
      if (!trackMap.has(track.id)) {
        trackMap.set(track.id, { ...track, source: 'NETEASE' });
      }
    }
  }

  // 从每日推荐中收集
  for (const track of dailyRecommend) {
    if (!trackMap.has(track.id)) {
      trackMap.set(track.id, { ...track, source: 'NETEASE' });
    }
  }

  // 从排行榜中收集
  for (const track of [...topRecords.allTime, ...topRecords.recentWeek]) {
    if (!trackMap.has(track.id)) {
      trackMap.set(track.id, { ...track, source: 'NETEASE' });
    }
  }

  // 从最近播放中收集
  for (const track of recentPlays) {
    if (!trackMap.has(track.id)) {
      trackMap.set(track.id, { ...track, source: 'NETEASE' });
    }
  }

  console.log(`去重后歌曲总数: ${trackMap.size}`);

  // 构建喜欢歌曲 Set
  const likedSet = new Set(likedSongIds);

  // 使用事务批量插入
  const insertTrack = db.prepare(`
    INSERT OR IGNORE INTO radio_track
    (user_id, title, artist, album, release_year, genre_tags, mood_tags,
     source_type, source_track_id, cover_url, play_url, play_count, liked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `);

  const insertPlaylist = db.prepare(`
    INSERT OR IGNORE INTO radio_playlist
    (user_id, playlist_name, source_type, source_playlist_id, track_count)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertPlaylistTrack = db.prepare(`
    INSERT OR IGNORE INTO radio_playlist_track
    (playlist_id, track_id, sort_no)
    VALUES (?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    // 插入歌曲
    let insertedCount = 0;
    for (const track of trackMap.values()) {
      const publishYear = track.publishTime && track.publishTime > 0
        ? new Date(track.publishTime).getFullYear()
        : null;

      const result = insertTrack.run(
        userId,
        track.title,
        track.artists,
        track.album || null,
        publishYear,
        null, // genre_tags
        null, // mood_tags
        track.source,
        String(track.id),
        track.coverUrl || null,
        null, // play_url
        likedSet.has(track.id) ? 1 : 0
      );
      if (result.changes > 0) insertedCount++;
    }
    console.log(`插入歌曲: ${insertedCount} 首`);

    // 插入歌单和关联关系
    let playlistCount = 0;
    for (const playlist of playlists) {
      const result = insertPlaylist.run(
        userId,
        playlist.name,
        'NETEASE',
        String(playlist.id),
        playlist.trackCount
      );

      if (result.changes > 0) {
        const playlistRowId = result.lastInsertRowid;
        playlistCount++;

        // 插入歌单-歌曲关联
        for (let i = 0; i < playlist.tracks.length; i++) {
          const track = playlist.tracks[i];
          // 查找歌曲在 radio_track 中的 id
          const trackRow = db.prepare(
            'SELECT id FROM radio_track WHERE source_track_id = ?'
          ).get(String(track.id)) as { id: number } | undefined;

          if (trackRow) {
            insertPlaylistTrack.run(playlistRowId, trackRow.id, i);
          }
        }
      }
    }
    console.log(`插入歌单: ${playlistCount} 个`);
  });

  transaction();

  // 统计结果
  const trackCount = (db.prepare('SELECT COUNT(*) as cnt FROM radio_track').get() as { cnt: number }).cnt;
  const playlistCount = (db.prepare('SELECT COUNT(*) as cnt FROM radio_playlist').get() as { cnt: number }).cnt;
  const likedCount = (db.prepare('SELECT COUNT(*) as cnt FROM radio_track WHERE liked = 1').get() as { cnt: number }).cnt;

  console.log('\n导入完成！');
  console.log(`  歌曲总数: ${trackCount}`);
  console.log(`  歌单总数: ${playlistCount}`);
  console.log(`  喜欢歌曲: ${likedCount}`);
}

importNeteaseData();
