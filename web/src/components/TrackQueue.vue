<script setup lang="ts">
import { usePlayerStore } from '../stores/player'

const store = usePlayerStore()
</script>

<template>
  <div class="queue">
    <div class="queue-header">
      <div>
        <span class="queue-label">TONIGHT'S SET</span>
        <p class="queue-title">{{ store.session?.sessionTitle || 'Queue' }}</p>
      </div>
      <span class="queue-count">{{ store.trackCount }} TRACKS</span>
    </div>
    <div v-if="store.currentTrack" class="queue-current">
      <span class="current-kicker">CURRENT</span>
      <strong>{{ store.currentTrack.title }}</strong>
      <p>{{ store.currentTrack.recommendReason || 'Claudio picked this track for the current set.' }}</p>
    </div>
    <div class="queue-list">
      <div
        v-for="(track, i) in store.session?.tracks"
        :key="track.trackId"
        class="queue-item"
        :class="{ active: i === store.currentIndex }"
        @click="store.goTo(i)"
      >
        <span class="item-index">{{ String(i + 1).padStart(2, '0') }}</span>
        <div class="item-info">
          <span class="item-title">{{ track.title }}</span>
          <span class="item-artist">{{ track.artist }}</span>
          <span v-if="track.recommendReason" class="item-reason">{{ track.recommendReason }}</span>
        </div>
        <span v-if="i === store.currentIndex" class="item-playing">▶</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.queue {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.queue-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
  gap: 12px;
}

.queue-label {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-3);
  letter-spacing: 1px;
}

.queue-title {
  margin: 2px 0 0;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.35;
}

.queue-count {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-3);
  letter-spacing: 1px;
  flex-shrink: 0;
  margin-top: 2px;
}

.queue-current {
  margin: 10px 14px 8px;
  padding: 12px 13px;
  border-radius: var(--radius-lg);
  background: var(--paper);
  color: var(--ink);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
}

.current-kicker {
  display: block;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 1.5px;
  color: rgba(21, 21, 21, 0.5);
  margin-bottom: 4px;
}

.queue-current strong {
  display: block;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--ink);
}

.queue-current p {
  margin: 5px 0 0;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.6;
  color: rgba(21, 21, 21, 0.68);
}

.queue-list {
  flex: 1;
  overflow-y: auto;
}

.queue-list::-webkit-scrollbar { width: 2px; }
.queue-list::-webkit-scrollbar-thumb { background: var(--line-m); }

.queue-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.15s;
}

.queue-item:hover {
  background: var(--raised);
}

.queue-item.active {
  background: var(--signal-glow);
  border-left: 2px solid var(--signal-dim);
}

.item-index {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
  width: 22px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.queue-item.active .item-index {
  color: var(--signal);
}

.item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.item-title {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-artist {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-reason {
  margin-top: 2px;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-playing {
  font-size: 10px;
  color: var(--signal);
  animation: blink 1.5s ease-in-out infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
