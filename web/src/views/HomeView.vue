<script setup lang="ts">
import { ref } from 'vue'
import { usePlayerStore } from '../stores/player'
import { createRadioSession } from '../api'
import RadioPlayer from '../components/RadioPlayer.vue'
import DjChat from '../components/DjChat.vue'
import TrackQueue from '../components/TrackQueue.vue'
import TodayPlan from '../components/TodayPlan.vue'
import NeteaseLogin from '../components/NeteaseLogin.vue'

const store = usePlayerStore()

const scene = ref('coding')
const mood = ref('专注')
const extraPrompt = ref('')
const creating = ref(false)
const showLogin = ref(false)

async function handleCreate() {
  creating.value = true
  try {
    const res = await createRadioSession({
      scene: scene.value,
      mood: mood.value,
      extraPrompt: extraPrompt.value || undefined,
    })
    if (res.code === 0) {
      store.setSession(res.data)
    } else {
      alert(res.message || '创建失败')
    }
  } catch (e: any) {
    alert('请求失败: ' + e.message)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="home">
    <!-- 顶部状态栏 -->
    <header class="top-bar">
      <div class="top-left">
        <span class="logo">MY RADIO</span>
        <span class="dot">·</span>
        <span class="freq">FM 24.7</span>
      </div>
      <div class="top-center">
        <span class="status-text">
          {{ store.session ? store.session.sessionTitle : 'STANDBY' }}
        </span>
      </div>
      <div class="top-right">
        <span class="indicator online" :class="{ active: store.session }">ON AIR</span>
        <span class="time">{{ new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</span>
        <button class="netease-btn" @click="showLogin = true">NETEASE</button>
      </div>
    </header>

    <!-- 网易云登录弹窗 -->
    <NeteaseLogin
      v-if="showLogin"
      @close="showLogin = false"
      @login-success="showLogin = false"
    />

    <!-- 主内容区 -->
    <main class="main-content">
      <!-- 左侧：播放器 -->
      <section class="player-section">
        <RadioPlayer />
      </section>

      <!-- 右侧：DJ 聊天 + 队列 + 今日计划 -->
      <section class="right-panel">
        <DjChat />
        <TrackQueue v-if="store.session" />
        <TodayPlan />
      </section>
    </main>

    <!-- 底部：创建表单或状态栏 -->
    <footer class="bottom-bar">
      <div v-if="!store.session" class="create-form">
        <div class="form-row">
          <label class="form-label">SCENE</label>
          <div class="select-group">
            <button
              v-for="s in [
                { v: 'coding', l: 'CODE' },
                { v: 'working', l: 'WORK' },
                { v: 'relaxing', l: 'CHILL' },
                { v: 'sleeping', l: 'SLEEP' },
              ]"
              :key="s.v"
              :class="{ active: scene === s.v }"
              @click="scene = s.v"
            >{{ s.l }}</button>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label">MOOD</label>
          <div class="select-group">
            <button
              v-for="m in ['专注', '放松', '高兴', '低落', '怀旧', '深夜']"
              :key="m"
              :class="{ active: mood === m }"
              @click="mood = m"
            >{{ m }}</button>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label">NOTE</label>
          <input
            v-model="extraPrompt"
            class="form-input"
            placeholder="可选，比如：不想听太吵的"
          />
        </div>
        <button class="start-btn" :disabled="creating" @click="handleCreate">
          {{ creating ? '>> GENERATING...' : '>> START RADIO' }}
        </button>
      </div>
      <div v-else class="status-row">
        <span class="status-item">SESSION #{{ store.session.sessionId }}</span>
        <span class="status-item">{{ store.trackCount }} TRACKS</span>
        <span class="status-item">{{ store.currentIndex + 1 }}/{{ store.trackCount }}</span>
        <button class="new-session-btn" @click="store.clearSession()">NEW SESSION</button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-deep);
}

/* 顶部状态栏 */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 36px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 11px;
}

.top-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo {
  color: var(--accent);
  font-family: var(--font-display);
  font-size: 8px;
  letter-spacing: 2px;
}

.dot {
  color: var(--text-muted);
}

.freq {
  color: var(--warm);
  font-family: var(--font-pixel);
  font-size: 16px;
}

.top-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.status-text {
  color: var(--text-secondary);
  font-size: 12px;
  letter-spacing: 1px;
}

.top-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.indicator {
  padding: 1px 6px;
  border: 1px solid var(--border-light);
  color: var(--text-muted);
  font-size: 10px;
  letter-spacing: 1px;
}

.indicator.active {
  border-color: var(--red-dim);
  color: var(--red);
  animation: blink 2s ease-in-out infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.time {
  color: var(--text-muted);
  font-family: var(--font-pixel);
  font-size: 16px;
}

.netease-btn {
  padding: 1px 6px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--red-dim);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.15s;
}

.netease-btn:hover {
  border-color: var(--red-dim);
  color: var(--red);
}

/* 主内容区 */
.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.player-section {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--border);
}

.right-panel {
  width: 360px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 底部栏 */
.bottom-bar {
  border-top: 1px solid var(--border);
  background: var(--bg-panel);
}

/* 创建表单 */
.create-form {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 10px 20px;
  height: 52px;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 1px;
  white-space: nowrap;
}

.select-group {
  display: flex;
  gap: 2px;
}

.select-group button {
  padding: 3px 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 14px;
  transition: all 0.15s;
}

.select-group button:hover {
  border-color: var(--border-light);
  color: var(--text-primary);
}

.select-group button.active {
  background: var(--accent-glow);
  border-color: var(--accent-dim);
  color: var(--accent);
}

.form-input {
  padding: 3px 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-family: var(--font-pixel);
  font-size: 16px;
  width: 200px;
  outline: none;
}

.form-input::placeholder {
  color: var(--text-muted);
}

.form-input:focus {
  border-color: var(--accent-dim);
}

.start-btn {
  padding: 4px 16px;
  background: var(--accent-glow);
  border: 1px solid var(--accent-dim);
  color: var(--accent);
  font-size: 16px;
  letter-spacing: 1px;
  transition: all 0.15s;
  white-space: nowrap;
}

.start-btn:hover:not(:disabled) {
  background: rgba(74, 222, 128, 0.25);
}

.start-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 状态行 */
.status-row {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 20px;
  height: 36px;
  font-family: var(--font-mono);
  font-size: 11px;
}

.status-item {
  color: var(--text-muted);
  letter-spacing: 1px;
}

.new-session-btn {
  margin-left: auto;
  padding: 2px 10px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 12px;
  transition: all 0.15s;
}

.new-session-btn:hover {
  border-color: var(--red-dim);
  color: var(--red);
}
</style>
