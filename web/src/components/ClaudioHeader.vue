<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { usePlayerStore } from '../stores/player'

const store = usePlayerStore()

const emit = defineEmits<{ (e: 'settings'): void }>()

const now = ref(new Date())
let timer: ReturnType<typeof setInterval>

onMounted(() => {
  timer = setInterval(() => { now.value = new Date() }, 1000)
})
onUnmounted(() => clearInterval(timer))

const timeStr = computed(() => {
  const h = String(now.value.getHours()).padStart(2, '0')
  const m = String(now.value.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
})

const statusLabel = computed(() => {
  if (store.djSpeaking) return 'SPEAKING'
  if (store.isPlaying) return 'ON AIR'
  if (store.session) return 'PAUSED'
  return 'STANDBY'
})

const statusLine = computed(() => {
  if (store.djSpeaking) return 'online · speaking between tracks'
  if (store.isPlaying) return 'online · on your current set'
  if (store.session) return 'online · paused'
  return 'offline · waiting for a mood'
})

const tagline = computed(() => {
  if (store.djSpeaking) return 'Speaking between tracks.'
  if (store.session) return 'I have taste.'
  return 'Your mood is my prompt.'
})
</script>

<template>
  <header class="claudio-header">
    <div class="hdr-avatar" aria-hidden="true">
      <span class="avatar-mark">C</span>
    </div>
    <div class="hdr-identity">
      <div class="hdr-title-row">
        <span class="hdr-name">Claudio</span>
        <span class="hdr-status" :class="{ online: store.session }">{{ statusLabel }}</span>
        <span v-if="store.djSpeaking" class="hdr-speaking" aria-label="DJ speaking">
          <span class="speak-bar" /><span class="speak-bar" /><span class="speak-bar" />
        </span>
      </div>
      <div class="hdr-subline">
        <span>{{ statusLine }}</span>
        <span class="hdr-dot">·</span>
        <span>{{ tagline }}</span>
      </div>
    </div>
    <span class="hdr-time">{{ timeStr }}</span>
    <button class="hdr-settings" aria-label="打开设置" @click="emit('settings')">&#9881;</button>
  </header>
</template>

<style scoped>
.claudio-header {
  display: flex;
  align-items: flex-start;
  padding: 10px 16px 8px;
  gap: 8px;
  flex-shrink: 0;
  background: transparent;
}

.hdr-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 35% 25%, rgba(242, 238, 230, 0.18), transparent 32%),
    var(--surface);
  border: 1.5px solid var(--signal-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-brand);
  font-size: 14px;
  color: var(--signal);
  position: relative;
  flex-shrink: 0;
  margin-top: 1px;
}

.avatar-mark {
  transform: translateY(-1px);
}

.hdr-avatar::after {
  content: '';
  position: absolute;
  bottom: -1px;
  right: -1px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-3);
  border: 1.5px solid var(--stage-black);
  transition: background 0.3s;
}

.claudio-header:has(.hdr-status.online) .hdr-avatar::after {
  background: var(--signal);
  animation: hdr-pulse 2s ease-in-out infinite;
}

@keyframes hdr-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(55, 214, 122, 0.4); }
  50% { opacity: 0.7; box-shadow: 0 0 4px 1px rgba(55, 214, 122, 0.15); }
}

.hdr-identity {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.hdr-title-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.hdr-name {
  font-family: var(--font-brand);
  font-size: 18px;
  color: var(--text-primary);
  letter-spacing: 2px;
  line-height: 1;
}

.hdr-status {
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--text-3);
  letter-spacing: 1px;
  padding: 1px 5px;
  border: 1px solid var(--line);
  text-transform: uppercase;
}

.hdr-status.online {
  color: var(--signal);
  border-color: var(--signal-dim);
}

.hdr-subline {
  display: flex;
  align-items: center;
  gap: 5px;
  max-width: 190px;
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--text-3);
  letter-spacing: 0.4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hdr-dot {
  color: var(--line-m);
}

/* DJ speaking 波形 */
.hdr-speaking {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 2px;
}

.speak-bar {
  width: 2px;
  height: 8px;
  background: var(--warm);
  border-radius: 1px;
  animation: speak-wave 0.8s ease-in-out infinite;
}

.speak-bar:nth-child(2) { animation-delay: 0.15s; height: 12px; }
.speak-bar:nth-child(3) { animation-delay: 0.3s; height: 6px; }

@keyframes speak-wave {
  0%, 100% { transform: scaleY(0.4); }
  50% { transform: scaleY(1); }
}

.hdr-time {
  margin-left: auto;
  font-family: var(--font-brand);
  font-size: 24px;
  color: var(--text-2);
  letter-spacing: 2px;
}

.hdr-settings {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--text-3);
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  padding: 0;
}

.hdr-settings:hover {
  border-color: var(--line-m);
  color: var(--text-2);
}

@media (max-width: 768px) {
  .claudio-header {
    padding: 8px 12px 6px;
  }

  .hdr-subline {
    max-width: 165px;
  }
}
</style>
