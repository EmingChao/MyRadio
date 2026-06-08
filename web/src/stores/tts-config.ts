import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getTtsConfig, updateTtsConfig, uploadTtsVoice } from '../api';
import { usePlayerStore } from './player';

export interface TtsVoiceConfig {
  mode: 'clone' | 'preset';
  refAudioName: string | null;
  voice: string | null;
  dialect: string | null;
  configKey: string | null;
}

const DIALECT_LABELS: Record<string, string> = {
  dongbei: '东北话',
  sichuan: '四川话',
  henan: '河南话',
  cantonese: '粤语',
};

export const useTtsConfigStore = defineStore('tts-config', () => {
  const config = ref<TtsVoiceConfig>({
    mode: 'clone',
    refAudioName: null,
    voice: null,
    dialect: null,
    configKey: null,
  });
  const loading = ref(false);
  const uploading = ref(false);

  /**
   * 将后端返回的配置同步到本地。
   */
  function applyConfig(data: any) {
    config.value = {
      mode: data.mode || 'clone',
      refAudioName: data.refAudioName || null,
      voice: data.voice || null,
      dialect: data.dialect || null,
      configKey: data.configKey || null,
    };
    usePlayerStore().setActiveTtsConfigKey(config.value.configKey);
  }

  /**
   * 通知播放器丢弃旧 TTS 映射，让下一首开始使用新配置。
   */
  function notifyPlayerTtsConfigChanged() {
    usePlayerStore().handleTtsConfigChanged();
  }

  /**
   * 获取当前 TTS 配置
   */
  async function fetchConfig() {
    try {
      const res = await getTtsConfig();
      if (res.code === 0 && res.data) {
        applyConfig(res.data);
      }
    } catch {}
  }

  /**
   * 切换 TTS 模式（clone / preset）
   */
  async function setMode(mode: 'clone' | 'preset') {
    if (config.value.mode === mode) return;
    loading.value = true;
    try {
      const res = await updateTtsConfig({ mode });
      if (res.code === 0 && res.data) {
        applyConfig(res.data);
        notifyPlayerTtsConfigChanged();
      }
    } catch {} finally {
      loading.value = false;
    }
  }

  /**
   * 切换预设音色
   */
  async function setVoice(voice: string) {
    if (config.value.voice === voice) return;
    loading.value = true;
    try {
      const res = await updateTtsConfig({ voice });
      if (res.code === 0 && res.data) {
        applyConfig(res.data);
        notifyPlayerTtsConfigChanged();
      }
    } catch {} finally {
      loading.value = false;
    }
  }

  /**
   * 切换方言
   */
  async function setDialect(dialect: string | null) {
    if (config.value.dialect === dialect) return;
    loading.value = true;
    try {
      const res = await updateTtsConfig({ dialect });
      if (res.code === 0 && res.data) {
        applyConfig(res.data);
        notifyPlayerTtsConfigChanged();
      }
    } catch {} finally {
      loading.value = false;
    }
  }

  /**
   * 上传参考音频文件
   */
  async function uploadVoice(file: File): Promise<boolean> {
    uploading.value = true;
    try {
      const res = await uploadTtsVoice(file);
      if (res.code === 0 && res.data) {
        config.value.refAudioName = res.data.refAudioName;
        config.value.configKey = res.data.configKey || null;
        // 上传后自动切到克隆模式
        config.value.mode = 'clone';
        usePlayerStore().setActiveTtsConfigKey(config.value.configKey);
        notifyPlayerTtsConfigChanged();
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      uploading.value = false;
    }
  }

  /**
   * 重置为默认参考音频（清空自定义上传）
   */
  async function resetVoice() {
    loading.value = true;
    try {
      const res = await updateTtsConfig({ mode: 'clone', refAudioPath: null });
      if (res.code === 0 && res.data) {
        applyConfig(res.data);
        notifyPlayerTtsConfigChanged();
      }
    } catch {} finally {
      loading.value = false;
    }
  }

  /** 获取方言中文标签 */
  function getDialectLabel(dialect: string | null): string {
    if (!dialect) return '默认（普通话）';
    return DIALECT_LABELS[dialect] || dialect;
  }

  // 初始化时加载配置
  fetchConfig();

  return {
    config,
    loading,
    uploading,
    fetchConfig,
    setMode,
    setVoice,
    setDialect,
    uploadVoice,
    resetVoice,
    getDialectLabel,
  };
});
