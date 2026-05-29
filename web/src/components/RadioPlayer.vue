<script setup lang="ts">
import { computed, ref, inject } from 'vue'
import { usePlayerStore } from '../stores/player'
import { useCoverBg } from '../composables/useCoverBg'
import LyricsPanel from './LyricsPanel.vue'
import type { RadioTrack } from '../stores/player'

const store = usePlayerStore()
const showLyrics = ref(false)
const { bgStyle } = useCoverBg()
const openDetail = inject<(track?: RadioTrack) => void>('openDetail', () => {})

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
      <!-- 碟片 -->
      <div class="disc-wrap">
        <div class="disc" :class="{ spinning: store.isPlaying }">
          <img
            v-if="store.currentTrack?.coverUrl"
            :src="store.currentTrack.coverUrl"
            alt="cover"
            class="disc-cover"
          />
          <span v-else class="disc-label">ON AIR</span>
          <div class="disc-hole" />
        </div>
      </div>

      <!-- 曲目信息 -->
      <div class="track-info" @click="openDetail()">
        <div class="track-title">{{ store.currentTrack?.title || '---' }}</div>
        <div class="track-artist">{{ store.currentTrack?.artist || '---' }}</div>
        <div v-if="store.currentTrack?.album" class="track-album">{{ store.currentTrack.album }}</div>
      </div>
    </div>

    <!-- DJ 串场词 -->
    <div v-if="store.currentTrack?.segue" class="segue-bar">
      <span class="segue-label">DJ</span>
      <span class="segue-text">{{ store.currentTrack.segue }}</span>
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

    <!-- 歌词面板 -->
    <button
      v-if="store.currentTrack?.lyrics"
      class="lyrics-btn"
      :class="{ active: showLyrics }"
      @click="showLyrics = !showLyrics"
    >LYRICS</button>

    <div v-if="showLyrics" class="lyrics-wrap">
      <LyricsPanel :lyrics="store.currentTrack?.lyrics || ''" :current-time="store.currentTime" />
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
  padding: 8px 16px 10px;
  position: relative;
  overflow: hidden;
}

/* 封面氛围 */
.stage-bg {
  position: absolute;
  inset: -40px;
  background-size: cover;
  background-position: center;
  filter: blur(50px) brightness(0.2) saturate(1.6);
  opacity: 0.45;
  z-index: 0;
  transition: background-image 0.8s ease;
  pointer-events: none;
}

.stage-content {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.set-strip {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 1px;
  margin-bottom: 8px;
}

.set-label {
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--signal);
  letter-spacing: 1.6px;
  text-transform: uppercase;
}

.set-title {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.set-meta {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 碟片 */
.disc-wrap { flex-shrink: 0; }

.disc {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid rgba(55, 214, 122, 0.2);
  box-shadow: 0 0 16px rgba(55, 214, 122, 0.08);
  position: relative;
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
}

.disc.spinning {
  animation: spin 6s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.disc-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.disc-label {
  font-family: var(--font-brand);
  font-size: 6px;
  color: var(--text-3);
  letter-spacing: 1px;
}

.disc-hole {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--stage-black);
  border: 1px solid var(--line-m);
}

/* 曲目信息 */
.track-info {
  flex: 1;
  min-width: 0;
  padding-top: 2px;
  cursor: pointer;
}

.track-title {
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.track-artist {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--signal);
  margin-top: 2px;
  letter-spacing: 0.3px;
}

.track-album {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
  margin-top: 1px;
}

/* DJ 串场词 */
.segue-bar {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  padding: 10px 12px;
  border-left: none;
  border-radius: var(--radius-lg);
  background: var(--paper);
  color: var(--ink);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
}

.segue-label {
  font-family: var(--font-mono);
  font-size: 9px;
  color: rgba(21, 21, 21, 0.52);
  letter-spacing: 1px;
  flex-shrink: 0;
}

.segue-text {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink);
  line-height: 1.65;
}

/* 进度条 */
.progress-row {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
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
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
  cursor: pointer;
}

.bar:active { height: 5px; }

.fill {
  height: 100%;
  background: var(--signal);
  border-radius: 2px;
  transition: width 0.3s linear;
}

/* 控制按钮 */
.controls {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 10px;
}

.ctrl {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--line-m);
  background: rgba(255, 255, 255, 0.04);
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
  background: var(--signal-dim);
  border-color: rgba(55, 214, 122, 0.3);
  color: var(--signal);
}

.ctrl-play:hover { background: rgba(55, 214, 122, 0.25); }

/* 歌词 */
.lyrics-btn {
  position: relative;
  z-index: 1;
  margin-top: 8px;
  padding: 1px 8px;
  background: transparent;
  border: 1px solid var(--line);
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.15s;
}

.lyrics-btn:hover,
.lyrics-btn.active {
  border-color: var(--signal-dim);
  color: var(--signal);
  background: var(--signal-glow);
}

.lyrics-wrap {
  position: relative;
  z-index: 1;
  margin-top: 6px;
  max-height: 120px;
  overflow: hidden;
  border: 1px solid var(--line);
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
