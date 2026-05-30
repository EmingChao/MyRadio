import type { RadioSession } from './player'

export type DjSpeechKind = 'opening' | 'segue'

export interface DjSpeechDecision {
  kind: DjSpeechKind
  text: string
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
