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

const cloneDialectHash = getTextHash(text, style, {
  mode: 'clone',
  refAudioPath: '/voices/a.mp3',
  voice: null,
  dialect: 'sichuan',
});

assert.notEqual(cloneHash, otherCloneHash, '切换克隆参考音频后不能复用旧 TTS 缓存');
assert.notEqual(cloneHash, presetHash, '切换克隆/预设模式后不能复用旧 TTS 缓存');
assert.notEqual(presetHash, dialectHash, '切换方言后不能复用旧 TTS 缓存');
assert.equal(cloneHash, cloneDialectHash, '克隆音色不支持方言，克隆模式下切换方言不能影响 TTS 缓存 key');

const dialectRequest = buildTtsRequestPreview(text, style, {
  mode: 'clone',
  refAudioPath: referenceAudioPath,
  voice: null,
  dialect: 'sichuan',
});

assert.equal(dialectRequest.model, 'mimo-v2.5-tts-voiceclone', '克隆音色始终使用音色复刻模型');
assert.match(String(dialectRequest.audio.voice), /^data:audio\/mpeg;base64,/, '克隆音色请求需要继续传参考音频');
assert.doesNotMatch(dialectRequest.messages[0].content, /四川话|方言|口音倾向|方言演员/, '克隆音色 user 导演指令不能再包含方言逻辑');
assert.match(dialectRequest.messages[0].content, /参考音频|参考音色|真实说话方式/, '克隆音色导演指令仍需要围绕参考音频本身');
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
assert.match(presetDialectRequest.messages[1].content, /^\(平静 四川话\)/, '预设音色需要使用“情绪 方言”的空格标签格式，确保方言生效');
assert.doesNotMatch(presetDialectRequest.messages[1].content, /^\(四川话 /, '方言不能放在情绪标签前面，否则 Mimo 容易忽略方言');

const presetHenanRelaxRequest = buildTtsRequestPreview('傍晚好。工作日即将结束。', {
  preset: 'relax',
  emotion: 'warm',
  pace: 'slow',
  energy: 'low',
  playbackRate: 0.95,
  prompt: '温柔私人电台 DJ 风格',
}, {
  mode: 'preset',
  refAudioPath: null,
  voice: '冰糖',
  dialect: 'henan',
});
assert.match(presetHenanRelaxRequest.messages[1].content, /^\(温柔 河南话\)/, '温柔场景下 assistant content 应生成 (温柔 河南话) 前缀');

console.log('tts config hash tests passed');
