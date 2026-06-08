import assert from 'node:assert/strict';
import { buildTtsBatchPlan } from '../src/services/tts';

const texts = ['opening', 'track-1', 'track-2', 'track-3', 'track-4'];
const plan = buildTtsBatchPlan(texts, {
  foregroundCount: 3,
  backgroundDelayMs: 4500,
});

assert.deepEqual(
  plan.map(item => ({ text: item.item, priority: item.priority, delayBeforeMs: item.delayBeforeMs })),
  [
    { text: 'opening', priority: 'foreground', delayBeforeMs: 0 },
    { text: 'track-1', priority: 'foreground', delayBeforeMs: 0 },
    { text: 'track-2', priority: 'foreground', delayBeforeMs: 0 },
    { text: 'track-3', priority: 'background', delayBeforeMs: 4500 },
    { text: 'track-4', priority: 'background', delayBeforeMs: 4500 },
  ],
  'TTS 批量任务需要优先生成开场、当前和下一段，其余后台慢速续跑',
);

assert.deepEqual(buildTtsBatchPlan([], { foregroundCount: 3, backgroundDelayMs: 4500 }), []);

console.log('tts queue tests passed');
