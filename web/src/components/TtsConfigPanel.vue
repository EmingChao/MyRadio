<script setup lang="ts">
import { ref } from 'vue'
import { useTtsConfigStore } from '../stores/tts-config'

const store = useTtsConfigStore()
const fileInput = ref<HTMLInputElement | null>(null)

/** 预设音色列表 */
const voiceOptions = [
  { id: '冰糖', label: '冰糖', gender: 'female', lang: '中文' },
  { id: '茉莉', label: '茉莉', gender: 'female', lang: '中文' },
  { id: '苏打', label: '苏打', gender: 'male',   lang: '中文' },
  { id: '白桦', label: '白桦', gender: 'male',   lang: '中文' },
  { id: 'Mia',   label: 'Mia',   gender: 'female', lang: '英文' },
  { id: 'Chloe', label: 'Chloe', gender: 'female', lang: '英文' },
  { id: 'Milo',  label: 'Milo',  gender: 'male',   lang: '英文' },
  { id: 'Dean',  label: 'Dean',  gender: 'male',   lang: '英文' },
]

/** 方言风格选项：仅预设音色支持，克隆音色始终使用参考音频本身 */
const dialectOptions = [
  { value: 'dongbei',    label: '东北话' },
  { value: 'sichuan',    label: '四川话' },
  { value: 'henan',      label: '河南话' },
  { value: 'cantonese',  label: '粤语' },
]

/** 性别图标 */
function genderIcon(gender: string): string {
  return gender === 'female' ? '♀' : '♂'
}

function handleModeSwitch(mode: 'clone' | 'preset') {
  store.setMode(mode)
}

function handleVoiceSelect(voiceId: string) {
  store.setVoice(voiceId)
}

function handleDialectSelect(dialect: string) {
  // 再次点击已选中的方言 = 取消选择，回到默认普通话
  store.setDialect(store.config.dialect === dialect ? null : dialect)
}

function triggerUpload() {
  fileInput.value?.click()
}

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  store.uploadVoice(file)
  input.value = ''
}

function handleResetVoice() {
  store.resetVoice()
}
</script>

<template>
  <div class="tts-config-panel">
    <!-- 模式切换 -->
    <div class="tts-mode-row">
      <button
        class="mode-btn"
        :class="{ active: store.config.mode === 'clone' }"
        :disabled="store.loading"
        @click="handleModeSwitch('clone')"
      >
        音色克隆
      </button>
      <button
        class="mode-btn"
        :class="{ active: store.config.mode === 'preset' }"
        :disabled="store.loading"
        @click="handleModeSwitch('preset')"
      >
        预设音色
      </button>
    </div>

    <!-- 克隆模式详情 -->
    <div v-if="store.config.mode === 'clone'" class="tts-section">
      <div class="tts-voice-info">
        <span class="tts-label">当前音色</span>
        <span class="tts-value">{{ store.config.refAudioName || '默认音色' }}</span>
      </div>
      <div class="tts-actions">
        <button class="tts-action-btn" :disabled="store.uploading" @click="triggerUpload">
          {{ store.uploading ? '上传中...' : '上传参考音频' }}
        </button>
        <button
          v-if="store.config.refAudioName"
          class="tts-action-btn tts-action-reset"
          :disabled="store.loading"
          @click="handleResetVoice"
        >
          恢复默认
        </button>
      </div>
      <p class="tts-hint">支持 MP3 / WAV / M4A / FLAC，建议 10 秒以上清晰人声</p>
      <input
        ref="fileInput"
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.flac"
        class="tts-file-input"
        @change="handleFileChange"
      />
    </div>

    <!-- 预设模式详情 -->
    <div v-else class="tts-section">
      <!-- 方言只对预设音色生效，克隆音色不展示该设置 -->
      <div class="dialect-section">
        <span class="tts-label">方言风格 <span class="dialect-hint">（仅预设音色，可选）</span></span>
        <div class="dialect-chips">
          <button
            v-for="opt in dialectOptions"
            :key="opt.value ?? 'default'"
            class="dialect-chip"
            :class="{ active: store.config.dialect === opt.value }"
            :disabled="store.loading"
            @click="handleDialectSelect(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- 音色选择网格 -->
      <div class="voice-grid">
        <button
          v-for="v in voiceOptions"
          :key="v.id"
          class="voice-card"
          :class="{
            active: store.config.voice === v.id,
            female: v.gender === 'female',
            male: v.gender === 'male',
          }"
          :disabled="store.loading"
          @click="handleVoiceSelect(v.id)"
        >
          <span class="voice-avatar">{{ v.label.charAt(0) }}</span>
          <span class="voice-name">{{ v.label }}</span>
          <span class="voice-meta">
            <span class="voice-gender">{{ genderIcon(v.gender) }}</span>
            <span class="voice-lang">{{ v.lang }}</span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tts-config-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 4px;
}

.tts-mode-row {
  display: flex;
  gap: 6px;
}

.mode-btn {
  flex: 1;
  padding: 8px 10px;
  background: rgba(244, 239, 228, 0.035);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  cursor: pointer;
  transition: all 0.16s ease;
}

.mode-btn:hover:not(:disabled) {
  border-color: var(--border-light);
  color: var(--text-secondary);
}

.mode-btn.active {
  background: linear-gradient(180deg, rgba(56, 217, 120, 0.12), rgba(56, 217, 120, 0.06));
  border-color: rgba(56, 217, 120, 0.28);
  color: var(--accent);
}

.mode-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ===== 克隆模式 ===== */
.tts-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tts-voice-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(244, 239, 228, 0.025);
  border-radius: 8px;
}

.tts-label {
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 650;
  color: var(--text-muted);
}

.tts-value {
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tts-actions {
  display: flex;
  gap: 6px;
}

.tts-action-btn {
  flex: 1;
  padding: 7px 10px;
  background: rgba(244, 239, 228, 0.04);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-secondary);
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.15s;
}

.tts-action-btn:hover:not(:disabled) {
  border-color: var(--border-light);
  color: var(--text-primary);
}

.tts-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tts-action-reset {
  flex: 0 0 auto;
  color: var(--text-muted);
}

.tts-hint {
  margin: 0;
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
  opacity: 0.7;
  line-height: 1.4;
}

.tts-file-input {
  display: none;
}

/* ===== 预设模式：音色网格 ===== */
.voice-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.voice-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 4px 6px;
  background: rgba(244, 239, 228, 0.03);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.16s ease;
  position: relative;
}

.voice-card:hover:not(:disabled) {
  border-color: var(--border-light);
  background: rgba(244, 239, 228, 0.05);
}

.voice-card.active {
  border-color: rgba(216, 181, 106, 0.4);
  background: linear-gradient(180deg, rgba(216, 181, 106, 0.12), rgba(216, 181, 106, 0.04));
}

.voice-card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.voice-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 800;
  color: var(--paper);
  background: linear-gradient(135deg, rgba(180, 160, 120, 0.5), rgba(140, 130, 100, 0.5));
  border: 1px solid rgba(216, 181, 106, 0.2);
}

.voice-card.female .voice-avatar {
  background: linear-gradient(135deg, rgba(200, 120, 150, 0.55), rgba(160, 100, 130, 0.55));
  border-color: rgba(200, 120, 150, 0.25);
}

.voice-card.male .voice-avatar {
  background: linear-gradient(135deg, rgba(100, 150, 200, 0.55), rgba(80, 120, 170, 0.55));
  border-color: rgba(100, 150, 200, 0.25);
}

.voice-card.active .voice-avatar {
  box-shadow: 0 0 10px rgba(216, 181, 106, 0.3);
}

.voice-name {
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: 0;
}

.voice-card.active .voice-name {
  color: var(--warm);
}

.voice-meta {
  display: flex;
  gap: 3px;
  align-items: center;
}

.voice-gender {
  font-size: 9px;
  line-height: 1;
  opacity: 0.6;
}

.voice-card.female .voice-gender { color: #e88aaa; }
.voice-card.male   .voice-gender { color: #7ab4e0; }

.voice-lang {
  font-family: var(--font-body);
  font-size: 9px;
  font-weight: 600;
  color: var(--text-muted);
  opacity: 0.6;
}

/* ===== 方言风格 ===== */
.dialect-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dialect-hint {
  font-weight: 500;
  opacity: 0.6;
}

.dialect-chips {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.dialect-chip {
  padding: 5px 10px;
  background: rgba(244, 239, 228, 0.035);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0;
  cursor: pointer;
  transition: all 0.16s ease;
}

.dialect-chip:hover:not(:disabled) {
  border-color: var(--border-light);
  color: var(--text-secondary);
}

.dialect-chip.active {
  background: linear-gradient(180deg, rgba(56, 217, 120, 0.12), rgba(56, 217, 120, 0.06));
  border-color: rgba(56, 217, 120, 0.28);
  color: var(--accent);
}

.dialect-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
