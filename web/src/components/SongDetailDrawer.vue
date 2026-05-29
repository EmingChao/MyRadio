<script setup lang="ts">
import { ref } from 'vue'
import type { RadioTrack } from '../stores/player'
import BottomSheet from './BottomSheet.vue'
import LyricsPanel from './LyricsPanel.vue'

defineProps<{
  visible: boolean
  track: RadioTrack | null
  currentTime: number
}>()

const emit = defineEmits<{ (e: 'close'): void }>()
const showFullLyrics = ref(false)
</script>

<template>
  <BottomSheet :visible="visible" title="TRACK INFO" @close="emit('close')">
    <div class="detail" v-if="track">
      <!-- 封面 + 基本信息 -->
      <div class="detail-header">
        <img
          v-if="track.coverUrl"
          :src="track.coverUrl"
          class="detail-cover"
          alt="cover"
        />
        <div v-else class="detail-cover-placeholder">♪</div>
        <div class="detail-info">
          <div class="detail-title">{{ track.title }}</div>
          <div class="detail-artist">{{ track.artist }}</div>
          <div v-if="track.album" class="detail-album">{{ track.album }}</div>
        </div>
      </div>

      <!-- 推荐理由 -->
      <div v-if="track.recommendReason" class="detail-section">
        <div class="section-label">WHY THIS TRACK</div>
        <p class="section-text warm">{{ track.recommendReason }}</p>
      </div>

      <!-- DJ 解说词 -->
      <div v-if="track.djScript" class="detail-section">
        <div class="section-label">DJ SAYS</div>
        <p class="section-text">{{ track.djScript }}</p>
      </div>

      <!-- DJ 串场词 -->
      <div v-if="track.segue" class="detail-section">
        <div class="section-label">SEGUE</div>
        <p class="section-text warm">{{ track.segue }}</p>
      </div>

      <!-- 歌词 -->
      <div v-if="track.lyrics" class="detail-section">
        <div class="section-header">
          <span class="section-label">LYRICS</span>
          <button class="expand-btn" @click="showFullLyrics = !showFullLyrics">
            {{ showFullLyrics ? 'COLLAPSE' : 'FULL' }}
          </button>
        </div>
        <LyricsPanel
          :lyrics="track.lyrics"
          :current-time="currentTime"
          :style="showFullLyrics ? { maxHeight: '400px' } : { maxHeight: '160px' }"
        />
      </div>

      <!-- 无歌词提示 -->
      <div v-else class="detail-section">
        <div class="section-label">LYRICS</div>
        <p class="section-text muted">暂无歌词</p>
      </div>
    </div>
  </BottomSheet>
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 头部：封面 + 信息 */
.detail-header {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.detail-cover {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.detail-cover-placeholder {
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  font-size: 32px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.detail-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-title {
  font-family: var(--font-pixel);
  font-size: 22px;
  color: var(--text-primary);
  line-height: 1.2;
}

.detail-artist {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--accent);
  letter-spacing: 0.5px;
}

.detail-album {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}

/* 区块通用 */
.detail-section {
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.section-label {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: 1px;
  margin-bottom: 8px;
}

.section-header .section-label {
  margin-bottom: 0;
}

.section-text {
  font-family: var(--font-pixel);
  font-size: 15px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 0;
}

.section-text.warm {
  color: var(--warm);
  border-left: 2px solid var(--warm-dim);
  padding-left: 10px;
}

.section-text.muted {
  color: var(--text-muted);
  font-size: 13px;
}

.expand-btn {
  padding: 1px 8px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.15s;
}

.expand-btn:hover {
  border-color: var(--accent-dim);
  color: var(--accent);
}
</style>
