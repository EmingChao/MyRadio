/**
 * 设备适配器层
 * 定义统一的播放设备接口，支持多种设备类型
 */

export interface DeviceStatus {
  state: 'PLAYING' | 'PAUSED' | 'STOPPED' | 'ERROR';
  volume: number;
  currentTrackUrl: string | null;
  position: number; // 秒
}

export interface DeviceAdapter {
  play(trackUrl: string): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  setVolume(level: number): Promise<void>; // 0-100
  getStatus(): Promise<DeviceStatus>;
}

/**
 * 浏览器音频适配器（no-op，实际播放由前端 HTMLAudioElement 处理）
 */
export class WebAudioAdapter implements DeviceAdapter {
  private volume = 100;

  async play(_trackUrl: string): Promise<void> {
    // 浏览器端直接播放，服务端不干预
  }

  async pause(): Promise<void> {}

  async stop(): Promise<void> {}

  async setVolume(level: number): Promise<void> {
    this.volume = Math.max(0, Math.min(100, level));
  }

  async getStatus(): Promise<DeviceStatus> {
    return {
      state: 'STOPPED',
      volume: this.volume,
      currentTrackUrl: null,
      position: 0,
    };
  }
}

/**
 * 模拟音箱适配器（用于 UI 和流程验证）
 */
export class MockSpeakerAdapter implements DeviceAdapter {
  private state: DeviceStatus = {
    state: 'STOPPED',
    volume: 80,
    currentTrackUrl: null,
    position: 0,
  };
  private startedAt: number | null = null;

  async play(trackUrl: string): Promise<void> {
    this.state.state = 'PLAYING';
    this.state.currentTrackUrl = trackUrl;
    this.state.position = 0;
    this.startedAt = Date.now();
  }

  async pause(): Promise<void> {
    if (this.state.state === 'PLAYING') {
      this.state.state = 'PAUSED';
      if (this.startedAt) {
        this.state.position += (Date.now() - this.startedAt) / 1000;
        this.startedAt = null;
      }
    }
  }

  async stop(): Promise<void> {
    this.state.state = 'STOPPED';
    this.state.currentTrackUrl = null;
    this.state.position = 0;
    this.startedAt = null;
  }

  async setVolume(level: number): Promise<void> {
    this.state.volume = Math.max(0, Math.min(100, level));
  }

  async getStatus(): Promise<DeviceStatus> {
    // 如果正在播放，计算当前位置
    if (this.state.state === 'PLAYING' && this.startedAt) {
      return {
        ...this.state,
        position: this.state.position + (Date.now() - this.startedAt) / 1000,
      };
    }
    return { ...this.state };
  }
}

// 适配器实例缓存
const adapters = new Map<string, DeviceAdapter>();

/**
 * 获取设备适配器（工厂函数）
 */
export function getAdapter(deviceType: string): DeviceAdapter {
  if (!adapters.has(deviceType)) {
    switch (deviceType) {
      case 'WEB_AUDIO':
        adapters.set(deviceType, new WebAudioAdapter());
        break;
      case 'MOCK_SPEAKER':
        adapters.set(deviceType, new MockSpeakerAdapter());
        break;
      default:
        throw new Error(`不支持的设备类型: ${deviceType}`);
    }
  }
  return adapters.get(deviceType)!;
}
