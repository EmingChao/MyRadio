import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getDeviceList, switchDeviceApi, setDeviceVolume } from '../api';

export interface PlayDevice {
  id: number;
  userId: number;
  deviceName: string;
  deviceType: string;
  endpoint: string | null;
  defaultDevice: number;
  onlineStatus: string;
  volume: number;
}

export const useDeviceStore = defineStore('device', () => {
  const devices = ref<PlayDevice[]>([]);
  const currentDeviceId = ref<number | null>(null);

  const currentDevice = computed(() =>
    devices.value.find(d => d.id === currentDeviceId.value) || null
  );

  async function fetchDevices() {
    try {
      const res = await getDeviceList();
      if (res.code === 0 && res.data) {
        devices.value = res.data;
        const defaultDev = res.data.find((d: PlayDevice) => d.defaultDevice === 1);
        if (defaultDev) {
          currentDeviceId.value = defaultDev.id;
        }
      }
    } catch {}
  }

  async function switchToDevice(deviceId: number) {
    try {
      const res = await switchDeviceApi(deviceId);
      if (res.code === 0) {
        currentDeviceId.value = deviceId;
        // 更新本地默认状态
        devices.value.forEach(d => {
          d.defaultDevice = d.id === deviceId ? 1 : 0;
        });
      }
    } catch {}
  }

  async function setVolume(deviceId: number, volume: number) {
    try {
      await setDeviceVolume(deviceId, volume);
      const device = devices.value.find(d => d.id === deviceId);
      if (device) device.volume = volume;
    } catch {}
  }

  // 初始化时获取设备列表
  fetchDevices();

  return {
    devices,
    currentDeviceId,
    currentDevice,
    fetchDevices,
    switchToDevice,
    setVolume,
  };
});
