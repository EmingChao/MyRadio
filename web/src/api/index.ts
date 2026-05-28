const BASE_URL = '/api';

async function request(url: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return res.json();
}

/** 创建电台会话 */
export async function createRadioSession(params: {
  scene?: string;
  mood?: string;
  extraPrompt?: string;
}) {
  return request('/radio/session/create', {
    method: 'POST',
    body: JSON.stringify(params),
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
export async function sendChatMessage(sessionId: number, message: string) {
  return request('/radio/session/chat', {
    method: 'POST',
    body: JSON.stringify({ sessionId, message }),
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
export async function synthesizeTts(text: string) {
  return request('/tts/synthesize', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

/** 获取今日电台计划 */
export async function getDailyPlan() {
  return request('/plan/today');
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
