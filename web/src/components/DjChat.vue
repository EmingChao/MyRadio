<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
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
  return store.session.tracks.slice(store.currentIndex + 1, store.currentIndex + 4)
})

const contextText = computed(() => {
  if (!store.session) return ''
  const mood = store.session.aiSummary?.trim()
  if (mood) return mood
  return `Claudio is holding ${store.trackCount} tracks for this set. Ask for BGM, a quieter turn, or the story behind the current song.`
})

let eventId: number | null = null

function handleWsEvent(event: WsEvent) {
  if (event.type === 'QUEUE_UPDATED' && event.data.tracks) {
    store.updateQueue(event.data.tracks)
    chatHistory.value.push({ role: 'system', content: 'Queue Updated', type: 'queue-update' })
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

async function handleSend() {
  if (!chatInput.value.trim() || !store.session || sending.value) return

  const message = chatInput.value.trim()
  chatInput.value = ''
  sending.value = true

  chatHistory.value.push({ role: 'user', content: message })

  try {
    const res = await sendChatMessage(store.session.sessionId, message)
    if (res.code === 0) {
      const { reply, queueChanged, updatedTracks } = res.data
      chatHistory.value.push({ role: 'dj', content: reply })
      if (queueChanged && updatedTracks) {
        store.updateQueue(updatedTracks)
        chatHistory.value.push({ role: 'system', content: 'Queue Updated', type: 'queue-update' })
      }
    } else {
      chatHistory.value.push({ role: 'dj', content: '抱歉，处理失败了。' })
    }
  } catch {
    chatHistory.value.push({ role: 'dj', content: '网络错误，请稍后再试。' })
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="dj-feed">
    <!-- 消息流 -->
    <div class="feed-messages">
      <!-- 开场白 — 白色纸片 -->
      <div v-if="store.session?.say" class="msg msg-open">
        <div class="brief-head">
          <div class="brief-wave" :class="{ active: store.djSpeaking }" aria-hidden="true">
            <span
              v-for="(level, index) in store.djWaveform.slice(0, 6)"
              :key="index"
              class="brief-bar"
              :style="{ height: `${Math.round(level * 100)}%` }"
            />
          </div>
          <div class="msg-tag">Opening brief</div>
        </div>
        <p class="msg-text">{{ store.session.say }}</p>
      </div>

      <!-- 当前歌曲推荐 — 绿色描边卡 -->
      <div v-if="store.currentTrack" class="msg msg-now">
        <div class="msg-tag">Now playing</div>
        <div class="now-title-row">
          <span class="now-dot" aria-hidden="true" />
          <p class="msg-title">{{ store.currentTrack.title }}</p>
        </div>
        <p class="msg-text">{{ store.currentTrack.recommendReason }}</p>
      </div>

      <!-- DJ 解说 — 琥珀气泡 -->
      <div v-if="store.currentTrack?.djScript" class="msg msg-talk">
        <div class="msg-tag">Claudio says</div>
        <p class="msg-text">{{ store.currentTrack.djScript }}</p>
      </div>

      <!-- 后续队列预告，避免首屏中段空白 -->
      <div v-if="upcomingTracks.length" class="msg msg-next">
        <div class="msg-tag">Next</div>
        <div class="next-list">
          <div v-for="(track, i) in upcomingTracks" :key="track.trackId" class="next-row">
            <span class="next-num">{{ String(store.currentIndex + i + 2).padStart(2, '0') }}</span>
            <span class="next-title">{{ track.title }}</span>
            <span class="next-artist">{{ track.artist }}</span>
          </div>
        </div>
      </div>

      <!-- 当前上下文简报，让 Radio 首屏更像常驻 DJ -->
      <div v-if="store.session" class="msg msg-context">
        <div class="msg-tag">Context</div>
        <p class="msg-text">{{ contextText }}</p>
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
          <div class="msg-tag">Claudio says</div>
          <p class="msg-text">{{ chat.content }}</p>
        </div>
      </template>

      <!-- 无会话占位 -->
      <div v-if="!store.session" class="feed-empty">
        <p class="empty-text">CREATE SESSION TO START</p>
      </div>
    </div>

    <!-- 聊天输入 -->
    <div v-if="store.session" class="feed-input">
      <input
        v-model="chatInput"
        class="feed-input-field"
        placeholder="告诉 Claudio 现在想听什么..."
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
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.feed-messages {
  flex: 1;
  overflow-y: auto;
  padding: 0 0 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
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

/* ===== OPEN: 暖纸 brief ===== */
.msg-open {
  margin: 4px 14px;
  padding: 10px 12px;
  background: rgba(241, 233, 216, 0.92);
  border: 1px solid rgba(23, 22, 19, 0.08);
  border-radius: var(--radius);
  box-shadow:
    0 12px 26px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.brief-head {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 4px;
}

.brief-wave {
  width: 24px;
  height: 18px;
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.brief-bar {
  width: 3px;
  min-height: 4px;
  border-radius: 999px;
  background: rgba(23, 22, 19, 0.5);
  transform-origin: center;
  transition: height 80ms linear, opacity 120ms ease;
  opacity: 0.35;
}

.brief-wave.active .brief-bar {
  opacity: 0.9;
}

.msg-open .msg-tag {
  color: rgba(23, 22, 19, 0.48);
  margin-bottom: 0;
}

.msg-open .msg-text {
  font-size: 12px;
  color: var(--ink);
  line-height: 1.62;
}

/* ===== NOW: 深色玻璃推荐卡 ===== */
.msg-now {
  margin: 0 14px 4px;
  padding: 10px 12px;
  background:
    linear-gradient(135deg, rgba(244, 239, 228, 0.052), rgba(244, 239, 228, 0.022)),
    rgba(18, 21, 27, 0.56);
  border: 1px solid rgba(244, 239, 228, 0.052);
  border-top-color: transparent;
  border-radius: var(--radius);
  box-shadow: 0 -14px 28px rgba(9, 10, 13, 0.1);
}

.msg-now .msg-tag { color: var(--warm); }

.now-title-row {
  display: flex;
  align-items: center;
  gap: 7px;
}

.now-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--signal);
  box-shadow: 0 0 10px rgba(56, 217, 120, 0.35);
  flex-shrink: 0;
}

/* ===== TALK: DJ 气泡 ===== */
.msg-talk {
  margin: 2px 14px;
  padding: 9px 12px;
  border-radius: var(--radius);
  background: rgba(216, 181, 106, 0.055);
  border: 1px solid rgba(216, 181, 106, 0.12);
}

.msg-talk .msg-tag { color: var(--warm); }

/* ===== NEXT: 后续歌曲预告 ===== */
.msg-next {
  margin: 4px 14px;
  padding: 10px 12px;
  border: 1px solid rgba(244, 239, 228, 0.09);
  border-radius: var(--radius);
  background: rgba(244, 239, 228, 0.032);
}

.next-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.next-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  column-gap: 8px;
  row-gap: 1px;
  align-items: baseline;
}

.next-num {
  grid-row: span 2;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--warm);
  font-variant-numeric: tabular-nums;
}

.next-title {
  font-family: var(--font-body);
  font-size: 11px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.next-artist {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== CONTEXT: 当前上下文 ===== */
.msg-context {
  margin: 4px 14px;
  padding: 8px 10px;
  border: 1px solid rgba(216, 181, 106, 0.12);
  border-radius: 999px;
  background: rgba(216, 181, 106, 0.04);
}

.msg-context .msg-tag {
  color: var(--warm);
  display: inline;
  margin-right: 8px;
}

.msg-context .msg-text {
  display: inline;
  font-size: 11px;
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
  gap: 6px;
  padding: 7px 12px 6px;
  border-top: 1px solid var(--line);
  background: rgba(8, 9, 13, 0.42);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  flex-shrink: 0;
}

.feed-input-field {
  flex: 1;
  padding: 7px 10px;
  background: rgba(244, 239, 228, 0.055);
  border: 1px solid var(--line);
  border-radius: 9px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s;
}

.feed-input-field::placeholder { color: var(--text-3); }
.feed-input-field:focus { border-color: rgba(216, 181, 106, 0.34); }
.feed-input-field:disabled { opacity: 0.5; cursor: not-allowed; }

.feed-send {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: rgba(56, 217, 120, 0.11);
  border: 1px solid rgba(56, 217, 120, 0.22);
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
