export interface TtsStyle {
  preset: 'focus' | 'relax' | 'night' | 'bgm' | 'neutral';
  emotion: string;
  pace: 'slow' | 'medium-slow' | 'medium';
  energy: 'low' | 'medium-low' | 'medium';
  playbackRate: number;
  prompt: string;
}

export interface TtsStyleContext {
  scene?: string | null;
  mood?: string | null;
  title?: string | null;
  artist?: string | null;
  isOpening?: boolean;
}

/**
 * 根据当前场景、心情和歌曲信息推导 TTS 情绪风格。
 */
export function resolveTtsStyle(context: TtsStyleContext = {}): TtsStyle {
  const mood = String(context.mood || '').toLowerCase();
  const scene = String(context.scene || '').toLowerCase();

  if (mood.includes('深夜') || scene.includes('sleep')) {
    return {
      preset: 'night',
      emotion: '贴近、低声、带一点夜间陪伴感',
      pace: 'slow',
      energy: 'low',
      playbackRate: 0.94,
      prompt: buildPrompt('夜间低声电台', '语速偏慢，音量感轻，停顿更长，像在深夜把音乐轻轻递给用户'),
    };
  }

  if (mood.includes('放松') || scene.includes('relax')) {
    return {
      preset: 'relax',
      emotion: '温柔、松弛、有呼吸感',
      pace: 'medium-slow',
      energy: 'medium-low',
      playbackRate: 0.97,
      prompt: buildPrompt('放松陪伴电台', '语气柔和，句尾自然落下，像朋友在不打扰地介绍下一首歌'),
    };
  }

  if (mood.includes('bgm')) {
    return {
      preset: 'bgm',
      emotion: '克制、简短、存在感低',
      pace: 'medium',
      energy: 'low',
      playbackRate: 1.0,
      prompt: buildPrompt('背景音乐电台', '表达更克制，少一点戏剧性，不抢音乐本身的存在感'),
    };
  }

  if (mood.includes('专注') || scene.includes('coding') || scene.includes('working')) {
    return {
      preset: 'focus',
      emotion: '稳定、清醒、克制但有温度',
      pace: 'medium',
      energy: 'medium-low',
      playbackRate: 1.01,
      prompt: buildPrompt('专注工作电台', '语气干净，停顿明确，不催促，像帮用户把注意力轻轻收回来'),
    };
  }

  return {
    preset: 'neutral',
    emotion: '温暖、自然、克制',
    pace: 'medium-slow',
    energy: 'medium-low',
    playbackRate: 0.98,
    prompt: buildPrompt('私人音乐电台', '自然聊天感，适合音乐串场，不要播音腔，不要营销腔'),
  };
}

/**
 * TTS 模型使用的风格提示词。
 */
function buildPrompt(name: string, detail: string): string {
  return [
    `(${name})`,
    detail,
    '声音要贴合当前音乐氛围，像懂用户品味的 DJ 在切歌前低声说明推荐理由',
    '句子之间留出自然呼吸，不要夸张抑扬顿挫，不要像广告或新闻播报',
  ].join('，');
}
