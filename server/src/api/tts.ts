import { Router } from 'express';
import { synthesizeSpeech, getTtsFilePath, getTextHash, getTtsConfigKey, buildTtsRequestPreview } from '../services/tts';
import { resolveTtsStyle } from '../services/tts-style';
import { getTtsConfig } from '../stores/tts-config';
import { appendRuntimeLog } from '../services/runtime-logs';

const router = Router();
const USER_ID = 443961717;

/**
 * POST /api/tts/synthesize — 合成语音
 * Body: { text: string }
 * 返回: { hash: string, audioUrl: string }
 */
router.post('/synthesize', async (req, res) => {
  const start = Date.now();
  const sessionId = Number(req.body?.context?.sessionId);
  try {
    const { text, context } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ code: 400, message: '缺少 text 参数' });
    }

    const style = resolveTtsStyle(context || {});
    const ttsConfig = getTtsConfig(USER_ID);
    let requestPreview: any = null;
    try {
      requestPreview = buildTtsRequestPreview(text, style, ttsConfig);
    } catch (err: any) {
      requestPreview = { buildError: err.message || '构建请求预览失败' };
    }
    if (Number.isFinite(sessionId) && sessionId > 0) {
      appendRuntimeLog(sessionId, {
        scope: 'mimo',
        level: 'info',
        title: '当前独白 TTS 兜底请求',
        message: `文本 ${text.length} 字，风格=${style.preset}`,
        detail: {
          request: {
            url: 'https://api.xiaomimimo.com/v1/chat/completions',
            method: 'POST',
            body: requestPreview,
          },
        },
      });
    }
    const filePath = await synthesizeSpeech(text, style, ttsConfig);
    if (!filePath) {
      if (Number.isFinite(sessionId) && sessionId > 0) {
        appendRuntimeLog(sessionId, {
          scope: 'mimo',
          level: 'warn',
          title: '当前独白 TTS 兜底未生成',
          message: 'Mimo 未返回可用音频，播放器会在等待超时后直接播放歌曲',
          durationMs: Date.now() - start,
          detail: {
            request: { body: requestPreview },
            response: { ok: false, reason: '未返回可用音频文件' },
          },
        });
      }
      return res.json({ code: 0, data: { hash: null, audioUrl: null } });
    }

    const hash = getTextHash(text, style, ttsConfig);
    if (Number.isFinite(sessionId) && sessionId > 0) {
      appendRuntimeLog(sessionId, {
        scope: 'mimo',
        level: 'success',
        title: '当前独白 TTS 兜底成功',
        message: '当前等待的 DJ 独白已生成',
        durationMs: Date.now() - start,
        meta: { hash },
        detail: {
          request: { body: requestPreview },
          response: {
            ok: true,
            hash,
            audioUrl: `/api/tts/audio/${hash}`,
          },
        },
      });
    }
    res.json({
      code: 0,
      data: {
        hash,
        audioUrl: `/api/tts/audio/${hash}`,
        style,
        configKey: getTtsConfigKey(ttsConfig),
      },
    });
  } catch (err: any) {
    console.error('TTS 合成失败:', err);
    if (Number.isFinite(sessionId) && sessionId > 0) {
      appendRuntimeLog(sessionId, {
        scope: 'mimo',
        level: 'error',
        title: '当前独白 TTS 兜底失败',
        message: err.message || 'TTS 合成失败',
        durationMs: Date.now() - start,
        detail: {
          error: {
            message: err.message || String(err),
          },
        },
      });
    }
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
