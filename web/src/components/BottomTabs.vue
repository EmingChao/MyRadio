<script setup lang="ts">
defineProps<{
  active: string
}>()

const emit = defineEmits<{ (e: 'change', tab: string): void }>()

const tabs = [
  {
    key: 'radio',
    label: '电台',
    aria: '切换到电台播放页',
    icon: 'play',
  },
  {
    key: 'queue',
    label: '队列',
    aria: '切换到播放队列页',
    icon: 'queue',
  },
  {
    key: 'plan',
    label: '计划',
    aria: '切换到今日计划页',
    icon: 'plan',
  },
  {
    key: 'taste',
    label: '品味',
    aria: '切换到品味画像页',
    icon: 'taste',
  },
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
      <svg v-if="tab.icon === 'play'" class="tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 6.75v10.5a.75.75 0 0 0 1.18.61l7.2-5.25a.75.75 0 0 0 0-1.22l-7.2-5.25A.75.75 0 0 0 9 6.75Z"/>
      </svg>
      <svg v-else-if="tab.icon === 'queue'" class="tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4.75 6.5h14.5v1.5H4.75v-1.5Zm0 5h14.5V13H4.75v-1.5Zm0 5h9.5V18H4.75v-1.5Z"/>
      </svg>
      <svg v-else-if="tab.icon === 'plan'" class="tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 5.25a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5Zm.75 3v3.44l2.58 1.5-.75 1.3-3.33-1.93V8.25h1.5Z"/>
      </svg>
      <svg v-else class="tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 20.1 10.8 19c-3.9-3.4-6.3-5.6-6.3-8.4A4.6 4.6 0 0 1 9.1 6.1c1.2 0 2.4.6 2.9 1.4.5-.8 1.7-1.4 2.9-1.4a4.6 4.6 0 0 1 4.6 4.5c0 2.8-2.4 5-6.3 8.4L12 20.1Z"/>
      </svg>
      <span class="tab-label">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.bottom-tabs {
  display: flex;
  margin: 0 0 0;
  padding: 7px 14px calc(10px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid rgba(244, 239, 228, 0.032);
  border-left: 0;
  border-right: 0;
  border-bottom: 0;
  border-radius: 0 0 28px 28px;
  background:
    linear-gradient(180deg, rgba(9, 11, 15, 0.7), rgba(5, 6, 9, 0.96));
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  flex-shrink: 0;
  position: relative;
  z-index: 1;
  box-shadow:
    inset 0 1px 0 rgba(244, 239, 228, 0.03),
    0 10px 22px rgba(0, 0, 0, 0.14);
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-height: 50px;
  padding: 8px 0 5px;
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
  top: 4px;
  transition: background 0.15s, box-shadow 0.15s;
}

.tab-icon {
  width: 17px;
  height: 17px;
  fill: currentColor;
  color: rgba(143, 138, 131, 0.72);
  transition: color 0.15s, transform 0.15s;
  line-height: 1;
}

.tab-label {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 560;
  color: rgba(178, 170, 160, 0.78);
  letter-spacing: 1px;
  text-transform: uppercase;
  transition: color 0.15s;
}

.tab-item.active .tab-icon {
  color: var(--text-primary);
  transform: translateY(-1px);
}

.tab-item.active .tab-label {
  color: var(--text-primary);
}

.tab-item.active::before {
  background: var(--signal);
  box-shadow: 0 0 10px rgba(77, 216, 141, 0.35);
}

.tab-item:active {
  background: rgba(244, 239, 228, 0.045);
}
</style>
