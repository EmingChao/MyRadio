/**
 * 根据当前电台场景计算 DJ TTS 的播放增益。
 * 浏览器 audio.volume 最高只能到 1，因此实际增益会在 Web Audio GainNode 中应用。
 */
export function resolveTtsOutputGain(sessionTitle?: string): number {
  const title = sessionTitle || '';
  if (title.includes('深夜')) return 1.3;
  if (title.includes('BGM')) return 1.28;
  if (title.includes('专注')) return 1.38;
  if (title.includes('放松')) return 1.34;
  return 1.35;
}
