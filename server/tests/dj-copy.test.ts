import assert from 'node:assert/strict';
import { buildFallbackTrackCopy, buildOpeningCopy, buildTrackVoiceIntro } from '../src/agent/dj-copy';

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

assert.ok(firstTrackCopy.segue.length >= 45, '串场词需要承担明确的情绪过渡');
assert.ok(firstTrackCopy.djScript.length >= 70, 'DJ 解说需要介绍歌曲和体验目标');
assert.ok(firstTrackCopy.recommendReason.length >= 70, '推荐理由需要解释为什么适合当前用户');
assert.match(firstTrackCopy.segue, /Midnight City|M83/, '串场词需要提到歌曲或艺人');
assert.match(firstTrackCopy.recommendReason, /专注|编码|用户偏好|心情匹配/, '推荐理由需要结合场景或画像');

const voiceIntro = buildTrackVoiceIntro(firstTrackCopy);
assert.ok(voiceIntro.length > firstTrackCopy.segue.length, 'TTS 歌曲独白需要合并介绍和推荐理由，不应只读串场词');
assert.match(voiceIntro, /推荐|适合|Midnight City|M83/, 'TTS 歌曲独白需要包含歌曲介绍和推荐理由');

console.log('dj-copy tests passed');
