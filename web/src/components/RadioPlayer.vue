<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerStore } from '../stores/player'

const store = usePlayerStore()

// 格式化时间为 mm:ss
function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// 进度百分比
const progressPercent = computed(() => {
  if (!store.duration) return 0
  return (store.currentTime / store.duration) * 100
})

// 点击进度条跳转
function handleProgressClick(e: MouseEvent) {
  const bar = e.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const ratio = (e.clientX - rect.left) / rect.width
  store.seek(ratio * store.duration)
}
</script>

<template>
  <div class="player">
    <!-- 无会话时的占位 -->
    <div v-if="!store.session" class="placeholder">
      <div class="disc-outer">
        <div class="disc">
          <div class="disc-label">NO SIGNAL</div>
        </div>
      </div>
      <p class="idle-text">CREATE SESSION TO START</p>
    </div>

    <!-- 播放器 -->
    <div v-else class="player-active">
      <!-- 封面碟片 -->
      <div class="disc-outer" :class="{ active: store.isPlaying }">
        <div class="disc" :class="{ spinning: store.isPlaying }">
          <img
            v-if="store.currentTrack?.coverUrl"
            :src="store.currentTrack.coverUrl"
            alt="cover"
            class="cover-img"
          />
          <div v-else class="disc-label">ON AIR</div>
          <div class="disc-hole"></div>
        </div>
      </div>

      <!-- 歌曲信息面板 -->
      <div class="track-panel">
        <div class="track-title-row">
          <span class="track-title">{{ store.currentTrack?.title || '---' }}</span>
        </div>
        <div class="track-meta-row">
          <span class="track-artist">{{ store.currentTrack?.artist || '---' }}</span>
          <span class="track-album">{{ store.currentTrack?.album || '' }}</span>
        </div>
      </div>

      <!-- DJ 串场词 -->
      <div v-if="store.currentTrack?.segue" class="segue-panel">
        <div class="segue-header">
          <span class="segue-label">DJ</span>
          <span class="segue-dot">.</span>
        </div>
        <p class="segue-text">{{ store.currentTrack.segue }}</p>
      </div>

      <!-- 控制栏 -->
      <div class="controls">
        <button
          class="ctrl-btn"
          :disabled="store.currentIndex === 0"
          @click="store.prev"
        >|&lt;</button>
        <button class="ctrl-btn play-btn" @click="store.togglePlay">
          {{ store.isPlaying ? '||' : '>' }}
        </button>
        <button
          class="ctrl-btn"
          :disabled="store.currentIndex >= store.trackCount - 1"
          @click="store.next"
        >&gt;|</button>
      </div>

      <!-- 进度条（基于真实播放时间） -->
      <div class="progress-wrapper">
        <span class="time-label">{{ formatTime(store.currentTime) }}</span>
        <div class="progress-bar" @click="handleProgressClick">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <span class="time-label">{{ formatTime(store.duration) }}</span>
      </div>
      <div class="progress-text">
        <span>{{ String(store.currentIndex + 1).padStart(2, '0') }}</span>
        <span class="progress-sep">/</span>
        <span>{{ String(store.trackCount).padStart(2, '0') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player {
  width: 100%;
  max-width: 420px;
  text-align: center;
  padding: 20px;
}

.placeholder {
  opacity: 0.35;
}

.idle-text {
  margin-top: 20px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 2px;
}

/* 碟片外壳 */
.disc-outer {
  width: 220px;
  height: 220px;
  border-radius: 50%;
  margin: 0 auto;
  padding: 8px;
  background: var(--bg-raised);
  border: 2px solid var(--border);
  box-shadow:
    0 0 0 1px var(--border),
    inset 0 2px 8px rgba(0,0,0,0.4);
  transition: border-color 0.6s, box-shadow 0.6s;
}

.disc-outer.active {
  border-color: var(--accent-dim);
  box-shadow:
    0 0 0 1px var(--accent-dim),
    0 0 20px rgba(74, 222, 128, 0.08),
    inset 0 2px 8px rgba(0,0,0,0.4);
}

.disc {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: var(--bg-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  border: 1px solid var(--border);
}

.disc.spinning {
  animation: spin 6s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.disc-label {
  font-family: var(--font-display);
  font-size: 8px;
  color: var(--text-muted);
  letter-spacing: 2px;
}

.disc-hole {
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--bg-deep);
  border: 1px solid var(--border);
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

/* 歌曲信息面板 */
.track-panel {
  margin-top: 24px;
  padding: 12px 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  text-align: left;
}

.track-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.track-title {
  font-family: var(--font-pixel);
  font-size: 24px;
  color: var(--text-primary);
  line-height: 1.2;
}

.track-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.track-artist {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--accent);
  letter-spacing: 0.5px;
}

.track-album {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}

/* DJ 串场词 */
.segue-panel {
  margin-top: 16px;
  padding: 10px 14px;
  background: var(--bg-surface);
  border-left: 2px solid var(--warm-dim);
  text-align: left;
}

.segue-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.segue-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--warm);
  font-weight: 600;
  letter-spacing: 1px;
}

.segue-dot {
  color: var(--warm-dim);
}

.segue-text {
  font-family: var(--font-pixel);
  font-size: 16px;
  color: var(--text-secondary);
  line-height: 1.4;
  margin: 0;
}

/* 控制栏 */
.controls {
  margin-top: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.ctrl-btn {
  padding: 8px 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 14px;
  letter-spacing: 1px;
  transition: all 0.15s;
}

.ctrl-btn:hover:not(:disabled) {
  border-color: var(--border-light);
  color: var(--text-primary);
}

.ctrl-btn:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

.play-btn {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--accent-glow) !important;
  border-color: var(--accent-dim) !important;
  color: var(--accent) !important;
  font-size: 18px !important;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 !important;
}

.play-btn:hover {
  background: rgba(74, 222, 128, 0.25) !important;
}

/* 进度条区域 */
.progress-wrapper {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  min-width: 36px;
}

.progress-bar {
  flex: 1;
  height: 4px;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  overflow: hidden;
  cursor: pointer;
  position: relative;
}

.progress-bar:hover {
  height: 6px;
}

.progress-fill {
  height: 100%;
  background: var(--accent-dim);
  transition: width 0.2s linear;
}

.progress-text {
  margin-top: 8px;
  font-family: var(--font-pixel);
  font-size: 18px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.progress-sep {
  color: var(--border-light);
}
</style>
