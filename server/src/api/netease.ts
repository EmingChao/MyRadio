import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import db from '../stores/db';
import { login_qr_key, login_qr_create, login_qr_check, login_status, song_url, like as neteaseLike, likelist as neteaseLikelist } from 'NeteaseCloudMusicApi';

const router = Router();
const COOKIE_FILE = path.resolve(__dirname, '../../data/netease-cookie.txt');

/**
 * 网易云 SDK 类型声明较宽，这里按运行时返回体做局部收窄。
 */
function bodyOf<T>(result: { body?: unknown }): T {
  return (result.body || {}) as T;
}

/**
 * GET /api/netease/login/status — 检查网易云登录状态
 */
router.get('/login/status', async (_req, res) => {
  try {
    if (!fs.existsSync(COOKIE_FILE)) {
      return res.json({ code: 0, data: { loggedIn: false } });
    }
    const cookie = fs.readFileSync(COOKIE_FILE, 'utf-8').trim();
    const result = await login_status({ cookie });
    const body = bodyOf<{ data?: { profile?: { nickname: string; userId: number; avatarUrl?: string } } }>(result);
    const profile = body.data?.profile;
    if (profile) {
      res.json({
        code: 0,
        data: {
          loggedIn: true,
          nickname: profile.nickname,
          userId: profile.userId,
          avatarUrl: profile.avatarUrl,
        },
      });
    } else {
      res.json({ code: 0, data: { loggedIn: false } });
    }
  } catch {
    res.json({ code: 0, data: { loggedIn: false } });
  }
});

/**
 * POST /api/netease/qr/create — 生成登录二维码
 * 返回 qrimg (base64 PNG) 和 key (用于轮询)
 */
router.post('/qr/create', async (_req, res) => {
  try {
    const keyRes = await login_qr_key({ timestamp: Date.now() } as any);
    const keyBody = bodyOf<{ data?: { unikey?: string } }>(keyRes);
    const unikey = keyBody.data?.unikey;
    if (!unikey) {
      return res.status(500).json({ code: 500, message: '获取二维码 key 失败' });
    }

    const qrRes = await login_qr_create({
      key: unikey,
      qrimg: 'true',
      timestamp: Date.now(),
    } as any);
    const qrBody = bodyOf<{ data?: { qrimg?: string; qrurl?: string } }>(qrRes);

    res.json({
      code: 0,
      data: {
        key: unikey,
        qrimg: qrBody.data?.qrimg || '',
        qrurl: qrBody.data?.qrurl || '',
      },
    });
  } catch (err: any) {
    console.error('生成二维码失败:', err);
    res.status(500).json({ code: 500, message: err.message || '生成二维码失败' });
  }
});

/**
 * GET /api/netease/qr/check?key=xxx — 轮询扫码状态
 * 返回 code: 801=等待扫码, 802=已扫码待确认, 803=登录成功, 800=已过期
 */
router.get('/qr/check', async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) {
      return res.status(400).json({ code: 400, message: '缺少 key 参数' });
    }

    const result = await login_qr_check({
      key: String(key),
      timestamp: Date.now(),
    } as any);
    const body = bodyOf<{ code?: number; cookie?: string }>(result);

    const statusCode = body.code;

    // 登录成功，保存 cookie
    if (statusCode === 803 && body.cookie) {
      fs.writeFileSync(COOKIE_FILE, body.cookie);
      console.log('[Netease] 登录成功，cookie 已保存');
    }

    res.json({
      code: 0,
      data: {
        status: statusCode,
        message: statusCode === 800 ? '已过期'
          : statusCode === 801 ? '等待扫码'
          : statusCode === 802 ? '已扫码，待确认'
          : statusCode === 803 ? '登录成功'
          : '未知状态',
      },
    });
  } catch (err: any) {
    console.error('检查扫码状态失败:', err);
    res.status(500).json({ code: 500, message: err.message || '检查状态失败' });
  }
});

/**
 * POST /api/netease/like — 红心/取消红心歌曲（同步网易云）
 * Body: { id: number, like: boolean }
 */
router.post('/like', async (req, res) => {
  try {
    if (!fs.existsSync(COOKIE_FILE)) {
      return res.status(400).json({ code: 400, message: '未登录，请先扫码登录' });
    }
    const { id, like: isLike } = req.body;
    if (!id) {
      return res.status(400).json({ code: 400, message: '缺少歌曲 ID' });
    }
    const cookie = fs.readFileSync(COOKIE_FILE, 'utf-8').trim();
    await neteaseLike({ id: Number(id), like: !!isLike, cookie } as any);
    res.json({ code: 0, message: isLike ? '已红心' : '已取消红心' });
  } catch (err: any) {
    console.error('[Netease] 红心操作失败:', err.message);
    res.status(500).json({ code: 500, message: err.message || '红心操作失败' });
  }
});

/**
 * GET /api/netease/likelist — 获取网易云红心歌曲列表
 */
router.get('/likelist', async (_req, res) => {
  try {
    if (!fs.existsSync(COOKIE_FILE)) {
      return res.status(400).json({ code: 400, message: '未登录，请先扫码登录' });
    }
    const cookie = fs.readFileSync(COOKIE_FILE, 'utf-8').trim();
    const result = await neteaseLikelist({ cookie } as any);
    const body = bodyOf<{ ids?: number[] }>(result);
    res.json({ code: 0, data: { ids: body.ids || [] } });
  } catch (err: any) {
    console.error('[Netease] 获取红心列表失败:', err.message);
    res.status(500).json({ code: 500, message: err.message || '获取红心列表失败' });
  }
});

/**
 * POST /api/netease/fetch-urls — 登录成功后获取完整播放地址
 * 清除旧 URL 并重新获取
 */
router.post('/fetch-urls', async (req, res) => {
  try {
    if (!fs.existsSync(COOKIE_FILE)) {
      return res.status(400).json({ code: 400, message: '未登录，请先扫码登录' });
    }
    const cookie = fs.readFileSync(COOKIE_FILE, 'utf-8').trim();

    // 先返回响应，后台执行
    res.json({ code: 0, message: '开始获取播放地址，将在后台执行' });

    // 后台批量获取
    fetchPlayUrlsWithCookie(cookie).catch(err => {
      console.error('[Netease] 批量获取播放地址失败:', err.message);
    });
  } catch (err: any) {
    console.error('获取播放地址失败:', err);
    res.status(500).json({ code: 500, message: err.message || '获取播放地址失败' });
  }
});

/**
 * 用 cookie 批量获取播放地址
 */
async function fetchPlayUrlsWithCookie(cookie: string) {
  const BATCH_SIZE = 200;

  // 清除旧的 30 秒试听 URL
  const cleared = db.prepare("UPDATE radio_track SET play_url = NULL WHERE play_url IS NOT NULL").run();
  console.log(`[Netease] 已清除 ${cleared.changes} 首歌的旧播放地址`);

  const tracks = db.prepare(`
    SELECT id, source_track_id FROM radio_track
    WHERE play_url IS NULL OR play_url = ''
  `).all() as Array<{ id: number; source_track_id: string }>;

  console.log(`[Netease] 共 ${tracks.length} 首歌需要获取播放地址`);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
    const batch = tracks.slice(i, i + BATCH_SIZE);
    const ids = batch.map(t => Number(t.source_track_id)).filter(id => !isNaN(id));
    if (ids.length === 0) continue;

    try {
      const result = await song_url({ id: ids.join(','), br: 999000, cookie });
      const body = bodyOf<{ data?: Array<{ id: number; url?: string }> }>(result);
      const urlData = body.data || [];

      const urlMap = new Map<number, string>();
      for (const item of urlData) {
        if (item.url) urlMap.set(item.id, item.url);
      }

      const updateStmt = db.prepare('UPDATE radio_track SET play_url = ? WHERE id = ?');
      const updateMany = db.transaction((items: Array<{ dbId: number; url: string }>) => {
        for (const item of items) updateStmt.run(item.url, item.dbId);
      });

      const toUpdate: Array<{ dbId: number; url: string }> = [];
      for (const track of batch) {
        const url = urlMap.get(Number(track.source_track_id));
        if (url) {
          toUpdate.push({ dbId: track.id, url });
          updated++;
        } else {
          failed++;
        }
      }

      if (toUpdate.length > 0) updateMany(toUpdate);
      console.log(`[Netease] 批次 ${Math.floor(i / BATCH_SIZE) + 1}: ${toUpdate.length} 成功`);

      if (i + BATCH_SIZE < tracks.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (err: any) {
      console.error(`[Netease] 批次失败:`, err.message);
      failed += batch.length;
    }
  }

  console.log(`[Netease] 完成！更新: ${updated}, 失败: ${failed}, 总计: ${tracks.length}`);
}

export default router;
