import assert from 'node:assert/strict';
import { RADIO_DJ_SYSTEM_PROMPT, buildRadioPrompt } from '../src/agent/prompts';

const prompt = buildRadioPrompt({
  userContext: { scene: 'coding', mood: '专注' },
  musicProfile: { signatures: ['夜晚电子'], favoriteArtists: ['Warm Artist'] },
  candidates: [
    {
      trackId: 1,
      title: 'Late Night Song',
      artist: 'Warm Artist',
      songFacts: {
        wiki: '一首关于夜晚和重新出发的歌曲。',
        lyricTheme: '歌词围绕城市、雨声和没说出口的话展开。',
      },
      reason: '用户偏好, 夜晚匹配',
    },
  ],
  trackCountRange: { min: 5, max: 6 },
  copyMode: 'selection',
});

assert.match(RADIO_DJ_SYSTEM_PROMPT, /songFacts/, '系统 prompt 需要说明 songFacts 的使用方式');
assert.match(RADIO_DJ_SYSTEM_PROMPT, /不要编造事实/, '系统 prompt 需要阻止模型编造歌曲背景');
assert.match(RADIO_DJ_SYSTEM_PROMPT, /改变空气的密度|空气里的明暗|适合当前状态/, '系统 prompt 需要明确禁用模板化套话');
assert.match(RADIO_DJ_SYSTEM_PROMPT, /sourceScope=daily/, '系统 prompt 需要说明每日推荐来源的表达方式');
assert.match(RADIO_DJ_SYSTEM_PROMPT, /sourceScope=similar/, '系统 prompt 需要说明相似歌曲来源的表达方式');
assert.match(RADIO_DJ_SYSTEM_PROMPT, /sourceScope=fm/, '系统 prompt 需要说明私人 FM 来源的表达方式');
assert.match(prompt, /djScript 必须优先使用其中至少一个可信线索/, '用户 prompt 需要要求 DJ 解说使用事实卡');
assert.match(prompt, /禁止编造创作故事/, '用户 prompt 需要明确事实缺失时的边界');
assert.match(prompt, /不要说“每日推荐接口”/, '用户 prompt 需要禁止把来源解释成接口日志');
assert.match(prompt, /songFacts/, '候选内容需要允许携带 songFacts 字段');
assert.match(prompt, /从候选歌曲中选 5-6 首/, '首屏 AI 编排应只生成轻量队列，避免一次性长输出超时');
assert.match(prompt, /歌曲顺序由你决定/, '轻量队列仍需要保留 AI 选歌和排序能力');
assert.match(prompt, /djScript 可以省略或保持很短/, '轻量模式应允许后端补全独白，避免 AI 长输出超时');
assert.match(prompt, /每首歌必须至少落到一个具体细节/, '模型编排要求需要强调具体歌曲细节，而不是氛围套话');
assert.doesNotMatch(prompt, /选 12-20 首/, '轻量模式不能继续要求 12-20 首完整队列');

console.log('prompt song facts tests passed');
