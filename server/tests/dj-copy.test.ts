import assert from 'node:assert/strict';
import { buildFallbackTrackCopy, buildOpeningCopy, buildTrackVoiceIntro, enrichTrackCopyIfNeeded, polishDjCopyText } from '../src/agent/dj-copy';
import { resolveTtsStyle } from '../src/services/tts-style';

const track = {
  id: 1,
  title: 'Midnight City',
  artists: 'M83',
  album: "Hurry Up, We're Dreaming",
  genre_tags: '电子,合成器',
  mood_tags: '夜晚,专注',
};

const opening = buildOpeningCopy({ scene: 'coding', mood: '专注' }, 12);
assert.ok(opening.length >= 60, '开场白需要有足够的情绪铺垫');
assert.match(opening, /专注|编码|状态/, '开场白需要承接当前场景和心情');

const firstTrackCopy = buildFallbackTrackCopy(track, {
  index: 0,
  reason: '心情匹配, 用户偏好',
  sceneLabel: '编码',
  moodLabel: '专注',
});
const templatePattern = /改变.*空气.*密度|空气里的明暗|适合你现在这种|适合当前状态|底色铺开|接住余温|把情绪慢慢铺开|情绪重心|留出了呼吸|贴住你/;

assert.ok(firstTrackCopy.segue.length >= 45, '串场词需要承担明确的情绪过渡');
assert.ok(firstTrackCopy.djScript.length >= 70, 'DJ 解说需要介绍歌曲和体验目标');
assert.ok(firstTrackCopy.recommendReason.length >= 70, '推荐理由需要解释为什么适合当前用户');
assert.match(firstTrackCopy.segue, /Midnight City|M83/, '串场词需要提到歌曲或艺人');
assert.match(firstTrackCopy.recommendReason, /专注|编码|用户偏好|心情匹配/, '推荐理由需要结合场景或画像');
assert.doesNotMatch(
  [firstTrackCopy.segue, firstTrackCopy.djScript, firstTrackCopy.recommendReason].join('\n'),
  templatePattern,
  '兜底独白不能继续使用“空气密度/适合你现在/情绪重心”等模板套话',
);

const factRichCopy = buildFallbackTrackCopy({
  ...track,
  track_fact: {
    wiki_summary: '这首歌以夜色中的城市道路为画面，合成器铺陈出带有电影感的奔跑感。',
    lyric_summary: '歌词围绕夜晚、城市灯光和重新出发的念头展开。',
    comment_summary: '很多听众会把它当成深夜独处时的一盏灯。',
  },
}, {
  index: 1,
  reason: '用户偏好电子和夜晚氛围',
  sceneLabel: '编码',
  moodLabel: '专注',
  previousTrack: track,
});
assert.match(
  factRichCopy.djScript,
  /城市|夜晚|灯光|合成器|听众/,
  '有歌曲事实时，兜底独白要优先落到真实信息，而不是只写氛围套话',
);

const voiceIntro = buildTrackVoiceIntro(firstTrackCopy);
assert.ok(voiceIntro.length > firstTrackCopy.segue.length, 'TTS 歌曲独白需要合并介绍和推荐理由，不应只读串场词');
assert.match(voiceIntro, /Midnight City|M83|专注|编码|用户偏好|心情匹配/, 'TTS 歌曲独白需要包含歌曲介绍和推荐理由');
assert.doesNotMatch(voiceIntro, /undefined|null/, 'TTS 独白不能出现无效字段文本');
assert.doesNotMatch(voiceIntro, templatePattern, 'TTS 合并独白也不能重新带入模板套话');

const polished = polishDjCopyText('下一首我想让它来改变一下空气的密度，它适合你现在这种专注状态，也给当前编码留出了呼吸。');
assert.doesNotMatch(polished, templatePattern, '即使模型返回模板句，后端也需要在保存前净化');
assert.match(polished, /专注|编码|状态|继续/, '净化后仍要保留可听懂的推荐语义');

const unsafeAiCopy = enrichTrackCopyIfNeeded({
  segue: '接下来听张方钊的《穷惯了》。',
  djScript: '这首歌制作人是河南说唱之神，拿过很多重要奖项，作品背后还有很强的行业影响力，所以特别适合你现在这种专注状态，也能让人马上进入故事里。',
  recommendReason: '它能改变空气的密度，也给当前编码留出了呼吸；如果你需要一首既有存在感又不会打断工作的歌，这首放在这里刚刚好。',
}, {
  title: '穷惯了',
  artists: '张方钊',
  album: '钱专',
  track_fact: {
    lyric_summary: '歌词围绕生活压力、钱和自我调侃展开。',
  },
}, {
  index: 0,
  reason: '用户常听中文说唱和生活化叙事',
  sceneLabel: '编码',
  moodLabel: '专注',
});
const unsafeAiText = [unsafeAiCopy.segue, unsafeAiCopy.djScript, unsafeAiCopy.recommendReason].join('\n');
assert.doesNotMatch(unsafeAiText, /河南说唱之神|拿过很多重要奖项|改变.*空气.*密度|适合你现在这种|留出了呼吸/, '不可靠事实和模板套话不能进入最终保存的独白');
assert.match(unsafeAiText, /生活压力|钱|自我调侃|中文说唱/, '替换后要回到真实歌曲事实和用户品味关系');

const weatherCopies = Array.from({ length: 8 }, (_, index) => buildFallbackTrackCopy({
  ...track,
  title: `Track ${index}`,
}, {
  index,
  reason: '合成器听感和夜晚偏好匹配',
  sceneLabel: '编码',
  moodLabel: '专注',
  weather: '中雨，32.6°C，降水0.8mm',
}));
const weatherCopyText = weatherCopies.map(copy => copy.recommendReason).join('\n');
const weatherMentions = weatherCopies.filter(copy => /雨天|有雨|小雨|中雨/.test(copy.recommendReason)).length;
assert.ok(weatherMentions <= 1, '天气只能在极少数强相关歌曲里轻轻带过，不能频繁出现');
assert.doesNotMatch(weatherCopyText, /32\.6|°C|降水|降雨量|mm/i, 'DJ 独白不能出现温度、降水量或毫米这类天气播报细节');

const exploreCopy = buildFallbackTrackCopy({
  ...track,
  title: 'A New Map',
  source_type: 'NETEASE_EXPLORE',
}, {
  index: 2,
  reason: '和常听的电子氛围有相近的夜间质感',
  sceneLabel: '编码',
  moodLabel: '专注',
  sourceScope: 'explore',
});
assert.match(exploreCopy.recommendReason, /新|探索|边界|歌单外|可能/, '探索推荐需要说清楚为什么值得主动推荐');

const dailyCopy = buildFallbackTrackCopy({
  ...track,
  title: 'Today Signal',
  source_type: 'NETEASE_DAILY_RECOMMEND',
}, {
  index: 1,
  reason: '每日推荐：来自网易云当天推荐',
  sceneLabel: '编码',
  moodLabel: '专注',
  sourceScope: 'daily',
});
assert.match(dailyCopy.recommendReason, /今天|每日|当下|这一轮/, '每日推荐需要被讲成今天适合听的自然理由');

const similarCopy = buildFallbackTrackCopy({
  ...track,
  title: 'Near Signal',
  source_type: 'NETEASE_SIMI_SONG',
}, {
  index: 3,
  reason: '相似歌曲：围绕 Midnight City 延展出的候选',
  sceneLabel: '编码',
  moodLabel: '专注',
  sourceScope: 'similar',
});
assert.match(similarCopy.recommendReason, /相近|延展|顺着|接近/, '相似歌曲需要说明它如何顺着当前听感延展');

const fmCopy = buildFallbackTrackCopy({
  ...track,
  title: 'Fresh Signal',
  source_type: 'NETEASE_PERSONAL_FM',
}, {
  index: 4,
  reason: '私人 FM：顺着最近听感发现的新候选',
  sceneLabel: '编码',
  moodLabel: '专注',
  sourceScope: 'fm',
});
assert.match(fmCopy.recommendReason, /新鲜|发现|最近|自然/, '私人 FM 候选需要被讲成有发现感但不陌生的推荐');

const openingStyle = resolveTtsStyle({ scene: 'coding', mood: '专注', isOpening: true });
const exploreStyle = resolveTtsStyle({ scene: 'coding', mood: '专注', sourceScope: 'explore', kind: 'trackIntro' });
assert.notEqual(openingStyle.prompt, exploreStyle.prompt, '开场和探索推荐需要有不同的 TTS 表演提示');
assert.match(exploreStyle.prompt, /发现|探索|推荐/, '探索推荐 TTS 需要带有发现感和推荐感');

console.log('dj-copy tests passed');
