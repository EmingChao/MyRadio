<script setup lang="ts">
defineProps<{
  active: string
}>()

const emit = defineEmits<{ (e: 'change', tab: string): void }>()

const tabs = [
  { key: 'radio', icon: '▶', label: 'Radio', aria: '切换到电台播放页' },
  { key: 'queue', icon: '☰', label: 'Queue', aria: '切换到播放队列页' },
  { key: 'plan', icon: '◷', label: 'Plan', aria: '切换到今日计划页' },
  { key: 'taste', icon: '♡', label: 'Taste', aria: '切换到品味画像页' },
]
</script>

<template>
  <nav class="bottom-tabs">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="tab-item"
      :class="{ active: active === tab.key }"
      :aria-label="tab.aria"
      :aria-current="active === tab.key ? 'page' : undefined"
      :data-tab="tab.key"
      @click="emit('change', tab.key)"
    >
      <span class="tab-icon">{{ tab.icon }}</span>
      <span class="tab-label">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.bottom-tabs {
  display: flex;
  padding: 4px 0 calc(4px + env(safe-area-inset-bottom, 8px));
  border-top: 1px solid var(--line);
  background: rgba(9, 11, 15, 0.9);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-height: 48px;
  padding: 7px 0 6px;
  cursor: pointer;
  transition: all 0.15s;
  border: none;
  background: none;
  position: relative;
}

.tab-item::before {
  content: '';
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: transparent;
  position: absolute;
  top: 5px;
  transition: background 0.15s, box-shadow 0.15s;
}

.tab-icon {
  font-size: 16px;
  color: rgba(143, 138, 131, 0.72);
  transition: color 0.15s;
  line-height: 1;
}

.tab-label {
  font-family: var(--font-mono);
  font-size: 8px;
  color: rgba(143, 138, 131, 0.72);
  letter-spacing: 1px;
  text-transform: uppercase;
  transition: color 0.15s;
}

.tab-item.active .tab-icon {
  color: var(--text-primary);
}

.tab-item.active .tab-label {
  color: var(--text-primary);
}

.tab-item.active::before {
  background: var(--signal);
  box-shadow: 0 0 10px rgba(56, 217, 120, 0.35);
}

.tab-item:active {
  background: rgba(244, 239, 228, 0.045);
}
</style>
