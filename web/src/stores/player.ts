import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { reportPlayback, refreshSessionTracks, getCurrentSession, synthesizeTts, getTrackLyrics } from '../api';
import { resolveDjSpeechBeforeTrack } from './player-tts-sequence';

export interface RadioTrack {
  trackId: number;
  title: string;
  artist: string;
  album: string | null;
  coverUrl: string | null;
  playUrl: string | null;
  lyrics?: string;
  djScript: string;
  recommendReason: string;
  segue: string;
  voiceIntro?: string;
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

export interface SlotInfo {
  scene: string;
  mood: string;
  startTime: string;
  endTime: string;
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
  // DJ TTS 实时波形采样值，范围 0-1。
  const djWaveform = ref<number[]>(Array.from({ length: 16 }, () => 0.08));
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
  // 新会话开场白是否仍需要播放
  const openingPending = ref(false);
  // 每首歌的串场词只在进入该歌曲前播一次
  const spokenSegueKeys = new Set<string>();
  // 当前是否正在等待 TTS 生成完成
  const pendingSpeechText = ref<string | null>(null);
  let pendingSpeechTimer: ReturnType<typeof setTimeout> | null = null;
  const synthesizingTexts = new Set<string>();
  const loadingLyricsTrackIds = new Set<number>();
  // 控制旧异步播放流程失效，避免快速切歌时串音。
  let playbackToken = 0;
  // Web Audio 节点延迟初始化，避免页面还没交互就创建上下文。
  let ttsAudioContext: AudioContext | null = null;
  let ttsAnalyser: AnalyserNode | null = null;
  let waveformFrame: number | null = null;

  // 时段切换通知
  const slotChanged = ref<SlotInfo | null>(null);

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

  // TTS 播放结束后再启动当前音乐，保证 DJ 语音发生在音乐前。
  ttsAudio.addEventListener('ended', () => {
    stopWaveformCapture();
    djSpeaking.value = false;
    void fadeVolume(audio, 1.0, 800).then(() => resumeTrackPlayback());
  });

  /**
   * 直接加载并播放当前歌曲。
   */
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

  /**
   * 恢复当前歌曲播放，不重置已有播放进度。
   */
  function resumeTrackPlayback() {
    const track = currentTrack.value;
    if (!track?.playUrl) {
      audio.pause();
      return;
    }

    const expectedSrc = new URL(track.playUrl, window.location.href).href;
    if (audio.src !== expectedSrc) {
      loadAndPlay();
      return;
    }

    audio.play().catch(() => {
      isPlaying.value = false;
    });
  }

  /**
   * 进入当前歌曲前先判断是否需要播放 DJ 语音。
   */
  function prepareTrackPlayback() {
    const token = ++playbackToken;
    currentTime.value = 0;
    duration.value = 0;
    audio.pause();
    audio.currentTime = 0;

    const decision = resolveDjSpeechBeforeTrack(session.value, currentIndex.value, openingPending.value);
    if (!decision) {
      loadAndPlay();
      return;
    }

    const speechKey = getSpeechKey(decision.kind, decision.text);
    if (decision.kind === 'segue' && spokenSegueKeys.has(speechKey)) {
      loadAndPlay();
      return;
    }

    if (decision.kind === 'opening') {
      openingPending.value = false;
    } else {
      spokenSegueKeys.add(speechKey);
    }

    const started = playTts(decision.text, { after: 'play-track', token });
    if (!started) {
      pendingSpeechText.value = decision.text;
      void ensureTtsReady(decision.text, token);
      if (pendingSpeechTimer) clearTimeout(pendingSpeechTimer);
      pendingSpeechTimer = setTimeout(() => {
        if (pendingSpeechText.value === decision.text && token === playbackToken) {
          pendingSpeechText.value = null;
          resumeTrackPlayback();
        }
      }, 3500);
    }
  }

  // 监听 currentIndex 变化，自动准备新歌曲
  watch(currentIndex, () => {
    if (session.value) {
      prepareTrackPlayback();
      void ensureCurrentTrackLyrics();
    }
  });

  watch(() => currentTrack.value?.trackId, () => {
    void ensureCurrentTrackLyrics();
  });

  // 设置会话
  function setSession(s: RadioSession) {
    session.value = s;
    currentIndex.value = 0;
    currentTime.value = 0;
    duration.value = 0;
    openingPending.value = true;
    pendingSpeechText.value = null;
    spokenSegueKeys.clear();
    stopTts();
    // 延迟一帧，等待 WebSocket 订阅和 TTS_READY 先进入正常链路。
    setTimeout(() => prepareTrackPlayback(), 50);
    void ensureCurrentTrackLyrics();
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
      // 首次由按钮、空格或系统媒体键触发播放时，仍然先走 DJ 独白链路。
      if (!audio.src) {
        prepareTrackPlayback();
        return;
      }
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
      if (item.audioUrl) {
        ttsMap.value.set(item.text, item.audioUrl);
      }
    }
    if (pendingSpeechText.value && ttsMap.value.has(pendingSpeechText.value)) {
      const text = pendingSpeechText.value;
      pendingSpeechText.value = null;
      if (pendingSpeechTimer) {
        clearTimeout(pendingSpeechTimer);
        pendingSpeechTimer = null;
      }
      playTts(text, { after: 'play-track', token: playbackToken });
    }
  }

  /**
   * 主动确保某段 DJ 文案存在 TTS 音频。
   * WebSocket 可能在页面刷新、恢复旧会话或网络抖动时错过，这里补一条前端兜底链路。
   */
  async function ensureTtsReady(text: string, token: number) {
    if (!text || ttsMap.value.has(text) || synthesizingTexts.has(text)) return;
    synthesizingTexts.add(text);
    try {
      const res = await synthesizeTts(text);
      const audioUrl = res?.data?.audioUrl;
      const hash = res?.data?.hash;
      if (audioUrl) {
        ttsMap.value.set(text, audioUrl);
        if (pendingSpeechText.value === text && token === playbackToken) {
          pendingSpeechText.value = null;
          if (pendingSpeechTimer) {
            clearTimeout(pendingSpeechTimer);
            pendingSpeechTimer = null;
          }
          playTts(text, { after: 'play-track', token });
        }
      } else if (hash === null) {
        console.warn('[TTS] 语音合成未返回音频，将直接播放音乐');
      }
    } catch (err) {
      console.warn('[TTS] 前端兜底合成失败:', err);
    } finally {
      synthesizingTexts.delete(text);
    }
  }

  /**
   * 当前歌曲缺少歌词时，主动从后端获取并写回队列。
   */
  async function ensureCurrentTrackLyrics() {
    const track = currentTrack.value;
    if (!track || track.lyrics || loadingLyricsTrackIds.has(track.trackId)) return;

    loadingLyricsTrackIds.add(track.trackId);
    try {
      const res = await getTrackLyrics(track.trackId);
      const raw = res?.data?.raw;
      if (raw && session.value) {
        const target = session.value.tracks.find(t => t.trackId === track.trackId);
        if (target) target.lyrics = raw;
      }
    } catch (err) {
      console.warn('[Lyrics] 获取当前歌曲歌词失败:', err);
    } finally {
      loadingLyricsTrackIds.delete(track.trackId);
    }
  }

  // 音量渐变工具函数
  function fadeVolume(target: HTMLAudioElement, to: number, duration: number): Promise<void> {
    return new Promise(resolve => {
      const from = target.volume;
      const diff = to - from;
      if (Math.abs(diff) < 0.01) { target.volume = to; resolve(); return; }
      const start = performance.now();
      function step(now: number) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        // ease-out 曲线
        const eased = 1 - Math.pow(1 - progress, 2);
        target.volume = from + diff * eased;
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          target.volume = to;
          resolve();
        }
      }
      requestAnimationFrame(step);
    });
  }

  /**
   * 播放 TTS 音频，返回是否成功启动播放流程。
   */
  function playTts(text: string, options?: { after?: 'play-track'; token?: number }): boolean {
    const url = ttsMap.value.get(text);
    if (!url) return false;

    const token = options?.token ?? playbackToken;
    djSpeaking.value = true;
    pendingSpeechText.value = null;
    // 先渐降音乐音量，再播放 TTS
    fadeVolume(audio, 0.15, 600).then(() => {
      if (token !== playbackToken) return;
      ttsAudio.src = url;
      setupWaveformCapture();
      ttsAudio.play().then(() => {
        startWaveformCapture();
      }).catch(() => {
        stopWaveformCapture();
        djSpeaking.value = false;
        if (options?.after === 'play-track') {
          resumeTrackPlayback();
        } else {
          fadeVolume(audio, 1.0, 400);
        }
      });
    });
    return true;
  }

  /**
   * 停止当前 TTS，避免清理会话或切歌时继续播旧语音。
   */
  function stopTts() {
    if (pendingSpeechTimer) {
      clearTimeout(pendingSpeechTimer);
      pendingSpeechTimer = null;
    }
    ttsAudio.pause();
    ttsAudio.removeAttribute('src');
    ttsAudio.load();
    djSpeaking.value = false;
    stopWaveformCapture();
  }

  /**
   * 生成串场去重 key。
   */
  function getSpeechKey(kind: string, text: string): string {
    return `${kind}:${currentIndex.value}:${text}`;
  }

  /**
   * 初始化 TTS 音频分析器，用于根据真实音频绘制波形。
   */
  function setupWaveformCapture() {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor || ttsAnalyser) return;
    ttsAudioContext = new AudioContextCtor();
    const source = ttsAudioContext.createMediaElementSource(ttsAudio);
    ttsAnalyser = ttsAudioContext.createAnalyser();
    ttsAnalyser.fftSize = 64;
    source.connect(ttsAnalyser);
    ttsAnalyser.connect(ttsAudioContext.destination);
  }

  /**
   * 启动真实 TTS 波形采样。
   */
  function startWaveformCapture() {
    if (!ttsAnalyser) return;
    ttsAudioContext?.resume().catch(() => {});
    const data = new Uint8Array(ttsAnalyser.frequencyBinCount);
    const sampleCount = djWaveform.value.length;

    function tick() {
      if (!ttsAnalyser || !djSpeaking.value) return;
      ttsAnalyser.getByteFrequencyData(data);
      const next = Array.from({ length: sampleCount }, (_, index) => {
        const sourceIndex = Math.min(data.length - 1, Math.floor(index * data.length / sampleCount));
        return Math.max(0.08, data[sourceIndex] / 255);
      });
      djWaveform.value = next;
      waveformFrame = requestAnimationFrame(tick);
    }
    tick();
  }

  /**
   * 停止波形采样并回到静默状态。
   */
  function stopWaveformCapture() {
    if (waveformFrame !== null) {
      cancelAnimationFrame(waveformFrame);
      waveformFrame = null;
    }
    djWaveform.value = djWaveform.value.map(() => 0.08);
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

  // 恢复最近会话（页面刷新时调用）
  async function restoreSession() {
    try {
      const res = await getCurrentSession();
      if (res.code === 0 && res.data && res.data.tracks?.length > 0) {
        session.value = {
          sessionId: res.data.sessionId,
          sessionTitle: res.data.sessionTitle,
          aiSummary: res.data.aiSummary || '',
          say: res.data.say || '',
          tracks: res.data.tracks,
        };
        // 找到第一首 WAITING 的歌曲作为当前播放位置
        const waitingIdx = res.data.tracks.findIndex((t: any) => t.playStatus === 'WAITING');
        currentIndex.value = waitingIdx >= 0 ? waitingIdx : 0;
        // 刷新播放地址（CDN 链接可能已过期）
        refreshTracks();
      }
    } catch {
      // 静默失败
    }
  }

  // 设置时段切换通知
  function setSlotChanged(info: SlotInfo) {
    slotChanged.value = info;
  }

  // 清除时段切换通知
  function clearSlotChanged() {
    slotChanged.value = null;
  }

  // 清理会话
  function clearSession() {
    playbackToken++;
    audio.pause();
    audio.src = '';
    stopTts();
    session.value = null;
    currentIndex.value = 0;
    isPlaying.value = false;
    currentTime.value = 0;
    duration.value = 0;
    openingPending.value = false;
    pendingSpeechText.value = null;
    spokenSegueKeys.clear();
  }

  // 初始化时自动恢复最近会话
  restoreSession();

  return {
    session,
    currentIndex,
    isPlaying,
    djSpeaking,
    djWaveform,
    loading,
    currentTime,
    duration,
    currentTrack,
    trackCount,
    ttsMap,
    slotChanged,
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
    ensureCurrentTrackLyrics,
    refreshTracks,
    restoreSession,
    clearSession,
    setSlotChanged,
    clearSlotChanged,
    audio,
  };
});
