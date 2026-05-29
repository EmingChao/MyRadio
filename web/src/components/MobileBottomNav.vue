<script setup lang="ts">
defineProps<{
  active: string
}>()

const emit = defineEmits<{ (e: 'navigate', tab: string): void }>()

const tabs = [
  { key: 'play', label: 'PLAY' },
  { key: 'chat', label: 'CHAT' },
  { key: 'queue', label: 'QUEUE' },
  { key: 'more', label: 'MORE' },
]
</script>

<template>
  <nav class="bottom-nav">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="nav-item"
      :class="{ active: active === tab.key }"
      @click="emit('navigate', tab.key)"
    >
      <span class="nav-icon">
        <template v-if="tab.key === 'play'">&#9654;</template>
        <template v-else-if="tab.key === 'chat'">&#9998;</template>
        <template v-else-if="tab.key === 'queue'">&#9776;</template>
        <template v-else>&#9783;</template>
      </span>
      <span class="nav-label">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.bottom-nav {
  display: flex;
  border-top: 1px solid var(--border);
  background: var(--bg-panel);
  padding-bottom: env(safe-area-inset-bottom);
}

.nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 0 6px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  transition: color 0.15s;
}

.nav-item:active {
  background: var(--bg-surface);
}

.nav-item.active {
  color: var(--accent);
}

.nav-icon {
  font-size: 16px;
  line-height: 1;
}

.nav-label {
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 1px;
}
</style>
