import { onMounted, onUnmounted, watch } from 'vue'
import { usePlayerStore } from '../stores/player'

/**
 * 判断键盘事件是否来自输入场景。
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false

  const tag = el.tagName?.toLowerCase()
  return tag === 'input'
    || tag === 'textarea'
    || tag === 'select'
    || el.isContentEditable
}

export type KeyboardPlayerAction = 'toggle' | 'next' | 'prev'

/**
 * 将页面内快捷键解析成播放器动作。
 */
export function resolveKeyboardPlayerAction(event: Pick<KeyboardEvent, 'code' | 'target'>): KeyboardPlayerAction | null {
  if (isTypingTarget(event.target)) return null

  if (event.code === 'Space') return 'toggle'
  if (event.code === 'ArrowRight') return 'next'
  if (event.code === 'ArrowLeft') return 'prev'

  return null
}

/**
 * 绑定系统媒体键和页面内播放快捷键。
 */
export function useMediaKeyboardControls() {
  const store = usePlayerStore()

  /**
   * 执行页面快捷键对应的播放动作。
   */
  function handleKeydown(event: KeyboardEvent) {
    const action = resolveKeyboardPlayerAction(event)
    if (!action) return

    event.preventDefault()
    if (action === 'toggle') store.togglePlay()
    if (action === 'next') store.next()
    if (action === 'prev') store.prev()
  }

  /**
   * 注册系统媒体键：
   * F8/播放暂停键、F7/上一首、F9/下一首会走这里。
   */
  function setupMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) return

    navigator.mediaSession.setActionHandler('play', () => {
      if (!store.isPlaying) store.togglePlay()
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      if (store.isPlaying) store.togglePlay()
    })
    navigator.mediaSession.setActionHandler('nexttrack', () => store.next())
    navigator.mediaSession.setActionHandler('previoustrack', () => store.prev())
  }

  /**
   * 同步系统媒体浮窗中的歌曲信息。
   */
  function updateMediaSessionMetadata() {
    if (!('mediaSession' in navigator)) return

    const track = store.currentTrack
    if (!track) return

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album || 'Claudio Radio',
      artwork: track.coverUrl
        ? [{ src: track.coverUrl, sizes: '512x512', type: 'image/jpeg' }]
        : [],
    })
    navigator.mediaSession.playbackState = store.isPlaying ? 'playing' : 'paused'
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
    setupMediaSessionHandlers()
    updateMediaSessionMetadata()
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })

  watch(
    () => [store.currentTrack?.trackId, store.isPlaying],
    () => updateMediaSessionMetadata(),
  )
}
