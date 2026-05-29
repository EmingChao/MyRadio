import { Router } from 'express';
import { getFullProfile, updateProfileField } from '../stores/profile';
import db from '../stores/db';

const router = Router();
const USER_ID = 443961717;

/**
 * GET /api/taste/profile — 获取完整品味画像
 */
router.get('/profile', (_req, res) => {
  try {
    const profile = getFullProfile(USER_ID);
    res.json({ code: 0, data: profile });
  } catch (err: any) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

/**
 * PUT /api/taste/profile — 更新品味字段
 * Body: { field: string, value: string }
 */
router.put('/profile', (req, res) => {
  try {
    const { field, value } = req.body;
    if (!field || value === undefined) {
      return res.status(400).json({ code: 400, message: '缺少 field 或 value' });
    }
    updateProfileField(USER_ID, field, typeof value === 'string' ? value : JSON.stringify(value));
    res.json({ code: 0, message: '更新成功' });
  } catch (err: any) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

/**
 * GET /api/taste/playlists — 获取歌单列表（含 memory）
 */
router.get('/playlists', (_req, res) => {
  try {
    const rows = db.prepare(
      'SELECT id, playlist_name, source_type, track_count, memory FROM radio_playlist WHERE user_id = ? ORDER BY track_count DESC'
    ).all(USER_ID);
    res.json({ code: 0, data: rows });
  } catch (err: any) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

/**
 * PUT /api/taste/playlist/:id/memory — 更新歌单记忆标签
 */
router.put('/playlist/:id/memory', (req, res) => {
  try {
    const playlistId = Number(req.params.id);
    const { memory } = req.body;
    if (memory === undefined) {
      return res.status(400).json({ code: 400, message: '缺少 memory' });
    }
    db.prepare(`
      UPDATE radio_playlist
      SET memory = ?, modified_time = datetime('now','localtime')
      WHERE id = ? AND user_id = ?
    `).run(memory, playlistId, USER_ID);
    res.json({ code: 0, message: '更新成功' });
  } catch (err: any) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

/**
 * POST /api/taste/rebuild — 重新生成 taste.json（从 DB 数据重建）
 */
router.post('/rebuild', (_req, res) => {
  try {
    const profile = getFullProfile(USER_ID);
    const fs = require('fs');
    const path = require('path');
    const tastePath = path.resolve(__dirname, '../../data/taste.json');

    const tasteData = {
      user: 'EmingRising',
      userId: USER_ID,
      playlists: profile.playlists,
      taste_profile: {
        by_time_of_day: profile.byTimeOfDay,
        by_mood: profile.byMood,
        by_scene: profile.byScene,
        favorite_artists: profile.favoriteArtists,
        top_artists_by_library: profile.topArtistsByLibrary,
        lifelong_top: profile.lifelongTop,
        signatures: profile.signatures,
      },
      do_not_play: profile.doNotPlay,
      _meta: {
        generatedAt: new Date().toISOString(),
        note: '从 DB 重建',
      },
    };

    fs.writeFileSync(tastePath, JSON.stringify(tasteData, null, 2), 'utf-8');
    res.json({ code: 0, message: 'taste.json 已重建' });
  } catch (err: any) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

export default router;
