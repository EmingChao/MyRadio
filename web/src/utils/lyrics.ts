export interface LyricLine {
  time: number
  text: string
}

/**
 * 解析 LRC 格式歌词。
 */
export function parseLrc(lyrics: string): LyricLine[] {
  if (!lyrics) return []

  const lines: LyricLine[] = []
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/

  for (const rawLine of lyrics.split('\n')) {
    const match = rawLine.match(regex)
    if (!match) continue

    const min = Number.parseInt(match[1], 10)
    const sec = Number.parseInt(match[2], 10)
    const msText = match[3]
    const ms = Number.parseInt(msText, 10)
    const text = match[4].trim()
    if (!text) continue

    lines.push({
      time: min * 60 + sec + ms / (msText.length === 3 ? 1000 : 100),
      text,
    })
  }

  return lines.sort((a, b) => a.time - b.time)
}

/**
 * 根据播放时间计算当前歌词行。
 */
export function resolveActiveLyricIndex(lines: LyricLine[], currentTime: number): number {
  let index = -1
  for (let i = 0; i < lines.length; i++) {
    if (currentTime >= lines[i].time) index = i
    else break
  }
  return index
}
