import assert from 'node:assert/strict';
import { formatCandidatesForClaude } from '../src/agent/recall';
import { buildSongFactsForPrompt, normalizeTrackFactText } from '../src/services/track-facts';

const longWiki = '这是一首关于夜晚、离别和重新出发的歌曲。'.repeat(20);
const longLyric = '歌词把城市、雨声、旧日记和没说出口的话放在一起。'.repeat(20);

const songFacts = buildSongFactsForPrompt({
  wiki_summary: longWiki,
  lyric_summary: longLyric,
  comment_summary: '很多听众会把它当成深夜独处时的一盏灯。',
  music_quality_summary: '可播放，标准音质。',
});

assert.ok(songFacts, '有任意事实摘要时需要生成 songFacts');
assert.ok((songFacts?.wiki || '').length <= 130, '百科摘要需要被压缩，避免 prompt 过长');
assert.ok((songFacts?.lyricTheme || '').length <= 90, '歌词主题需要被压缩，避免传入大段歌词');
assert.equal(songFacts?.listenerImpression, '很多听众会把它当成深夜独处时的一盏灯。', '听众印象需要保留可用摘要');

const formatted = formatCandidatesForClaude([
  {
    track: {
      id: 1,
      title: 'Late Night Song',
      artist: 'Warm Artist',
      album: 'City Album',
      release_year: 2024,
      genre_tags: '流行,电子',
      mood_tags: '夜晚,独处',
      liked: 1,
      source_type: 'NETEASE',
      track_fact: {
        wiki_summary: longWiki,
        lyric_summary: longLyric,
        comment_summary: '评论里反复提到它适合一个人走夜路时听。',
      },
    },
    score: 80,
    reason: '用户偏好, 夜晚匹配',
  } as any,
]);

assert.ok(formatted[0].songFacts, '候选摘要需要携带可给 DJ 使用的歌曲事实卡');
assert.ok(formatted[0].songFacts.wiki.length <= 130, '候选事实卡不能把原始百科全文塞给模型');
assert.match(formatted[0].songFacts.lyricTheme, /城市|雨声|旧日记/, '歌词主题摘要需要保留真实主题线索');
assert.equal(normalizeTrackFactText('  A\n\nB\tC  '), 'A B C', '事实文本需要清理多余空白');

const creditFact = buildSongFactsForPrompt({
  lyric_summary: '作词 : 张方钊 作曲 : 张方钊 编曲 : pilotkid 制作人 : 河南说唱之神 录音 : 某某 真正的歌词围绕生活压力、钱和自我调侃展开。',
});
assert.doesNotMatch(creditFact?.lyricTheme || '', /作词|作曲|编曲|制作人|录音|河南说唱之神/, '歌词主题摘要必须过滤职员表，不能把制作人员当成歌词主题');
assert.match(creditFact?.lyricTheme || '', /生活压力|自我调侃/, '过滤职员表后仍要保留真正的歌词主题');

console.log('track facts tests passed');
