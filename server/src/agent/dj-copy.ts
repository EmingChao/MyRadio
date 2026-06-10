import { buildSongFactsForPrompt, type PromptSongFacts } from '../services/track-facts';

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
  track_fact?: any;
  songFacts?: PromptSongFacts;
}

interface FallbackTrackCopyOptions {
  index: number;
  reason?: string;
  sceneLabel: string;
  moodLabel: string;
  previousTrack?: TrackLike | null;
  sourceScope?: string;
  weather?: string;
}

type VoiceIntroDepth = 'spotlight' | 'standard' | 'bridge';

interface TrackVoiceIntroOptions {
  index?: number;
  track?: TrackLike;
  sourceScope?: string;
  totalTracks?: number;
  recentVoiceIntros?: string[];
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
  const tags = normalizeTags(track) || '旋律、节奏和声线';
  const reason = cleanRecommendSignal(options.reason || '和你的听歌习惯比较接近');
  const sourceHint = buildSourceHint(track, options);
  const albumText = buildAlbumContextText(track);
  const factSentence = buildFactSentence(track);
  const weatherMood = sanitizeWeatherForDj(options.weather);
  const weatherText = shouldMentionWeather(track, options)
    ? pickByTrack(track, [
      `窗外是${weatherMood}，这首歌的留白会显得更清楚，`,
      `${weatherMood}里听它，鼓点和声线不会显得拥挤，`,
      `今天这种${weatherMood}不需要被反复说明，但这一首的质地刚好合拍，`,
    ])
    : '';
  const introPrefix = options.index === 0
    ? pickByTrack(track, [
      '第一首先从一个清楚的拍点开始，让手上的事情有个容易进入的速度。',
      '开场不急着拔高，我先放一首轮廓分明的歌，把注意力慢慢带回来。',
      '我们从一首不太用力、但辨识度很清楚的歌开始，让这组电台先站稳。',
    ])
    : buildTransitionPrefix(options.previousTrack, track);

  const segue = polishDjCopyText(`${introPrefix}${sourceHint.segue}${pickByTrack(track, [
    `现在把这一段交给 ${artist} 的《${track.title}》。`,
    `下一首听 ${artist} 的《${track.title}》，先听它的鼓点和声线怎么把人带进去。`,
    `这里换到《${track.title}》，${artist} 会把节奏落到更具体的位置。`,
    `接下来听《${track.title}》，我想先让歌本身说话。`,
  ])}`);
  const djScript = polishDjCopyText(pickByTrack(track, [
    `《${track.title}》${albumText}${factSentence}${artist} 的处理不靠堆满信息，而是把${tags}摆得很清楚，听的时候容易抓到它的主线。`,
    `这首《${track.title}》${albumText}${factSentence}我会先留意 ${artist} 的声线和编曲之间的距离：它没有把所有东西都推到前面，而是让细节慢慢出现。`,
    `《${track.title}》${albumText}${factSentence}好听之外，它还有一个清楚的听感落点：${tags}之间的关系很明确，不需要硬讲背景也能听出它自己的表情。`,
    `如果只看歌名，《${track.title}》可能会被低估。${factSentence}${artist} 把旋律、节奏和停顿处理得很有分寸，整首歌不是装饰性的陪伴，而是有自己的表达。`,
    `这首歌不是只负责“好听”。${factSentence}${artist} 在《${track.title}》里留下了可辨认的线索，${tags}让它和普通背景音乐拉开了一点距离。`,
  ]));
  const recommendReason = polishDjCopyText(pickByTrack(track, [
    `${reason}只是入口。${weatherText}在${options.sceneLabel}里，它的节奏能给手上的事一个稳定拍点，同时又不会把注意力抢走。`,
    `${weatherText}它和你常听方向之间有一条线：这首歌的${tags}够清楚，能让这一段${options.sceneLabel}时间少一点机械循环感。`,
    `${reason}这条线能对上，但更重要的是，它在${options.moodLabel}里不是喊口号，而是用节奏和声线把人留在一个能继续做事的位置。`,
    `如果一路只播最熟的歌，电台会变得太平。这首《${track.title}》保留了你熟悉的入口，又多出一点属于它自己的表情。`,
    `${weatherText}${reason}能把它带进这一轮；${artist} 的处理方式让它不会变成纯背景，在${options.moodLabel}里听，也能给当前${options.sceneLabel}留住一个稳定的拍点，和你常听的方向接得上。`,
  ]) + sourceHint.recommendSuffix);

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
    segue: polishDjCopyText(shouldReplaceDjCopy(copy.segue, 36) ? fallback.segue : copy.segue),
    djScript: polishDjCopyText(shouldReplaceDjCopy(copy.djScript, 50) ? fallback.djScript : copy.djScript),
    recommendReason: polishDjCopyText(shouldReplaceDjCopy(copy.recommendReason, 50) ? fallback.recommendReason : copy.recommendReason),
  };
}

/**
 * 生成真正用于 TTS 播放的歌曲前独白。
 * 这里按歌曲位置、候选来源和事实丰富度分层，避免每首歌都像完整作文。
 */
export function buildTrackVoiceIntro(copy: {
  segue?: string;
  djScript?: string;
  recommendReason?: string;
}, options: TrackVoiceIntroOptions = {}): string {
  const segue = normalizeSentence(copy.segue);
  const djScript = normalizeSentence(copy.djScript);
  const recommendReason = normalizeSentence(copy.recommendReason);
  const depth = resolveVoiceIntroDepth(options);

  if (depth === 'spotlight') {
    return reviewVoiceIntroAgainstTemplates([
      compactVoicePart(segue, 110),
      compactVoicePart(djScript, 150),
      recommendReason ? compactVoicePart(`我把它放在这里，是因为${stripIntroPhrase(recommendReason)}`, 130) : '',
    ].filter(Boolean).join(' '), options);
  }

  if (depth === 'standard') {
    return reviewVoiceIntroAgainstTemplates([
      compactVoicePart(segue, 105),
      compactVoicePart(djScript || recommendReason, 135),
    ].filter(Boolean).join(' '), options);
  }

  return reviewVoiceIntroAgainstTemplates([
    compactVoicePart(segue, 95),
    compactVoicePart(stripIntroPhrase(recommendReason || djScript), 75),
  ].filter(Boolean).join(' '), options);
}

/**
 * 对最终 TTS 独白做反模板审稿。
 * 这里使用最近几首的句式记忆和固定套话清单，减少连续播放时的重复感。
 */
export function reviewVoiceIntroAgainstTemplates(text: string, options: TrackVoiceIntroOptions = {}): string {
  const track = options.track;
  let reviewed = polishDjCopyText(text)
    .replace(/我把它放在这里，是因为/g, '')
    .replace(/我把它放在这里/g, '')
    .replace(/把它放在这里，是因为/g, '')
    .replace(/我选它，是因为/g, '')
    .replace(/所以我把它放在这里/g, '')
    .replace(/这首歌放在这里，是想/g, '')
    .replace(/，\s*，/g, '，')
    .replace(/。\s*。/g, '。')
    .trim();

  reviewed = rewriteRepeatedOpening(reviewed, options);
  reviewed = dedupeNearbySentences(reviewed);

  // 如果审稿后丢失了歌曲名，补一个很短的锚点，避免 TTS 变成泛泛氛围话。
  if (track?.title && !reviewed.includes(track.title)) {
    const artist = track.artists || track.artist || '';
    reviewed = `${artist ? `${artist} 的` : ''}《${track.title}》在这里进来。${reviewed}`;
  }

  return polishDjCopyText(reviewed);
}

/**
 * 判断当前歌曲独白的讲述层级：重点歌讲故事，普通歌做自然过渡。
 */
export function resolveVoiceIntroDepth(options: TrackVoiceIntroOptions = {}): VoiceIntroDepth {
  const index = Math.max(0, options.index ?? 0);
  const track = options.track;
  const sourceScope = normalizeSourceScope(options.sourceScope || track?.source_type);
  const facts = track ? resolveSongFacts(track) : undefined;
  const hasRichFacts = Boolean(facts?.listenerImpression || facts?.wiki || facts?.lyricTheme);
  const isDiscoverySource = sourceScope === 'daily' || sourceScope === 'explore' || sourceScope === 'fm';
  const isRelationSource = sourceScope === 'similar' || sourceScope === 'vector';

  if (index === 0) return 'spotlight';

  // 发现类候选适合被认真介绍，但也要留出间隔，避免每首都像推荐理由汇报。
  if (isDiscoverySource) {
    return index % 4 === 1 ? 'spotlight' : 'standard';
  }

  // 有真实事实的歌可以偶尔展开讲，其余时候保持一段式介绍。
  if (hasRichFacts) {
    return index % 5 === 2 ? 'spotlight' : 'standard';
  }

  if (isRelationSource || index % 3 === 0) return 'standard';
  return 'bridge';
}

/**
 * 净化 DJ 文案中的模板化表达。
 * 模型或兜底文案偶尔会生成漂亮但空泛的句子，这里在保存/TTS 前做最后一道防线。
 */
export function polishDjCopyText(text: string | undefined): string {
  if (!text) return '';
  return normalizeSentence(text)
    .replace(/我想让它来改变一下空气的密度/g, '我想用它换一个更清楚的节奏入口')
    .replace(/改变一下空气的密度/g, '换一个更清楚的节奏入口')
    .replace(/把空气里的明暗稍微调一下/g, '把听感从上一首里自然接出来')
    .replace(/空气里的明暗/g, '听感里的层次')
    .replace(/它适合你现在这种([^，。；;]*)状态/g, '它和你现在的$1状态能接上')
    .replace(/适合你现在这种([^，。；;]*)的状态/g, '和你现在的$1状态能接上')
    .replace(/适合你现在这种([^，。；;]*)状态/g, '和你现在的$1状态能接上')
    .replace(/适合当前状态/g, '能接住这一刻的听感')
    .replace(/情绪重心接近/g, '听感方向接近')
    .replace(/让它能贴住你现在的([^，。；;]*)状态/g, '它和你现在的$1状态能接上')
    .replace(/也给当前([^，。；;]*)留出了呼吸/g, '也不会打断当前$1')
    .replace(/留出了呼吸/g, '留下了停顿')
    .replace(/底色铺开/g, '主线打开')
    .replace(/接住余温/g, '接上上一首的尾音')
    .replace(/把情绪慢慢铺开/g, '把歌曲的主线慢慢说明白')
    .replace(/把情绪推高/g, '把声音抬得太满')
    .replace(/情绪坐标/g, '听感位置')
    .replace(/轻轻往前推/g, '往前带一点')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 判断 DJ 文案是否过短，过短时会显得像系统提示而不是电台主播。
 */
function isThinCopy(text: string | undefined, minLength: number): boolean {
  return !text || text.trim().length < minLength;
}

/**
 * 判断模型文案是否需要被后端事实版文案替换。
 */
function shouldReplaceDjCopy(text: string | undefined, minLength: number): boolean {
  if (isThinCopy(text, minLength)) return true;
  return hasTemplatePhrase(text) || hasUnverifiedFactClaim(text);
}

/**
 * 检测漂亮但空泛的模板套话。
 */
function hasTemplatePhrase(text: string | undefined): boolean {
  return /改变.*空气.*密度|空气里的明暗|适合你现在这种|适合当前状态|底色铺开|接住余温|把情绪慢慢铺开|情绪重心|留出了呼吸|贴住你/i.test(text || '');
}

/**
 * 检测容易被模型编造的未验证事实声明。
 */
function hasUnverifiedFactClaim(text: string | undefined): boolean {
  return /制作人是|被誉为|被称为|之神|拿过.*奖|获得.*奖|斩获.*奖|电影主题曲|电视剧主题曲|采访中|创作灵感来自|背后.*故事|行业影响力/i.test(text || '');
}

/**
 * 清理单段 TTS 文案，避免重复空白影响语音节奏。
 */
function normalizeSentence(text: string | undefined): string {
  return text?.replace(/\s+/g, ' ').trim() || '';
}

/**
 * 压缩一段口播文本，优先在自然标点处收束，避免 TTS 读出半截句子。
 */
function compactVoicePart(text: string | undefined, maxLength: number): string {
  const cleaned = normalizeSentence(text);
  if (!cleaned || cleaned.length <= maxLength) return cleaned;

  const clipped = cleaned.slice(0, maxLength + 1);
  const punctuationIndex = Math.max(
    clipped.lastIndexOf('。'),
    clipped.lastIndexOf('；'),
    clipped.lastIndexOf(';'),
    clipped.lastIndexOf('，'),
    clipped.lastIndexOf(','),
  );

  if (punctuationIndex >= Math.floor(maxLength * 0.55)) {
    return ensureVoiceSentenceEnd(clipped.slice(0, punctuationIndex + 1));
  }

  return ensureVoiceSentenceEnd(cleaned.slice(0, maxLength).replace(/[，,；;、\s]+$/g, ''));
}

/**
 * 给被截断的口播片段补一个自然句尾。
 */
function ensureVoiceSentenceEnd(text: string): string {
  const cleaned = normalizeSentence(text).replace(/[，,；;、\s]+$/g, '');
  if (!cleaned) return '';
  return /[。！？!?]$/.test(cleaned) ? cleaned : `${cleaned}。`;
}

/**
 * 当最近几首使用了相同开头时，换成更具体的歌曲锚点。
 */
function rewriteRepeatedOpening(text: string, options: TrackVoiceIntroOptions): string {
  const currentSignature = getOpeningSignature(text);
  if (!currentSignature || !isOpeningSignatureRepeated(currentSignature, options.recentVoiceIntros || [])) {
    return text;
  }

  const track = options.track;
  const title = track?.title || extractQuotedTitle(text);
  if (!title) return text;
  const artist = track?.artists || track?.artist || '';
  const lead = `换到《${title}》这里，${artist ? `${artist}的声音` : '这首歌'}`;
  let rest = text
    .replace(/^接下来这首《[^》]+》\s*/, '')
    .replace(/^下一首(?:我选|听)?《[^》]+》\s*/, '')
    .replace(/^接下来听《[^》]+》\s*/, '')
    .replace(/^这里换到《[^》]+》\s*/, '')
    .replace(new RegExp(`接下来这首《${escapeRegExp(title)}》`, 'g'), '这首歌')
    .replace(/^我想让它自然进来[。；;，,\s]*/g, '')
    .replace(/^我想让它/g, '')
    .replace(/^这首歌/g, '')
    .replace(/^它/g, '')
    .replace(/^[，,。；;\s]+/g, '');

  if (!rest) {
    rest = '会把这一段听感接得更具体。';
  }

  return ensureVoiceSentenceEnd(`${lead}${rest}`);
}

/**
 * 判断某个开头句式近期是否已经出现。
 */
function isOpeningSignatureRepeated(signature: string, recentVoiceIntros: string[]): boolean {
  return recentVoiceIntros
    .map(getOpeningSignature)
    .filter(Boolean)
    .some(item => item === signature);
}

/**
 * 抽取句式开头，用于判断连续独白是否像同一套模板。
 */
function getOpeningSignature(text: string | undefined): string {
  const cleaned = normalizeSentence(text);
  if (/^接下来这首/.test(cleaned)) return '接下来这首';
  if (/^接下来听/.test(cleaned)) return '接下来听';
  if (/^下一首/.test(cleaned)) return '下一首';
  if (/^这里换到/.test(cleaned)) return '这里换到';
  if (/^现在让/.test(cleaned)) return '现在让';
  if (/^前一首/.test(cleaned)) return '前一首';
  return '';
}

/**
 * 从文案中提取《歌名》形式的标题。
 */
function extractQuotedTitle(text: string): string {
  return text.match(/《([^》]+)》/)?.[1] || '';
}

/**
 * 转义正则特殊字符，避免歌名里带符号时改写失败。
 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 去掉相邻重复句，降低模型连续复述同一层意思的概率。
 */
function dedupeNearbySentences(text: string): string {
  const sentences = normalizeSentence(text).split(/(?<=[。！？!?])/).map(item => item.trim()).filter(Boolean);
  if (sentences.length <= 1) return text;

  const kept: string[] = [];
  for (const sentence of sentences) {
    const normalized = normalizeComparableText(sentence);
    const last = kept[kept.length - 1];
    if (last && normalizeComparableText(last) === normalized) continue;
    kept.push(sentence);
  }
  return kept.join('');
}

/**
 * 生成更适合口播的标签摘要，避免把数据库标签原样堆到独白里。
 */
function normalizeTags(track: TrackLike): string {
  const tags = [track.genre_tags, track.mood_tags]
    .filter(Boolean)
    .flatMap(text => String(text).split(/[,，、/|]/))
    .map(text => text.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(tags)).slice(0, 3);
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0];
  return unique.join('、');
}

/**
 * 清洗推荐理由里的接口痕迹，只留下可被用户理解的音乐线索。
 */
function cleanRecommendSignal(reason: string): string {
  return normalizeSentence(reason)
    .replace(/每日推荐[:：]?/g, '')
    .replace(/私人\s*FM[:：]?/gi, '')
    .replace(/相似歌曲[:：]?/g, '')
    .replace(/来自网易云当天推荐/g, '今天更容易被听见')
    .replace(/围绕\s*/g, '顺着')
    .replace(/候选/g, '方向')
    .replace(/\s+/g, ' ')
    .trim() || '和你的听歌习惯比较接近';
}

/**
 * 只在专辑确实提供上下文时提专辑。
 * 很多网易云单曲的 album 会等于歌名，硬说“收在同名专辑里”会显得像模板。
 */
function buildAlbumContextText(track: TrackLike): string {
  const album = normalizeSentence(track.album || '');
  if (!album || isSingleLikeAlbum(track.title, album)) return '';
  if (stableNumber(track) % 3 !== 0 && !resolveSongFacts(track)?.wiki) return '';
  return `出现在《${album}》这张作品里，`;
}

/**
 * 判断专辑名是否更像单曲容器，而不是值得介绍的专辑上下文。
 */
function isSingleLikeAlbum(title: string, album: string): boolean {
  const cleanTitle = normalizeComparableText(title);
  const cleanAlbum = normalizeComparableText(album);
  if (!cleanTitle || !cleanAlbum) return false;
  if (cleanTitle === cleanAlbum) return true;
  if (/单曲|single|新歌|remix|伴奏|demo/i.test(album)) return true;
  return false;
}

/**
 * 归一化标题和专辑名，用于判断同名单曲。
 */
function normalizeComparableText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[《》"'“”‘’()[\]（）【】\-_\s·.。,:：，、]/g, '')
    .trim();
}

/**
 * 从歌曲事实卡中挑出一句具体信息，让兜底独白有真实落点。
 */
function buildFactSentence(track: TrackLike): string {
  const facts = resolveSongFacts(track);
  if (!facts) return '';

  const candidates = [
    facts.lyricTheme ? `歌词线索落在${ensureSentenceTail(facts.lyricTheme)}` : '',
    facts.listenerImpression ? buildListenerImpressionSentence(facts.listenerImpression) : '',
    facts.wiki ? `资料里能抓到一个具体线索：${ensureSentenceTail(facts.wiki)}` : '',
    facts.alias?.length ? `它还有一个容易被记住的名字线索：${ensureSentenceTail(facts.alias.join('、'))}` : '',
    facts.musicDetail ? `音乐信息里更明确的是${ensureSentenceTail(facts.musicDetail)}` : '',
  ].filter(Boolean);

  if (candidates.length === 0) return '';
  return `${pickByTrack(track, candidates)} `;
}

/**
 * 把评论摘要转成自然听众印象，避免出现“听成听众反馈集中在”这类机械拼接。
 */
function buildListenerImpressionSentence(listenerImpression: string): string {
  const cleaned = normalizeSentence(listenerImpression)
    .replace(/^听众(?:反馈|印象)?(?:主要)?集中在[:：，,\s]*/g, '')
    .replace(/^评论(?:主要)?集中在[:：，,\s]*/g, '')
    .replace(/^很多听众(?:会|把它)?/g, '')
    .replace(/^常把它当作/g, '常被听成');
  return cleaned ? `听众印象更集中在${ensureSentenceTail(cleaned)}` : '';
}

/**
 * 解析 track 上携带的事实卡，兼容 prompt songFacts 和数据库 track_fact 两种来源。
 */
function resolveSongFacts(track: TrackLike): PromptSongFacts | undefined {
  if (track.songFacts) return track.songFacts;
  return buildSongFactsForPrompt(track.track_fact);
}

/**
 * 保证事实片段能自然接进长句里。
 */
function ensureSentenceTail(text: string): string {
  const cleaned = normalizeSentence(text).replace(/[。；;，,]+$/g, '');
  return cleaned ? `${cleaned}。` : '';
}

/**
 * 根据候选来源生成自然的 DJ 解释，不把接口名暴露给用户。
 */
function buildSourceHint(track: TrackLike, options: FallbackTrackCopyOptions): { segue: string; recommendSuffix: string } {
  const sourceScope = options.sourceScope || '';
  if (sourceScope === 'daily' || track.source_type === 'NETEASE_DAILY_RECOMMEND') {
    return {
      segue: pickByTrack(track, [
        '这首更像今天会被你注意到的那一种，我把它放进来，让这一轮不只是复读旧歌。',
        '这里接一首今天更该被听见的歌，它不是换口味，而是把这轮电台往当下拉近一点。',
        '接下来这首像是今天从你的听感里冒出来的，我让它自然进入队列。',
      ]),
      recommendSuffix: ' 它让这组歌多了一点今天的现场感，不是机械刷新，而是把这一轮听感说得更具体。',
    };
  }

  if (sourceScope === 'similar' || track.source_type === 'NETEASE_SIMI_SONG') {
    return {
      segue: pickByTrack(track, [
        '这首是顺着刚才那类声音往旁边走一步，不是复制相似，而是换一个角度延展。',
        '这里我让听感继续靠近你熟悉的质地，但不会只停在同一首歌的影子里。',
        '接下来这首和前面的气质有相近的纹理，适合把这段电台自然续下去。',
      ]),
      recommendSuffix: ' 它的价值在于相近但不重复，能顺着你熟悉的声音再往外走一步。',
    };
  }

  if (sourceScope === 'fm' || track.source_type === 'NETEASE_PERSONAL_FM') {
    return {
      segue: pickByTrack(track, [
        '这首带着一点即时发现感，我把它放得轻一点，让它像自然冒出来的一段新声音。',
        '这里稍微打开一点新鲜度，但不离开你正在听的频道。',
        '接下来这首不是硬切出去，而是顺着你最近的听感多探一步。',
      ]),
      recommendSuffix: ' 它的好处是有一点新鲜，但不是陌生；像从你最近的听感里自然冒出来的一首歌。',
    };
  }

  if (sourceScope === 'vector') {
    return {
      segue: '这首更像是顺着整组歌共同的气质挑出来的，不只贴近某一首，而是贴近这一段电台的整体方向。',
      recommendSuffix: ' 它不是单点相似，而是和这组歌共同的听感方向靠得更近。',
    };
  }

  if (sourceScope === 'explore' || track.source_type === 'NETEASE_EXPLORE') {
    return {
      segue: pickByTrack(track, [
        '这首不一定在你原来的歌单里，但它和你常听的气质有一条暗线连着。',
        '这里我稍微往你的歌单外走了一步，放一首可能会让你觉得“原来我也会喜欢”的歌。',
        '接下来这首算是主动探索，不是偏离口味，而是给熟悉方向加一个新侧面。',
      ]),
      recommendSuffix: ' 它也让这组歌不只是重复“喜欢”列表，而是从你的口味里长出一点新的可能。',
    };
  }

  return { segue: '', recommendSuffix: '' };
}

/**
 * 将数据库来源和召回来源归一成独白策略可理解的来源类型。
 */
function normalizeSourceScope(sourceScope: string | null | undefined): string {
  const source = String(sourceScope || '').toLowerCase();
  if (source.includes('daily')) return 'daily';
  if (source.includes('explore')) return 'explore';
  if (source.includes('personal_fm') || source.includes('fm')) return 'fm';
  if (source.includes('simi') || source.includes('similar')) return 'similar';
  if (source.includes('vector')) return 'vector';
  return source;
}

/**
 * 控制天气在独白里的出现频率：天气只在少数强相关位置被提到。
 */
function shouldMentionWeather(track: TrackLike, options: FallbackTrackCopyOptions): boolean {
  const weatherMood = sanitizeWeatherForDj(options.weather);
  if (!weatherMood) return false;
  if (options.index !== 0) return false;

  // 天气只能作为氛围，不做播报；首歌之外不再反复提，避免独白像套模板。
  const signal = `${track.title}${track.album || ''}${track.genre_tags || ''}${track.mood_tags || ''}${weatherMood}`.toLowerCase();
  const weatherKeywords = ['雨', '雪', '雾', '阴', '夜', '冷', 'wind', 'rain', 'snow', 'night'];
  return weatherKeywords.some(keyword => signal.includes(keyword));
}

/**
 * 将天气信息清洗成 DJ 可使用的氛围词，禁止温度、降水量等天气预报式细节进入独白。
 */
function sanitizeWeatherForDj(weather: string | undefined): string {
  if (!weather) return '';
  const text = weather
    .replace(/\d+(?:\.\d+)?\s*(?:°c|℃|度|mm|毫米)/gi, '')
    .replace(/(?:降水|降雨量|雨量|降雪量)[^，,。；;\s]*/gi, '')
    .replace(/[，,。；;]\s*/g, ' ')
    .trim()
    .toLowerCase();

  if (!text) return '';
  if (/暴雨|大雨|中雨|小雨|阵雨|雨|rain|shower/.test(text)) return '雨天';
  if (/雪|snow/.test(text)) return '雪天';
  if (/雾|fog|霾|haze/.test(text)) return '有雾的天气';
  if (/阴|cloud|多云|overcast/.test(text)) return '阴天';
  if (/风|wind/.test(text)) return '有风的天气';
  if (/冷|寒|低温|chilly|cold/.test(text)) return '偏冷的天气';
  if (/热|高温|hot/.test(text)) return '偏热的天气';
  return '';
}

/**
 * 去掉推荐理由里过于书面的开头，让 TTS 串接更自然。
 */
function stripIntroPhrase(text: string): string {
  return text
    .replace(/^我把它排在这里，不只是因为/, '不只是因为')
    .replace(/^我把它放到这里，是因为/, '')
    .replace(/^把它放到这里，是因为/, '')
    .replace(/^我选它，是因为/, '')
    .replace(/^我推荐它，不只是因为/, '不只是因为')
    .replace(/^这首歌放在这里，是想/, '我想')
    .replace(/^我会在这里选它，是因为/, '我选它，是因为')
    .replace(/^我想把它放到这里，是因为/, '它在这里合适，是因为');
}

/**
 * 生成上一首到当前歌曲之间的情绪承接。
 */
function buildTransitionPrefix(previousTrack: TrackLike | null | undefined, currentTrack: TrackLike): string {
  if (!previousTrack) {
    return pickByTrack(currentTrack, [
      '接下来不急着转弯，我想让情绪顺着刚才的方向再走一小段。',
      '下一首我会把节奏稍微换个角度，但不打断现在的状态。',
      '这里把节奏放松一点，换一首更容易继续听下去的歌。',
    ]);
  }
  return pickByTrack(currentTrack, [
    `前一首先留在耳边，这里换到《${currentTrack.title}》，让节奏从另一个入口接上。`,
    `接下来这首《${currentTrack.title}》我想放得近一点，让上一段旋律有个更清楚的落点。`,
    `这里不做很硬的转场，换到《${currentTrack.title}》，让这段时间继续往前走。`,
    `现在让《${currentTrack.title}》进来，把听感从上一首里自然接出来。`,
    `下一首我选《${currentTrack.title}》，不是为了打断刚才的状态，而是换成更容易继续听下去的质地。`,
  ]);
}

/**
 * 根据歌曲稳定选择一条文案，避免兜底内容每首歌都落入同一句模板。
 */
function pickByTrack(track: TrackLike, variants: string[]): string {
  return variants[stableNumber(track) % variants.length];
}

/**
 * 根据歌曲信息得到稳定数字，确保兜底文案有变化但同一首歌保持一致。
 */
function stableNumber(track: TrackLike): number {
  const seed = `${track.title}-${track.artists || track.artist || ''}-${track.album || ''}`;
  return Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}
