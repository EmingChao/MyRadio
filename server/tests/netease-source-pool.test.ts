import assert from 'node:assert/strict';
import {
  mergeNeteaseSourceCandidates,
  normalizeNeteaseSourceSongs,
  pickNeteaseSimilarSeeds,
  pickNeteaseVectorSeeds,
} from '../src/agent/netease-sources';

const seeds = pickNeteaseSimilarSeeds([
  { track: { id: 1, source_track_id: '101' }, score: 90 },
  { track: { id: 2, source_track_id: '101' }, score: 80 },
  { track: { id: 3, source_track_id: '202' }, score: 70 },
  { track: { id: 4, source_track_id: null }, score: 60 },
], 3);

assert.deepEqual(seeds, ['101', '202', '4'], '相似歌曲种子需要按分数去重，并兼容没有 source_track_id 的歌曲');

const vectorSeeds = pickNeteaseVectorSeeds([
  { track: { id: 1, source_track_id: '101' }, score: 90 },
  { track: { id: 2, source_track_id: '202' }, score: 88 },
  { track: { id: 3, source_track_id: '303' }, score: 86 },
], 2);

assert.equal(vectorSeeds, '101,202', '向量续播种子需要按分数拼成网易云可用的 ids 字符串');

const normalizedFromObject = normalizeNeteaseSourceSongs({
  songs: [
    {
      id: 909,
      name: '云随机歌曲',
      ar: [{ name: '测试歌手' }],
      al: { name: '测试专辑', picUrl: 'https://img.example/cover.jpg' },
      publishTime: new Date('2020-01-01').getTime(),
    },
  ],
});

assert.equal(normalizedFromObject.length, 1, '网易云来源归一化需要兼容对象包裹的 songs 数组');
assert.equal(normalizedFromObject[0].sourceTrackId, '909', '对象包裹结构中的歌曲 ID 需要被正确提取');

const merged = mergeNeteaseSourceCandidates({
  libraryScored: Array.from({ length: 8 }, (_, i) => ({
    track: { id: i + 1, source_type: 'NETEASE_PLAYLIST' },
    score: 100 - i,
    reason: '喜欢',
    sourceScope: 'library',
  })),
  dailyScored: Array.from({ length: 3 }, (_, i) => ({
    track: { id: 101 + i, source_type: 'NETEASE_DAILY_RECOMMEND' },
    score: 90 - i,
    reason: '每日推荐',
    sourceScope: 'daily',
  })),
  similarScored: Array.from({ length: 3 }, (_, i) => ({
    track: { id: 201 + i, source_type: 'NETEASE_SIMI_SONG' },
    score: 88 - i,
    reason: '相似歌曲',
    sourceScope: 'similar',
  })),
  fmScored: Array.from({ length: 2 }, (_, i) => ({
    track: { id: 251 + i, source_type: 'NETEASE_PERSONAL_FM' },
    score: 87 - i,
    reason: '私人 FM',
    sourceScope: 'fm',
  })),
  vectorScored: Array.from({ length: 2 }, (_, i) => ({
    track: { id: 271 + i, source_type: 'NETEASE_VECTOR' },
    score: 85 - i,
    reason: '向量续播',
    sourceScope: 'vector',
  })),
  exploreScored: Array.from({ length: 3 }, (_, i) => ({
    track: { id: 301 + i, source_type: 'NETEASE_EXPLORE' },
    score: 86 - i,
    reason: '主动探索',
    sourceScope: 'explore',
  })),
  limit: 12,
});

const dailyIndex = merged.findIndex(item => item.sourceScope === 'daily');
const similarIndex = merged.findIndex(item => item.sourceScope === 'similar');
const fmIndex = merged.findIndex(item => item.sourceScope === 'fm');
const vectorIndex = merged.findIndex(item => item.sourceScope === 'vector');
const exploreIndex = merged.findIndex(item => item.sourceScope === 'explore');

assert.ok(dailyIndex >= 0, '每日推荐候选需要进入混排结果');
assert.ok(similarIndex >= 0, '相似歌曲候选需要进入混排结果');
assert.ok(fmIndex >= 0, '私人 FM 候选需要进入混排结果');
assert.ok(vectorIndex >= 0, '向量续播候选需要进入混排结果');
assert.ok(exploreIndex >= 0, '探索候选需要进入混排结果');
assert.ok(dailyIndex < exploreIndex, '每日推荐应该比纯探索候选更早进入队列');
assert.ok(similarIndex < exploreIndex, '相似歌曲应该比纯探索候选更早进入队列');
assert.equal(merged.length, 12, '混排结果需要保持目标长度');

console.log('netease source pool tests passed');
