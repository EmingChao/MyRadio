import db from './db';

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

const USER_ID = 443961717;

/**
 * 获取用户所有设备
 */
export function listDevices(userId: number = USER_ID): PlayDevice[] {
  return db.prepare(`
    SELECT id, user_id AS userId, device_name AS deviceName, device_type AS deviceType,
           endpoint, default_device AS defaultDevice, online_status AS onlineStatus, volume
    FROM radio_play_device WHERE user_id = ? ORDER BY default_device DESC, id ASC
  `).all(userId) as PlayDevice[];
}

/**
 * 获取单个设备
 */
export function getDevice(deviceId: number): PlayDevice | undefined {
  return db.prepare(`
    SELECT id, user_id AS userId, device_name AS deviceName, device_type AS deviceType,
           endpoint, default_device AS defaultDevice, online_status AS onlineStatus, volume
    FROM radio_play_device WHERE id = ?
  `).get(deviceId) as PlayDevice | undefined;
}

/**
 * 获取默认设备
 */
export function getDefaultDevice(userId: number = USER_ID): PlayDevice | undefined {
  return db.prepare(`
    SELECT id, user_id AS userId, device_name AS deviceName, device_type AS deviceType,
           endpoint, default_device AS defaultDevice, online_status AS onlineStatus, volume
    FROM radio_play_device WHERE user_id = ? AND default_device = 1
  `).get(userId) as PlayDevice | undefined;
}

/**
 * 切换默认设备
 */
export function setDefaultDevice(deviceId: number, userId: number = USER_ID): void {
  db.prepare(`UPDATE radio_play_device SET default_device = 0 WHERE user_id = ?`).run(userId);
  db.prepare(`UPDATE radio_play_device SET default_device = 1, modified_time = datetime('now','localtime') WHERE id = ? AND user_id = ?`).run(deviceId, userId);
}

/**
 * 更新设备在线状态
 */
export function updateDeviceStatus(deviceId: number, status: string): void {
  db.prepare(`UPDATE radio_play_device SET online_status = ?, modified_time = datetime('now','localtime') WHERE id = ?`).run(status, deviceId);
}

/**
 * 更新设备音量
 */
export function updateDeviceVolume(deviceId: number, volume: number): void {
  db.prepare(`UPDATE radio_play_device SET volume = ?, modified_time = datetime('now','localtime') WHERE id = ?`).run(volume, deviceId);
}
