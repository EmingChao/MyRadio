<script setup lang="ts">
import { computed, inject } from 'vue'
import { usePlayerStore } from '../stores/player'
import { useCoverBg } from '../composables/useCoverBg'
import type { RadioTrack } from '../stores/player'

const store = usePlayerStore()
const { bgStyle } = useCoverBg()
const openDetail = inject<(track?: RadioTrack) => void>('openDetail', () => {})

const progressPercent = computed(() => {
  if (!store.duration) return 0
  return (store.currentTime / store.duration) * 100
})

function formatTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function handleProgressClick(e: MouseEvent) {
  const bar = e.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const ratio = (e.clientX - rect.left) / rect.width
  store.seek(ratio * store.duration)
}
</script>

<template>
  <div class="now-playing" v-if="store.session">
    <!-- 封面背景 -->
    <div class="cover-bg" :style="bgStyle" />
    <!-- Claudio 身份 -->
    <div class="dj-identity">
      <span class="dj-name">CLAUDIO</span>
      <span class="dj-dot" :class="{ online: store.isPlaying }" />
      <span v-if="store.djSpeaking" class="dj-speaking">SPEAKING</span>
      <span class="dj-tagline">Your mood is my prompt.</span>
    </div>

    <!-- 碟片 + 曲目信息 -->
    <div class="np-main">
      <div class="np-disc-wrap">
        <div class="np-disc" :class="{ spinning: store.isPlaying }">
          <img
            v-if="store.currentTrack?.coverUrl"
            :src="store.currentTrack.coverUrl"
            class="np-cover"
          />
          <span v-else class="np-label">ON AIR</span>
          <div class="np-hole" />
        </div>
      </div>

      <div class="np-info" @click="openDetail()">
        <div class="np-title">{{ store.currentTrack?.title || '---' }}</div>
        <div class="np-artist">{{ store.currentTrack?.artist || '---' }}</div>
      </div>
    </div>

    <!-- DJ segue -->
    <div v-if="store.currentTrack?.segue" class="np-segue">
      <span class="segue-dj">DJ</span>
      <span class="segue-text">{{ store.currentTrack.segue }}</span>
    </div>

    <!-- 进度条 -->
    <div class="np-progress">
      <span class="np-time">{{ formatTime(store.currentTime) }}</span>
      <div class="np-bar" @click="handleProgressClick">
        <div class="np-fill" :style="{ width: progressPercent + '%' }" />
      </div>
      <span class="np-time">{{ formatTime(store.duration) }}</span>
    </div>

    <!-- 控制按钮 -->
    <div class="np-controls">
      <button class="np-btn" :disabled="store.currentIndex <= 0" @click="store.prev()">|&lt;</button>
      <button class="np-btn np-play" @click="store.togglePlay()">
        {{ store.isPlaying ? '||' : '&#9654;' }}
      </button>
      <button class="np-btn" :disabled="store.currentIndex >= store.trackCount - 1" @click="store.next()">&gt;|</button>
    </div>
  </div>
</template>

<style scoped>
.now-playing {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 16px;
  gap: 10px;
  position: relative;
  overflow: hidden;
}

/* 封面背景 */
.cover-bg {
  position: absolute;
  inset: -10px;
  background-size: cover;
  background-position: center;
  filter: blur(20px) brightness(0.25) saturate(1.4);
  opacity: 0.4;
  z-index: 0;
  transition: background-image 0.8s ease;
  pointer-events: none;
}

.now-playing > *:not(.cover-bg) {
  position: relative;
  z-index: 1;
}

/* DJ 身份 */
.dj-identity {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.dj-name {
  font-family: var(--font-display);
  font-size: 8px;
  color: var(--accent);
  letter-spacing: 2px;
}

.dj-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
}

.dj-dot.online {
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent);
}

.dj-speaking {
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--warm);
  letter-spacing: 1px;
  padding: 1px 4px;
  border: 1px solid var(--warm-dim);
  animation: speak-blink 1.5s ease-in-out infinite;
}

@keyframes speak-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.dj-tagline {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
  margin-left: auto;
  font-style: italic;
}

/* 主区域 */
.np-main {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
}

/* 碟片 */
.np-disc-wrap {
  flex-shrink: 0;
}

.np-disc {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: var(--bg-surface);
  border: 2px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  transition: border-color 0.3s;
}

.np-disc.spinning {
  animation: spin 6s linear infinite;
  border-color: var(--accent-dim);
  box-shadow: 0 0 12px var(--accent-glow);
}

.np-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.np-label {
  font-family: var(--font-display);
  font-size: 6px;
  color: var(--text-muted);
  letter-spacing: 1px;
}

.np-hole {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--bg-deep);
  border: 1px solid var(--border);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 曲目信息 */
.np-info {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.np-title {
  font-family: var(--font-pixel);
  font-size: 20px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.np-artist {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* DJ segue */
.np-segue {
  width: 100%;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 8px;
  border-left: 2px solid var(--warm-dim);
  background: var(--warm-glow);
}

.segue-dj {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--warm);
  letter-spacing: 1px;
  flex-shrink: 0;
}

.segue-text {
  font-family: var(--font-pixel);
  font-size: 14px;
  color: var(--text-secondary);
}

/* 进度条 */
.np-progress {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
}

.np-time {
  font-family: var(--font-pixel);
  font-size: 14px;
  color: var(--text-muted);
  min-width: 40px;
  text-align: center;
}

.np-bar {
  flex: 1;
  height: 4px;
  background: var(--bg-raised);
  border-radius: 2px;
  cursor: pointer;
}

.np-bar:active {
  height: 6px;
}

.np-fill {
  height: 100%;
  background: var(--accent-dim);
  border-radius: 2px;
  transition: width 0.2s;
}

/* 控制按钮 */
.np-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.np-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.np-btn:active:not(:disabled) {
  border-color: var(--border-light);
  color: var(--text-primary);
}

.np-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.np-play {
  width: 44px;
  height: 44px;
  font-size: 18px;
  background: var(--accent-glow);
  border-color: var(--accent-dim);
  color: var(--accent);
}

.np-play:active {
  background: rgba(74, 222, 128, 0.25);
}
</style>
