<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getDailyPlan } from '../api'
import { usePlayerStore } from '../stores/player'

const store = usePlayerStore()
const plan = ref<any>(null)
const loading = ref(true)

const sceneLabels: Record<string, string> = {
  morning: 'MORNING',
  working: 'WORK',
  relaxing: 'CHILL',
  sleeping: 'SLEEP',
  coding: 'CODE',
}

onMounted(async () => {
  try {
    const res = await getDailyPlan()
    if (res.code === 0 && res.data) {
      plan.value = res.data
    }
  } catch {
    // 静默失败
  } finally {
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
</script>

<template>
  <div class="today-plan" v-if="plan">
    <div class="plan-header">
      <span class="plan-label">PLAN</span>
      <span class="plan-title">{{ plan.planTitle }}</span>
    </div>
    <div class="plan-weather" v-if="plan.weatherSummary">
      {{ plan.weatherSummary }}
    </div>
    <div class="plan-items">
      <div
        v-for="(item, i) in plan.items"
        :key="i"
        class="plan-item"
        :class="{ active: isCurrentSlot(item) }"
      >
        <div class="item-time">{{ item.startTime }}-{{ item.endTime }}</div>
        <div class="item-scene">{{ sceneLabels[item.scene] || item.scene }}</div>
        <div class="item-mood">{{ item.mood }}</div>
        <div class="item-desc">{{ item.strategySummary }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.today-plan {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-surface);
  font-family: var(--font-mono);
  font-size: 11px;
}

.plan-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.plan-label {
  font-size: 9px;
  color: var(--warm);
  letter-spacing: 1px;
  padding: 1px 4px;
  border: 1px solid var(--warm-dim);
}

.plan-title {
  font-family: var(--font-pixel);
  font-size: 16px;
  color: var(--text-primary);
}

.plan-weather {
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 8px;
  letter-spacing: 1px;
}

.plan-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.plan-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid transparent;
  transition: all 0.15s;
}

.plan-item.active {
  border-color: var(--accent-dim);
  background: var(--accent-glow);
}

.item-time {
  color: var(--text-muted);
  font-size: 10px;
  min-width: 80px;
}

.item-scene {
  color: var(--accent);
  font-size: 9px;
  letter-spacing: 1px;
  min-width: 50px;
}

.item-mood {
  color: var(--warm);
  font-size: 10px;
  min-width: 40px;
}

.item-desc {
  color: var(--text-secondary);
  font-size: 10px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
