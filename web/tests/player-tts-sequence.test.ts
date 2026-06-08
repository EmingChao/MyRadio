import assert from 'node:assert/strict'
import { resolveDjSpeechBeforeTrack, resolvePostSpeechVolumeSteps, resolveRevealVolume, resolveTtsWaitTimeoutMs, shouldClientSynthesizeSpeech, shouldMarkSpeechAsSpoken, shouldPrepareSpeechBeforeManualPlay, shouldPrefetchSpeechForIndex, shouldStartTrackBeforeFadeIn, shouldStartOverlapFromTtsProgress } from '../src/stores/player-tts-sequence'

const session = {
  sessionId: 1,
  sessionTitle: '深夜编程',
  aiSummary: '',
  say: '欢迎来到今晚的 MyRadio。',
  tracks: [
    {
      trackId: 101,
      title: '开场曲',
      artist: '歌手 A',
      album: null,
      coverUrl: null,
      playUrl: '/intro.mp3',
      djScript: '',
      recommendReason: '',
      segue: '先用这首歌把注意力收回来。',
    },
    {
      trackId: 102,
      title: '下一首',
      artist: '歌手 B',
      album: null,
      coverUrl: null,
      playUrl: '/next.mp3',
      djScript: '',
      recommendReason: '',
      segue: '接下来换到更轻的律动。',
      voiceIntro: '接下来换到更轻的律动。这首歌会把刚才的情绪继续往前送一点。',
    },
  ],
}

assert.deepEqual(resolveDjSpeechBeforeTrack(session, 0, true), {
  kind: 'opening',
  text: '欢迎来到今晚的 MyRadio。',
})

assert.deepEqual(resolveDjSpeechBeforeTrack(session, 1, false), {
  kind: 'segue',
  text: '接下来换到更轻的律动。这首歌会把刚才的情绪继续往前送一点。',
})

assert.equal(resolveDjSpeechBeforeTrack({ ...session, say: '', tracks: [] }, 0, true), null)

assert.equal(shouldMarkSpeechAsSpoken('segue', false), false, 'TTS 未真正开始时不能标记串场已播放')
assert.equal(shouldMarkSpeechAsSpoken('segue', true), true, 'TTS 开始播放后才能标记串场已播放')
assert.equal(shouldMarkSpeechAsSpoken('opening', true), false, '开场白不进入每首歌串场去重集合')
assert.equal(shouldStartTrackBeforeFadeIn(false), true, '没有提前叠入音乐时，TTS 结束后应先启动歌曲再淡入')
assert.equal(shouldStartTrackBeforeFadeIn(true), false, '已经提前叠入音乐时，只需要恢复音量')
assert.equal(shouldStartOverlapFromTtsProgress(7.1, 10, false), true, 'TTS 进入最后 3 秒时应开始叠入音乐')
assert.equal(shouldStartOverlapFromTtsProgress(5, 10, false), false, 'TTS 还没到最后 3 秒时不叠入音乐')
assert.equal(shouldStartOverlapFromTtsProgress(7.1, 10, true), false, '已经叠入过音乐时不能重复启动')
assert.equal(resolveRevealVolume(0.22, true), 0.22, '页面失焦时歌曲要直接进入目标音量，不能等 RAF 淡入')
assert.equal(resolveRevealVolume(0.22, false), 0, '页面有焦点时才从 0 音量淡入')
assert.deepEqual(resolvePostSpeechVolumeSteps(), [
  { volume: 0.52, durationMs: 850 },
  { volume: 1.0, durationMs: 2800 },
], 'TTS 结束后歌曲应分两段恢复音量，避免从低音量突然冲到全音量')
assert.equal(shouldPrefetchSpeechForIndex(10, 3, 4), true, '下一首应该提前准备 DJ 独白')
assert.equal(shouldPrefetchSpeechForIndex(10, 3, 5), true, '下下首也应该提前准备 DJ 独白')
assert.equal(shouldPrefetchSpeechForIndex(10, 3, 6), false, '过远的歌曲不提前合成，避免后台 TTS 堵塞')
assert.equal(shouldPrefetchSpeechForIndex(10, 3, 3), false, '当前歌曲不进入下一首预热逻辑')
assert.equal(shouldClientSynthesizeSpeech('current-waiting'), true, '正在等待播放的当前独白可以走前端兜底合成')
assert.equal(shouldClientSynthesizeSpeech('background-preheat'), false, '后续歌曲预热只补拉服务端已生成语音，不能主动打 TTS 接口')
assert.equal(shouldPrepareSpeechBeforeManualPlay(true, true), true, '当前歌曲即使已经加载，只要独白没播过，手动播放也要先走 DJ 独白')
assert.equal(shouldPrepareSpeechBeforeManualPlay(true, false), false, '当前歌曲已加载且独白已处理时，手动播放可以直接恢复歌曲')
assert.equal(shouldPrepareSpeechBeforeManualPlay(false, false), true, '当前歌曲未加载时，手动播放必须走完整准备流程')
assert.equal(resolveTtsWaitTimeoutMs('segue', 0, 9000, 25000), 25000, '第一首歌曲独白应有更长等待时间，避免 TTS 稍慢就直接跳过')
assert.equal(resolveTtsWaitTimeoutMs('segue', 2, 9000, 25000), 9000, '非第一首继续使用常规等待时间')
assert.equal(resolveTtsWaitTimeoutMs('opening', 0, 9000, 25000), 25000, '开场白也应按首段等待时间处理')

console.log('player-tts-sequence tests passed')
