<script setup lang="ts">
import { ref } from 'vue'
import { useDeviceStore } from '../stores/device'
import type { PlayDevice } from '../stores/device'

const store = useDeviceStore()
const open = ref(false)

const deviceTypeLabels: Record<string, string> = {
  WEB_AUDIO: 'BROWSER',
  MOCK_SPEAKER: 'MOCK',
}

function handleSelect(device: PlayDevice) {
  store.switchToDevice(device.id)
  open.value = false
}

function handleVolumeChange(device: PlayDevice, e: Event) {
  const val = Number((e.target as HTMLInputElement).value)
  store.setVolume(device.id, val)
}
</script>

<template>
  <div class="device-selector">
    <button class="device-trigger" @click="open = !open">
      <span class="device-icon">{{ store.currentDevice?.deviceType === 'MOCK_SPEAKER' ? '🔊' : '💻' }}</span>
      <span class="device-name">{{ store.currentDevice?.deviceName || 'DEVICE' }}</span>
      <span class="device-arrow" :class="{ open }">▾</span>
    </button>

    <div v-if="open" class="device-dropdown">
      <div class="device-list">
        <div
          v-for="device in store.devices"
          :key="device.id"
          class="device-row"
          :class="{ active: device.id === store.currentDeviceId }"
          @click="handleSelect(device)"
        >
          <span class="device-status" :class="{ online: device.onlineStatus === 'ONLINE' }" />
          <span class="device-row-name">{{ device.deviceName }}</span>
          <span class="device-type">{{ deviceTypeLabels[device.deviceType] || device.deviceType }}</span>
        </div>
      </div>
      <div v-if="store.currentDevice" class="device-volume">
        <span class="vol-label">VOL</span>
        <input
          type="range"
          min="0"
          max="100"
          :value="store.currentDevice.volume"
          class="vol-slider"
          @input="handleVolumeChange(store.currentDevice!, $event)"
        />
        <span class="vol-value">{{ store.currentDevice.volume }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.device-selector {
  position: relative;
}

.device-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.15s;
}

.device-trigger:hover {
  border-color: var(--border-light);
  color: var(--text-secondary);
}

.device-icon {
  font-size: 10px;
}

.device-name {
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-arrow {
  transition: transform 0.15s;
}

.device-arrow.open {
  transform: rotate(180deg);
}

.device-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 200px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  z-index: 100;
}

.device-list {
  max-height: 200px;
  overflow-y: auto;
}

.device-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.device-row:hover {
  background: var(--bg-surface);
}

.device-row.active {
  background: var(--accent-glow);
}

.device-status {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  flex-shrink: 0;
}

.device-status.online {
  background: var(--accent);
  box-shadow: 0 0 4px var(--accent);
}

.device-row-name {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
  flex: 1;
}

.device-row.active .device-row-name {
  color: var(--accent);
}

.device-type {
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--text-muted);
  letter-spacing: 1px;
  padding: 1px 4px;
  border: 1px solid var(--border);
}

.device-volume {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
}

.vol-label {
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--text-muted);
  letter-spacing: 1px;
  flex-shrink: 0;
}

.vol-slider {
  flex: 1;
  height: 2px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--bg-raised);
  outline: none;
  cursor: pointer;
}

.vol-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
}

.vol-value {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
  min-width: 24px;
  text-align: right;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .device-dropdown {
    position: fixed;
    top: auto;
    bottom: 60px;
    left: 12px;
    right: 12px;
    min-width: auto;
  }
}
</style>
