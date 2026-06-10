const BASE_URL = '/api';

async function request(url: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const text = await res.text();
  let data: any = null;
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(res.ok ? '接口返回格式异常' : `接口错误 ${res.status}: ${text.slice(0, 80)}`);
    }
  }

  if (!res.ok) {
    const message = data?.message || (res.status === 502 ? '后端服务未连接，请确认 MyRadio 后端已启动' : `接口错误 ${res.status}`);
    throw new Error(message);
  }

  return data;
}

/** 创建电台会话 */
export async function createRadioSession(params: {
  scene?: string;
  mood?: string;
  extraPrompt?: string;
  refreshMode?: 'new-session';
  avoidTrackIds?: number[];
}) {
  return request('/radio/session/create', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** 从当前计划时段创建会话 */
export async function createSessionFromPlan() {
  return request('/radio/session/create-from-plan', {
    method: 'POST',
  });
}

/** 为当前会话追加续播队列 */
export async function continueRadioSession(sessionId: number, limit = 8) {
  return request(`/radio/session/${sessionId}/continue`, {
    method: 'POST',
    body: JSON.stringify({ limit }),
  });
}

/** 获取歌曲列表 */
export async function getTrackList(params: {
  keyword?: string;
  liked?: number;
  page?: number;
  pageSize?: number;
}) {
  const query = new URLSearchParams();
  if (params.keyword) query.set('keyword', params.keyword);
  if (params.liked !== undefined) query.set('liked', String(params.liked));
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  return request(`/track/list?${query}`);
}

/** 获取歌曲统计 */
export async function getTrackStats() {
  return request('/track/stats');
}

/** 获取歌单列表 */
export async function getPlaylists() {
  return request('/track/playlists');
}

/** 发送聊天消息 */
export async function sendChatMessage(sessionId: number, message: string, currentIndex?: number) {
  return request('/radio/session/chat', {
    method: 'POST',
    body: JSON.stringify({ sessionId, message, currentIndex }),
  });
}

/** 播放行为上报 */
export async function reportPlayback(params: {
  sessionId: number;
  trackId: number;
  action: 'PLAY' | 'SKIP' | 'COMPLETE';
  playSeconds?: number;
}) {
  return request('/radio/playback/report', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** 合成 TTS 语音 */
export async function synthesizeTts(text: string, context?: Record<string, any>) {
  return request('/tts/synthesize', {
    method: 'POST',
    body: JSON.stringify({ text, context }),
  });
}

/** 查询当前会话已生成的 TTS 语音 */
export async function getSessionTtsItems(sessionId: number, say?: string) {
  const query = new URLSearchParams();
  if (say) query.set('say', say);
  // TTS 是后台陆续生成的，禁用缓存避免拿到旧的空结果。
  query.set('_', String(Date.now()));
  return request(`/radio/session/${sessionId}/tts?${query.toString()}`, { cache: 'no-store' });
}

/** 查询当前 session 的运行日志 */
export async function getSessionRuntimeLogs(sessionId: number, since?: number) {
  const query = new URLSearchParams();
  if (since) query.set('since', String(since));
  query.set('_', String(Date.now()));
  return request(`/radio/session/${sessionId}/runtime-logs?${query.toString()}`, { cache: 'no-store' });
}

/** 获取今日电台计划 */
export async function getDailyPlan() {
  return request('/plan/today');
}

/** 获取当前会话（页面刷新恢复） */
export async function getCurrentSession() {
  return request('/radio/now');
}

/** 刷新会话歌曲（获取最新播放地址） */
export async function refreshSessionTracks(sessionId: number) {
  return request(`/radio/session/${sessionId}/tracks`);
}

/** 检查网易云登录状态 */
export async function getNeteaseLoginStatus() {
  return request('/netease/login/status');
}

/** 生成网易云登录二维码 */
export async function createNeteaseQr() {
  return request('/netease/qr/create', { method: 'POST' });
}

/** 检查网易云扫码状态 */
export async function checkNeteaseQr(key: string) {
  return request(`/netease/qr/check?key=${encodeURIComponent(key)}`);
}

/** 触发获取播放地址 */
export async function fetchNeteaseUrls() {
  return request('/netease/fetch-urls', { method: 'POST' });
}

/** 获取完整品味画像 */
export async function getTasteProfile() {
  return request('/taste/profile');
}

/** 更新品味字段 */
export async function updateTasteProfile(field: string, value: any) {
  return request('/taste/profile', {
    method: 'PUT',
    body: JSON.stringify({ field, value }),
  });
}

/** 获取歌单列表 */
export async function getTastePlaylists() {
  return request('/taste/playlists');
}

/** 更新歌单记忆 */
export async function updatePlaylistMemory(playlistId: number, memory: string) {
  return request(`/taste/playlist/${playlistId}/memory`, {
    method: 'PUT',
    body: JSON.stringify({ memory }),
  });
}

/** 获取设备列表 */
export async function getDeviceList() {
  return request('/device/list');
}

/** 切换默认设备 */
export async function switchDeviceApi(deviceId: number) {
  return request('/device/switch', {
    method: 'POST',
    body: JSON.stringify({ deviceId }),
  });
}

/** 调节设备音量 */
export async function setDeviceVolume(deviceId: number, volume: number) {
  return request('/device/volume', {
    method: 'POST',
    body: JSON.stringify({ deviceId, volume }),
  });
}

/** 发送播放指令到设备 */
export async function sendDevicePlay(deviceId: number, trackUrl: string) {
  return request('/device/play', {
    method: 'POST',
    body: JSON.stringify({ deviceId, trackUrl }),
  });
}

/** 获取歌曲歌词 */
export async function getTrackLyrics(trackId: number) {
  return request(`/track/${trackId}/lyrics`);
}

/** 获取当前天气 */
export async function getCurrentWeather() {
  return request('/weather/current');
}

/** 获取 TTS 语音配置 */
export async function getTtsConfig() {
  return request('/tts-config');
}

/** 更新 TTS 语音配置 */
export async function updateTtsConfig(params: { mode?: string; refAudioPath?: string | null; voice?: string | null; dialect?: string | null }) {
  return request('/tts-config', {
    method: 'PUT',
    body: JSON.stringify(params),
  });
}

/** 上传克隆参考音频（二进制文件） */
export async function uploadTtsVoice(file: File) {
  const res = await fetch(`/api/tts-config/voice?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });
  const text = await res.text();
  let data: any = null;
  if (text.trim()) {
    try { data = JSON.parse(text); } catch { throw new Error('接口返回格式异常'); }
  }
  if (!res.ok) throw new Error(data?.message || `上传失败 ${res.status}`);
  return data;
}
