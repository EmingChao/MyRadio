<script setup lang="ts">
const props = defineProps<{
  visible: boolean
  title?: string
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

function onMaskClick() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="visible" class="sheet-overlay" @click.self="onMaskClick">
        <div class="sheet-container">
          <div class="sheet-handle" />
          <div v-if="title" class="sheet-header">
            <span class="sheet-title">{{ title }}</span>
          </div>
          <div class="sheet-body">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 100;
  display: flex;
  align-items: flex-end;
}

.sheet-container {
  width: 100%;
  max-height: 70vh;
  background: var(--bg-panel);
  border-top: 1px solid var(--border-light);
  border-radius: 12px 12px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sheet-handle {
  width: 36px;
  height: 4px;
  background: var(--border-light);
  border-radius: 2px;
  margin: 8px auto 4px;
}

.sheet-header {
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
}

.sheet-title {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 1px;
}

.sheet-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px 24px;
}

/* 动画 */
.sheet-enter-active {
  transition: opacity 0.2s ease;
}
.sheet-enter-active .sheet-container {
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}
.sheet-leave-active {
  transition: opacity 0.2s ease 0.1s;
}
.sheet-leave-active .sheet-container {
  transition: transform 0.2s ease;
}

.sheet-enter-from {
  opacity: 0;
}
.sheet-enter-from .sheet-container {
  transform: translateY(100%);
}

.sheet-leave-to {
  opacity: 0;
}
.sheet-leave-to .sheet-container {
  transform: translateY(100%);
}
</style>
