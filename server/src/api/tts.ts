import { Router } from 'express';
import { synthesizeSpeech, getTtsFilePath, getTextHash } from '../services/tts';
import { resolveTtsStyle } from '../services/tts-style';

const router = Router();

/**
 * POST /api/tts/synthesize — 合成语音
 * Body: { text: string }
 * 返回: { hash: string, audioUrl: string }
 */
router.post('/synthesize', async (req, res) => {
  try {
    const { text, context } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ code: 400, message: '缺少 text 参数' });
    }

    const style = resolveTtsStyle(context || {});
    const filePath = await synthesizeSpeech(text, style);
    if (!filePath) {
      return res.json({ code: 0, data: { hash: null, audioUrl: null } });
    }

    const hash = getTextHash(text, style);
    res.json({
      code: 0,
      data: {
        hash,
        audioUrl: `/api/tts/audio/${hash}`,
        style,
      },
    });
  } catch (err: any) {
    console.error('TTS 合成失败:', err);
    res.status(500).json({ code: 500, message: err.message || 'TTS 合成失败' });
  }
});

/**
 * GET /api/tts/audio/:hash — 获取 TTS 音频文件
 */
router.get('/audio/:hash', (req, res) => {
  const { hash } = req.params;
  const filePath = getTtsFilePath(hash);

  if (!filePath) {
    return res.status(404).json({ code: 404, message: '音频不存在' });
  }

  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(filePath);
});

export default router;
