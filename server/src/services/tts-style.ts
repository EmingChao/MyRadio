export interface TtsStyle {
  preset: 'focus' | 'relax' | 'night' | 'bgm' | 'neutral';
  kind: 'opening' | 'trackIntro' | 'explorePick';
  emotion: string;
  pace: 'slow' | 'medium-slow' | 'medium';
  energy: 'low' | 'medium-low' | 'medium';
  playbackRate: number;
  version: string;
  prompt: string;
}

export interface TtsStyleContext {
  scene?: string | null;
  mood?: string | null;
  title?: string | null;
  artist?: string | null;
  isOpening?: boolean;
  kind?: 'opening' | 'trackIntro' | 'explorePick';
  sourceScope?: 'library' | 'explore' | string | null;
}

/**
 * 根据当前场景、心情和歌曲信息推导 TTS 情绪风格。
 */
export function resolveTtsStyle(context: TtsStyleContext = {}): TtsStyle {
  const mood = String(context.mood || '').toLowerCase();
  const scene = String(context.scene || '').toLowerCase();
  const kind = resolveKind(context);
  const rolePrompt = buildRolePrompt(kind, context);

  if (mood.includes('深夜') || scene.includes('sleep')) {
    return {
      preset: 'night',
      kind,
      emotion: '贴近、低声、带一点夜间陪伴感',
      pace: 'slow',
      energy: 'low',
      playbackRate: 0.94,
      version: 'emotive-v1',
      prompt: buildPrompt('夜间低声电台', '语速偏慢，音量感轻，停顿更长，像在深夜把音乐轻轻递给用户', rolePrompt),
    };
  }

  if (mood.includes('放松') || scene.includes('relax')) {
    return {
      preset: 'relax',
      kind,
      emotion: '温柔、松弛、有呼吸感',
      pace: 'medium-slow',
      energy: 'medium-low',
      playbackRate: 0.97,
      version: 'emotive-v1',
      prompt: buildPrompt('放松陪伴电台', '语气柔和，句尾自然落下，像朋友在不打扰地介绍下一首歌', rolePrompt),
    };
  }

  if (mood.includes('bgm')) {
    return {
      preset: 'bgm',
      kind,
      emotion: '克制、简短、存在感低',
      pace: 'medium',
      energy: 'low',
      playbackRate: 1.0,
      version: 'emotive-v1',
      prompt: buildPrompt('背景音乐电台', '表达更克制，少一点戏剧性，不抢音乐本身的存在感', rolePrompt),
    };
  }

  if (mood.includes('专注') || scene.includes('coding') || scene.includes('working')) {
    return {
      preset: 'focus',
      kind,
      emotion: '稳定、清醒、克制但有温度',
      pace: 'medium',
      energy: 'medium-low',
      playbackRate: 1.01,
      version: 'emotive-v1',
      prompt: buildPrompt('专注工作电台', '语气干净，停顿明确，不催促，像帮用户把注意力轻轻收回来', rolePrompt),
    };
  }

  return {
    preset: 'neutral',
    kind,
    emotion: '温暖、自然、克制',
    pace: 'medium-slow',
    energy: 'medium-low',
    playbackRate: 0.98,
    version: 'emotive-v1',
    prompt: buildPrompt('私人音乐电台', '自然聊天感，适合音乐串场，不要播音腔，不要营销腔', rolePrompt),
  };
}

/**
 * TTS 模型使用的风格提示词。
 */
function buildPrompt(name: string, detail: string, rolePrompt: string): string {
  return [
    `(${name})`,
    detail,
    rolePrompt,
    '声音要贴合当前音乐氛围，像懂用户品味的 DJ 在切歌前低声说明推荐理由',
    '重点词轻轻强调，情绪有弧线但不过度表演；句子之间留出自然呼吸',
    '不要夸张抑扬顿挫，不要像广告、新闻播报或朗读模板',
  ].join('，');
}

/**
 * 识别当前 TTS 是开场、普通歌曲介绍，还是主动探索推荐。
 */
function resolveKind(context: TtsStyleContext): TtsStyle['kind'] {
  if (context.kind === 'opening' || context.isOpening) return 'opening';
  if (context.kind === 'explorePick' || context.sourceScope === 'explore') return 'explorePick';
  return 'trackIntro';
}

/**
 * 根据 DJ 独白用途生成更细的表演提示。
 */
function buildRolePrompt(kind: TtsStyle['kind'], context: TtsStyleContext): string {
  const songText = context.title
    ? `提到《${context.title}》${context.artist ? `和 ${context.artist}` : ''}时稍微更亲近一点`
    : '提到下一首歌时稍微更亲近一点';

  if (kind === 'opening') {
    return '这是电台开场，像自然开口说第一段话；前两句稳但要连贯，不要逐字顿读，后面轻轻把用户带入播放状态';
  }
  if (kind === 'explorePick') {
    return `这是主动探索推荐，声音里要有发现感和一点温柔的笃定，像真的发现了一首可能适合用户的新歌；${songText}`;
  }
  return `这是歌曲前串场介绍，要像真实电台主持人在音乐开始前自然铺垫，不能像念字段；${songText}`;
}
