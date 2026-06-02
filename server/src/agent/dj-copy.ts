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
  weather?: string;
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
  const albumText = track.album ? `收在《${track.album}》里，` : '';
  const weatherText = options.weather ? `外面的${options.weather}也让这首歌更适合被放在这里，` : '';
  const introPrefix = options.index === 0
    ? pickByTrack(track, [
      '第一首先不急着把情绪推高，我想让它像把灯光调暗一点那样，把注意力慢慢收回来。',
      '开场我会放一首有入口感的歌，让耳朵先找到这个时段的呼吸。',
      '我们从一首不太用力、但气质很清楚的歌开始，让这组电台先站稳。',
    ])
    : buildTransitionPrefix(options.previousTrack, track);

  const exploreHint = isExplore
    ? pickByTrack(track, [
      '这首不一定在你原来的歌单里，但它和你常听的气质有一条暗线连着。',
      '这里我稍微往你的歌单外走了一步，放一首可能会让你觉得“原来我也会喜欢”的歌。',
      '接下来这首算是主动探索，不是偏离口味，而是把你的听感边界轻轻打开一点。',
    ])
    : '';
  const segue = `${introPrefix}${exploreHint}${pickByTrack(track, [
    `现在把这一段交给 ${artist} 的《${track.title}》。`,
    `下一首是 ${artist} 的《${track.title}》，我想让它来改变一下空气的密度。`,
    `这里换到《${track.title}》，让 ${artist} 把刚才的情绪换一种角度说出来。`,
  ])}`;
  const djScript = pickByTrack(track, [
    `《${track.title}》${albumText}不是靠大开大合抓人，它更像是用${tags}慢慢把画面推近。${artist}把声音里的边缘感留得很清楚，所以听起来会有一种不被催促的空间。`,
    `《${track.title}》${albumText}最打动人的地方，是它没有把情绪直接说破。${artist}让旋律和音色先走在前面，${tags}在后面慢慢浮出来，适合你现在这种${options.moodLabel}的状态。`,
    `这首《${track.title}》${albumText}听感上有一种很具体的纹理。它不只是好听，更重要的是 ${artist} 把节奏、声线和留白放在一个舒服的位置，让人可以待在里面。`,
  ]);
  const recommendReason = pickByTrack(track, [
    `我推荐它，不只是因为${reason}。${weatherText}它适合现在的${options.sceneLabel}，是因为它有存在感，但不会把你的注意力整块拿走；你可以听见它，也可以继续做自己的事。`,
    `这首歌放在这里，是想给这段时间一点情绪上的支撑。${weatherText}${reason}只是入口，更关键的是它能把你熟悉的听感整理得更安静、更贴近当下。`,
    `${weatherText}我会在这里选它，是因为它和你的品味不是表面的相似，而是情绪重心接近：${reason}让它能贴住你现在的${options.moodLabel}状态，有一点克制，有一点温度，也给当前${options.sceneLabel}留出了呼吸。`,
  ]) + (isExplore ? ' 它也让这组歌不只是重复“喜欢”列表，而是从你的口味里长出一点新的可能。' : '');

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
    return pickByTrack(currentTrack, [
      '接下来不急着转弯，我想让情绪顺着刚才的方向再走一小段。',
      '下一首我会把节奏稍微换个角度，但不打断现在的状态。',
      '这里让空气松一点，换一首更适合继续听下去的歌。',
    ]);
  }
  return pickByTrack(currentTrack, [
    `刚才 ${previousTrack.title} 留下的是一种比较克制的余味，接下来换到《${currentTrack.title}》，让情绪更靠近你一点。`,
    `${previousTrack.title} 的那股劲先放在这里，下一首《${currentTrack.title}》会把同一种心情说得更柔和一点。`,
    `从 ${previousTrack.title} 到《${currentTrack.title}》，我想做一个不突兀的过渡，让这段时间继续流动。`,
    `刚才那首歌像把门打开了一点，现在《${currentTrack.title}》进来，把房间里的光线换成另一种颜色。`,
  ]);
}

/**
 * 根据歌曲稳定选择一条文案，避免兜底内容每首歌都落入同一句模板。
 */
function pickByTrack(track: TrackLike, variants: string[]): string {
  const seed = `${track.title}-${track.artists || track.artist || ''}-${track.album || ''}`;
  const hash = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return variants[hash % variants.length];
}
