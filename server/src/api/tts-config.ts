import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getTtsConfig, upsertTtsConfig } from '../stores/tts-config';
import { clearTtsRuntimeCache, getTtsConfigKey } from '../services/tts';

const router = Router();
const USER_ID = 443961717;

// 自定义参考音频存储目录
const VOICE_DIR = path.resolve(__dirname, '../../data/tts-voices');
// 最大上传文件大小：20MB
const MAX_FILE_SIZE = 20 * 1024 * 1024;
// 允许的音频 MIME 类型
const ALLOWED_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
  'audio/mp4', 'audio/m4a', 'audio/flac', 'audio/ogg', 'audio/webm',
]);

/**
 * GET /api/tts-config
 * 获取当前 TTS 语音配置
 */
router.get('/', (_req, res) => {
  try {
    const config = getTtsConfig(USER_ID);
    // 前端不关心绝对路径，只传文件名用于显示
    const refAudioName = config.refAudioPath
      ? path.basename(config.refAudioPath)
      : null;

    res.json({
      code: 0,
      data: { ...config, refAudioName, configKey: getTtsConfigKey(config) },
    });
  } catch (err: any) {
    console.error('[TTS Config] 获取配置失败:', err);
    res.status(500).json({ code: 500, message: err.message || '获取配置失败' });
  }
});

/**
 * PUT /api/tts-config
 * 更新 TTS 配置（mode / voice / dialect / refAudioPath）
 */
router.put('/', (req, res) => {
  try {
    const { mode, voice, dialect, refAudioPath } = req.body;

    // 校验参数
    if (mode && mode !== 'clone' && mode !== 'preset') {
      return res.status(400).json({ code: 400, message: 'mode 只能是 clone 或 preset' });
    }

    const validVoices = new Set([null, '冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean']);
    if (voice !== undefined && !validVoices.has(voice)) {
      return res.status(400).json({ code: 400, message: '不支持的音色' });
    }

    const validDialects = new Set([null, 'dongbei', 'sichuan', 'henan', 'cantonese']);
    if (dialect !== undefined && !validDialects.has(dialect)) {
      return res.status(400).json({ code: 400, message: '不支持的方言类型' });
    }

    const nextMode = mode ?? getTtsConfig(USER_ID).mode;
    const updated = upsertTtsConfig(USER_ID, {
      ...(mode !== undefined ? { mode } : {}),
      ...(refAudioPath !== undefined ? { refAudioPath } : {}),
      ...(voice !== undefined ? { voice } : {}),
      // 只有预设音色支持方言；切到克隆模式时必须清空，避免界面和日志误导用户。
      ...(nextMode === 'clone' ? { dialect: null } : dialect !== undefined ? { dialect } : {}),
    });

    // 配置已进入 TTS hash，切换后会生成新文件；这里只清理运行时参考音频缓存。
    clearTtsRuntimeCache();

    const refAudioName = updated.refAudioPath ? path.basename(updated.refAudioPath) : null;
    res.json({ code: 0, data: { ...updated, refAudioName, configKey: getTtsConfigKey(updated) } });
  } catch (err: any) {
    console.error('[TTS Config] 更新配置失败:', err);
    res.status(500).json({ code: 500, message: err.message || '更新配置失败' });
  }
});

/**
 * POST /api/tts-config/voice
 * 上传克隆参考音频（二进制 body，文件名通过 ?name= 传入）
 */
router.post('/voice', (req, res) => {
  try {
    // 确保存储目录存在
    if (!fs.existsSync(VOICE_DIR)) {
      fs.mkdirSync(VOICE_DIR, { recursive: true });
    }

    const fileName = req.query.name as string;
    if (!fileName) {
      return res.status(400).json({ code: 400, message: '缺少文件名参数 ?name=' });
    }

    // 用 hash 生成唯一文件名，保留原始扩展名
    const ext = path.extname(fileName).toLowerCase();
    const hash = crypto.createHash('md5').update(fileName + Date.now().toString()).digest('hex').slice(0, 10);
    const storedName = `voice_${hash}${ext}`;
    const filePath = path.join(VOICE_DIR, storedName);

    // 手动读取原始 body（需路由注册时使用 express.raw）
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      // 防止超大文件耗尽内存
      const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
      if (totalSize > MAX_FILE_SIZE) {
        res.status(413).json({ code: 413, message: '文件大小超过 20MB 限制' });
        req.destroy();
      }
    });

    req.on('end', () => {
      if (res.headersSent) return;
      const buffer = Buffer.concat(chunks);

      if (buffer.length === 0) {
        return res.status(400).json({ code: 400, message: '文件内容为空' });
      }

      fs.writeFileSync(filePath, buffer);

      // 上传参考音频代表进入克隆音色，克隆模式不保留方言配置。
      upsertTtsConfig(USER_ID, { mode: 'clone', refAudioPath: filePath, dialect: null });

      // 新参考音频路径会进入 TTS hash，这里只清理运行时参考音频缓存。
      clearTtsRuntimeCache();

      console.log(`[TTS Config] 参考音频已上传: ${storedName} (${(buffer.length / 1024).toFixed(0)}KB)`);
      res.json({
        code: 0,
        data: { refAudioName: storedName, configKey: getTtsConfigKey(getTtsConfig(USER_ID)) },
      });
    });

    req.on('error', (err) => {
      console.error('[TTS Config] 上传失败:', err);
      if (!res.headersSent) {
        res.status(500).json({ code: 500, message: '文件上传失败' });
      }
    });
  } catch (err: any) {
    console.error('[TTS Config] 上传处理异常:', err);
    res.status(500).json({ code: 500, message: err.message || '上传失败' });
  }
});

export default router;
