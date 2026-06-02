<script setup lang="ts">
import { ref } from 'vue'
import { useDeviceStore } from '../stores/device'
import type { PlayDevice } from '../stores/device'

const store = useDeviceStore()
const open = ref(false)

const deviceTypeLabels: Record<string, string> = {
  WEB_AUDIO: '浏览器',
  MOCK_SPEAKER: '模拟',
}

const deviceNameLabels: Record<string, string> = {
  Browser: '浏览器播放',
  'Mock Speaker': '模拟音箱',
}

function formatDeviceName(device?: PlayDevice | null) {
  if (!device) return '播放设备'
  return deviceNameLabels[device.deviceName] || device.deviceName
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
      <span class="device-icon" :class="{ online: store.currentDevice?.onlineStatus === 'ONLINE' }" />
      <span class="device-name">{{ formatDeviceName(store.currentDevice) }}</span>
      <span class="device-arrow" :class="{ open }" aria-hidden="true" />
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
          <span class="device-row-name">{{ formatDeviceName(device) }}</span>
          <span class="device-type">{{ deviceTypeLabels[device.deviceType] || device.deviceType }}</span>
        </div>
      </div>
      <div v-if="store.currentDevice" class="device-volume">
        <span class="vol-label">音量</span>
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
  padding: 4px 8px;
  background: rgba(244, 239, 228, 0.035);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0;
  cursor: pointer;
  transition: all 0.15s;
}

.device-trigger:hover {
  border-color: var(--border-light);
  color: var(--text-secondary);
}

.device-icon {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--text-muted);
  box-shadow: none;
  flex-shrink: 0;
}

.device-icon.online {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
}

.device-name {
  max-width: 112px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-arrow {
  width: 6px;
  height: 6px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg) translateY(-1px);
  transition: transform 0.15s;
}

.device-arrow.open {
  transform: rotate(225deg) translateY(-1px);
}

.device-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 200px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.32);
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
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  flex: 1;
}

.device-row.active .device-row-name {
  color: var(--accent);
}

.device-type {
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 650;
  color: var(--text-muted);
  letter-spacing: 0;
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
}

.device-volume {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
}

.vol-label {
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 650;
  color: var(--text-muted);
  letter-spacing: 0;
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
