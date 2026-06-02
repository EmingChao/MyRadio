<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getDailyPlan, createSessionFromPlan } from '../api'
import { usePlayerStore } from '../stores/player'

const store = usePlayerStore()
const plan = ref<any>(null)
const loading = ref(true)
const starting = ref(false)

onMounted(async () => {
  try {
    const res = await getDailyPlan()
    if (res.code === 0 && res.data) plan.value = res.data
  } catch {} finally {
    loading.value = false
  }
})

function isCurrentSlot(item: any): boolean {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const currentTime = `${hh}:${mm}`
  return currentTime >= item.startTime && currentTime < item.endTime
}

async function handlePlayFromPlan() {
  if (starting.value || store.session) return
  starting.value = true
  try {
    const res = await createSessionFromPlan()
    if (res.code === 0) store.setSession(res.data)
  } catch {} finally {
    starting.value = false
  }
}
</script>

<template>
  <div class="plan">
    <div v-if="loading" class="plan-loading">正在读取今日计划...</div>

    <template v-else-if="plan">
      <div class="plan-header">
        <span class="plan-label">今日计划</span>
        <span class="plan-title">{{ plan.planTitle }}</span>
        <span v-if="plan.weatherSummary" class="plan-weather">{{ plan.weatherSummary }}</span>
      </div>
      <div class="plan-timeline">
        <div
          v-for="(item, i) in plan.items"
          :key="i"
          class="plan-slot"
          :class="{ current: isCurrentSlot(item) }"
        >
          <div class="slot-time">{{ item.startTime }}–{{ item.endTime }}</div>
          <div class="slot-meta">
            <span class="slot-scene">{{ item.scene }}</span>
            <span class="slot-mood">{{ item.mood }}</span>
          </div>
          <div v-if="item.strategySummary" class="slot-desc">{{ item.strategySummary }}</div>
          <button
            v-if="isCurrentSlot(item) && !store.session"
            class="slot-play"
            :disabled="starting"
            @click.stop="handlePlayFromPlan"
          >{{ starting ? '...' : '播放这一段' }}</button>
        </div>
      </div>
    </template>

    <div v-else class="plan-empty">今天还没有计划</div>
  </div>
</template>

<style scoped>
.plan {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: var(--text-primary);
}

.plan-loading,
.plan-empty {
  padding: 40px 16px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
  letter-spacing: 1px;
}

.plan-header {
  display: grid;
  gap: 2px;
  padding: 4px 16px 13px;
  border-bottom: 0;
}

.plan-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: rgba(216, 181, 106, 0.76);
  letter-spacing: 1.6px;
  text-transform: uppercase;
}

.plan-title {
  font-family: var(--font-body);
  font-size: 17px;
  font-weight: 760;
  color: rgba(244, 239, 228, 0.92);
  line-height: 1.35;
}

.plan-weather {
  font-family: var(--font-body);
  font-size: 12px;
  color: rgba(241, 233, 216, 0.42);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-timeline {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 12px;
}

.plan-timeline::-webkit-scrollbar { width: 2px; }
.plan-timeline::-webkit-scrollbar-thumb { background: var(--line-m); }

.plan-slot {
  position: relative;
  padding: 10px 10px 10px 14px;
  border-radius: 8px;
  border: 1px solid transparent;
  transition: background 0.15s, border-color 0.15s;
}

.plan-slot::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 12px;
  bottom: 12px;
  width: 2px;
  border-radius: 999px;
  background: rgba(244, 239, 228, 0.08);
}

.plan-slot.current {
  background:
    radial-gradient(circle at 12% 8%, rgba(77, 216, 141, 0.1), transparent 34%),
    linear-gradient(90deg, rgba(77, 216, 141, 0.08), rgba(244, 239, 228, 0.02));
  border-color: rgba(77, 216, 141, 0.12);
}

.plan-slot.current::before {
  background: rgba(77, 216, 141, 0.74);
  box-shadow: 0 0 12px rgba(77, 216, 141, 0.2);
}

.slot-time {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-3);
  letter-spacing: 0.5px;
  font-variant-numeric: tabular-nums;
}

.slot-meta {
  display: flex;
  gap: 8px;
  margin-top: 3px;
}

.slot-scene {
  font-family: var(--font-mono);
  font-size: 11px;
  color: rgba(77, 216, 141, 0.8);
  letter-spacing: 1px;
  text-transform: uppercase;
}

.slot-mood {
  font-family: var(--font-mono);
  font-size: 11px;
  color: rgba(216, 181, 106, 0.78);
}

.slot-desc {
  font-family: var(--font-body);
  font-size: 13px;
  color: rgba(241, 233, 216, 0.56);
  margin-top: 5px;
  line-height: 1.55;
}

.slot-play {
  margin-top: 8px;
  padding: 5px 12px;
  background:
    linear-gradient(180deg, rgba(77, 216, 141, 0.16), rgba(77, 216, 141, 0.08));
  border: 1px solid rgba(77, 216, 141, 0.18);
  border-radius: 8px;
  color: rgba(143, 238, 180, 0.92);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 760;
  letter-spacing: 0;
  cursor: pointer;
  transition: all 0.15s;
}

.slot-play:hover:not(:disabled) {
  background: rgba(55, 214, 122, 0.25);
}

.slot-play:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
