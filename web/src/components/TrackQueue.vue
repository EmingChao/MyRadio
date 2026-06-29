<script setup lang="ts">
import { usePlayerStore } from '../stores/player'

const store = usePlayerStore()
</script>

<template>
  <div class="queue">
    <div class="queue-header">
      <div>
        <span class="queue-label">播放队列</span>
        <p class="queue-title">{{ store.session?.sessionTitle || '队列' }}</p>
      </div>
      <span class="queue-count">{{ store.trackCount }} 首</span>
    </div>
    <div v-if="store.currentTrack" class="queue-current">
      <span class="current-kicker">正在播放</span>
      <strong>{{ store.currentTrack.title }}</strong>
      <small>{{ store.currentTrack.artist }}</small>
      <p>{{ store.currentTrack.recommendReason || 'MyRadio 会根据当前场景和你的品味继续调整后续队列。' }}</p>
    </div>
    <div v-else class="queue-empty">
      <span class="empty-kicker">暂无队列</span>
      <strong>先开启一段私人电台</strong>
      <p>队列会在歌曲开始后展示，后续也会根据你的输入静默调整。</p>
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
        <button
          class="item-like"
          :class="{ liked: track.liked }"
          :aria-label="track.liked ? '取消红心' : '红心收藏'"
          @click.stop="store.toggleLike(i)"
        >
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path
              v-if="track.liked"
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
        <span v-if="i === store.currentIndex" class="item-playing" aria-label="当前播放" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.queue {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: var(--text-primary);
}

.queue-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 4px 16px 12px;
  border-bottom: 0;
  gap: 12px;
}

.queue-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: rgba(216, 181, 106, 0.76);
  letter-spacing: 1.6px;
  text-transform: uppercase;
}

.queue-title {
  margin: 2px 0 0;
  font-family: var(--font-body);
  font-size: 17px;
  font-weight: 760;
  color: rgba(244, 239, 228, 0.92);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-count {
  font-family: var(--font-mono);
  font-size: 11px;
  color: rgba(241, 233, 216, 0.42);
  letter-spacing: 0.8px;
  flex-shrink: 0;
  margin-top: 2px;
  text-transform: uppercase;
}

.queue-current {
  margin: 0 14px 10px;
  padding: 12px 13px 13px;
  border-radius: 10px;
  border: 1px solid rgba(244, 239, 228, 0.075);
  background:
    radial-gradient(circle at 10% 10%, rgba(216, 181, 106, 0.09), transparent 38%),
    linear-gradient(180deg, rgba(244, 239, 228, 0.048), rgba(244, 239, 228, 0.018));
  box-shadow: inset 0 1px 0 rgba(244, 239, 228, 0.035);
}

.queue-empty {
  margin: 80px 14px 0;
  padding: 18px 16px;
  border-radius: 14px;
  border: 1px solid rgba(244, 239, 228, 0.045);
  background:
    linear-gradient(180deg, rgba(244, 239, 228, 0.035), rgba(244, 239, 228, 0.01));
  text-align: center;
  box-shadow: inset 0 1px 0 rgba(244, 239, 228, 0.02);
}

.queue-empty .empty-kicker {
  display: block;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 1.4px;
  color: rgba(216, 181, 106, 0.68);
}

.queue-empty strong {
  display: block;
  margin-top: 5px;
  font-family: var(--font-body);
  font-size: 16px;
  color: rgba(244, 239, 228, 0.88);
}

.queue-empty p {
  margin: 6px 0 0;
  font-family: var(--font-body);
  font-size: 13px;
  line-height: 1.6;
  color: rgba(241, 233, 216, 0.56);
}

.current-kicker {
  display: block;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 1.5px;
  color: rgba(77, 216, 141, 0.74);
  margin-bottom: 4px;
}

.queue-current strong {
  display: block;
  font-family: var(--font-body);
  font-size: 16px;
  color: rgba(244, 239, 228, 0.94);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-current small {
  display: block;
  margin-top: 1px;
  font-family: var(--font-body);
  font-size: 13px;
  color: rgba(241, 233, 216, 0.56);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-current p {
  margin: 7px 0 0;
  font-family: var(--font-body);
  font-size: 13px;
  line-height: 1.6;
  color: rgba(241, 233, 216, 0.58);
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.queue-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 10px;
}

.queue-list::-webkit-scrollbar { width: 2px; }
.queue-list::-webkit-scrollbar-thumb { background: var(--line-m); }

.queue-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 9px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.15s, border-color 0.15s, transform 0.15s;
}

.queue-item:hover {
  background: rgba(244, 239, 228, 0.035);
}

.queue-item.active {
  background:
    linear-gradient(90deg, rgba(77, 216, 141, 0.11), rgba(244, 239, 228, 0.025));
  border-color: rgba(77, 216, 141, 0.13);
}

.item-index {
  font-family: var(--font-mono);
  font-size: 12px;
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
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 720;
  color: rgba(244, 239, 228, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-artist {
  font-family: var(--font-body);
  font-size: 12px;
  color: rgba(241, 233, 216, 0.44);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-reason {
  margin-top: 2px;
  font-family: var(--font-body);
  font-size: 12px;
  color: rgba(241, 233, 216, 0.38);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-playing {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--signal);
  box-shadow: 0 0 12px rgba(77, 216, 141, 0.35);
  animation: blink 1.5s ease-in-out infinite;
}

.item-like {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  color: rgba(241, 233, 216, 0.28);
  transition: color 0.2s, transform 0.15s;
  padding: 0;
}

.item-like:hover {
  color: rgba(216, 100, 100, 0.7);
  transform: scale(1.15);
}

.item-like.liked {
  color: rgba(220, 80, 80, 0.9);
}

.item-like.liked:hover {
  color: rgba(220, 80, 80, 0.6);
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
