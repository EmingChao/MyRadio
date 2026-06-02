import assert from 'node:assert/strict'
import { resolveTtsOutputGain } from '../src/stores/player-tts-volume'

assert.equal(resolveTtsOutputGain('编码电台 · 专注模式'), 1.26)
assert.equal(resolveTtsOutputGain('深夜电台 · 深夜模式'), 1.2)
assert.equal(resolveTtsOutputGain('BGM 电台 · BGM模式'), 1.18)
assert.equal(resolveTtsOutputGain(''), 1.24)

console.log('player-tts-volume tests passed')
