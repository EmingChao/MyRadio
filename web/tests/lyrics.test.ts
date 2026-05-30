import assert from 'node:assert/strict'
import { parseLrc, resolveActiveLyricIndex } from '../src/utils/lyrics'

const lines = parseLrc(`
[00:01.00]第一句
[00:03.250]第二句
[00:02.50]中间一句
[ar:meta]
`)

assert.deepEqual(lines, [
  { time: 1, text: '第一句' },
  { time: 2.5, text: '中间一句' },
  { time: 3.25, text: '第二句' },
])

assert.equal(resolveActiveLyricIndex(lines, 0.5), -1)
assert.equal(resolveActiveLyricIndex(lines, 1.2), 0)
assert.equal(resolveActiveLyricIndex(lines, 2.8), 1)
assert.equal(resolveActiveLyricIndex(lines, 9), 2)

console.log('lyrics tests passed')
