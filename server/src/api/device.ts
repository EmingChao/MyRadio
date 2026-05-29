import { Router } from 'express';
import { listDevices, getDevice, setDefaultDevice, updateDeviceVolume } from '../stores/device';
import { getAdapter } from '../services/device-adapter';

const router = Router();
const USER_ID = 443961717;

/**
 * GET /api/device/list
 * 获取设备列表
 */
router.get('/list', (_req, res) => {
  const devices = listDevices(USER_ID);
  res.json({ code: 0, data: devices });
});

/**
 * POST /api/device/switch
 * 切换默认设备
 */
router.post('/switch', (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) {
    res.json({ code: 400, message: '缺少 deviceId' });
    return;
  }

  const device = getDevice(deviceId);
  if (!device) {
    res.json({ code: 404, message: '设备不存在' });
    return;
  }

  setDefaultDevice(deviceId, USER_ID);
  res.json({ code: 0, data: { ...device, defaultDevice: 1 } });
});

/**
 * POST /api/device/volume
 * 调节设备音量
 */
router.post('/volume', async (req, res) => {
  const { deviceId, volume } = req.body;
  if (!deviceId || volume === undefined) {
    res.json({ code: 400, message: '缺少 deviceId 或 volume' });
    return;
  }

  const device = getDevice(deviceId);
  if (!device) {
    res.json({ code: 404, message: '设备不存在' });
    return;
  }

  try {
    const adapter = getAdapter(device.deviceType);
    await adapter.setVolume(volume);
    updateDeviceVolume(deviceId, volume);
    res.json({ code: 0 });
  } catch (e: any) {
    res.json({ code: 500, message: e.message });
  }
});

/**
 * POST /api/device/play
 * 发送播放指令到设备
 */
router.post('/play', async (req, res) => {
  const { deviceId, trackUrl } = req.body;
  if (!deviceId || !trackUrl) {
    res.json({ code: 400, message: '缺少 deviceId 或 trackUrl' });
    return;
  }

  const device = getDevice(deviceId);
  if (!device) {
    res.json({ code: 404, message: '设备不存在' });
    return;
  }

  try {
    const adapter = getAdapter(device.deviceType);
    await adapter.play(trackUrl);
    res.json({ code: 0 });
  } catch (e: any) {
    res.json({ code: 500, message: e.message });
  }
});

/**
 * GET /api/device/:id/status
 * 获取设备状态
 */
router.get('/:id/status', async (req, res) => {
  const deviceId = Number(req.params.id);
  const device = getDevice(deviceId);
  if (!device) {
    res.json({ code: 404, message: '设备不存在' });
    return;
  }

  try {
    const adapter = getAdapter(device.deviceType);
    const status = await adapter.getStatus();
    res.json({ code: 0, data: status });
  } catch (e: any) {
    res.json({ code: 500, message: e.message });
  }
});

export default router;
