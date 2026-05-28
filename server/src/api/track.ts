import { Router } from 'express';
import {
  queryTracks,
  getTrackById,
  updateTrackTags,
  updateTrackLiked,
  incrementPlayCount,
  incrementSkipCount,
  queryPlaylists,
  getTrackStats,
} from '../stores/track';

const router = Router();

const USER_ID = 443961717; // 单用户，固定为网易云用户ID

/**
 * GET /api/track/list — 分页查询歌曲
 * Query: keyword, playlistId, liked, sourceType, page, pageSize
 */
router.get('/list', (req, res) => {
  const userId = USER_ID;
  const { keyword, playlistId, liked, sourceType, page, pageSize } = req.query;

  const result = queryTracks({
    userId,
    keyword: keyword as string,
    playlistId: playlistId ? Number(playlistId) : undefined,
    liked: liked !== undefined ? Number(liked) : undefined,
    sourceType: sourceType as string,
    page: page ? Number(page) : 1,
    pageSize: pageSize ? Number(pageSize) : 20,
  });

  res.json({ code: 0, data: result });
});

/**
 * GET /api/track/stats — 获取歌曲统计
 */
router.get('/stats', (_req, res) => {
  const stats = getTrackStats(USER_ID);
  res.json({ code: 0, data: stats });
});

/**
 * GET /api/track/playlists — 获取歌单列表
 */
router.get('/playlists', (_req, res) => {
  const playlists = queryPlaylists(USER_ID);
  res.json({ code: 0, data: playlists });
});

/**
 * GET /api/track/:id — 获取歌曲详情
 */
router.get('/:id', (req, res) => {
  const track = getTrackById(Number(req.params.id));
  if (!track) {
    res.status(404).json({ code: 404, message: '歌曲不存在' });
    return;
  }
  res.json({ code: 0, data: track });
});

/**
 * PUT /api/track/:id/tags — 更新歌曲标签
 * Body: { genreTags: string, moodTags: string }
 */
router.put('/:id/tags', (req, res) => {
  const { genreTags, moodTags } = req.body;
  const ok = updateTrackTags(Number(req.params.id), genreTags ?? null, moodTags ?? null);
  if (!ok) {
    res.status(404).json({ code: 404, message: '歌曲不存在' });
    return;
  }
  res.json({ code: 0, message: '标签已更新' });
});

/**
 * PUT /api/track/:id/liked — 更新喜欢状态
 * Body: { liked: 0 | 1 }
 */
router.put('/:id/liked', (req, res) => {
  const { liked } = req.body;
  const ok = updateTrackLiked(Number(req.params.id), liked ? 1 : 0);
  if (!ok) {
    res.status(404).json({ code: 404, message: '歌曲不存在' });
    return;
  }
  res.json({ code: 0, message: liked ? '已喜欢' : '已取消喜欢' });
});

/**
 * POST /api/track/:id/play — 记录播放
 */
router.post('/:id/play', (req, res) => {
  incrementPlayCount(Number(req.params.id));
  res.json({ code: 0, message: '播放已记录' });
});

/**
 * POST /api/track/:id/skip — 记录跳过
 */
router.post('/:id/skip', (req, res) => {
  incrementSkipCount(Number(req.params.id));
  res.json({ code: 0, message: '跳过已记录' });
});

export default router;
