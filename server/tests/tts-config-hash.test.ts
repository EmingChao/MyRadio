import assert from 'node:assert/strict';
import path from 'node:path';
import { buildTtsRequestPreview, getTextHash } from '../src/services/tts';

const text = '这里换到下一首歌，让情绪自然往前走。';
const referenceAudioPath = path.resolve(__dirname, '../../files/bilibili_audio_first18s.mp3');
const style = {
  preset: 'focus',
  emotion: 'calm',
  pace: 'medium',
  energy: 'medium',
  playbackRate: 1,
  prompt: '私人电台 DJ 风格',
} as const;

const cloneHash = getTextHash(text, style, {
  mode: 'clone',
  refAudioPath: '/voices/a.mp3',
  voice: null,
  dialect: null,
});

const otherCloneHash = getTextHash(text, style, {
  mode: 'clone',
  refAudioPath: '/voices/b.mp3',
  voice: null,
  dialect: null,
});

const presetHash = getTextHash(text, style, {
  mode: 'preset',
  refAudioPath: null,
  voice: '冰糖',
  dialect: null,
});

const dialectHash = getTextHash(text, style, {
  mode: 'preset',
  refAudioPath: null,
  voice: '冰糖',
  dialect: 'sichuan',
});

assert.notEqual(cloneHash, otherCloneHash, '切换克隆参考音频后不能复用旧 TTS 缓存');
assert.notEqual(cloneHash, presetHash, '切换克隆/预设模式后不能复用旧 TTS 缓存');
assert.notEqual(presetHash, dialectHash, '切换方言后不能复用旧 TTS 缓存');

const dialectRequest = buildTtsRequestPreview(text, style, {
  mode: 'clone',
  refAudioPath: referenceAudioPath,
  voice: null,
  dialect: 'sichuan',
});

assert.equal(dialectRequest.model, 'mimo-v2.5-tts-voiceclone', '克隆音色选择方言时仍应使用音色复刻模型');
assert.match(String(dialectRequest.audio.voice), /^data:audio\/mpeg;base64,/, '克隆音色请求需要继续传参考音频');
assert.match(dialectRequest.messages[0].content, /四川话/, 'user 导演指令需要说明方言要求');
assert.match(dialectRequest.messages[0].content, /保持参考音色/, '克隆音色方言必须优先要求保持参考音色主体');
assert.match(dialectRequest.messages[0].content, /不要.*强硬/, '克隆音色需要避免被导演成强硬语气');
assert.doesNotMatch(dialectRequest.messages[1].content, /^\(四川话 /, '克隆音色不能把方言作为强 assistant 标签，否则容易改变克隆音色');
assert.match(dialectRequest.messages[1].content, /^\(平静\)/, '克隆音色仍保留温和的风格标签控制节奏');
assert.doesNotMatch(dialectRequest.messages[1].content, /干练|深沉|凌厉|严肃/, '克隆音色不能使用容易改变声音人格的强风格标签');
assert.equal(dialectRequest.audio.optimize_text_preview, true, '需要开启文本优化，降低首段逐字朗读和不连贯风险');

const presetDialectRequest = buildTtsRequestPreview(text, style, {
  mode: 'preset',
  refAudioPath: null,
  voice: '冰糖',
  dialect: 'sichuan',
});

assert.equal(presetDialectRequest.model, 'mimo-v2.5-tts', '预设音色继续使用预设 TTS 模型');
assert.match(presetDialectRequest.messages[1].content, /^\(四川话 /, '预设音色可以用强方言标签保证方言生效');

console.log('tts config hash tests passed');
