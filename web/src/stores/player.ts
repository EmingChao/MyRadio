import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { reportPlayback, refreshSessionTracks, getCurrentSession, synthesizeTts, getTrackLyrics, continueRadioSession } from '../api';
import { resolveDjSpeechBeforeTrack } from './player-tts-sequence';
import { resolveTtsOutputGain } from './player-tts-volume';

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
  style?: TtsStyle;
}

export interface TtsStyle {
  preset: string;
  emotion?: string;
  pace?: string;
  energy?: string;
  playbackRate?: number;
  prompt?: string;
}

export interface SlotInfo {
  scene: string;
  mood: string;
  startTime: string;
  endTime: string;
}

export const usePlayerStore = defineStore('player', () => {
  const TRACK_WAVEFORM_SIZE = 18;
  const SPEECH_DUCKING_VOLUME = 0.16;
  const SPEECH_OVERLAP_VOLUME = 0.22;
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
  // 当前歌曲实时波形采样值，范围 0-1。
  const trackWaveform = ref<number[]>(buildIdleTrackWaveform(TRACK_WAVEFORM_SIZE));
  // 当前正在朗读的 DJ 文案，用于 UI 做逐字已读效果。
  const currentSpeechText = ref('');
  // 当前 DJ 文案朗读进度，范围 0-1。
  const currentSpeechProgress = ref(0);
  // 加载状态
  const loading = ref(false);
  const extendingQueue = ref(false);

  // Audio 实例（单例）
  const audio = new Audio();
  audio.preload = 'auto';

  // TTS 音频实例
  const ttsAudio = new Audio();
  ttsAudio.preload = 'auto';

  // TTS 映射：text -> audioUrl
  const ttsMap = ref<Map<string, string>>(new Map());
  const ttsStyleMap = ref<Map<string, TtsStyle>>(new Map());
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
  let ttsOverlapTimer: ReturnType<typeof setTimeout> | null = null;
  let ttsOverlapStarted = false;
  let currentTtsOverlapToken: number | null = null;
  let currentTtsShouldOverlap = false;
  // Web Audio 节点延迟初始化，避免页面还没交互就创建上下文。
  let ttsAudioContext: AudioContext | null = null;
  let ttsAnalyser: AnalyserNode | null = null;
  let ttsGainNode: GainNode | null = null;
  let waveformFrame: number | null = null;
  let trackAudioContext: AudioContext | null = null;
  let trackAnalyser: AnalyserNode | null = null;
  let trackStreamSource: MediaStreamAudioSourceNode | null = null;
  let trackWaveformFrame: number | null = null;
  let trackSilentFrameCount = 0;
  let speechProgressFrame: number | null = null;
  let extendingQueuePromise: Promise<boolean> | null = null;

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
    void handleAudioEnded();
  });

  /**
   * 处理歌曲自然结束：优先进入下一首，队列末尾则尝试自动续播。
   */
  async function handleAudioEnded() {
    const track = currentTrack.value;
    if (track && session.value) {
      reportPlayback({
        sessionId: session.value.sessionId,
        trackId: track.trackId,
        action: 'COMPLETE',
        playSeconds: Math.floor(audio.currentTime),
      }).catch(() => {});
    }

    if (currentIndex.value < trackCount.value - 1) {
      currentIndex.value++;
      void ensureQueueContinuation('near-end');
    } else {
      const extended = await ensureQueueContinuation('ended');
      if (extended && currentIndex.value < trackCount.value - 1) {
        currentIndex.value++;
      } else {
        isPlaying.value = false;
      }
    }
  }

  audio.addEventListener('play', () => {
    isPlaying.value = true;
    setupTrackWaveformCapture();
    startTrackWaveformCapture();
  });

  audio.addEventListener('pause', () => {
    isPlaying.value = false;
    stopTrackWaveformCapture();
  });

  // TTS 播放结束后再启动当前音乐，保证 DJ 语音发生在音乐前。
  ttsAudio.addEventListener('ended', () => {
    if (ttsOverlapTimer) {
      clearTimeout(ttsOverlapTimer);
      ttsOverlapTimer = null;
    }
    stopWaveformCapture();
    stopSpeechProgressCapture();
    djSpeaking.value = false;
    currentSpeechProgress.value = 1;
    if (ttsOverlapStarted) {
      void fadeVolume(audio, 1.0, 700);
    } else {
      void fadeVolume(audio, 1.0, 800).then(() => resumeTrackPlayback());
    }
    ttsOverlapStarted = false;
  });

  ttsAudio.addEventListener('timeupdate', () => {
    updateSpeechProgress();
  });

  ttsAudio.addEventListener('loadedmetadata', () => {
    updateSpeechProgress();
    if (djSpeaking.value && currentTtsShouldOverlap && currentTtsOverlapToken !== null) {
      scheduleTrackOverlapBeforeTtsEnd(currentTtsOverlapToken, true);
    }
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
    setupTrackWaveformCapture();
    audio.volume = Math.max(0, Math.min(1, audio.volume));
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

    if (!isAudioLoadedForCurrentTrack()) {
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
    stopTts();
    audio.pause();
    unloadTrackAudio();

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
      void ensureQueueContinuation('near-end');
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
  async function next() {
    if (currentIndex.value < trackCount.value - 1) {
      reportSkip();
      currentIndex.value++;
      return;
    }

    // 队列末尾手动点下一首时，也按真实电台逻辑继续接歌。
    if (trackCount.value > 0) {
      reportSkip();
      const extended = await ensureQueueContinuation('ended');
      if (extended && currentIndex.value < trackCount.value - 1) {
        currentIndex.value++;
      }
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
      // 首次播放或切歌后 src 尚未对齐时，重新走当前歌曲的准备流程，避免恢复上一首。
      if (!isAudioLoadedForCurrentTrack()) {
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

  /**
   * 用后端返回的完整队列替换本地队列，并保持当前歌曲播放索引不变。
   */
  function replaceQueue(newTracks: RadioTrack[]) {
    if (!session.value || newTracks.length === 0) return;
    const currentTrackId = currentTrack.value?.trackId;
    session.value.tracks = newTracks;
    if (!currentTrackId) return;

    // 如果后端保留了当前歌曲但位置有变化，前端同步索引但不重置音频。
    const nextIndex = newTracks.findIndex(track => track.trackId === currentTrackId);
    if (nextIndex >= 0 && nextIndex !== currentIndex.value) {
      currentIndex.value = nextIndex;
    }
  }

  /**
   * 追加续播歌曲，不影响当前剩余队列。
   */
  function appendQueue(newTracks: RadioTrack[]) {
    if (!session.value || newTracks.length === 0) return;
    const existing = new Set(session.value.tracks.map(track => track.trackId));
    const uniqueTracks = newTracks.filter(track => !existing.has(track.trackId));
    session.value.tracks = [...session.value.tracks, ...uniqueTracks];
  }

  /**
   * 队列快结束或已经结束时自动追加下一段。
   */
  async function ensureQueueContinuation(reason: 'near-end' | 'ended'): Promise<boolean> {
    if (!session.value) return false;
    if (extendingQueuePromise) return extendingQueuePromise;
    const remaining = trackCount.value - currentIndex.value - 1;
    if (reason === 'near-end' && remaining > 2) return false;

    extendingQueue.value = true;
    extendingQueuePromise = (async () => {
      try {
        const res = await continueRadioSession(session.value!.sessionId, 8);
        const appendedTracks = res?.data?.appendedTracks || [];
        if (res.code === 0 && appendedTracks.length > 0) {
          appendQueue(appendedTracks);
          return true;
        }
        return false;
      } catch (err) {
        console.warn('[Queue] 自动续播失败:', err);
        return false;
      } finally {
        extendingQueue.value = false;
        extendingQueuePromise = null;
      }
    })();

    return extendingQueuePromise;
  }

  // 设置 TTS 音频映射（从 WebSocket TTS_READY 事件获取）
  function setTtsItems(items: TtsItem[]) {
    for (const item of items) {
      if (item.audioUrl) {
        ttsMap.value.set(item.text, item.audioUrl);
        if (item.style) ttsStyleMap.value.set(item.text, item.style);
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
      const res = await synthesizeTts(text, buildTtsStyleContext());
      const audioUrl = res?.data?.audioUrl;
      const hash = res?.data?.hash;
      if (audioUrl) {
        ttsMap.value.set(text, audioUrl);
        if (res?.data?.style) ttsStyleMap.value.set(text, res.data.style);
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
        target.volume = Math.max(0, Math.min(1, from + diff * eased));
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          target.volume = Math.max(0, Math.min(1, to));
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
    currentSpeechText.value = text;
    currentSpeechProgress.value = 0;
    pendingSpeechText.value = null;
    currentTtsOverlapToken = token;
    currentTtsShouldOverlap = options?.after === 'play-track';
    // 先渐降音乐音量，再播放 TTS
    fadeVolume(audio, SPEECH_DUCKING_VOLUME, 600).then(() => {
      if (token !== playbackToken) return;
      ttsAudio.src = url;
      applyTtsPlaybackStyle(text);
      setupWaveformCapture();
      applyTtsOutputGain();
      ttsAudio.play().then(() => {
        updateSpeechProgress();
        startSpeechProgressCapture();
        startWaveformCapture();
        scheduleTrackOverlapBeforeTtsEnd(token, currentTtsShouldOverlap);
      }).catch(() => {
        stopWaveformCapture();
        stopSpeechProgressCapture();
        djSpeaking.value = false;
        currentSpeechProgress.value = 0;
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
    if (ttsOverlapTimer) {
      clearTimeout(ttsOverlapTimer);
      ttsOverlapTimer = null;
    }
    ttsOverlapStarted = false;
    currentTtsOverlapToken = null;
    currentTtsShouldOverlap = false;
    ttsAudio.pause();
    ttsAudio.playbackRate = 1;
    ttsAudio.removeAttribute('src');
    ttsAudio.load();
    djSpeaking.value = false;
    currentSpeechText.value = '';
    currentSpeechProgress.value = 0;
    stopWaveformCapture();
    stopSpeechProgressCapture();
  }

  /**
   * 根据 TTS audio 当前进度同步逐字朗读 UI。
   */
  function updateSpeechProgress() {
    if (!ttsAudio.duration || !isFinite(ttsAudio.duration)) {
      currentSpeechProgress.value = djSpeaking.value ? 0.02 : currentSpeechProgress.value;
      return;
    }
    currentSpeechProgress.value = Math.max(0, Math.min(1, ttsAudio.currentTime / ttsAudio.duration));
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
    ttsGainNode = ttsAudioContext.createGain();
    ttsAnalyser.fftSize = 64;
    source.connect(ttsAnalyser);
    ttsAnalyser.connect(ttsGainNode);
    ttsGainNode.connect(ttsAudioContext.destination);
    applyTtsOutputGain();
  }

  /**
   * 根据当前电台场景应用 TTS 输出增益。
   * 只提升独白可听度，不改变歌曲 ducking 音量逻辑。
   */
  function applyTtsOutputGain() {
    ttsAudio.volume = 1;
    if (!ttsGainNode) return;
    ttsGainNode.gain.value = resolveTtsOutputGain(session.value?.sessionTitle);
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
   * 用动画帧同步 TTS 朗读进度，避免低频 timeupdate 造成逐字跳变。
   */
  function startSpeechProgressCapture() {
    if (speechProgressFrame !== null) cancelAnimationFrame(speechProgressFrame);

    function tick() {
      if (!djSpeaking.value) return;
      updateSpeechProgress();
      speechProgressFrame = requestAnimationFrame(tick);
    }

    tick();
  }

  /**
   * 停止 TTS 朗读进度同步。
   */
  function stopSpeechProgressCapture() {
    if (speechProgressFrame !== null) {
      cancelAnimationFrame(speechProgressFrame);
      speechProgressFrame = null;
    }
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

  /**
   * 在 DJ 独白结束前几秒淡入音乐，形成自然的电台过渡。
   */
  function scheduleTrackOverlapBeforeTtsEnd(token: number, shouldPlayTrack: boolean) {
    if (!shouldPlayTrack) return;
    if (ttsOverlapTimer) clearTimeout(ttsOverlapTimer);
    ttsOverlapStarted = false;

    const durationMs = Number.isFinite(ttsAudio.duration) ? ttsAudio.duration * 1000 : 0;
    if (!durationMs || durationMs <= 3200) return;

    ttsOverlapTimer = setTimeout(() => {
      if (token !== playbackToken || !djSpeaking.value || ttsAudio.paused) return;
      const track = currentTrack.value;
      if (!track?.playUrl) return;

      ttsOverlapStarted = true;
      if (!isAudioLoadedForCurrentTrack()) {
        audio.src = track.playUrl;
        audio.load();
        setupTrackWaveformCapture();
      }
      audio.volume = 0;
      audio.play()
        // DJ 仍在讲话时只把音乐铺到低音量，等独白结束再恢复正常音量。
        .then(() => fadeVolume(audio, SPEECH_OVERLAP_VOLUME, 1200))
        .catch(() => {
          ttsOverlapStarted = false;
        });
    }, Math.max(0, durationMs - 3000));
  }

  /**
   * 判断主音频元素是否已经加载到当前歌曲。
   */
  function isAudioLoadedForCurrentTrack(): boolean {
    const track = currentTrack.value;
    if (!track?.playUrl || !audio.src) return false;
    return audio.src === new URL(track.playUrl, window.location.href).href;
  }

  /**
   * 卸载主音频，切歌等待 TTS 或新地址时不保留上一首 src。
   */
  function unloadTrackAudio() {
    audio.removeAttribute('src');
    audio.load();
    currentTime.value = 0;
    duration.value = 0;
    stopTrackWaveformCapture();
  }

  /**
   * 初始化当前歌曲音频分析器，用真实音乐驱动专辑旁边的波形。
   */
  function setupTrackWaveformCapture() {
    if (trackAnalyser) return;
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;

    try {
      const captureStream = (audio as HTMLAudioElement & { captureStream?: () => MediaStream }).captureStream;
      if (!captureStream) return;

      trackAudioContext = new AudioContextCtor();
      trackAnalyser = trackAudioContext.createAnalyser();
      trackAnalyser.fftSize = 128;
      // 使用 captureStream 做旁路采样，不接管 audio 元素本身的输出链路。
      trackStreamSource = trackAudioContext.createMediaStreamSource(captureStream.call(audio));
      trackStreamSource.connect(trackAnalyser);
    } catch (err) {
      console.warn('[Audio] 当前浏览器无法初始化歌曲波形分析:', err);
      trackAnalyser = null;
      trackStreamSource = null;
      trackAudioContext = null;
    }
  }

  /**
   * 启动当前歌曲真实波形采样。
   */
  function startTrackWaveformCapture() {
    if (trackWaveformFrame !== null) cancelAnimationFrame(trackWaveformFrame);
    if (!trackAnalyser) {
      startFallbackTrackWaveformCapture();
      return;
    }
    trackAudioContext?.resume().catch(() => {});

    const data = new Uint8Array(trackAnalyser.frequencyBinCount);
    const sampleCount = trackWaveform.value.length;
    trackSilentFrameCount = 0;

    function tick() {
      if (!trackAnalyser || audio.paused || audio.ended) {
        stopTrackWaveformCapture();
        return;
      }
      trackAnalyser.getByteFrequencyData(data);
      const peak = data.reduce((max, value) => Math.max(max, value), 0);
      trackSilentFrameCount = peak <= 2 ? trackSilentFrameCount + 1 : 0;

      if (trackSilentFrameCount > 12) {
        trackWaveform.value = buildFallbackTrackWaveform();
        trackWaveformFrame = requestAnimationFrame(tick);
        return;
      }

      const next = Array.from({ length: sampleCount }, (_, index) => {
        const sourceIndex = Math.min(data.length - 1, Math.floor(index * data.length / sampleCount));
        const level = data[sourceIndex] / 255;
        return Math.max(0.16, Math.min(1, level));
      });
      trackWaveform.value = next;
      trackWaveformFrame = requestAnimationFrame(tick);
    }

    tick();
  }

  /**
   * 停止当前歌曲波形采样并回到低电平。
   */
  function stopTrackWaveformCapture() {
    if (trackWaveformFrame !== null) {
      cancelAnimationFrame(trackWaveformFrame);
      trackWaveformFrame = null;
    }
    trackSilentFrameCount = 0;
    trackWaveform.value = buildIdleTrackWaveform(TRACK_WAVEFORM_SIZE);
  }

  /**
   * 真实采样不可用时，使用当前播放进度生成降级波形，避免 UI 消失。
   */
  function startFallbackTrackWaveformCapture() {
    function tick() {
      if (audio.paused || audio.ended) {
        stopTrackWaveformCapture();
        return;
      }
      trackWaveform.value = buildFallbackTrackWaveform();
      trackWaveformFrame = requestAnimationFrame(tick);
    }

    tick();
  }

  /**
   * 暂停态的低电平波形，保证专辑旁边始终有声音区域的视觉锚点。
   */
  function buildIdleTrackWaveform(count: number): number[] {
    return Array.from({ length: count }, (_, index) => 0.18 + ((index * 7) % 5) * 0.018);
  }

  /**
   * 基于当前歌曲和播放时间生成可变降级波形。
   */
  function buildFallbackTrackWaveform(): number[] {
    const trackSeed = currentTrack.value?.trackId || currentIndex.value + 1;
    const time = audio.currentTime || currentTime.value || 0;
    return Array.from({ length: TRACK_WAVEFORM_SIZE }, (_, index) => {
      const fast = Math.sin(time * 5.4 + index * 0.86 + trackSeed * 0.17);
      const slow = Math.sin(time * 1.7 + index * 0.31 + trackSeed * 0.11);
      const level = 0.34 + fast * 0.18 + slow * 0.12 + ((index + trackSeed) % 3) * 0.035;
      return Math.max(0.18, Math.min(0.86, level));
    });
  }

  /**
   * 当前 TTS 兜底合成使用的情绪上下文。
   */
  function buildTtsStyleContext(): Record<string, any> {
    const track = currentTrack.value;
    return {
      scene: session.value?.sessionTitle || '',
      mood: extractMoodFromSessionTitle(session.value?.sessionTitle),
      title: track?.title,
      artist: track?.artist,
      album: track?.album,
    };
  }

  /**
   * 从会话标题中提取当前模式，兼容后端暂未下发 scene/mood 字段的情况。
   */
  function extractMoodFromSessionTitle(title?: string): string {
    if (!title) return '';
    const match = title.match(/·\s*([^·]+?)模式/);
    return match?.[1] || '';
  }

  /**
   * 按 TTS 风格控制播放层语速，让声音更贴合当前音乐场景。
   */
  function applyTtsPlaybackStyle(text: string) {
    const style = ttsStyleMap.value.get(text);
    const rate = style?.playbackRate ?? resolveLocalTtsRate();
    ttsAudio.playbackRate = Math.max(0.9, Math.min(1.06, rate));
  }

  /**
   * 老缓存或旧 TTS_READY 没有 style 时的本地语速兜底。
   */
  function resolveLocalTtsRate(): number {
    const moodText = extractMoodFromSessionTitle(session.value?.sessionTitle);
    if (moodText.includes('深夜')) return 0.94;
    if (moodText.includes('放松')) return 0.97;
    if (moodText.includes('BGM')) return 1.0;
    if (moodText.includes('专注')) return 1.01;
    return 0.98;
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
        void ensureQueueContinuation('near-end');
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
    unloadTrackAudio();
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
    trackWaveform,
    currentSpeechText,
    currentSpeechProgress,
    loading,
    extendingQueue,
    currentTime,
    duration,
    currentTrack,
    trackCount,
    ttsMap,
    ttsStyleMap,
    slotChanged,
    setSession,
    next,
    prev,
    goTo,
    togglePlay,
    seek,
    setVolume,
    updateQueue,
    replaceQueue,
    appendQueue,
    ensureQueueContinuation,
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
