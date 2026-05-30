interface SessionMoodContext {
  scene?: string;
  mood?: string;
}

interface TrackLike {
  title: string;
  artists?: string;
  artist?: string;
  album?: string | null;
  genre_tags?: string | null;
  mood_tags?: string | null;
  source_type?: string | null;
}

interface FallbackTrackCopyOptions {
  index: number;
  reason?: string;
  sceneLabel: string;
  moodLabel: string;
  previousTrack?: TrackLike | null;
  sourceScope?: 'library' | 'explore';
}

/**
 * 获取面向用户的场景名称。
 */
export function getSceneLabel(scene?: string): string {
  if (scene === 'coding') return '编码';
  if (scene === 'working') return '工作';
  if (scene === 'relaxing') return '放松';
  if (scene === 'sleeping') return '入眠';
  return '日常';
}

/**
 * 生成体验优先的开场白，避免电台启动时只有一句系统提示。
 */
export function buildOpeningCopy(params: SessionMoodContext, trackCount: number): string {
  const sceneLabel = getSceneLabel(params.scene);
  const moodLabel = params.mood || '随意';
  return `现在进入${sceneLabel}时间，我会把这组歌放得更贴近“${moodLabel}”的状态。前面先稳住情绪和节奏，中段再慢慢打开一点空间感；这 ${trackCount} 首歌不会急着抢注意力，而是陪你把当前这段时间顺下来。`;
}

/**
 * 为模型不可用或字段过短时生成更像 DJ 独白的兜底文案。
 */
export function buildFallbackTrackCopy(track: TrackLike, options: FallbackTrackCopyOptions) {
  const artist = track.artists || track.artist || '这位音乐人';
  const tags = [track.genre_tags, track.mood_tags].filter(Boolean).join('、') || '你熟悉的气质';
  const reason = options.reason || '和你的听歌习惯比较接近';
  const isExplore = options.sourceScope === 'explore' || track.source_type === 'NETEASE_EXPLORE';
  const introPrefix = options.index === 0
    ? '第一首我想先把状态放稳。'
    : buildTransitionPrefix(options.previousTrack, track);

  const exploreHint = isExplore
    ? '这首不一定在你原来的歌单里，我是顺着你的品味往外多走了一步。'
    : '';
  const segue = `${introPrefix}${exploreHint}${artist} 的《${track.title}》会把这一段带到更适合${options.sceneLabel}的氛围里；它不急着往前推，而是用${tags}的质感，把“${options.moodLabel}”这件事落到声音里。`;
  const djScript = `这首《${track.title}》适合放在这里，是因为它能承接你现在需要的情绪密度。${artist}的表达不会太满，留出的空间足够你继续做自己的事，同时又能让这组歌有一个明确的方向。${isExplore ? '把它放进来，是想给熟悉的口味一点新鲜空气。' : ''}`;
  const recommendReason = `推荐它主要因为${reason}。结合当前${options.sceneLabel}场景和“${options.moodLabel}”状态，这首歌能提供一点情绪支撑，但不会喧宾夺主；${isExplore ? '它和你的常听气质有连接，又不会只是重复旧歌单。' : '它像是在旁边把灯调暗一点，让注意力慢慢回到你自己身上。'}`;

  return { segue, djScript, recommendReason };
}

/**
 * 当模型返回字段过短时，用体验型文案补齐。
 */
export function enrichTrackCopyIfNeeded<T extends { segue?: string; djScript?: string; recommendReason?: string }>(
  copy: T,
  track: TrackLike,
  options: FallbackTrackCopyOptions,
): T {
  const fallback = buildFallbackTrackCopy(track, options);
  return {
    ...copy,
    segue: isThinCopy(copy.segue, 36) ? fallback.segue : copy.segue,
    djScript: isThinCopy(copy.djScript, 50) ? fallback.djScript : copy.djScript,
    recommendReason: isThinCopy(copy.recommendReason, 50) ? fallback.recommendReason : copy.recommendReason,
  };
}

/**
 * 生成真正用于 TTS 播放的歌曲前独白。
 * 这里会把过渡、歌曲介绍和推荐理由揉成一段，避免用户只听到很短的切歌提示。
 */
export function buildTrackVoiceIntro(copy: {
  segue?: string;
  djScript?: string;
  recommendReason?: string;
}): string {
  return [copy.segue, copy.djScript, copy.recommendReason]
    .map(text => normalizeSentence(text))
    .filter(Boolean)
    .join(' ');
}

/**
 * 判断 DJ 文案是否过短，过短时会显得像系统提示而不是电台主播。
 */
function isThinCopy(text: string | undefined, minLength: number): boolean {
  return !text || text.trim().length < minLength;
}

/**
 * 清理单段 TTS 文案，避免重复空白影响语音节奏。
 */
function normalizeSentence(text: string | undefined): string {
  return text?.replace(/\s+/g, ' ').trim() || '';
}

/**
 * 生成上一首到当前歌曲之间的情绪承接。
 */
function buildTransitionPrefix(previousTrack: TrackLike | null | undefined, currentTrack: TrackLike): string {
  if (!previousTrack) {
    return '接下来我想把这段情绪继续往前送一点。';
  }
  return `刚才 ${previousTrack.title} 已经把底色铺开了，接下来换到《${currentTrack.title}》。`;
}
