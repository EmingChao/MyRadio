import assert from 'node:assert/strict'
import { resolveDjSpeechBeforeTrack } from '../src/stores/player-tts-sequence'

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

console.log('player-tts-sequence tests passed')
