<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { usePlayerStore } from '../stores/player'
import { sendChatMessage } from '../api'
import { useWebSocket } from '../composables/useWebSocket'
import type { WsEvent } from '../composables/useWebSocket'

const store = usePlayerStore()
const chatInput = ref('')
const sending = ref(false)
const chatHistory = ref<Array<{ role: string; content: string; type?: string }>>([])

const { connected, subscribe, onEvent, offEvent } = useWebSocket()

// 监听 WebSocket 事件
let eventId: number | null = null

function handleWsEvent(event: WsEvent) {
  if (event.type === 'QUEUE_UPDATED' && event.data.tracks) {
    // 队列被重排，更新 store 中的队列
    store.updateQueue(event.data.tracks)
    chatHistory.value.push({
      role: 'system',
      content: '队列已更新',
      type: 'queue-update',
    })
  } else if (event.type === 'TTS_READY' && event.data.ttsItems) {
    // TTS 音频就绪，存入 store
    store.setTtsItems(event.data.ttsItems)
    // 自动播放开场白
    const sayItem = event.data.ttsItems.find((t: any) => t.text === store.session?.say)
    if (sayItem) {
      store.playTts(sayItem.text)
    }
  }
  // DJ_CHAT 事件通过 HTTP 响应已经处理，这里不重复添加
}

onMounted(() => {
  eventId = onEvent(handleWsEvent)
  // 订阅当前会话
  if (store.session) {
    subscribe(store.session.sessionId)
  }
})

// 会话变化时重新订阅
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

  // 添加用户消息到历史
  chatHistory.value.push({ role: 'user', content: message })

  try {
    const res = await sendChatMessage(store.session.sessionId, message)
    if (res.code === 0) {
      const { reply, intent, queueChanged, updatedTracks } = res.data

      // 添加 DJ 回复到历史
      chatHistory.value.push({ role: 'dj', content: reply })

      // 如果队列有变化，直接用 HTTP 响应中的数据更新
      if (queueChanged && updatedTracks) {
        store.updateQueue(updatedTracks)
        chatHistory.value.push({
          role: 'system',
          content: '队列已更新',
          type: 'queue-update',
        })
      }
    } else {
      chatHistory.value.push({ role: 'dj', content: '抱歉，处理失败了。' })
    }
  } catch (e: any) {
    chatHistory.value.push({ role: 'dj', content: '网络错误，请稍后再试。' })
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="dj-chat">
    <!-- 电台标题 -->
    <div class="header">
      <div class="header-row">
        <span class="header-label">DJ</span>
        <span class="header-title">{{ store.session?.sessionTitle || 'STANDBY' }}</span>
        <span class="ws-status" :class="{ online: connected }">{{ connected ? 'LIVE' : 'OFF' }}</span>
      </div>
      <p v-if="store.session?.aiSummary" class="summary">{{ store.session.aiSummary }}</p>
    </div>

    <!-- 消息区域 -->
    <div class="messages">
      <!-- 开场白 -->
      <div v-if="store.session?.say" class="msg">
        <div class="msg-tag">OPEN</div>
        <p class="msg-text">{{ store.session.say }}</p>
      </div>

      <!-- 当前歌曲推荐理由 -->
      <div v-if="store.currentTrack" class="msg">
        <div class="msg-tag">NOW</div>
        <p class="msg-title">{{ store.currentTrack.title }}</p>
        <p class="msg-text">{{ store.currentTrack.recommendReason }}</p>
      </div>

      <!-- DJ 解说词 -->
      <div v-if="store.currentTrack?.djScript" class="msg">
        <div class="msg-tag">TALK</div>
        <p class="msg-text">{{ store.currentTrack.djScript }}</p>
      </div>

      <!-- 聊天历史 -->
      <div v-for="(chat, i) in chatHistory" :key="i" class="msg" :class="{ 'msg-user': chat.role === 'user', 'msg-system': chat.type === 'queue-update' }">
        <div class="msg-tag">
          {{ chat.role === 'user' ? 'YOU' : chat.type === 'queue-update' ? 'QUEUE' : 'DJ' }}
        </div>
        <p class="msg-text">{{ chat.content }}</p>
      </div>

      <!-- 占位 -->
      <div v-if="!store.session" class="empty">
        <div class="empty-icon">[ ]</div>
        <p>CREATE SESSION TO START</p>
      </div>
    </div>

    <!-- 聊天输入框 -->
    <div v-if="store.session" class="chat-input-area">
      <input
        v-model="chatInput"
        class="chat-input"
        placeholder="和 DJ 聊聊天..."
        :disabled="sending"
        @keyup.enter="handleSend"
      />
      <button class="send-btn" :disabled="sending || !chatInput.trim()" @click="handleSend">
        {{ sending ? '...' : '>' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.dj-chat {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  border-bottom: 1px solid var(--border);
}

.header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
}

.header-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--warm);
  font-weight: 600;
  letter-spacing: 1px;
  padding: 1px 4px;
  border: 1px solid var(--warm-dim);
}

.header-title {
  font-family: var(--font-pixel);
  font-size: 18px;
  color: var(--text-primary);
}

.summary {
  margin: 6px 0 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.msg {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
}

.msg:last-child {
  border-bottom: none;
}

.msg-tag {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: 1px;
  margin-bottom: 6px;
}

.msg-title {
  font-family: var(--font-pixel);
  font-size: 18px;
  color: var(--accent);
  margin: 0 0 4px;
}

.msg-text {
  font-family: var(--font-pixel);
  font-size: 16px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 0;
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.empty-icon {
  font-family: var(--font-mono);
  font-size: 24px;
  color: var(--border-light);
}

.empty p {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 2px;
  margin: 0;
}

.msg-user {
  background: var(--bg-raised);
}

.msg-user .msg-tag {
  color: var(--accent);
}

.msg-system {
  background: var(--bg-surface);
  opacity: 0.8;
}

.msg-system .msg-tag {
  color: var(--warm);
  font-size: 8px;
}

.ws-status {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: 1px;
  padding: 1px 4px;
  border: 1px solid var(--border);
}

.ws-status.online {
  color: var(--accent);
  border-color: var(--accent-dim);
}

/* 聊天输入区域 */
.chat-input-area {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-surface);
}

.chat-input {
  flex: 1;
  padding: 6px 10px;
  background: var(--bg-deep);
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-family: var(--font-pixel);
  font-size: 16px;
  outline: none;
}

.chat-input::placeholder {
  color: var(--text-muted);
}

.chat-input:focus {
  border-color: var(--accent-dim);
}

.chat-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn {
  padding: 6px 14px;
  background: var(--accent-glow);
  border: 1px solid var(--accent-dim);
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 14px;
  transition: all 0.15s;
}

.send-btn:hover:not(:disabled) {
  background: rgba(74, 222, 128, 0.25);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
