<script setup lang="ts">
import { computed, nextTick, ref, onMounted, onUnmounted, watch } from 'vue'
import { usePlayerStore } from '../stores/player'
import { sendChatMessage } from '../api'
import { useWebSocket } from '../composables/useWebSocket'
import type { WsEvent } from '../composables/useWebSocket'

const store = usePlayerStore()
const chatInput = ref('')
const sending = ref(false)
const chatHistory = ref<Array<{ role: string; content: string; type?: string }>>([])

const { subscribe, onEvent, offEvent } = useWebSocket()

const upcomingTracks = computed(() => {
  if (!store.session) return []
  return store.session.tracks.slice(store.currentIndex + 1, store.currentIndex + 2)
})

const currentDjMonologue = computed(() => {
  if (store.djSpeaking && store.currentSpeechText) return store.currentSpeechText
  const track = store.currentTrack
  if (!track) return ''
  return track.voiceIntro || track.djScript || track.recommendReason || track.segue || ''
})

const transcriptRef = ref<HTMLElement | null>(null)
let userScrollTimer: ReturnType<typeof setTimeout> | null = null
const userReadingTranscript = ref(false)
const transcriptExpanded = ref(false)
const manuallyPinnedTranscript = ref(false)

const transcriptCharacters = computed(() => Array.from(currentDjMonologue.value))

const currentReadCount = computed(() => {
  const text = currentDjMonologue.value
  if (!text) return 0
  if (store.currentSpeechText === text) {
    return Math.min(text.length, Math.max(0, Math.ceil(text.length * store.currentSpeechProgress)))
  }
  return store.djSpeaking ? 0 : text.length
})

const shouldExpandTranscript = computed(() => transcriptExpanded.value || store.djSpeaking)

let eventId: number | null = null

function handleWsEvent(event: WsEvent) {
  if (event.type === 'QUEUE_UPDATED' && event.data.tracks) {
    if (event.data.append) {
      store.appendQueue(event.data.tracks)
    } else if (event.data.soft) {
      store.replaceQueue(event.data.tracks)
    } else {
      store.updateQueue(event.data.tracks)
    }
    if (!event.data.soft) {
      chatHistory.value.push({ role: 'system', content: '队列已更新', type: 'queue-update' })
    }
  } else if (event.type === 'TTS_READY' && event.data.ttsItems) {
    store.setTtsItems(event.data.ttsItems)
  }
}

onMounted(() => {
  eventId = onEvent(handleWsEvent)
  if (store.session) subscribe(store.session.sessionId)
})

watch(() => store.session?.sessionId, (id) => {
  if (id) subscribe(id)
})

onUnmounted(() => {
  if (eventId !== null) offEvent(eventId)
})

function handleTranscriptManualScroll() {
  userReadingTranscript.value = true
  if (userScrollTimer) clearTimeout(userScrollTimer)
  userScrollTimer = setTimeout(() => {
    userReadingTranscript.value = false
  }, 1800)
}

function handleTranscriptWheel(event: WheelEvent) {
  const el = transcriptRef.value
  if (!el) return

  const atTop = el.scrollTop <= 0
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
  const shouldPassToFeed = (event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)
  if (!shouldPassToFeed) {
    handleTranscriptManualScroll()
    return
  }

  const feed = el.closest('.feed-messages') as HTMLElement | null
  if (!feed) return
  feed.scrollTop += event.deltaY
  event.preventDefault()
}

function toggleTranscript() {
  transcriptExpanded.value = !transcriptExpanded.value
  manuallyPinnedTranscript.value = transcriptExpanded.value
}

watch(() => store.djSpeaking, (speaking) => {
  if (speaking) {
    transcriptExpanded.value = true
    manuallyPinnedTranscript.value = false
    return
  }
  if (!manuallyPinnedTranscript.value) {
    transcriptExpanded.value = false
  }
})

watch(() => store.currentTrack?.trackId, () => {
  if (!store.djSpeaking && !manuallyPinnedTranscript.value) {
    transcriptExpanded.value = false
  }
})

watch([currentReadCount, currentDjMonologue], async () => {
  if (!store.djSpeaking || userReadingTranscript.value || !shouldExpandTranscript.value) return
  await nextTick()
  const el = transcriptRef.value
  if (!el || !currentDjMonologue.value) return
  const progress = currentReadCount.value / currentDjMonologue.value.length
  el.scrollTo({
    top: Math.max(0, (el.scrollHeight - el.clientHeight) * progress),
    behavior: 'smooth',
  })
})

async function handleSend() {
  if (!chatInput.value.trim() || !store.session || sending.value) return

  const message = chatInput.value.trim()
  chatInput.value = ''
  sending.value = true

  chatHistory.value.push({ role: 'user', content: message })

  let res: any
  try {
    res = await sendChatMessage(store.session.sessionId, message, store.currentIndex)
  } catch {
    chatHistory.value.push({ role: 'dj', content: '网络错误，请稍后再试。' })
    sending.value = false
    return
  }

  try {
    if (res?.code === 0) {
      const { reply, queueChanged, updatedTracks, queueUpdateMode } = res.data || {}
      chatHistory.value.push({ role: 'dj', content: reply || '收到，我会调整后面的歌。' })
      if (queueChanged && Array.isArray(updatedTracks)) {
        if (queueUpdateMode === 'soft') {
          store.replaceQueue(updatedTracks)
        } else {
          store.updateQueue(updatedTracks)
          chatHistory.value.push({ role: 'system', content: '队列已更新', type: 'queue-update' })
        }
      }
    } else {
      chatHistory.value.push({ role: 'dj', content: '抱歉，处理失败了。' })
    }
  } catch (err) {
    console.warn('[Chat] 队列本地更新失败:', err)
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="dj-feed">
    <!-- 消息流 -->
    <div class="feed-messages">
      <!-- DJ 转录区：承接开场白和歌曲独白，避免和播放区重复。 -->
      <div
        v-if="currentDjMonologue"
        class="transcript-panel"
        :class="{ expanded: shouldExpandTranscript }"
      >
        <div class="transcript-head">
          <div class="transcript-wave" :class="{ active: store.djSpeaking }" aria-hidden="true">
            <span
              v-for="(level, index) in store.djWaveform.slice(0, 8)"
              :key="index"
              class="transcript-bar"
              :style="{ height: `${Math.round(level * 100)}%` }"
            />
          </div>
          <span class="transcript-state">{{ store.djSpeaking ? 'DJ 讲话中' : 'DJ 独白' }}</span>
          <button class="transcript-toggle" type="button" @click="toggleTranscript">
            {{ shouldExpandTranscript ? '收起' : '展开' }}
          </button>
        </div>
        <div
          ref="transcriptRef"
          class="transcript-copy"
          tabindex="0"
          aria-label="DJ 独白转录"
          @wheel="handleTranscriptWheel"
          @touchmove.passive="handleTranscriptManualScroll"
        >
          <span class="transcript-text" :class="{ speaking: store.currentSpeechText === currentDjMonologue && store.djSpeaking }">
            <span
              v-for="(char, index) in transcriptCharacters"
              :key="`${store.currentTrack?.trackId || 0}-${index}`"
              class="transcript-char"
              :class="{
                read: index < currentReadCount,
                current: index === currentReadCount && store.djSpeaking && store.currentSpeechText === currentDjMonologue,
              }"
            >{{ char }}</span>
          </span>
        </div>
      </div>

      <!-- 后续队列预告，避免首屏中段空白 -->
      <div v-if="upcomingTracks.length || store.extendingQueue" class="msg msg-next">
        <div class="msg-tag">下一首</div>
        <div class="next-list">
          <div v-for="(track, i) in upcomingTracks" :key="track.trackId" class="next-row">
            <span class="next-num">{{ String(store.currentIndex + i + 2).padStart(2, '0') }}</span>
            <span class="next-title">{{ track.title }}</span>
            <span class="next-artist">{{ track.artist }}</span>
          </div>
          <div v-if="store.extendingQueue" class="next-row next-loading">
            <span class="next-num">··</span>
            <span class="next-title">正在准备下一段电台</span>
            <span class="next-artist">MyRadio 正在寻找下一首</span>
          </div>
        </div>
      </div>

      <!-- 聊天历史 -->
      <template v-for="(chat, i) in chatHistory" :key="i">
        <!-- 用户消息 — 右侧绿色气泡 -->
        <div v-if="chat.role === 'user'" class="msg msg-you">
          <div class="msg-tag">You</div>
          <div class="msg-bubble">{{ chat.content }}</div>
        </div>

        <!-- 系统消息 — 居中状态条 -->
        <div v-else-if="chat.type === 'queue-update'" class="msg msg-system">
          <div class="msg-tag">{{ chat.content }}</div>
        </div>

        <!-- DJ 回复 — 琥珀气泡 -->
        <div v-else class="msg msg-talk">
          <div class="msg-tag">MyRadio 回复</div>
          <p class="msg-text">{{ chat.content }}</p>
        </div>
      </template>

      <!-- 无会话占位 -->
      <div v-if="!store.session" class="feed-empty">
        <p class="empty-text">开启电台后开始对话</p>
      </div>
    </div>

    <!-- 聊天输入 -->
    <div v-if="store.session" class="feed-input">
      <input
        v-model="chatInput"
        class="feed-input-field"
        placeholder="告诉 MyRadio 现在想听什么..."
        :disabled="sending"
        @keyup.enter="handleSend"
      />
      <button class="feed-send" :disabled="sending || !chatInput.trim()" @click="handleSend">
        <span v-if="sending" class="send-pulse" aria-label="发送中" />
        <span v-else>&gt;</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.dj-feed {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  overflow: hidden;
  min-height: 0;
  background: transparent;
}

.feed-messages {
  flex: 0 1 auto;
  overflow-y: auto;
  max-height: 170px;
  padding: 0 0 4px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.feed-messages::-webkit-scrollbar { width: 2px; }
.feed-messages::-webkit-scrollbar-thumb { background: var(--line-m); }

/* ===== 消息基础 ===== */
.msg {
  padding: 8px 16px;
  position: relative;
}

.msg-tag {
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--text-3);
  letter-spacing: 1.5px;
  margin-bottom: 4px;
  text-transform: uppercase;
}

.msg-text {
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.6;
  margin: 0;
}

.msg-title {
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--text-primary);
  margin: 0 0 3px;
  font-weight: 650;
}

/* ===== DJ 转录 ===== */
.transcript-panel {
  margin: 4px 14px 0;
  padding: 8px 12px;
  border-radius: 14px;
  background:
    radial-gradient(ellipse at 12% 0%, rgba(216, 181, 106, 0.1), transparent 48%),
    linear-gradient(135deg, rgba(244, 239, 228, 0.042), rgba(244, 239, 228, 0.012));
  border: 1px solid rgba(216, 181, 106, 0.055);
  box-shadow:
    inset 0 1px 0 rgba(244, 239, 228, 0.028),
    0 8px 20px rgba(0, 0, 0, 0.08);
  transition: padding 0.24s ease, background 0.24s ease, border-color 0.24s ease;
}

.transcript-panel.expanded {
  padding-bottom: 10px;
}

.transcript-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.transcript-wave {
  width: 30px;
  height: 18px;
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.transcript-bar {
  width: 3px;
  min-height: 4px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(241, 233, 216, 0.72), rgba(216, 181, 106, 0.44));
  opacity: 0.36;
  transition: height 80ms linear, opacity 180ms ease;
}

.transcript-wave.active .transcript-bar {
  opacity: 0.9;
}

.transcript-state {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 650;
  color: rgba(216, 181, 106, 0.72);
  letter-spacing: 1.5px;
}

.transcript-toggle {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: rgba(241, 233, 216, 0.46);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 650;
  line-height: 1;
  cursor: pointer;
  padding: 2px 0 2px 8px;
  transition: color 0.16s ease;
}

.transcript-toggle:hover {
  color: rgba(241, 233, 216, 0.76);
}

.transcript-copy {
  max-height: 0;
  overflow-y: auto;
  overscroll-behavior: auto;
  padding-right: 4px;
  opacity: 0;
  mask-image: linear-gradient(180deg, #000 0%, #000 84%, transparent 100%);
  -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 84%, transparent 100%);
  transition: max-height 0.28s ease, opacity 0.2s ease;
}

.transcript-panel.expanded .transcript-copy {
  max-height: 65px;
  opacity: 1;
}

.transcript-copy::-webkit-scrollbar { width: 2px; }
.transcript-copy::-webkit-scrollbar-thumb {
  background: rgba(216, 181, 106, 0.22);
  border-radius: 999px;
}

.transcript-text {
  display: block;
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 560;
  line-height: 1.66;
  letter-spacing: 0;
  text-shadow: 0 1px 16px rgba(0, 0, 0, 0.24);
}

.transcript-char {
  color: rgba(241, 233, 216, 0.36);
  transition: color 0.28s ease, text-shadow 0.28s ease;
}

.transcript-char.read {
  color: rgba(241, 233, 216, 0.86);
  text-shadow: 0 0 10px rgba(216, 181, 106, 0.1);
}

.transcript-text.speaking .transcript-char.read {
  color: rgba(244, 239, 228, 0.9);
}

.transcript-char.current {
  color: rgba(229, 207, 158, 0.96);
  text-shadow:
    0 0 8px rgba(216, 181, 106, 0.22),
    0 1px 16px rgba(0, 0, 0, 0.28);
}

/* ===== 聊天里的 DJ 回复 ===== */
.msg-talk {
  margin: 4px 14px;
  padding: 9px 12px;
  border-radius: var(--radius);
  background:
    linear-gradient(135deg, rgba(216, 181, 106, 0.045), rgba(244, 239, 228, 0.012));
  border: 1px solid rgba(216, 181, 106, 0.045);
}

.msg-talk .msg-tag { color: var(--warm); }

/* ===== NEXT: 后续歌曲预告 ===== */
.msg-next {
  margin: 0 14px 4px;
  padding: 12px 12px;
  border: 1px solid rgba(244, 239, 228, 0.04);
  border-radius: 14px;
  background:
    linear-gradient(135deg, rgba(244, 239, 228, 0.036), rgba(112, 139, 181, 0.026));
}

.next-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.next-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  column-gap: 10px;
  row-gap: 2px;
  align-items: center;
}

.next-num {
  grid-row: span 2;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 650;
  color: var(--warm);
  font-variant-numeric: tabular-nums;
}

.next-title {
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 650;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.next-artist {
  font-family: var(--font-mono);
  font-size: 10px;
  color: rgba(241, 233, 216, 0.56);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.next-loading .next-title {
  color: rgba(241, 233, 216, 0.62);
}

.next-loading .next-artist {
  color: rgba(216, 181, 106, 0.42);
}

/* ===== YOU: 用户气泡 ===== */
.msg-you {
  text-align: right;
}

.msg-you .msg-tag { color: var(--signal); }

.msg-bubble {
  display: inline-block;
  background: var(--signal-dim);
  padding: 6px 12px;
  border-radius: 12px 12px 4px 12px;
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--text-primary);
  max-width: 80%;
  text-align: left;
}

/* ===== SYSTEM: 居中状态条 ===== */
.msg-system {
  text-align: center;
  padding: 4px 16px;
}

.msg-system .msg-tag {
  font-size: 8px;
  color: var(--warm);
  display: inline-block;
  padding: 1px 8px;
  border: 1px solid var(--warm-dim);
}

/* ===== 空状态 ===== */
.feed-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-text {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
  letter-spacing: 2px;
  margin: 0;
}

/* ===== 聊天输入 ===== */
.feed-input {
  display: flex;
  gap: 8px;
  margin: 4px 14px 0;
  padding: 8px 10px;
  border: 1px solid rgba(244, 239, 228, 0.045);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(244, 239, 228, 0.045), rgba(244, 239, 228, 0.018));
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  flex-shrink: 0;
}

.feed-input-field {
  flex: 1;
  padding: 8px 8px;
  background: transparent;
  border: 0;
  border-radius: 0;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 560;
  outline: none;
  transition: border-color 0.15s;
}

.feed-input-field::placeholder { color: var(--text-3); }
.feed-input-field:disabled { opacity: 0.5; cursor: not-allowed; }

.feed-send {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background:
    radial-gradient(circle at 38% 28%, rgba(255, 255, 255, 0.12), transparent 34%),
    rgba(77, 216, 141, 0.105);
  border: 1px solid rgba(77, 216, 141, 0.2);
  color: var(--signal);
  font-family: var(--font-mono);
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}

.feed-send:hover:not(:disabled) { background: rgba(56, 217, 120, 0.18); }
.feed-send:disabled { opacity: 0.4; cursor: not-allowed; }

.send-pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--signal);
  box-shadow: 0 0 0 0 rgba(56, 217, 120, 0.32);
  animation: send-pulse 0.9s ease-in-out infinite;
}

@keyframes send-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(56, 217, 120, 0.32); }
  50% { opacity: 0.66; box-shadow: 0 0 0 5px rgba(56, 217, 120, 0); }
}
</style>
