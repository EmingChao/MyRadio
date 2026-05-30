import assert from 'node:assert/strict'
import { resolveDjSpeechBeforeTrack } from '../src/stores/player-tts-sequence'

const session = {
  sessionId: 1,
  sessionTitle: '深夜编程',
  aiSummary: '',
  say: '欢迎来到今晚的 Claudio 电台。',
  tracks: [
    {
      trackId: 101,
      title: 'Intro Song',
      artist: 'Artist A',
      album: null,
      coverUrl: null,
      playUrl: '/intro.mp3',
      djScript: '',
      recommendReason: '',
      segue: '先用这首歌把注意力收回来。',
    },
    {
      trackId: 102,
      title: 'Next Song',
      artist: 'Artist B',
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
  text: '欢迎来到今晚的 Claudio 电台。',
})

assert.deepEqual(resolveDjSpeechBeforeTrack(session, 1, false), {
  kind: 'segue',
  text: '接下来换到更轻的律动。这首歌会把刚才的情绪继续往前送一点。',
})

assert.equal(resolveDjSpeechBeforeTrack({ ...session, say: '', tracks: [] }, 0, true), null)

console.log('player-tts-sequence tests passed')
