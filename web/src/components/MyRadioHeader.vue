<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { usePlayerStore } from '../stores/player'
import { getCurrentWeather } from '../api'

interface WeatherInfo {
  temperature: number
  weatherCode: number
  description: string
  precipitation: number
}

const store = usePlayerStore()

const emit = defineEmits<{ (e: 'settings'): void }>()

const now = ref(new Date())
const weather = ref<WeatherInfo | null>(null)
let timer: ReturnType<typeof setInterval>

onMounted(() => {
  timer = setInterval(() => { now.value = new Date() }, 1000)
  loadWeather()
})
onUnmounted(() => clearInterval(timer))

const timeStr = computed(() => {
  const h = String(now.value.getHours()).padStart(2, '0')
  const m = String(now.value.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
})

const statusLabel = computed(() => {
  if (store.djSpeaking) return 'DJ 讲话中'
  if (store.isPlaying) return '播放中'
  if (store.session) return '已暂停'
  return '待启动'
})

const weatherText = computed(() => {
  if (!weather.value) return '天气同步中'
  return `${weather.value.description} · ${Math.round(weather.value.temperature)}°C`
})

async function loadWeather() {
  try {
    const res = await getCurrentWeather()
    if (res.code === 0 && res.data) {
      weather.value = res.data
    }
  } catch {
    weather.value = {
      temperature: 0,
      weatherCode: 2,
      description: '天气未知',
      precipitation: 0,
    }
  }
}
</script>

<template>
  <header class="myradio-header">
    <div class="header-slab">
      <div class="brand-row">
        <span class="brand-name">MyRadio</span>
        <span class="brand-status" :class="{ active: store.session }">{{ statusLabel }}</span>
        <span v-if="store.djSpeaking" class="header-wave" aria-label="DJ 正在讲话">
          <span /><span /><span />
        </span>
      </div>

      <div class="weather-cluster" :aria-label="weatherText">
        <span class="weather-copy">{{ weatherText }}</span>
        <span class="header-time">{{ timeStr }}</span>
      </div>

      <button class="header-settings" aria-label="打开设置" @click="emit('settings')">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M10.5 4.75h3l.55 2.05c.43.14.84.32 1.22.55l1.96-.82 2.12 2.12-.82 1.96c.23.38.41.79.55 1.22l2.05.55v3l-2.05.55c-.14.43-.32.84-.55 1.22l.82 1.96-2.12 2.12-1.96-.82c-.38.23-.79.41-1.22.55l-.55 2.05h-3l-.55-2.05c-.43-.14-.84-.32-1.22-.55l-1.96.82-2.12-2.12.82-1.96a7.52 7.52 0 0 1-.55-1.22L2.5 13.5v-3l2.05-.55c.14-.43.32-.84.55-1.22l-.82-1.96 2.12-2.12 1.96.82c.38-.23.79-.41 1.22-.55l.55-2.05Zm1.5 5.5a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5Z"/>
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.myradio-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 8px 16px 2px;
  min-height: 38px;
  z-index: 3;
  background:
    linear-gradient(180deg, rgba(7, 8, 11, 0.26), rgba(7, 8, 11, 0.06));
  border-bottom: 0;
  backdrop-filter: blur(18px) saturate(1.12);
  -webkit-backdrop-filter: blur(18px) saturate(1.12);
  pointer-events: auto;
}

.header-slab {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 6px;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.brand-name {
  font-family: var(--font-brand);
  font-size: 16px;
  line-height: 1;
  letter-spacing: 1.2px;
  color: rgba(244, 239, 228, 0.88);
  white-space: nowrap;
}

.brand-status {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 650;
  color: rgba(241, 233, 216, 0.56);
  letter-spacing: 1px;
  text-transform: uppercase;
  white-space: nowrap;
}

.brand-status.active {
  color: rgba(216, 181, 106, 0.64);
}

.header-wave {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 12px;
}

.header-wave span {
  width: 2px;
  height: 8px;
  border-radius: 99px;
  background: rgba(216, 181, 106, 0.72);
  animation: header-wave 0.8s ease-in-out infinite;
}

.header-wave span:nth-child(2) {
  height: 12px;
  animation-delay: 0.14s;
}

.header-wave span:nth-child(3) {
  height: 6px;
  animation-delay: 0.28s;
}

@keyframes header-wave {
  0%, 100% { transform: scaleY(0.45); opacity: 0.55; }
  50% { transform: scaleY(1); opacity: 1; }
}

.weather-cluster {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 16px;
  color: rgba(241, 233, 216, 0.72);
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 560;
  white-space: nowrap;
}

.weather-copy {
  max-width: 74px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-time {
  font-family: var(--font-brand);
  font-size: 17px;
  letter-spacing: 1.2px;
  color: rgba(244, 239, 228, 0.82);
}

.header-settings {
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 50%;
  background: rgba(244, 239, 228, 0.06);
  color: rgba(241, 233, 216, 0.58);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: color 0.18s ease, background 0.18s ease, transform 0.18s ease, border-color 0.18s ease;
  border: 1px solid rgba(244, 239, 228, 0.08);
}

.header-settings:hover {
  color: rgba(241, 233, 216, 0.66);
  background: rgba(244, 239, 228, 0.06);
  border-color: rgba(244, 239, 228, 0.08);
}

.header-settings:active {
  transform: scale(0.94);
}

.header-settings svg {
  width: 14px;
  height: 14px;
  fill: currentColor;
}

@media (max-width: 768px) {
  .myradio-header {
    padding: 8px 12px 2px;
  }

  .weather-copy {
    max-width: 66px;
  }
}
</style>
