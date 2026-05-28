<script setup lang="ts">
import { usePlayerStore } from '../stores/player'

const store = usePlayerStore()
</script>

<template>
  <div class="queue">
    <div class="queue-header">
      <span class="queue-label">QUEUE</span>
      <span class="queue-count">{{ store.trackCount }} TRACKS</span>
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
        </div>
        <span v-if="i === store.currentIndex" class="item-playing">&gt;</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.queue {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
}

.queue-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 1px;
}

.queue-count {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 1px;
}

.queue-list {
  flex: 1;
  overflow-y: auto;
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  transition: background 0.15s;
}

.queue-item:hover {
  background: var(--bg-raised);
}

.queue-item.active {
  background: var(--accent-glow);
  border-left: 2px solid var(--accent-dim);
}

.item-index {
  font-family: var(--font-pixel);
  font-size: 16px;
  color: var(--text-muted);
  width: 24px;
  text-align: right;
}

.queue-item.active .item-index {
  color: var(--accent);
}

.item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.item-title {
  font-family: var(--font-pixel);
  font-size: 16px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-artist {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-playing {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--accent);
  animation: blink 1.5s ease-in-out infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
