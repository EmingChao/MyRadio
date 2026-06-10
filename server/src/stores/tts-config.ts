import db from './db';

/**
 * TTS 配置接口：音色克隆 / 预设音色
 */
export interface TtsConfig {
  mode: 'clone' | 'preset';
  refAudioPath: string | null;
  voice: string | null;    // 预设音色标识：冰糖/茉莉/苏打/白桦/Mia/Chloe/Milo/Dean
  dialect: string | null;  // 方言风格，仅预设音色支持：dongbei/sichuan/henan/cantonese
}

const DEFAULT_CONFIG: TtsConfig = {
  mode: 'clone',
  refAudioPath: null,
  voice: null,
  dialect: null,
};

/**
 * 获取用户的 TTS 配置（无记录时返回默认值）
 */
export function getTtsConfig(userId: number): TtsConfig {
  const row = db.prepare(`
    SELECT mode, ref_audio_path AS refAudioPath, voice, dialect
    FROM radio_tts_config WHERE user_id = ?
  `).get(userId) as any;

  if (!row) {
    return { ...DEFAULT_CONFIG };
  }

  return normalizeTtsConfig({
    mode: row.mode || 'clone',
    refAudioPath: row.refAudioPath || null,
    voice: row.voice || null,
    dialect: row.dialect || null,
  });
}

/**
 * 更新用户的 TTS 配置（不存在则新建）
 */
export function upsertTtsConfig(userId: number, fields: Partial<TtsConfig>): TtsConfig {
  const current = getTtsConfig(userId);
  const merged = normalizeTtsConfig({ ...current, ...fields });

  db.prepare(`
    INSERT INTO radio_tts_config (user_id, mode, ref_audio_path, voice, dialect, create_time, modified_time)
    VALUES (?, ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))
    ON CONFLICT(user_id) DO UPDATE SET
      mode = excluded.mode,
      ref_audio_path = excluded.ref_audio_path,
      voice = excluded.voice,
      dialect = excluded.dialect,
      modified_time = datetime('now','localtime')
  `).run(userId, merged.mode, merged.refAudioPath, merged.voice, merged.dialect);

  return merged;
}

/**
 * 归一化 TTS 配置。
 * 克隆音色只跟随参考音频，不支持方言，因此读取和保存时都要清空 dialect。
 */
function normalizeTtsConfig(config: TtsConfig): TtsConfig {
  if (config.mode === 'clone') {
    return { ...config, dialect: null };
  }
  return config;
}
