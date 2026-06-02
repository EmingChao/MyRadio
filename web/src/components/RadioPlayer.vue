<script setup lang="ts">
import { computed, inject } from 'vue'
import { usePlayerStore } from '../stores/player'
import { useCoverBg } from '../composables/useCoverBg'
import LyricsPanel from './LyricsPanel.vue'
import type { RadioTrack } from '../stores/player'

const store = usePlayerStore()
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
  return `基于你的品味与当下场景编排 · ${store.trackCount} 首`
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
      <span class="set-label">当前电台</span>
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
          <span v-else class="album-label">播放中</span>
        </div>
      </div>

      <!-- 曲目信息 -->
      <div class="track-info" @click="openDetail()">
        <div class="track-title">{{ store.currentTrack?.title || '---' }}</div>
        <div class="track-artist">{{ store.currentTrack?.artist || '---' }}</div>
        <div v-if="store.currentTrack?.album" class="track-album">{{ store.currentTrack.album }}</div>
        <div class="track-waveform" :class="{ active: store.isPlaying }" aria-hidden="true">
          <span
            v-for="(level, index) in store.trackWaveform"
            :key="index"
            class="wave-bar"
            :style="{ height: `${Math.round(level * 100)}%` }"
          />
        </div>
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
      <button class="ctrl" :disabled="store.currentIndex <= 0" aria-label="上一首" @click="store.prev()">
        <img class="ctrl-icon" src="/player-icons/prev.png" alt="" aria-hidden="true" />
      </button>
      <button class="ctrl ctrl-play" :aria-label="store.isPlaying ? '暂停' : '播放'" @click="store.togglePlay()">
        <img
          class="ctrl-icon ctrl-icon-play"
          :src="store.isPlaying ? '/player-icons/pause.png' : '/player-icons/play.png'"
          alt=""
          aria-hidden="true"
        />
      </button>
      <button class="ctrl" :disabled="store.currentIndex >= store.trackCount - 1" aria-label="下一首" @click="store.next()">
        <img class="ctrl-icon" src="/player-icons/next.png" alt="" aria-hidden="true" />
      </button>
    </div>
  </div>

  <!-- 无会话占位 -->
  <div v-else class="stage-empty">
    <div class="empty-visual">
      <div class="empty-rings" aria-hidden="true">
        <span class="empty-ring ring-a" />
        <span class="empty-ring ring-b" />
        <span class="empty-ring ring-c" />
      </div>
      <div class="empty-disc">
        <span class="empty-label">NO SIGNAL</span>
      </div>
      <div class="empty-beam" aria-hidden="true" />
    </div>
    <div class="empty-copy">
      <span class="empty-kicker">待启动</span>
      <span class="empty-title">开启一段私人电台</span>
      <span class="empty-subtitle">MyRadio 会结合你的品味、场景和天气，安静地编排下一组歌。</span>
    </div>
  </div>
</template>

<style scoped>
.radio-stage {
  height: 430px;
  min-height: 430px;
  max-height: 430px;
  padding: 10px 16px 8px;
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-rows: 58px 96px 184px 16px 44px;
  row-gap: 2px;
  box-sizing: border-box;
}

/* 封面氛围 */
.stage-bg {
  position: absolute;
  inset: -40px;
  background-size: cover;
  background-position: center;
  filter: blur(48px) brightness(0.34) saturate(1.55);
  opacity: 0.68;
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
    linear-gradient(180deg, rgba(8, 9, 13, 0.02), rgba(8, 9, 13, 0.38) 62%, rgba(8, 9, 13, 0.66)),
    radial-gradient(circle at 70% 22%, rgba(216, 181, 106, 0.1), transparent 35%),
    radial-gradient(circle at 12% 52%, rgba(112, 139, 181, 0.08), transparent 38%);
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
  gap: 2px;
  min-height: 0;
  overflow: hidden;
  align-content: center;
}

.set-label {
  font-family: var(--font-mono);
  font-size: 8px;
  line-height: 1.2;
  color: rgba(216, 181, 106, 0.76);
  letter-spacing: 1.6px;
  text-transform: uppercase;
}

.set-title {
  font-family: var(--font-body);
  font-size: 13px;
  line-height: 1.22;
  color: rgba(244, 239, 228, 0.9);
  font-weight: 560;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.set-meta {
  font-family: var(--font-body);
  font-size: 9px;
  line-height: 1.28;
  color: rgba(241, 233, 216, 0.42);
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
  background: linear-gradient(135deg, var(--ember-dim), rgba(112, 139, 181, 0.13));
  filter: blur(20px);
  opacity: 0.92;
}

.album-tile {
  width: 86px;
  height: 86px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(244, 239, 228, 0.08);
  box-shadow:
    0 18px 42px rgba(0, 0, 0, 0.42),
    0 0 0 1px rgba(255, 255, 255, 0.018);
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
  color: rgba(244, 239, 228, 0.94);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.track-artist {
  font-family: var(--font-body);
  font-size: 11px;
  color: rgba(241, 233, 216, 0.7);
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
  opacity: 0.88;
}

.wave-bar {
  width: 3px;
  min-height: 4px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(241, 233, 216, 0.68), rgba(216, 181, 106, 0.4));
  transform-origin: center;
  transition: height 90ms linear, opacity 120ms ease;
  opacity: 0.56;
  box-shadow: 0 0 8px rgba(216, 181, 106, 0.08);
}

.track-waveform.active .wave-bar {
  opacity: 0.9;
  box-shadow: 0 0 10px rgba(216, 181, 106, 0.14);
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
  font-size: 10px;
  font-weight: 560;
  color: rgba(241, 233, 216, 0.64);
  min-width: 30px;
  font-variant-numeric: tabular-nums;
}

.bar {
  flex: 1;
  height: 4px;
  background: rgba(244, 239, 228, 0.09);
  border-radius: 999px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(244, 239, 228, 0.03);
}

.bar:active { height: 6px; }

.fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(216, 181, 106, 0.95), rgba(77, 216, 141, 0.9));
  border-radius: 999px;
  transition: width 0.3s linear;
  box-shadow: 0 0 12px rgba(216, 181, 106, 0.22);
}

/* 控制按钮 */
.controls {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 22px;
  min-height: 0;
}

.ctrl {
  width: 34px;
  height: 34px;
  border: 0;
  background: transparent;
  color: rgba(241, 233, 216, 0.58);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  cursor: pointer;
  transition: transform 0.16s ease, opacity 0.16s ease, filter 0.16s ease;
  padding: 0;
}

.ctrl:hover:not(:disabled) {
  transform: translateY(-1px);
}

.ctrl:active:not(:disabled) {
  transform: scale(0.94);
}

.ctrl:disabled { opacity: 0.25; cursor: not-allowed; }

.ctrl-play {
  width: 44px;
  height: 44px;
  color: rgba(244, 239, 228, 0.92);
}

.ctrl-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
  display: block;
  filter: brightness(0) saturate(100%) invert(83%) sepia(12%) saturate(398%) hue-rotate(3deg) brightness(90%) contrast(90%);
  opacity: 0.58;
}

.ctrl-icon-play {
  width: 42px;
  height: 42px;
  opacity: 0.9;
  filter:
    brightness(0) saturate(100%) invert(92%) sepia(16%) saturate(365%) hue-rotate(7deg) brightness(98%) contrast(95%)
    drop-shadow(0 0 12px rgba(216, 181, 106, 0.2));
}

.ctrl:hover:not(:disabled) .ctrl-icon {
  opacity: 0.82;
  filter:
    brightness(0) saturate(100%) invert(91%) sepia(12%) saturate(394%) hue-rotate(5deg) brightness(96%) contrast(95%)
    drop-shadow(0 0 8px rgba(216, 181, 106, 0.14));
}

.lyrics-wrap {
  position: relative;
  z-index: 1;
  width: 100%;
  min-width: 0;
  height: 184px;
  min-height: 184px;
  max-height: 184px;
  overflow: hidden;
  border: 0;
  background:
    linear-gradient(180deg, rgba(244, 239, 228, 0.012), transparent 16%, transparent 76%, rgba(8, 9, 13, 0.04)),
    transparent;
  box-shadow: none;
  mask-image: linear-gradient(180deg, transparent 0%, #000 14%, #000 82%, transparent 100%);
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 14%, #000 82%, transparent 100%);
  pointer-events: none;
}

/* 空状态 */
.stage-empty {
  height: 430px;
  min-height: 430px;
  max-height: 430px;
  padding: 10px 16px 12px;
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-rows: 1fr auto;
  align-items: center;
  background:
    radial-gradient(circle at 50% 18%, rgba(216, 181, 106, 0.08), transparent 18%),
    radial-gradient(circle at 50% 46%, rgba(241, 233, 216, 0.05), transparent 34%),
    linear-gradient(180deg, rgba(8, 9, 13, 0.86), rgba(8, 9, 13, 0.98));
}

.stage-empty::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 50% 22%, rgba(216, 181, 106, 0.12), transparent 22%),
    radial-gradient(circle at 16% 48%, rgba(77, 216, 141, 0.08), transparent 30%),
    linear-gradient(180deg, rgba(244, 239, 228, 0.02), transparent 34%, rgba(8, 9, 13, 0) 64%);
  pointer-events: none;
}

.empty-visual {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-rings {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}

.empty-ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(244, 239, 228, 0.06);
  box-shadow: inset 0 0 0 1px rgba(244, 239, 228, 0.01);
}

.ring-a {
  width: 132px;
  height: 132px;
  opacity: 0.38;
}

.ring-b {
  width: 182px;
  height: 182px;
  opacity: 0.2;
}

.ring-c {
  width: 240px;
  height: 240px;
  opacity: 0.1;
}

.empty-disc {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  border: 1px solid rgba(244, 239, 228, 0.08);
  background:
    radial-gradient(circle at 50% 38%, rgba(244, 239, 228, 0.05), transparent 28%),
    rgba(14, 17, 23, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.56;
  box-shadow:
    inset 0 1px 0 rgba(244, 239, 228, 0.02),
    0 0 0 1px rgba(255, 255, 255, 0.01);
}

.empty-beam {
  position: absolute;
  width: 180px;
  height: 36px;
  bottom: 18px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, rgba(216, 181, 106, 0.08), transparent);
  filter: blur(10px);
}

.empty-label {
  font-family: var(--font-brand);
  font-size: 8px;
  color: rgba(241, 233, 216, 0.56);
  letter-spacing: 1.2px;
}

.empty-copy {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 4px;
  justify-items: center;
  padding-bottom: 18px;
}

.empty-kicker {
  font-family: var(--font-mono);
  font-size: 8px;
  color: rgba(216, 181, 106, 0.7);
  letter-spacing: 1.8px;
}

.empty-title {
  font-family: var(--font-body);
  font-size: 13px;
  color: rgba(244, 239, 228, 0.84);
  letter-spacing: 0.8px;
}

.empty-subtitle {
  max-width: 270px;
  text-align: center;
  font-family: var(--font-body);
  font-size: 10px;
  line-height: 1.5;
  color: rgba(241, 233, 216, 0.46);
}
</style>
