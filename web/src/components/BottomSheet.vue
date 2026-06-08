<script setup lang="ts">
const props = defineProps<{
  visible: boolean
  title?: string
  variant?: 'default' | 'tall'
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
        <div class="sheet-container" :class="{ 'sheet-container-tall': props.variant === 'tall' }">
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
  justify-content: center;
  padding: 0 0 24px;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.sheet-container {
  width: min(390px, calc(100vw - 24px));
  max-height: min(70vh, 560px);
  background:
    linear-gradient(180deg, rgba(18, 22, 29, 0.98), rgba(10, 12, 16, 0.98));
  border: 1px solid rgba(244, 239, 228, 0.08);
  border-bottom: 0;
  border-radius: 20px 20px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow:
    0 -20px 60px rgba(0, 0, 0, 0.42),
    0 0 0 1px rgba(255, 255, 255, 0.018);
}

.sheet-container-tall {
  max-height: min(88vh, 760px);
}

.sheet-handle {
  width: 36px;
  height: 4px;
  background: rgba(244, 239, 228, 0.18);
  border-radius: 2px;
  margin: 8px auto 4px;
}

.sheet-header {
  padding: 8px 16px 6px;
  border-bottom: 1px solid rgba(244, 239, 228, 0.06);
}

.sheet-title {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 700;
  color: rgba(241, 233, 216, 0.76);
  letter-spacing: 0;
}

.sheet-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px 24px;
  overscroll-behavior: contain;
}

@media (max-width: 768px) {
  .sheet-overlay {
    align-items: flex-end;
    padding: 0;
  }

  .sheet-container {
    width: min(390px, 100vw);
    max-height: 72vh;
    border-left: 0;
    border-right: 0;
  }

  .sheet-container-tall {
    max-height: calc(100dvh - 54px);
  }

  .sheet-container-tall .sheet-body {
    padding-bottom: max(18px, env(safe-area-inset-bottom));
  }
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
