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
    const sayItem = event.data.ttsItems.find((t: any) => t.text === store.session?.say)
    if (sayItem) store.playTts(sayItem.text)
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
        <div class="msg-tag">Open</div>
        <p class="msg-text">{{ store.session.say }}</p>
      </div>

      <!-- 当前歌曲推荐 — 绿色描边卡 -->
      <div v-if="store.currentTrack" class="msg msg-now">
        <div class="msg-tag">Now</div>
        <p class="msg-title">{{ store.currentTrack.title }}</p>
        <p class="msg-text">{{ store.currentTrack.recommendReason }}</p>
      </div>

      <!-- DJ 解说 — 琥珀气泡 -->
      <div v-if="store.currentTrack?.djScript" class="msg msg-talk">
        <div class="msg-tag">DJ</div>
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
          <div class="msg-tag">DJ</div>
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
        {{ sending ? '...' : '>' }}
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
  padding: 2px 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
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
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.6;
  margin: 0;
}

.msg-title {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--signal);
  margin: 0 0 3px;
  font-weight: 500;
}

/* ===== OPEN: 白色纸片 ===== */
.msg-open {
  margin: 3px 12px;
  padding: 12px 14px;
  background: var(--paper);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.msg-open .msg-tag { color: var(--paper-muted); }

.msg-open .msg-text {
  font-size: 13px;
  color: var(--ink);
  line-height: 1.7;
}

/* ===== NOW: 深色卡 + 绿色左边 ===== */
.msg-now {
  margin: 3px 12px;
  padding: 10px 12px;
  background: var(--surface);
  border-left: 2px solid var(--signal);
  border-radius: 0 var(--radius) var(--radius) 0;
}

.msg-now .msg-tag { color: var(--signal); }

/* ===== TALK: DJ 气泡 ===== */
.msg-talk .msg-tag { color: var(--warm); }

/* ===== NEXT: 后续歌曲预告 ===== */
.msg-next {
  margin: 3px 12px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(242, 238, 230, 0.025);
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
  color: var(--signal);
  font-variant-numeric: tabular-nums;
}

.next-title {
  font-family: var(--font-mono);
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
  margin: 3px 12px;
  padding: 10px 12px;
  border: 1px solid rgba(214, 168, 79, 0.16);
  border-radius: var(--radius);
  background: rgba(214, 168, 79, 0.045);
}

.msg-context .msg-tag {
  color: var(--warm);
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
  font-family: var(--font-mono);
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
  padding: 6px 12px;
  border-top: 1px solid var(--line);
  flex-shrink: 0;
}

.feed-input-field {
  flex: 1;
  padding: 6px 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s;
}

.feed-input-field::placeholder { color: var(--text-3); }
.feed-input-field:focus { border-color: rgba(55, 214, 122, 0.3); }
.feed-input-field:disabled { opacity: 0.5; cursor: not-allowed; }

.feed-send {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: var(--signal-dim);
  border: 1px solid rgba(55, 214, 122, 0.25);
  color: var(--signal);
  font-family: var(--font-mono);
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}

.feed-send:hover:not(:disabled) { background: rgba(55, 214, 122, 0.25); }
.feed-send:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
