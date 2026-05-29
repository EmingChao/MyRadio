<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = defineProps<{
  message: string
  type?: 'info' | 'success' | 'error'
  duration?: number
}>()

const emit = defineEmits<{ (e: 'close'): void }>()
const visible = ref(false)

onMounted(() => {
  visible.value = true
  setTimeout(() => {
    visible.value = false
    setTimeout(() => emit('close'), 300)
  }, props.duration || 3000)
})
</script>

<template>
  <div class="toast-wrapper" :class="{ visible }">
    <div class="toast" :class="type || 'info'">
      {{ message }}
    </div>
  </div>
</template>

<style scoped>
.toast-wrapper {
  position: fixed;
  top: 48px;
  left: 50%;
  transform: translateX(-50%) translateY(-20px);
  opacity: 0;
  transition: all 0.3s ease;
  z-index: 200;
  pointer-events: none;
}

.toast-wrapper.visible {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
}

.toast {
  padding: 8px 20px;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.5px;
  border: 1px solid var(--border);
  background: var(--bg-panel);
  white-space: nowrap;
}

.toast.info {
  color: var(--text-secondary);
  border-color: var(--border-light);
}

.toast.success {
  color: var(--accent);
  border-color: var(--accent-dim);
  background: var(--accent-glow);
}

.toast.error {
  color: var(--red);
  border-color: var(--red-dim);
}
</style>
