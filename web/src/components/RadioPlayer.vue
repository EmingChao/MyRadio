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
    <div class="controls-row">
      <div class="controls-center">
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
        <button
          class="ctrl-like"
          :class="{ liked: store.currentTrack?.liked }"
          :aria-label="store.currentTrack?.liked ? '取消红心' : '红心收藏'"
          @click="store.toggleLike(store.currentIndex)"
        >
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path
              v-if="store.currentTrack?.liked"
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              fill="currentColor"
            />
            <path
              v-else
              d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>
    </div>
  </div>

  <!-- 无会话占位 -->
  <div v-else class="stage-empty">
    <div class="empty-visual">
      <div class="empty-signal" aria-hidden="true">
        <span class="signal-line line-a" />
        <span class="signal-line line-b" />
        <span class="signal-line line-c" />
        <span class="signal-line line-d" />
        <span class="signal-line line-e" />
        <span class="signal-line line-f" />
      </div>
      <span class="empty-label">待接入私人电台</span>
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
  height: 408px;
  min-height: 408px;
  max-height: 408px;
  padding: 6px 16px 0;
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-rows: 48px 88px 170px 18px 42px;
  row-gap: 2px;
  box-sizing: border-box;
}

/* 封面氛围 */
.stage-bg {
  display: none;
}

.radio-stage::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(8, 9, 13, 0.02), rgba(8, 9, 13, 0.08) 66%, rgba(8, 9, 13, 0.02)),
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
  font-size: 10px;
  line-height: 1.2;
  color: rgba(216, 181, 106, 0.76);
  letter-spacing: 1.6px;
  text-transform: uppercase;
}

.set-title {
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.22;
  color: rgba(244, 239, 228, 0.9);
  font-weight: 560;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.set-meta {
  font-family: var(--font-body);
  font-size: 11px;
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
  width: 82px;
  height: 82px;
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
  font-size: 18px;
  font-weight: 760;
  color: rgba(244, 239, 228, 0.94);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.track-artist {
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 600;
  color: rgba(241, 233, 216, 0.7);
  margin-top: 2px;
  letter-spacing: 0.3px;
}

.track-album {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
  margin-top: 1px;
}

.track-waveform {
  height: 26px;
  margin-top: 9px;
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
  font-size: 11px;
  font-weight: 700;
  color: rgba(241, 233, 216, 0.64);
  min-width: 30px;
  font-variant-numeric: tabular-nums;
}

.bar {
  flex: 1;
  height: 5px;
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
.controls-row {
  display: flex;
  justify-content: center;
  z-index: 2;
  min-height: 0;
}

.controls-center {
  position: relative;
  display: flex;
  align-items: center;
  gap: 20px;
}

.ctrl-like {
  position: absolute;
  left: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border: 0;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(241, 233, 216, 0.32);
  transition: color 0.2s, transform 0.15s;
  padding: 0;
}

.ctrl-like:hover {
  color: rgba(220, 80, 80, 0.7);
  transform: translateY(-50%) scale(1.1);
}

.ctrl-like.liked {
  color: rgba(220, 80, 80, 0.9);
}

.ctrl-like.liked:hover {
  color: rgba(220, 80, 80, 0.6);
}

.ctrl {
  width: 32px;
  height: 32px;
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
  width: 40px;
  height: 40px;
  color: rgba(244, 239, 228, 0.92);
}

.ctrl-icon {
  width: 27px;
  height: 27px;
  object-fit: contain;
  display: block;
  filter: brightness(0) saturate(100%) invert(83%) sepia(12%) saturate(398%) hue-rotate(3deg) brightness(90%) contrast(90%);
  opacity: 0.58;
}

.ctrl-icon-play {
  width: 38px;
  height: 38px;
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
  height: 170px;
  min-height: 170px;
  max-height: 170px;
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
  height: 408px;
  min-height: 408px;
  max-height: 408px;
  padding: 10px 16px 0;
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-rows: 1fr auto;
  align-items: center;
  background: transparent;
}

.stage-empty::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 30%, rgba(216, 181, 106, 0.08), transparent 32%),
    radial-gradient(ellipse at 26% 48%, rgba(77, 216, 141, 0.06), transparent 34%);
  pointer-events: none;
}

.empty-visual {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 10px;
  align-items: center;
  justify-content: center;
  justify-items: center;
  transform: translateY(12px);
}

.empty-signal {
  width: 170px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 0;
  background: transparent;
  opacity: 0.82;
}

.signal-line {
  width: 4px;
  min-height: 10px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(241, 233, 216, 0.68), rgba(216, 181, 106, 0.36));
  box-shadow: 0 0 12px rgba(216, 181, 106, 0.08);
}

.line-a,
.line-f { height: 16px; opacity: 0.42; }
.line-b,
.line-e { height: 30px; opacity: 0.56; }
.line-c { height: 46px; opacity: 0.72; }
.line-d { height: 38px; opacity: 0.64; }

.signal-line {
  animation: idle-signal 2.8s ease-in-out infinite;
}

.line-b { animation-delay: 0.12s; }
.line-c { animation-delay: 0.24s; }
.line-d { animation-delay: 0.36s; }
.line-e { animation-delay: 0.48s; }
.line-f { animation-delay: 0.6s; }

@keyframes idle-signal {
  0%, 100% { transform: scaleY(0.82); }
  50% { transform: scaleY(1.08); }
}

.empty-label {
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 700;
  color: rgba(241, 233, 216, 0.46);
  letter-spacing: 0;
}

.empty-copy {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 4px;
  justify-items: center;
  padding-bottom: 0;
}

.empty-kicker {
  font-family: var(--font-mono);
  font-size: 10px;
  color: rgba(216, 181, 106, 0.7);
  letter-spacing: 1.8px;
}

.empty-title {
  font-family: var(--font-body);
  font-size: 15px;
  color: rgba(244, 239, 228, 0.84);
  letter-spacing: 0.8px;
}

.empty-subtitle {
  max-width: 270px;
  text-align: center;
  font-family: var(--font-body);
  font-size: 12px;
  line-height: 1.5;
  color: rgba(241, 233, 216, 0.46);
}
</style>
