import db from '../stores/db';
import fs from 'fs';
import path from 'path';
import { song_url } from 'NeteaseCloudMusicApi';

/**
 * 批量获取网易云歌曲播放地址并更新到数据库
 * 需要先运行 netease-login.ts 获取登录 cookie
 * NeteaseCloudMusicApi song_url 支持一次查询多首歌（最多 500 首）
 */

const BATCH_SIZE = 200;
const COOKIE_FILE = path.resolve(__dirname, '../../data/netease-cookie.txt');

/**
 * 加载登录 cookie
 */
function loadCookie(): string {
  if (!fs.existsSync(COOKIE_FILE)) {
    console.error('未找到登录 cookie 文件，请先运行 netease-login.ts 登录');
    console.error(`预期路径: ${COOKIE_FILE}`);
    process.exit(1);
  }
  return fs.readFileSync(COOKIE_FILE, 'utf-8').trim();
}

async function fetchPlayUrls() {
  const cookie = loadCookie();
  console.log('已加载登录 cookie');

  // --force 参数：清除所有旧 URL 重新获取（用于解决 30 秒试听问题）
  const force = process.argv.includes('--force');
  if (force) {
    const cleared = db.prepare("UPDATE radio_track SET play_url = NULL WHERE play_url IS NOT NULL").run();
    console.log(`已清除 ${cleared.changes} 首歌的旧播放地址`);
  }

  console.log('开始批量获取播放地址...');

  // 查询所有没有 play_url 的歌曲
  const tracks = db.prepare(`
    SELECT id, source_track_id FROM radio_track
    WHERE play_url IS NULL OR play_url = ''
  `).all() as Array<{ id: number; source_track_id: string }>;

  console.log(`共 ${tracks.length} 首歌需要获取播放地址`);

  if (tracks.length === 0) {
    console.log('所有歌曲已有播放地址，无需更新');
    return;
  }

  let updated = 0;
  let failed = 0;

  // 分批处理
  for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
    const batch = tracks.slice(i, i + BATCH_SIZE);
    const ids = batch.map(t => Number(t.source_track_id)).filter(id => !isNaN(id));

    if (ids.length === 0) {
      continue;
    }

    console.log(`批次 ${Math.floor(i / BATCH_SIZE) + 1}: 获取 ${ids.length} 首歌的播放地址...`);

    try {
      // 传入 cookie 获取完整播放地址（VIP 歌曲需要会员 cookie）
      const result = await song_url({ id: ids.join(','), br: 999000, cookie });
      const urlData = result.body?.data || [];

      // 建立 source_track_id -> url 的映射
      const urlMap = new Map<number, string>();
      for (const item of urlData) {
        if (item.url) {
          urlMap.set(item.id, item.url);
        }
      }

      // 更新数据库
      const updateStmt = db.prepare('UPDATE radio_track SET play_url = ? WHERE id = ?');
      const updateMany = db.transaction((items: Array<{ dbId: number; url: string }>) => {
        for (const item of items) {
          updateStmt.run(item.url, item.dbId);
        }
      });

      const toUpdate: Array<{ dbId: number; url: string }> = [];
      for (const track of batch) {
        const neteaseId = Number(track.source_track_id);
        const url = urlMap.get(neteaseId);
        if (url) {
          toUpdate.push({ dbId: track.id, url });
          updated++;
        } else {
          failed++;
        }
      }

      if (toUpdate.length > 0) {
        updateMany(toUpdate);
      }

      console.log(`  本批次: ${toUpdate.length} 成功, ${batch.length - toUpdate.length} 失败`);

      // 避免请求过快
      if (i + BATCH_SIZE < tracks.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (err: any) {
      console.error(`批次 ${Math.floor(i / BATCH_SIZE) + 1} 失败:`, err.message);
      failed += batch.length;
    }
  }

  console.log(`\n完成！更新: ${updated}, 失败: ${failed}, 总计: ${tracks.length}`);
}

fetchPlayUrls().catch(err => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
