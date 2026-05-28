import db from '../stores/db';
import fs from 'fs';
import path from 'path';

/**
 * 从数据库构建品味本体 taste.json
 * 自动生成初始版本，用户后续可手动补充 memory 和签名
 */
function buildTaste() {
  const userId = 443961717;

  // 1. 获取所有歌单及其歌曲
  const playlists = db.prepare(`
    SELECT p.id, p.playlist_name, p.track_count, p.memory
    FROM radio_playlist p WHERE p.user_id = ?
    ORDER BY p.track_count DESC
  `).all(userId) as any[];

  // 2. 获取喜欢的歌曲
  const likedTracks = db.prepare(`
    SELECT title, artist, release_year FROM radio_track
    WHERE user_id = ? AND liked = 1
    ORDER BY play_count DESC
  `).all(userId) as any[];

  // 3. Top 艺术家（按歌曲数量）
  const topArtists = db.prepare(`
    SELECT artist, COUNT(*) as cnt FROM radio_track
    WHERE user_id = ? GROUP BY artist ORDER BY cnt DESC LIMIT 20
  `).all(userId) as any[];

  // 4. 喜欢的 Top 艺术家
  const likedArtists = db.prepare(`
    SELECT artist, COUNT(*) as cnt FROM radio_track
    WHERE user_id = ? AND liked = 1
    GROUP BY artist ORDER BY cnt DESC LIMIT 15
  `).all(userId) as any[];

  // 5. 按歌单名称分类场景
  const sceneMap: Record<string, string[]> = {
    working: [],    // 工作/学习
    relaxing: [],   // 放松
    energetic: [],  // 高能/嗨
    emotional: [],  // 情感/抒情
    focus: [],      // 专注
  };

  for (const p of playlists) {
    const name = p.playlist_name;
    if (/写作业|刷题|学习|专注/.test(name)) {
      sceneMap.focus.push(name);
    } else if (/慵懒|柔情|柔|乡村|清风/.test(name)) {
      sceneMap.relaxing.push(name);
    } else if (/说唱|Rap|Drill|挼普斯|抽象|gundan|IM NOT OK/.test(name)) {
      sceneMap.energetic.push(name);
    } else if (/民谣|粤语|催泪|经典|陈奕迅|死神|火影|影视/.test(name)) {
      sceneMap.emotional.push(name);
    } else if (/年度|精选|喜欢/.test(name)) {
      // 年度歌单和喜欢的音乐归为综合
    }
  }

  // 6. 构建品味本体
  const taste = {
    user: 'EmingRising',
    userId: userId,
    playlists: playlists.map((p: any) => ({
      name: p.playlist_name,
      trackCount: p.track_count,
      memory: p.memory || '', // 需要用户手动填写
    })),
    taste_profile: {
      by_time_of_day: {
        morning: ['华语流行', '轻快', '民谣'],
        working: ['中文说唱', '嘻哈', 'Drill', '无歌词纯音'],
        afternoon: ['粤语经典', '影视原声', '乐队'],
        late_night: ['民谣', '抒情', '慵懒女声', 'Lo-fi'],
      },
      by_mood: {
        专注: ['中文说唱', 'Drill', '纯音乐'],
        放松: ['民谣', '乡村', '慵懒女声'],
        高兴: ['说唱', '嘻哈', '流行'],
        低落: ['抒情', '粤语', '民谣'],
        怀旧: ['陈奕迅', '经典粤语', '老歌'],
      },
      by_scene: sceneMap,
      favorite_artists: likedArtists.map((a: any) => ({
        name: a.artist,
        likedCount: a.cnt,
      })),
      top_artists_by_library: topArtists.slice(0, 10).map((a: any) => ({
        name: a.artist,
        totalCount: a.cnt,
      })),
      lifelong_top: likedTracks.slice(0, 30).map((t: any) => ({
        title: t.title,
        artist: t.artist,
        year: t.release_year,
      })),
      signatures: [
        '中文说唱/嘻哈',
        '陈奕迅',
        '民谣',
        '粤语经典',
        '动漫 OST',
        '慵懒女声',
        '乡村音乐',
      ],
    },
    do_not_play: [], // 需要用户手动填写
    _meta: {
      generatedAt: new Date().toISOString(),
      note: '这是自动生成的初始版本，请补充每个歌单的 memory（回忆标签）和 do_not_play 列表',
    },
  };

  // 写入文件
  const outputPath = path.resolve(__dirname, '../../data/taste.json');
  fs.writeFileSync(outputPath, JSON.stringify(taste, null, 2), 'utf-8');

  console.log(`品味本体已生成: ${outputPath}`);
  console.log(`  歌单: ${taste.playlists.length}`);
  console.log(`  喜欢艺术家: ${taste.taste_profile.favorite_artists.length}`);
  console.log(`  终身 Top: ${taste.taste_profile.lifelong_top.length}`);
  console.log(`\n请手动补充:`);
  console.log(`  1. 每个歌单的 memory（回忆标签，30字内）`);
  console.log(`  2. do_not_play 列表（不想听的歌/风格）`);
  console.log(`  3. taste_profile.signatures（你的音乐签名）`);
}

buildTaste();
