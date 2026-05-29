<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, provide } from 'vue'
import { usePlayerStore } from '../stores/player'
import { createRadioSession } from '../api'
import { useWebSocket } from '../composables/useWebSocket'
import type { WsEvent } from '../composables/useWebSocket'
import type { RadioTrack } from '../stores/player'
import ClaudioHeader from '../components/ClaudioHeader.vue'
import RadioPlayer from '../components/RadioPlayer.vue'
import DjChat from '../components/DjChat.vue'
import TrackQueue from '../components/TrackQueue.vue'
import TodayPlan from '../components/TodayPlan.vue'
import TastePanel from '../components/TastePanel.vue'
import NeteaseLogin from '../components/NeteaseLogin.vue'
import Toast from '../components/Toast.vue'
import BottomSheet from '../components/BottomSheet.vue'
import BottomTabs from '../components/BottomTabs.vue'
import DeviceSelector from '../components/DeviceSelector.vue'
import SongDetailDrawer from '../components/SongDetailDrawer.vue'

const store = usePlayerStore()
const { onEvent, offEvent } = useWebSocket()

// 创建表单状态
const scene = ref('coding')
const mood = ref('专注')
const extraPrompt = ref('')
const creating = ref(false)
const createPhase = ref('')

// UI 状态
const showLogin = ref(false)
const showSettings = ref(false)
const showDetail = ref(false)
const detailTrack = ref<RadioTrack | null>(null)
const activeTab = ref('radio')
const toasts = ref<Array<{ id: number; message: string; type: 'info' | 'success' | 'error' }>>([])

// 提供给子组件打开详情的方法
function openDetail(track?: RadioTrack) {
  detailTrack.value = track || store.currentTrack
  showDetail.value = true
}
provide('openDetail', openDetail)
let toastId = 0

// 响应式检测
const isMobile = ref(window.innerWidth <= 768)
function onResize() { isMobile.value = window.innerWidth <= 768 }

// 监听时段切换事件
let wsEventId: number | null = null
function handleWsEvent(event: WsEvent) {
  if (event.type === 'SLOT_CHANGED' && event.data) {
    store.setSlotChanged(event.data)
  }
}

onMounted(() => {
  window.addEventListener('resize', onResize)
  wsEventId = onEvent(handleWsEvent)
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  if (wsEventId !== null) offEvent(wsEventId)
})

function showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
  const id = ++toastId
  toasts.value.push({ id, message, type })
}

function removeToast(id: number) {
  toasts.value = toasts.value.filter(t => t.id !== id)
}

const btnText = computed(() => {
  if (!creating.value) return 'START CLAUDIO'
  if (createPhase.value) return createPhase.value
  return 'GENERATING...'
})

// 时段切换通知
const switching = ref(false)
async function handleAcceptSlotChange() {
  if (switching.value || !store.slotChanged) return
  switching.value = true
  try {
    if (store.session) store.clearSession()
    scene.value = store.slotChanged.scene
    mood.value = store.slotChanged.mood
    store.clearSlotChanged()
    await handleCreate()
  } finally {
    switching.value = false
  }
}

async function handleCreate() {
  creating.value = true
  createPhase.value = '召回曲库...'
  try {
    setTimeout(() => { if (creating.value) createPhase.value = 'AI 编排中...' }, 2000)
    setTimeout(() => { if (creating.value) createPhase.value = '准备播放...' }, 8000)

    const res = await createRadioSession({
      scene: scene.value,
      mood: mood.value,
      extraPrompt: extraPrompt.value || undefined,
    })
    if (res.code === 0) {
      store.setSession(res.data)
      if (res.data.fallback) {
        showToast('本地编排模式（AI 暂不可用）', 'info')
      }
    } else {
      showToast(res.message || '创建失败', 'error')
    }
  } catch (e: any) {
    showToast('请求失败: ' + e.message, 'error')
  } finally {
    creating.value = false
    createPhase.value = ''
  }
}

function handleTabChange(tab: string) {
  activeTab.value = tab
}
</script>

<template>
  <div class="app-stage">
    <!-- Toast 通知 -->
    <Toast
      v-for="t in toasts"
      :key="t.id"
      :message="t.message"
      :type="t.type"
      @close="removeToast(t.id)"
    />

    <!-- 网易云登录弹窗 -->
    <NeteaseLogin
      v-if="showLogin"
      @close="showLogin = false"
      @login-success="showLogin = false"
    />

    <!-- 歌曲详情抽屉 -->
    <SongDetailDrawer
      :visible="showDetail"
      :track="detailTrack"
      :current-time="store.currentTime"
      @close="showDetail = false"
    />

    <!-- 手机壳容器 -->
    <div class="phone-shell" :class="{ 'is-mobile': isMobile }">
      <!-- Claudio Header -->
      <ClaudioHeader @settings="showSettings = true" />

      <!-- 时段切换通知条 -->
      <div v-if="store.slotChanged" class="slot-notice">
        <span class="slot-notice-text">
          时段切换：{{ store.slotChanged.scene }} · {{ store.slotChanged.mood }}
        </span>
        <button class="slot-notice-btn" :disabled="switching" @click="handleAcceptSlotChange">
          {{ switching ? '...' : 'SWITCH' }}
        </button>
        <button class="slot-notice-dismiss" @click="store.clearSlotChanged()">x</button>
      </div>

      <!-- ===== Radio Tab 主内容 ===== -->
      <template v-if="activeTab === 'radio'">
        <!-- Radio Stage: 播放器区域 -->
        <div class="stage-area">
          <RadioPlayer />
        </div>

        <!-- DJ Feed: 聊天流 -->
        <div class="feed-area">
          <DjChat />
        </div>

        <!-- Command Dock: 输入/启动区 -->
        <div class="dock-area">
          <!-- 有会话时：快捷心情 chips -->
          <div v-if="store.session" class="dock-chips">
            <button
              v-for="m in ['专注', '放松', '深夜', 'BGM']"
              :key="m"
              class="chip"
              :class="{ active: mood === m }"
              @click="mood = m"
            >{{ m }}</button>
          </div>

          <!-- 无会话时：创建表单 -->
          <div v-if="!store.session" class="create-dock">
            <div class="dock-chips">
              <button
                v-for="s in [
                  { v: 'coding', l: 'CODE' },
                  { v: 'working', l: 'WORK' },
                  { v: 'relaxing', l: 'CHILL' },
                  { v: 'sleeping', l: 'SLEEP' },
                ]"
                :key="s.v"
                class="chip"
                :class="{ active: scene === s.v }"
                @click="scene = s.v"
              >{{ s.l }}</button>
            </div>
            <div class="dock-input-row">
              <input
                v-model="extraPrompt"
                class="dock-input"
                placeholder="告诉 Claudio 你的心情..."
              />
              <button
                class="dock-send"
                :disabled="creating"
                @click="handleCreate"
              >{{ btnText }}</button>
            </div>
          </div>
        </div>
      </template>

      <!-- ===== Queue Tab ===== -->
      <div v-else-if="activeTab === 'queue'" class="tab-content">
        <TrackQueue />
      </div>

      <!-- ===== Plan Tab ===== -->
      <div v-else-if="activeTab === 'plan'" class="tab-content">
        <TodayPlan />
      </div>

      <!-- ===== Taste Tab ===== -->
      <div v-else-if="activeTab === 'taste'" class="tab-content">
        <TastePanel />
      </div>

      <!-- Bottom Tabs -->
      <BottomTabs :active="activeTab" @change="handleTabChange" />
    </div>

    <!-- Settings Sheet -->
    <BottomSheet :visible="showSettings" title="SETTINGS" @close="showSettings = false">
      <div class="settings-sheet">
        <div class="setting-row">
          <span class="setting-label">DEVICE</span>
          <DeviceSelector />
        </div>
        <button class="setting-item" @click="showSettings = false; showLogin = true">
          <span class="setting-label">NETEASE LOGIN</span>
        </button>
        <button v-if="store.session" class="setting-item setting-danger" @click="showSettings = false; store.clearSession()">
          <span class="setting-label">NEW SESSION</span>
        </button>
      </div>
    </BottomSheet>
  </div>
</template>

<style scoped>
/* ===== 舞台背景 ===== */
.app-stage {
  width: 100%;
  height: 100vh;
  background:
    radial-gradient(ellipse at 50% 0%, rgba(55, 214, 122, 0.04), transparent 45%),
    linear-gradient(180deg, #0b1110 0%, var(--stage-black) 40%, #020303 100%);
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
}

/* ===== 手机壳 ===== */
.phone-shell {
  width: 390px;
  height: 844px;
  background: var(--stage-black);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 32px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
  box-shadow:
    0 0 80px rgba(55, 214, 122, 0.03),
    0 0 0 1px rgba(255, 255, 255, 0.02);
}

.phone-shell.is-mobile {
  width: 100%;
  height: 100vh;
  height: 100dvh;
  border-radius: 0;
  border: none;
  box-shadow: none;
}

/* ===== Stage 播放区域 ===== */
.stage-area {
  flex-shrink: 0;
  overflow: hidden;
}

/* ===== DJ Feed 聊天流 ===== */
.feed-area {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* ===== Command Dock ===== */
.dock-area {
  flex-shrink: 0;
  padding: 6px 12px 4px;
  border-top: 1px solid var(--line);
  background: rgba(16, 18, 20, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.dock-chips {
  display: flex;
  gap: 5px;
  margin-bottom: 6px;
}

.chip {
  padding: 3px 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-2);
  cursor: pointer;
  transition: all 0.15s;
  letter-spacing: 0.3px;
}

.chip:hover, .chip.active {
  background: var(--signal-dim);
  border-color: rgba(55, 214, 122, 0.3);
  color: var(--signal);
}

.create-dock {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dock-input-row {
  display: flex;
  gap: 6px;
}

.dock-input {
  flex: 1;
  padding: 7px 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s;
}

.dock-input::placeholder {
  color: var(--text-3);
}

.dock-input:focus {
  border-color: rgba(55, 214, 122, 0.3);
}

.dock-send {
  padding: 7px 14px;
  background: var(--signal-dim);
  border: 1px solid rgba(55, 214, 122, 0.25);
  border-radius: 8px;
  color: var(--signal);
  font-family: var(--font-brand);
  font-size: 14px;
  letter-spacing: 1px;
  white-space: nowrap;
  transition: all 0.15s;
}

.dock-send:hover:not(:disabled) {
  background: rgba(55, 214, 122, 0.25);
}

.dock-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ===== Tab 内容区 ===== */
.tab-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

/* ===== 时段切换通知 ===== */
.slot-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  background: var(--warm-glow);
  border-bottom: 1px solid var(--warm-dim);
  flex-shrink: 0;
}

.slot-notice-text {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--warm);
  letter-spacing: 0.5px;
  flex: 1;
}

.slot-notice-btn {
  padding: 2px 8px;
  background: var(--warm-dim);
  border: 1px solid var(--warm);
  color: var(--stage-black);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.15s;
}

.slot-notice-btn:hover:not(:disabled) {
  background: var(--warm);
}

.slot-notice-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.slot-notice-dismiss {
  padding: 0 4px;
  background: transparent;
  border: none;
  color: var(--warm);
  font-size: 14px;
  cursor: pointer;
  line-height: 1;
}

/* ===== Settings Sheet ===== */
.settings-sheet {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--line);
}

.setting-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text-secondary);
  font-size: 14px;
  transition: all 0.15s;
  width: 100%;
  text-align: left;
}

.setting-item:active {
  border-color: var(--line-m);
  color: var(--text-primary);
}

.setting-danger {
  color: var(--danger);
}

.setting-label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 1px;
}

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .app-stage {
    align-items: flex-start;
  }

  .dock-area {
    padding: 6px 10px 4px;
  }
}
</style>
