import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { TtsStyle } from './tts-style';

/**
 * MiMo TTS 服务（VoiceClone 模式）
 * 对 DJ 的开场白和串场词进行语音合成
 */

const TTS_API_URL = 'https://api.xiaomimimo.com/v1/chat/completions';
const TTS_MODEL = 'mimo-v2.5-tts-voiceclone';
const CACHE_DIR = path.resolve(__dirname, '../../data/tts-cache');
const REFERENCE_AUDIO_PATH = path.resolve(__dirname, '../../../files/bilibili_audio_first18s.mp3');

// 风格控制指令（体验优先的私人电台 DJ 风格）
const STYLE_PROMPT = [
  '(温暖)(克制)(低沉)私人深夜电台 DJ 风格',
  '语速中慢，停顿自然，句尾不要拖得夸张',
  '像懂用户品味的朋友在介绍歌曲和承接情绪，不要播音腔，不要营销腔',
].join('，');

interface TtsApiResponse {
  choices?: Array<{
    message?: {
      audio?: {
        data?: string;
      };
    };
  }>;
}

/**
 * 加载参考音频为 base64
 */
let cachedReferenceAudio: string | null = null;

function loadReferenceAudio(): string {
  if (cachedReferenceAudio) return cachedReferenceAudio;

  if (!fs.existsSync(REFERENCE_AUDIO_PATH)) {
    throw new Error(`参考音频不存在: ${REFERENCE_AUDIO_PATH}`);
  }

  const buffer = fs.readFileSync(REFERENCE_AUDIO_PATH);
  cachedReferenceAudio = `data:audio/mpeg;base64,${buffer.toString('base64')}`;
  return cachedReferenceAudio;
}

/**
 * 计算文本 hash（用于缓存 key）
 */
function textHash(text: string, style?: TtsStyle | null): string {
  const styleKey = style ? `${style.preset}:${style.playbackRate}:${style.prompt}` : 'legacy';
  return crypto.createHash('md5').update(`${styleKey}\n${text}`).digest('hex').slice(0, 12);
}

/**
 * 从缓存中获取 TTS 音频
 */
function getCachedAudio(text: string, style?: TtsStyle | null): string | null {
  const hash = textHash(text, style);
  const filePath = path.join(CACHE_DIR, `${hash}.wav`);
  if (fs.existsSync(filePath)) {
    return filePath;
  }
  return null;
}

/**
 * 保存 TTS 音频到缓存
 */
function saveToCache(text: string, audioBase64: string, style?: TtsStyle | null): string {
  const hash = textHash(text, style);
  const filePath = path.join(CACHE_DIR, `${hash}.wav`);
  const buffer = Buffer.from(audioBase64, 'base64');
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * 调用 MiMo TTS API 合成语音
 */
export async function synthesizeSpeech(text: string, style?: TtsStyle | null): Promise<string | null> {
  if (!text || text.trim().length === 0) return null;

  // 1. 检查缓存
  const cached = getCachedAudio(text, style);
  if (cached) {
    console.log(`[TTS] 缓存命中: ${textHash(text, style)}`);
    return cached;
  }

  // 2. 获取 API Key
  const apiKey = process.env.MIMO_TTS_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (!apiKey) {
    console.warn('[TTS] 未配置 API Key，跳过语音合成');
    return null;
  }

  // 3. 加载参考音频
  let referenceAudio: string;
  try {
    referenceAudio = loadReferenceAudio();
  } catch (err: any) {
    console.error('[TTS] 加载参考音频失败:', err.message);
    return null;
  }

  // 4. 调用 API
  try {
    console.log(`[TTS] 合成语音(${style?.preset || 'legacy'}): "${text.slice(0, 30)}..."`);
    const stylePrompt = style?.prompt
      ? `${STYLE_PROMPT}，${style.prompt}，情绪=${style.emotion}，语速=${style.pace}，能量=${style.energy}`
      : STYLE_PROMPT;

    const response = await fetch(TTS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        messages: [
          { role: 'user', content: stylePrompt },
          { role: 'assistant', content: text },
        ],
        audio: {
          format: 'wav',
          voice: referenceAudio,
        },
      }),
    });

    if (!response.ok) {
      console.error(`[TTS] API 请求失败: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json() as TtsApiResponse;
    const audioData = data?.choices?.[0]?.message?.audio?.data;

    if (!audioData) {
      console.error('[TTS] API 未返回音频数据');
      return null;
    }

    // 5. 保存到缓存
    const filePath = saveToCache(text, audioData, style);
    console.log(`[TTS] 合成完成，已缓存: ${path.basename(filePath)}`);
    return filePath;
  } catch (err: any) {
    console.error('[TTS] 合成失败:', err.message);
    return null;
  }
}

/**
 * 获取 TTS 音频的 HTTP 访问路径
 */
export function getTtsAudioUrl(hash: string): string {
  return `/api/tts/audio/${hash}`;
}

/**
 * 获取 TTS 缓存文件路径
 */
export function getTtsFilePath(hash: string): string | null {
  const filePath = path.join(CACHE_DIR, `${hash}.wav`);
  return fs.existsSync(filePath) ? filePath : null;
}

/**
 * 获取文本对应的 hash
 */
export function getTextHash(text: string, style?: TtsStyle | null): string {
  return textHash(text, style);
}
