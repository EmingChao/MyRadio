<script setup lang="ts">
import { computed, inject } from 'vue'
import { usePlayerStore } from '../stores/player'
import { useCoverBg } from '../composables/useCoverBg'
import LyricsPanel from './LyricsPanel.vue'
import type { RadioTrack } from '../stores/player'

const store = usePlayerStore()
const { bgStyle } = useCoverBg()
const openDetail = inject<(track?: RadioTrack) => void>('openDetail', () => {})
const waveBars = [32, 56, 42, 78, 36, 64, 48, 88, 52, 72, 38, 60, 44, 82, 50, 68, 34, 58]

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const progressPercent = computed(() => {
  if (!store.duration) return 0
  return (store.currentTime / store.duration) * 100
})

const currentSetText = computed(() => {
  if (!store.session) return ''
  const summary = store.session.aiSummary?.trim()
  if (summary) return summary
  return `Built from your taste · ${store.trackCount} tracks`
})

const currentVoiceText = computed(() => {
  return store.currentTrack?.voiceIntro || store.currentTrack?.segue || ''
})

function handleProgressClick(e: MouseEvent) {
  const bar = e.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const ratio = (e.clientX - rect.left) / rect.width
  store.seek(ratio * store.duration)
}
</script>

<template>
  <div class="radio-stage" v-if="store.session">
    <!-- 封面氛围背景 -->
    <div class="stage-bg" :style="bgStyle" />

    <div class="set-strip">
      <span class="set-label">Current Set</span>
      <span class="set-title">{{ store.session.sessionTitle }}</span>
      <span class="set-meta">{{ currentSetText }}</span>
    </div>

    <div class="stage-content">
      <!-- 专辑封面不再模拟唱片，改成视频风格的声音封面块 -->
      <div class="cover-stack" :class="{ playing: store.isPlaying }">
        <div class="album-tile">
          <img
            v-if="store.currentTrack?.coverUrl"
            :src="store.currentTrack.coverUrl"
            alt="cover"
            class="album-cover"
          />
          <span v-else class="album-label">ON AIR</span>
        </div>
      </div>

      <!-- 曲目信息 -->
      <div class="track-info" @click="openDetail()">
        <div class="track-title">{{ store.currentTrack?.title || '---' }}</div>
        <div class="track-artist">{{ store.currentTrack?.artist || '---' }}</div>
        <div v-if="store.currentTrack?.album" class="track-album">{{ store.currentTrack.album }}</div>
        <div class="track-waveform" :class="{ active: store.isPlaying }" aria-hidden="true">
          <span
            v-for="(height, index) in waveBars"
            :key="index"
            class="wave-bar"
            :style="{ height: height + '%', animationDelay: `${index * 0.055}s` }"
          />
        </div>
      </div>
    </div>

    <!-- DJ 独白 -->
    <div class="voice-note" :class="{ empty: !currentVoiceText }">
      <div class="voice-mark" :class="{ active: store.djSpeaking }" aria-hidden="true">
        <span
          v-for="(level, index) in store.djWaveform.slice(0, 8)"
          :key="index"
          class="voice-bar"
          :style="{ height: `${Math.round(level * 100)}%` }"
        />
      </div>
      <div class="voice-copy">
        <span class="voice-label">Claudio</span>
        <span class="voice-text">{{ currentVoiceText }}</span>
      </div>
    </div>

    <!-- 实时歌词 -->
    <div class="lyrics-wrap">
      <LyricsPanel :lyrics="store.currentTrack?.lyrics || ''" :current-time="store.currentTime" />
    </div>

    <!-- 进度条 -->
    <div class="progress-row">
      <span class="time">{{ formatTime(store.currentTime) }}</span>
      <div class="bar" @click="handleProgressClick">
        <div class="fill" :style="{ width: progressPercent + '%' }" />
      </div>
      <span class="time">{{ formatTime(store.duration) }}</span>
    </div>

    <!-- 控制按钮 -->
    <div class="controls">
      <button class="ctrl" :disabled="store.currentIndex <= 0" @click="store.prev()">|&lt;</button>
      <button class="ctrl ctrl-play" @click="store.togglePlay()">
        {{ store.isPlaying ? '||' : '&#9654;' }}
      </button>
      <button class="ctrl" :disabled="store.currentIndex >= store.trackCount - 1" @click="store.next()">&gt;|</button>
    </div>
  </div>

  <!-- 无会话占位 -->
  <div v-else class="stage-empty">
    <div class="empty-disc">
      <span class="empty-label">NO SIGNAL</span>
    </div>
  </div>
</template>

<style scoped>
.radio-stage {
  height: 512px;
  min-height: 512px;
  max-height: 512px;
  padding: 8px 16px 10px;
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-rows: 45px 94px 72px 202px 16px 55px;
  row-gap: 4px;
  box-sizing: border-box;
}

/* 封面氛围 */
.stage-bg {
  position: absolute;
  inset: -40px;
  background-size: cover;
  background-position: center;
  filter: blur(46px) brightness(0.32) saturate(1.45);
  opacity: 0.62;
  z-index: 0;
  transition: background-image 0.8s ease;
  pointer-events: none;
  animation: ambient-drift 14s ease-in-out infinite;
}

.radio-stage::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(8, 9, 13, 0.08), rgba(8, 9, 13, 0.72)),
    radial-gradient(circle at 70% 22%, rgba(216, 181, 106, 0.08), transparent 35%);
  pointer-events: none;
  z-index: 0;
}

.stage-content {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 14px;
  align-items: flex-start;
  min-height: 0;
  overflow: hidden;
}

.set-strip {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 1px;
  min-height: 0;
  overflow: hidden;
}

.set-label {
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--warm);
  letter-spacing: 1.6px;
  text-transform: uppercase;
}

.set-title {
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.set-meta {
  font-family: var(--font-body);
  font-size: 9px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 封面声音块 */
.cover-stack {
  flex-shrink: 0;
  position: relative;
}

.cover-stack::before {
  content: '';
  position: absolute;
  inset: 12px 4px -8px;
  border-radius: 18px;
  background: var(--ember-dim);
  filter: blur(18px);
  opacity: 0.86;
}

.album-tile {
  width: 86px;
  height: 86px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(244, 239, 228, 0.16);
  box-shadow:
    0 12px 30px rgba(0, 0, 0, 0.38),
    0 0 0 1px rgba(255, 255, 255, 0.02);
  position: relative;
  background:
    radial-gradient(circle at 35% 24%, rgba(244, 239, 228, 0.12), transparent 36%),
    var(--raised);
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover-stack.playing .album-tile {
  animation: cover-breathe 5.6s ease-in-out infinite;
}

.album-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.album-label {
  font-family: var(--font-brand);
  font-size: 10px;
  color: var(--wave);
  letter-spacing: 1px;
}

/* 曲目信息 */
.track-info {
  flex: 1;
  min-width: 0;
  padding-top: 1px;
  cursor: pointer;
}

.track-title {
  font-family: var(--font-body);
  font-size: 16px;
  font-weight: 650;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.track-artist {
  font-family: var(--font-body);
  font-size: 11px;
  color: var(--text-primary);
  margin-top: 2px;
  letter-spacing: 0.3px;
}

.track-album {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
  margin-top: 1px;
}

.track-waveform {
  height: 28px;
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 3px;
  opacity: 0.74;
}

.wave-bar {
  width: 3px;
  min-height: 4px;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--wave), rgba(216, 181, 106, 0.42));
  transform-origin: center;
  transform: scaleY(0.36);
}

.track-waveform.active .wave-bar {
  animation: wave-rise 1.05s ease-in-out infinite;
}

/* DJ 独白字幕层 */
.voice-note {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px 8px 16px;
  min-height: 0;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background:
    radial-gradient(ellipse at 12% 50%, rgba(216, 181, 106, 0.11), transparent 34%),
    linear-gradient(180deg, rgba(244, 239, 228, 0.044), rgba(244, 239, 228, 0.018) 58%, rgba(244, 239, 228, 0));
  color: var(--text-primary);
  box-shadow:
    inset 0 1px 0 rgba(244, 239, 228, 0.026),
    inset 0 -1px 0 rgba(244, 239, 228, 0.018);
  mask-image: linear-gradient(90deg, transparent 0%, #000 5%, #000 95%, transparent 100%);
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 5%, #000 95%, transparent 100%);
}

.voice-note.empty {
  visibility: hidden;
}

.voice-mark {
  width: 28px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  flex-shrink: 0;
}

.voice-bar {
  width: 3px;
  min-height: 4px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(241, 233, 216, 0.76), rgba(216, 181, 106, 0.46));
  transform-origin: center;
  transition: height 80ms linear, opacity 120ms ease;
  opacity: 0.42;
}

.voice-mark.active .voice-bar {
  opacity: 0.95;
}

.voice-copy {
  min-width: 0;
  flex: 1;
  position: relative;
}

.voice-label {
  display: none;
}

.voice-text {
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 560;
  color: rgba(241, 233, 216, 0.78);
  line-height: 1.65;
  letter-spacing: 0;
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  text-shadow: 0 1px 16px rgba(0, 0, 0, 0.28);
}

/* 进度条 */
.progress-row {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 0;
}

.time {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-3);
  min-width: 30px;
  font-variant-numeric: tabular-nums;
}

.bar {
  flex: 1;
  height: 3px;
  background: rgba(244, 239, 228, 0.11);
  border-radius: 2px;
  overflow: hidden;
  cursor: pointer;
}

.bar:active { height: 5px; }

.fill {
  height: 100%;
  background: linear-gradient(90deg, var(--warm), var(--signal));
  border-radius: 2px;
  transition: width 0.3s linear;
}

/* 控制按钮 */
.controls {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 0;
}

.ctrl {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(244, 239, 228, 0.12);
  background: rgba(244, 239, 228, 0.045);
  color: var(--text-2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  padding: 0;
}

.ctrl:hover:not(:disabled) { border-color: var(--text-3); color: var(--text-primary); }
.ctrl:disabled { opacity: 0.25; cursor: not-allowed; }

.ctrl-play {
  width: 42px;
  height: 42px;
  font-size: 16px;
  background: rgba(241, 233, 216, 0.11);
  border-color: rgba(56, 217, 120, 0.26);
  color: var(--text-primary);
  box-shadow: 0 0 24px rgba(56, 217, 120, 0.08);
}

.ctrl-play:hover { background: rgba(56, 217, 120, 0.16); }

.lyrics-wrap {
  position: relative;
  z-index: 1;
  width: 100%;
  min-width: 0;
  height: 202px;
  min-height: 202px;
  max-height: 202px;
  overflow: hidden;
  border: 0;
  background:
    linear-gradient(180deg, rgba(244, 239, 228, 0.012), transparent 18%),
    transparent;
  box-shadow: none;
  mask-image: linear-gradient(180deg, transparent 0%, #000 14%, #000 82%, transparent 100%);
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 14%, #000 82%, transparent 100%);
  pointer-events: none;
}

/* 空状态 */
.stage-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
}

.empty-disc {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.3;
}

.empty-label {
  font-family: var(--font-brand);
  font-size: 6px;
  color: var(--text-3);
  letter-spacing: 1px;
}
</style>
