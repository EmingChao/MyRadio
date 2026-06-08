import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { TtsStyle } from './tts-style';
import type { TtsConfig } from '../stores/tts-config';

/**
 * MiMo TTS 服务
 * 支持两种模式：音色克隆（voiceclone）/ 预设音色（preset）
 * 对 DJ 的开场白和串场词进行语音合成
 */

const CLONE_API_URL = 'https://api.xiaomimimo.com/v1/chat/completions';
const CLONE_MODEL = 'mimo-v2.5-tts-voiceclone';
const PRESET_MODEL = 'mimo-v2.5-tts';
const CACHE_DIR = path.resolve(__dirname, '../../data/tts-cache');
const DEFAULT_REFERENCE_AUDIO_PATH = path.resolve(__dirname, '../../../files/bilibili_audio_first18s.mp3');
const inflightSynthesis = new Map<string, Promise<string | null>>();
const TTS_REQUEST_VERSION = 'voiceclone-natural-v3';

// 预设模式方言标识映射：后端 dialect 值 → 中文标签（用于 style prompt 注入）
const DIALECT_LABEL_MAP: Record<string, string> = {
  dongbei: '东北话',
  sichuan: '四川话',
  henan: '河南话',
  cantonese: '粤语',
};

const STYLE_TAG_MAP: Record<TtsStyle['preset'], string[]> = {
  focus: ['平静', '清醒'],
  relax: ['温柔', '慵懒'],
  night: ['低声', '深沉'],
  bgm: ['平静', '克制'],
  neutral: ['温柔', '深沉'],
};

const CLONE_STYLE_TAG_MAP: Record<TtsStyle['preset'], string[]> = {
  focus: ['平静'],
  relax: ['温柔'],
  night: ['低声'],
  bgm: ['平静'],
  neutral: ['温柔'],
};

// 风格控制指令（体验优先的私人电台 DJ 风格）
const STYLE_PROMPT = [
  '温暖、克制、低沉的私人电台 DJ 风格',
  '语速自然偏稳，整句连贯，不要一个字一个字顿读',
  '像懂用户品味的朋友在介绍歌曲和承接情绪，不要播音腔，不要营销腔',
].join('，');

const CLONE_STYLE_PROMPT = [
  '以参考音频里的真实说话方式为第一优先级',
  '保持原本的音高、松弛度、咬字习惯和自然语气，不要刻意压低嗓音',
  '像熟人自然介绍音乐，温和、有呼吸感，不要严肃、强硬、命令式或播音腔',
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

interface TtsRequestPreview {
  model: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  audio: Record<string, any>;
}

export interface TtsBatchPlanItem<T> {
  item: T;
  index: number;
  priority: 'foreground' | 'background';
  delayBeforeMs: number;
}

interface TtsBatchPlanOptions {
  foregroundCount?: number;
  backgroundDelayMs?: number;
}

/**
 * 构建批量 TTS 生成计划。
 * 前几段优先生成，保障用户刚点播放时能尽快听到；后续段落慢速后台续跑，降低外部 TTS 限流概率。
 */
export function buildTtsBatchPlan<T>(items: T[], options: TtsBatchPlanOptions = {}): Array<TtsBatchPlanItem<T>> {
  const foregroundCount = Math.max(1, Math.floor(options.foregroundCount ?? 3));
  const backgroundDelayMs = Math.max(0, Math.floor(options.backgroundDelayMs ?? 4500));

  return items.map((item, index) => {
    const priority = index < foregroundCount ? 'foreground' : 'background';
    return {
      item,
      index,
      priority,
      delayBeforeMs: priority === 'foreground' ? 0 : backgroundDelayMs,
    };
  });
}

/**
 * 加载参考音频为 base64（支持自定义路径，无则用默认）
 */
const refAudioCache = new Map<string, string>();

function loadReferenceAudio(customPath?: string | null): string {
  const filePath = customPath || DEFAULT_REFERENCE_AUDIO_PATH;
  if (refAudioCache.has(filePath)) return refAudioCache.get(filePath)!;

  if (!fs.existsSync(filePath)) {
    throw new Error(`参考音频不存在: ${filePath}`);
  }

  const buffer = fs.readFileSync(filePath);
  const base64 = `data:audio/mpeg;base64,${buffer.toString('base64')}`;
  refAudioCache.set(filePath, base64);
  return base64;
}

/**
 * 计算文本 hash（用于缓存 key）
 * 音色模式、预设音色、方言和克隆参考音频都会改变最终声音，必须进入缓存 key。
 */
function textHash(text: string, style?: TtsStyle | null, config?: TtsConfig | null): string {
  const styleKey = style ? `${style.preset}:${style.playbackRate}:${style.prompt}` : 'legacy';
  const configKey = getTtsConfigKey(config);
  return crypto.createHash('md5').update(`${TTS_REQUEST_VERSION}\n${styleKey}\n${configKey}\n${text}`).digest('hex').slice(0, 12);
}

/**
 * 计算 TTS 配置签名，用于前端过滤旧配置后台任务推回来的 TTS_READY。
 */
export function getTtsConfigKey(config?: TtsConfig | null): string {
  const raw = config
    ? `${config.mode}:${config.refAudioPath || 'default-ref'}:${config.voice || 'default-voice'}:${config.dialect || 'default-dialect'}`
    : 'default-config';
  return crypto.createHash('md5').update(raw).digest('hex').slice(0, 10);
}

/**
 * 从缓存中获取 TTS 音频
 */
function getCachedAudio(text: string, style?: TtsStyle | null, config?: TtsConfig | null): string | null {
  const hash = textHash(text, style, config);
  const filePath = path.join(CACHE_DIR, `${hash}.wav`);
  if (fs.existsSync(filePath)) {
    return filePath;
  }
  return null;
}

/**
 * 保存 TTS 音频到缓存
 */
function saveToCache(text: string, audioBase64: string, style?: TtsStyle | null, config?: TtsConfig | null): string {
  const hash = textHash(text, style, config);
  const filePath = path.join(CACHE_DIR, `${hash}.wav`);
  const buffer = Buffer.from(audioBase64, 'base64');
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * 调用 MiMo TTS API 合成语音（支持音色克隆和预设音色两种模式）
 */
export async function synthesizeSpeech(text: string, style?: TtsStyle | null, config?: TtsConfig | null): Promise<string | null> {
  if (!text || text.trim().length === 0) return null;

  // 1. 检查缓存
  const cached = getCachedAudio(text, style, config);
  if (cached) {
    console.log(`[TTS] 缓存命中: ${textHash(text, style, config)}`);
    return cached;
  }

  const hash = textHash(text, style, config);
  const inflight = inflightSynthesis.get(hash);
  if (inflight) {
    console.log(`[TTS] 等待同段语音合成: ${hash}`);
    return inflight;
  }

  const task = synthesizeSpeechUncached(text, style, config, hash).finally(() => {
    inflightSynthesis.delete(hash);
  });
  inflightSynthesis.set(hash, task);
  return task;
}

/**
 * 实际调用 MiMo TTS API。外层负责缓存和同 hash 去重。
 * 根据 TtsConfig.mode 决定使用克隆模型或预设模型。
 */
async function synthesizeSpeechUncached(
  text: string, style?: TtsStyle | null, config?: TtsConfig | null, hash?: string
): Promise<string | null> {
  const cacheHash = hash || textHash(text, style, config);

  // 2. 获取 API Key
  const apiKey = process.env.MIMO_TTS_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (!apiKey) {
    console.warn('[TTS] 未配置 API Key，跳过语音合成');
    return null;
  }

  // 3. 构建请求体：方言需要预设模型承接，否则克隆模型容易回落到参考音色。
  let requestBody: TtsRequestPreview;
  try {
    requestBody = buildTtsRequestPreview(text, style, config);
  } catch (err: any) {
    console.error('[TTS] 构建请求失败:', err.message);
    return null;
  }

  // 4. 调用 API
  try {
    const effectiveMode = requestBody.model === PRESET_MODEL ? 'preset' : 'clone';
    const modeLabel = effectiveMode === 'preset' ? `preset:${config?.dialect || 'default'}` : 'clone';
    console.log(`[TTS] 合成语音(${modeLabel}, ${style?.preset || 'legacy'}): "${text.slice(0, 30)}..."`);

    const response = await fetchWithRateLimitRetry(CLONE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    }, cacheHash);

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
    const filePath = saveToCache(text, audioData, style, config);
    console.log(`[TTS] 合成完成，已缓存: ${path.basename(filePath)}`);
    return filePath;
  } catch (err: any) {
    console.error('[TTS] 合成失败:', err.message);
    return null;
  }
}

/**
 * 构建 MiMo TTS 请求预览，便于测试确认音色/方言是否真的进入请求。
 */
export function buildTtsRequestPreview(text: string, style?: TtsStyle | null, config?: TtsConfig | null): TtsRequestPreview {
  const mode = config?.mode || 'clone';
  const basePrompt = mode === 'clone' ? CLONE_STYLE_PROMPT : STYLE_PROMPT;
  const stylePrompt = style?.prompt
    ? `${basePrompt}，${style.prompt}，情绪=${style.emotion}，语速=${style.pace}，能量=${style.energy}`
    : basePrompt;

  if (mode === 'preset') {
    const voiceId = config?.voice || '冰糖';
    const spokenText = buildAssistantTtsContent(text, style, config, {
      includeDialectTag: true,
      mode: 'preset',
    });

    return {
      model: PRESET_MODEL,
      messages: [
        { role: 'user', content: buildDirectorPrompt(stylePrompt, config, 'preset') },
        { role: 'assistant', content: spokenText },
      ],
      audio: { format: 'wav', voice: voiceId, optimize_text_preview: true },
    };
  }

  const referenceAudio = loadReferenceAudio(config?.refAudioPath);
  const spokenText = buildAssistantTtsContent(text, style, config, {
    includeDialectTag: false,
    mode: 'clone',
  });
  return {
    model: CLONE_MODEL,
    messages: [
      { role: 'user', content: buildDirectorPrompt(stylePrompt, config, 'clone') },
      { role: 'assistant', content: spokenText },
    ],
    audio: { format: 'wav', voice: referenceAudio, optimize_text_preview: true },
  };
}

/**
 * 构建 user 侧导演指令。自然语言控制放在 user，不进入最终朗读文本。
 */
function buildDirectorPrompt(stylePrompt: string, config?: TtsConfig | null, mode: 'clone' | 'preset' = 'clone'): string {
  const dialectLabel = config?.dialect ? DIALECT_LABEL_MAP[config.dialect] : null;
  if (!dialectLabel) return stylePrompt;
  if (mode === 'clone') {
    return [
      `保持参考音色的主体质感、年龄感、音高、松弛度、音色厚度和说话习惯，${dialectLabel}只作为很轻的口音倾向。`,
      `不要为了${dialectLabel}改变成另一种人声，不要夸张模仿方言演员。`,
      '不要把声音压低、压紧或变得强硬；整段话要连贯成句，标点只作为自然呼吸，不要每个短语都断开。',
      stylePrompt,
    ].join('');
  }
  return [
    `表演总目标：${dialectLabel}私人电台 DJ。`,
    `口音要求：全程使用${dialectLabel}口音和语气，但保持电台主持人的温暖、克制和自然停顿。`,
    '不要为了标准普通话牺牲方言感，也不要只在个别词上带口音。',
    stylePrompt,
  ].join('');
}

/**
 * 构建 assistant 侧目标文本。音频标签必须放在 assistant.content 中。
 */
function buildAssistantTtsContent(
  text: string,
  style?: TtsStyle | null,
  config?: TtsConfig | null,
  options: { includeDialectTag: boolean; mode: 'clone' | 'preset' } = { includeDialectTag: true, mode: 'preset' },
): string {
  const tagMap = options.mode === 'clone' ? CLONE_STYLE_TAG_MAP : STYLE_TAG_MAP;
  const labels = [
    options.includeDialectTag && config?.dialect ? DIALECT_LABEL_MAP[config.dialect] : '',
    ...(style ? tagMap[style.preset] : tagMap.neutral),
  ].filter(Boolean);
  const uniqueLabels = Array.from(new Set(labels));
  return uniqueLabels.length > 0
    ? `(${uniqueLabels.join(' ')})${text}`
    : text;
}

/**
 * 429 时做少量退避重试，避免新会话一次性合成多段语音时直接放弃 DJ 独白。
 */
async function fetchWithRateLimitRetry(url: string, init: RequestInit, hash: string): Promise<Response> {
  const delays = [0, 2500, 7000];
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) {
      console.log(`[TTS] 触发限流后等待重试: ${hash}, attempt=${attempt + 1}`);
      await delay(delays[attempt]);
    }
    const response = await fetch(url, init);
    lastResponse = response;
    if (response.status !== 429) return response;
  }

  return lastResponse!;
}

/**
 * Promise 形式的等待工具。
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 获取 TTS 音频的 HTTP 访问路径
 */
export function getTtsAudioUrl(hash: string): string {
  return `/api/tts/audio/${hash}`;
}

/**
 * 清空 TTS 缓存目录（切换音色模式时调用，确保新配置生效）
 */
export function clearTtsCache(): void {
  if (!fs.existsSync(CACHE_DIR)) return;
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.wav'));
  for (const f of files) {
    fs.unlinkSync(path.join(CACHE_DIR, f));
  }
  // 同时清理内存中的参考音频缓存，下次使用时重新加载
  refAudioCache.clear();
  console.log(`[TTS] 缓存已清空，共删除 ${files.length} 个文件`);
}

/**
 * 清理 TTS 内存态缓存。
 * 磁盘缓存 hash 已包含音色配置，配置变更不需要删除旧文件；清理内存即可确保参考音频重新加载。
 */
export function clearTtsRuntimeCache(): void {
  refAudioCache.clear();
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
export function getTextHash(text: string, style?: TtsStyle | null, config?: TtsConfig | null): string {
  return textHash(text, style, config);
}
