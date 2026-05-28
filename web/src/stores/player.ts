import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { reportPlayback, refreshSessionTracks } from '../api';

export interface RadioTrack {
  trackId: number;
  title: string;
  artist: string;
  album: string | null;
  coverUrl: string | null;
  playUrl: string | null;
  djScript: string;
  recommendReason: string;
  segue: string;
}

export interface RadioSession {
  sessionId: number;
  sessionTitle: string;
  aiSummary: string;
  say: string;
  tracks: RadioTrack[];
}

export interface TtsItem {
  text: string;
  hash: string;
  audioUrl: string;
}

export const usePlayerStore = defineStore('player', () => {
  // 电台会话
  const session = ref<RadioSession | null>(null);
  // 当前播放索引
  const currentIndex = ref(0);
  // 播放状态
  const isPlaying = ref(false);
  // DJ 是否在说话
  const djSpeaking = ref(false);
  // 加载状态
  const loading = ref(false);

  // Audio 实例（单例）
  const audio = new Audio();
  audio.preload = 'auto';

  // TTS 音频实例
  const ttsAudio = new Audio();
  ttsAudio.preload = 'auto';

  // TTS 映射：text -> audioUrl
  const ttsMap = ref<Map<string, string>>(new Map());

  // 播放进度（秒）
  const currentTime = ref(0);
  // 歌曲总时长（秒）
  const duration = ref(0);

  // 当前歌曲
  const currentTrack = computed(() => session.value?.tracks[currentIndex.value] || null);
  // 队列长度
  const trackCount = computed(() => session.value?.tracks.length || 0);

  // 监听 audio 事件
  audio.addEventListener('timeupdate', () => {
    currentTime.value = audio.currentTime;
  });

  audio.addEventListener('loadedmetadata', () => {
    duration.value = audio.duration;
  });

  audio.addEventListener('ended', () => {
    // 上报播放完成
    const track = currentTrack.value;
    if (track && session.value) {
      reportPlayback({
        sessionId: session.value.sessionId,
        trackId: track.trackId,
        action: 'COMPLETE',
        playSeconds: Math.floor(audio.currentTime),
      }).catch(() => {});
    }
    // 自动播放下一首
    if (currentIndex.value < trackCount.value - 1) {
      currentIndex.value++;
    } else {
      isPlaying.value = false;
    }
  });

  audio.addEventListener('play', () => {
    isPlaying.value = true;
  });

  audio.addEventListener('pause', () => {
    isPlaying.value = false;
  });

  // TTS 播放结束，恢复音乐音量
  ttsAudio.addEventListener('ended', () => {
    djSpeaking.value = false;
    audio.volume = 1.0;
  });

  // 切换歌曲时加载音频
  function loadAndPlay() {
    const track = currentTrack.value;
    if (!track?.playUrl) {
      audio.pause();
      return;
    }
    audio.src = track.playUrl;
    audio.load();
    audio.play().catch(() => {
      // 自动播放被浏览器阻止，等待用户交互
      isPlaying.value = false;
    });
  }

  // 监听 currentIndex 变化，自动加载新歌曲
  watch(currentIndex, () => {
    currentTime.value = 0;
    duration.value = 0;
    if (session.value) {
      loadAndPlay();
    }
  });

  // 设置会话
  function setSession(s: RadioSession) {
    session.value = s;
    currentIndex.value = 0;
    currentTime.value = 0;
    duration.value = 0;
    // 延迟一帧等 watch 触发
    setTimeout(() => loadAndPlay(), 50);
  }

  // 上报跳过当前歌曲
  function reportSkip() {
    const track = currentTrack.value;
    if (track && session.value) {
      reportPlayback({
        sessionId: session.value.sessionId,
        trackId: track.trackId,
        action: 'SKIP',
        playSeconds: Math.floor(audio.currentTime),
      }).catch(() => {});
    }
  }

  // 下一首
  function next() {
    if (currentIndex.value < trackCount.value - 1) {
      reportSkip();
      currentIndex.value++;
    }
  }

  // 上一首
  function prev() {
    if (currentIndex.value > 0) {
      reportSkip();
      currentIndex.value--;
    }
  }

  // 切到指定歌曲
  function goTo(index: number) {
    if (index >= 0 && index < trackCount.value && index !== currentIndex.value) {
      reportSkip();
      currentIndex.value = index;
    }
  }

  // 播放/暂停
  function togglePlay() {
    if (!currentTrack.value?.playUrl) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  // 跳转到指定时间
  function seek(time: number) {
    audio.currentTime = time;
    currentTime.value = time;
  }

  // 设置音量（0-1）
  function setVolume(v: number) {
    audio.volume = Math.max(0, Math.min(1, v));
  }

  // 更新队列（聊天重排后使用，保留当前播放位置）
  function updateQueue(newTracks: RadioTrack[]) {
    if (!session.value) return;
    // 保留当前正在播放的歌曲，替换后续队列
    const current = currentIndex.value;
    session.value.tracks = [
      ...session.value.tracks.slice(0, current + 1),
      ...newTracks,
    ];
  }

  // 设置 TTS 音频映射（从 WebSocket TTS_READY 事件获取）
  function setTtsItems(items: TtsItem[]) {
    for (const item of items) {
      ttsMap.value.set(item.text, item.audioUrl);
    }
  }

  // 播放 TTS 音频（DJ 说话时压低音乐音量）
  function playTts(text: string) {
    const url = ttsMap.value.get(text);
    if (!url) return;

    djSpeaking.value = true;
    audio.volume = 0.2; // 压低到约 -12dB
    ttsAudio.src = url;
    ttsAudio.play().catch(() => {
      djSpeaking.value = false;
      audio.volume = 1.0;
    });
  }

  // 刷新当前会话的歌曲数据（用于获取最新播放地址）
  async function refreshTracks() {
    if (!session.value) return;
    try {
      const res = await refreshSessionTracks(session.value.sessionId);
      if (res.code === 0 && res.data) {
        session.value.tracks = res.data;
      }
    } catch {}
  }

  // 清理会话
  function clearSession() {
    audio.pause();
    audio.src = '';
    session.value = null;
    currentIndex.value = 0;
    isPlaying.value = false;
    currentTime.value = 0;
    duration.value = 0;
  }

  return {
    session,
    currentIndex,
    isPlaying,
    djSpeaking,
    loading,
    currentTime,
    duration,
    currentTrack,
    trackCount,
    ttsMap,
    setSession,
    next,
    prev,
    goTo,
    togglePlay,
    seek,
    setVolume,
    updateQueue,
    setTtsItems,
    playTts,
    refreshTracks,
    clearSession,
    audio,
  };
});
