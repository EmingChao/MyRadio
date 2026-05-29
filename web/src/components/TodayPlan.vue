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
    <div v-if="loading" class="plan-loading">LOADING...</div>

    <template v-else-if="plan">
      <div class="plan-header">
        <span class="plan-label">PLAN</span>
        <span class="plan-title">{{ plan.planTitle }}</span>
      </div>
      <div v-if="plan.weatherSummary" class="plan-weather">{{ plan.weatherSummary }}</div>
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
          >{{ starting ? '...' : 'START THIS SET' }}</button>
        </div>
      </div>
    </template>

    <div v-else class="plan-empty">NO PLAN TODAY</div>
  </div>
</template>

<style scoped>
.plan {
  display: flex;
  flex-direction: column;
  height: 100%;
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
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
}

.plan-label {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--warm);
  letter-spacing: 1px;
  padding: 1px 6px;
  border: 1px solid var(--warm-dim);
}

.plan-title {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.plan-weather {
  padding: 6px 16px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
  letter-spacing: 0.5px;
}

.plan-timeline {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.plan-timeline::-webkit-scrollbar { width: 2px; }
.plan-timeline::-webkit-scrollbar-thumb { background: var(--line-m); }

.plan-slot {
  padding: 8px 16px;
  transition: background 0.15s;
}

.plan-slot.current {
  background: var(--signal-glow);
  border-left: 2px solid var(--signal-dim);
  margin-left: 0;
  padding-left: 14px;
}

.slot-time {
  font-family: var(--font-mono);
  font-size: 10px;
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
  font-size: 9px;
  color: var(--signal);
  letter-spacing: 1px;
}

.slot-mood {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--warm);
}

.slot-desc {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-2);
  margin-top: 3px;
  line-height: 1.4;
}

.slot-play {
  margin-top: 6px;
  padding: 4px 12px;
  background: var(--signal-dim);
  border: 1px solid rgba(55, 214, 122, 0.25);
  border-radius: 4px;
  color: var(--signal);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 1px;
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
