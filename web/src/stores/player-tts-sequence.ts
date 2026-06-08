import type { RadioSession } from './player'

export type DjSpeechKind = 'opening' | 'segue'

export interface DjSpeechDecision {
  kind: DjSpeechKind
  text: string
}

export type ClientTtsSynthesisReason = 'current-waiting' | 'background-preheat'

/**
 * 判断某段 DJ 独白是否应该在 TTS 音频真正开始播放后再标记为已读。
 */
export function shouldMarkSpeechAsSpoken(kind: DjSpeechKind, ttsStarted: boolean): boolean {
  return kind === 'segue' && ttsStarted
}

/**
 * 判断前端是否允许主动请求 TTS 合成。
 * 只有用户马上要听的当前段落可以兜底合成，后续预热交给服务端后台队列，避免触发限流。
 */
export function shouldClientSynthesizeSpeech(reason: ClientTtsSynthesisReason): boolean {
  return reason === 'current-waiting'
}

/**
 * DJ 独白结束后，歌曲应立即启动，音量淡入只负责过渡手感。
 */
export function shouldStartTrackBeforeFadeIn(ttsOverlapStarted: boolean): boolean {
  return !ttsOverlapStarted
}

/**
 * 根据 TTS 当前播放进度判断是否应进入最后 3 秒的歌曲叠入。
 */
export function shouldStartOverlapFromTtsProgress(currentTime: number, duration: number, alreadyStarted: boolean): boolean {
  if (alreadyStarted || !Number.isFinite(duration) || duration <= 3.2) return false
  return duration - currentTime <= 3
}

/**
 * 页面不可见时不能依赖 RAF 淡入，否则歌曲会保持 0 音量直到切回浏览器。
 */
export function resolveRevealVolume(targetVolume: number, pageHidden: boolean): number {
  return pageHidden ? targetVolume : 0
}

export interface PostSpeechVolumeStep {
  volume: number
  durationMs: number
}

/**
 * DJ 独白结束后的歌曲音量恢复曲线：先承接，再慢慢回到全音量。
 */
export function resolvePostSpeechVolumeSteps(): PostSpeechVolumeStep[] {
  return [
    { volume: 0.52, durationMs: 850 },
    { volume: 1.0, durationMs: 2800 },
  ]
}

/**
 * 判断某个队列位置是否需要提前准备 DJ 独白。
 */
export function shouldPrefetchSpeechForIndex(trackCount: number, currentIndex: number, targetIndex: number): boolean {
  if (trackCount <= 0) return false
  return targetIndex > currentIndex && targetIndex < trackCount && targetIndex - currentIndex <= 2
}

/**
 * 手动点击播放时是否需要先重新进入 DJ 独白准备流程。
 */
export function shouldPrepareSpeechBeforeManualPlay(audioLoadedForCurrentTrack: boolean, hasUnspokenSpeech: boolean): boolean {
  return !audioLoadedForCurrentTrack || hasUnspokenSpeech
}

/**
 * 解析 DJ 独白等待 TTS 的时间，首段更长，避免第一首歌没独白。
 */
export function resolveTtsWaitTimeoutMs(
  kind: DjSpeechKind,
  currentIndex: number,
  normalTimeoutMs: number,
  firstSegmentTimeoutMs: number,
): number {
  return kind === 'opening' || currentIndex === 0 ? firstSegmentTimeoutMs : normalTimeoutMs
}

/**
 * 按当前播放位置选择 DJ 应该先说的内容。
 */
export function resolveDjSpeechBeforeTrack(
  session: RadioSession | null,
  currentIndex: number,
  openingPending: boolean,
): DjSpeechDecision | null {
  if (!session) return null

  // 新会话第一次播放前，优先播开场白。
  if (openingPending && session.say?.trim()) {
    return { kind: 'opening', text: session.say.trim() }
  }

  const track = session.tracks[currentIndex]
  const voiceIntro = track?.voiceIntro?.trim()
  const segue = track?.segue?.trim()
  const text = voiceIntro || segue
  if (!text) return null

  // 每次进入一首歌前，优先使用后端合成的完整 DJ 独白。
  return { kind: 'segue', text }
}
