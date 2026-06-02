<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, provide, watch } from 'vue'
import { usePlayerStore } from '../stores/player'
import { createRadioSession } from '../api'
import { useMediaKeyboardControls } from '../composables/media-keyboard-controls'
import { useWebSocket } from '../composables/useWebSocket'
import { useCoverBg } from '../composables/useCoverBg'
import type { WsEvent } from '../composables/useWebSocket'
import type { RadioTrack } from '../stores/player'
import MyRadioHeader from '../components/MyRadioHeader.vue'
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
const { bgStyle: globalCoverStyle } = useCoverBg()
useMediaKeyboardControls()

// 创建表单状态
const scene = ref('coding')
const mood = ref('专注')
const extraPrompt = ref('')
const creating = ref(false)
const createPhase = ref('')
const modeOptions = ['专注', '放松', '深夜', 'BGM']

// UI 状态
const showLogin = ref(false)
const showSettings = ref(false)
const showDetail = ref(false)
const detailTrack = ref<RadioTrack | null>(null)
const activeTab = ref('radio')
const toasts = ref<Array<{ id: number; message: string; type: 'info' | 'success' | 'error' }>>([])
const theme = ref<'dark' | 'light'>(getInitialTheme())

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
  applyTheme(theme.value)
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  if (wsEventId !== null) offEvent(wsEventId)
})

watch(theme, (value) => {
  applyTheme(value)
  try {
    localStorage.setItem('myradio-theme', value)
  } catch {
    // 忽略存储失败
  }
}, { immediate: true })

function showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
  const id = ++toastId
  toasts.value.push({ id, message, type })
}

function removeToast(id: number) {
  toasts.value = toasts.value.filter(t => t.id !== id)
}

const btnText = computed(() => {
  if (!creating.value) return '开启 MyRadio'
  if (createPhase.value) return createPhase.value
  return '正在生成...'
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
  if (creating.value) return
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

async function handleMoodShortcut(nextMood: string) {
  if (creating.value) return
  mood.value = nextMood
  showToast(`切换到${nextMood}模式，重新编排电台`, 'info')
  if (store.session) {
    store.clearSession()
  }
  await handleCreate()
}

function handleTabChange(tab: string) {
  activeTab.value = tab
}

function getInitialTheme(): 'dark' | 'light' {
  try {
    const saved = localStorage.getItem('myradio-theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // 忽略存储读取失败
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(value: 'dark' | 'light') {
  document.documentElement.dataset.theme = value
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}

function setTheme(value: 'dark' | 'light') {
  theme.value = value
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
    <div class="phone-shell" :class="{ 'is-mobile': isMobile, 'has-session': !!store.session, 'is-creating': creating }">
      <!-- 全局专辑氛围层：让播放器、独白和底部导航都跟随当前封面形成同一套磨砂背景。 -->
      <div v-if="store.currentTrack?.coverUrl" class="global-cover-ambient" :style="globalCoverStyle" aria-hidden="true" />

      <!-- MyRadio Header -->
      <MyRadioHeader @settings="showSettings = true" />

      <!-- 时段切换通知条 -->
      <div v-if="store.slotChanged" class="slot-notice">
        <span class="slot-notice-text">
          时段切换：{{ store.slotChanged.scene }} · {{ store.slotChanged.mood }}
        </span>
        <button class="slot-notice-btn" :disabled="switching" @click="handleAcceptSlotChange">
          {{ switching ? '...' : '切换' }}
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

      <!-- Bottom Dock: 模式入口和底部导航共用一块面板，避免视觉断层。 -->
      <div class="bottom-dock" :class="{ 'radio-dock': activeTab === 'radio' }">
        <div v-if="activeTab === 'radio'" class="dock-area">
          <!-- 模式快捷项始终保持同一组中文选项，避免切换会话时布局跳变。 -->
          <div class="dock-chips">
            <button
              v-for="m in modeOptions"
              :key="m"
              class="chip"
              :class="{ active: mood === m }"
              :disabled="creating"
              @click="handleMoodShortcut(m)"
            >{{ m }}</button>
          </div>

          <!-- 无会话时：创建表单 -->
          <div v-if="!store.session" class="create-dock">
            <div class="dock-input-row">
              <input
                v-model="extraPrompt"
                class="dock-input"
                placeholder="告诉 MyRadio 你的心情..."
              />
              <button
                class="dock-send"
                :disabled="creating"
                @click="handleCreate"
              >{{ btnText }}</button>
            </div>
          </div>
        </div>

        <BottomTabs :active="activeTab" @change="handleTabChange" />
      </div>
    </div>

    <!-- Settings Sheet -->
    <BottomSheet :visible="showSettings" title="设置" @close="showSettings = false">
      <div class="settings-sheet">
        <div class="setting-row">
          <span class="setting-label">播放设备</span>
          <DeviceSelector />
        </div>
        <div class="setting-row setting-theme">
          <span class="setting-label">主题外观</span>
          <div class="theme-switch">
            <button class="theme-option" :class="{ active: theme === 'dark' }" @click="setTheme('dark')">深色</button>
            <button class="theme-option" :class="{ active: theme === 'light' }" @click="setTheme('light')">亮色</button>
            <button class="theme-cycle" :aria-label="theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'" @click="toggleTheme">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 4.75a7.25 7.25 0 1 0 7.25 7.25 5.75 5.75 0 0 1-7.25-7.25Z"/>
              </svg>
            </button>
          </div>
        </div>
        <button class="setting-item" @click="showSettings = false; showLogin = true">
          <span class="setting-label">网易云登录</span>
        </button>
        <button v-if="store.session" class="setting-item setting-danger" @click="showSettings = false; store.clearSession()">
          <span class="setting-label">重新开始电台</span>
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
  min-height: 100vh;
  background:
    radial-gradient(circle at 42% 10%, var(--shell-halo-a), transparent 28%),
    radial-gradient(ellipse at 50% -2%, rgba(241, 233, 216, 0.045), transparent 44%),
    radial-gradient(circle at 78% 82%, var(--shell-halo-b), transparent 33%),
    linear-gradient(180deg, var(--app-bg-1) 0%, var(--app-bg-2) 55%, var(--app-bg-3) 100%);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  overflow: hidden;
  padding: 12px 0 16px;
}

/* ===== 手机壳 ===== */
.phone-shell {
  width: 390px;
  height: 844px;
  flex-shrink: 0;
  background: var(--shell-bg-2);
  border: 0;
  border-radius: 32px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
  isolation: isolate;
  box-shadow:
    0 28px 120px rgba(0, 0, 0, 0.58),
    0 0 82px rgba(209, 135, 79, 0.08);
}

.phone-shell > * {
  position: relative;
  z-index: 1;
}

.global-cover-ambient {
  position: absolute;
  inset: -150px;
  z-index: 0;
  background-size: cover;
  background-position: center;
  opacity: 0.92;
  filter: blur(58px) saturate(1.42) brightness(0.42);
  transform: scale(1.34);
  transition: background-image 0.8s ease, opacity 0.3s ease, filter 0.3s ease;
  pointer-events: none;
}

.global-cover-ambient::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(7, 8, 11, 0.48) 0%, rgba(7, 8, 11, 0.5) 46%, rgba(7, 8, 11, 0.56) 100%),
    radial-gradient(circle at 50% 16%, rgba(244, 239, 228, 0.08), transparent 34%);
}

.phone-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.012) 1px, transparent 1px);
  background-size: 100% 42px, 42px 100%;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.48), transparent 48%);
  opacity: 0.18;
  pointer-events: none;
  z-index: 0;
}

.phone-shell::after {
  content: '';
  position: absolute;
  left: 18px;
  right: 18px;
  top: 36px;
  height: 210px;
  border-radius: 999px;
  background:
    radial-gradient(circle at 50% 40%, rgba(216, 181, 106, 0.14), transparent 58%),
    radial-gradient(circle at 16% 52%, rgba(77, 216, 141, 0.06), transparent 45%);
  filter: blur(22px);
  opacity: 0.14;
  animation: ambient-drift 12s ease-in-out infinite;
  pointer-events: none;
  z-index: 0;
}

.phone-shell.has-session::after {
  opacity: 0.18;
  background:
    radial-gradient(circle at 50% 36%, rgba(216, 181, 106, 0.16), transparent 56%),
    radial-gradient(circle at 20% 46%, rgba(77, 216, 141, 0.07), transparent 42%);
}

.phone-shell.is-creating::after {
  opacity: 1;
  animation-duration: 8s;
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
  position: relative;
  z-index: 1;
  padding: 0;
  margin-top: 36px;
}

/* ===== DJ Feed 聊天流 ===== */
.feed-area {
  flex: 0 0 198px;
  height: 198px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  min-height: 0;
  margin-top: -2px;
  padding: 0 12px 8px;
  position: relative;
  z-index: 2;
  background: transparent;
}

.phone-shell:not(.has-session) .feed-area {
  flex: 1 1 auto;
  justify-content: flex-end;
  padding-top: 4px;
  padding-bottom: 18px;
  background: transparent;
}

/* ===== Bottom Dock ===== */
.bottom-dock {
  flex-shrink: 0;
  margin: auto 0 0;
  padding: 8px 14px calc(8px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid rgba(244, 239, 228, 0.02);
  border-radius: 22px 22px 30px 30px;
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  position: relative;
  z-index: 1;
  box-shadow:
    none;
}

.bottom-dock::before {
  content: none;
  position: absolute;
  left: 18px;
  right: 18px;
  top: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(216, 181, 106, 0.2), transparent);
  opacity: 0.42;
}

/* ===== Command Dock ===== */
.dock-area {
  padding: 0 0 8px;
  position: relative;
}

.dock-chips {
  display: flex;
  gap: 6px;
  margin-bottom: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.dock-chips::-webkit-scrollbar {
  display: none;
}

.chip {
  flex: 1;
  min-width: 0;
  padding: 6px 9px;
  background: rgba(244, 239, 228, 0.04);
  border: 1px solid rgba(244, 239, 228, 0.055);
  border-radius: 12px;
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 700;
  color: rgba(241, 233, 216, 0.68);
  cursor: pointer;
  transition: all 0.16s ease;
  letter-spacing: 0;
}

.chip:hover, .chip.active {
  background: rgba(241, 233, 216, 0.1);
  border-color: rgba(56, 217, 120, 0.24);
  color: var(--text-primary);
}

.chip:disabled {
  opacity: 0.42;
  cursor: wait;
}

.create-dock {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
}

.dock-input-row {
  display: flex;
  gap: 6px;
}

.dock-input {
  flex: 1;
  padding: 10px 12px;
  background: rgba(244, 239, 228, 0.045);
  border: 1px solid rgba(244, 239, 228, 0.08);
  border-radius: 10px;
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 600;
  outline: none;
  transition: border-color 0.15s;
}

.dock-input::placeholder {
  color: var(--text-3);
}

.dock-input:focus {
  border-color: rgba(216, 181, 106, 0.34);
}

.dock-send {
  padding: 10px 14px;
  background: linear-gradient(180deg, rgba(56, 217, 120, 0.15), rgba(56, 217, 120, 0.09));
  border: 1px solid rgba(56, 217, 120, 0.24);
  border-radius: 10px;
  color: var(--signal);
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0;
  white-space: nowrap;
  transition: all 0.15s;
}

.dock-send:hover:not(:disabled) {
  background: rgba(56, 217, 120, 0.18);
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
  padding: 48px 12px 10px;
  position: relative;
  z-index: 1;
  background:
    linear-gradient(180deg, rgba(8, 9, 13, 0.08), rgba(8, 9, 13, 0) 120px);
  scrollbar-width: thin;
  scrollbar-color: var(--line-m) transparent;
}

.tab-content::-webkit-scrollbar {
  width: 2px;
}

.tab-content::-webkit-scrollbar-thumb {
  background: var(--line-m);
}

/* ===== 时段切换通知 ===== */
.slot-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  background:
    linear-gradient(180deg, rgba(216, 181, 106, 0.09), rgba(10, 12, 16, 0.78));
  border-bottom: 1px solid rgba(216, 181, 106, 0.16);
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
  background: rgba(216, 181, 106, 0.12);
  border: 1px solid rgba(216, 181, 106, 0.36);
  color: var(--paper);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.15s;
}

.slot-notice-btn:hover:not(:disabled) {
  background: rgba(216, 181, 106, 0.2);
}

.slot-notice-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.slot-notice-dismiss {
  padding: 0 4px;
  background: transparent;
  border: none;
  color: rgba(216, 181, 106, 0.74);
  font-size: 14px;
  cursor: pointer;
  line-height: 1;
}

/* ===== Settings Sheet ===== */
.settings-sheet {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-row,
.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 46px;
  padding: 10px 12px;
  background:
    linear-gradient(180deg, rgba(244, 239, 228, 0.055), rgba(244, 239, 228, 0.026)),
    var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  color: var(--text-secondary);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
}

.setting-theme {
  gap: 12px;
}

.theme-switch {
  display: flex;
  align-items: center;
  gap: 6px;
}

.theme-option {
  min-width: 48px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(244, 239, 228, 0.035);
  color: var(--text-3);
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0;
  transition: all 0.16s ease;
}

.theme-option.active {
  color: var(--paper);
  border-color: rgba(216, 181, 106, 0.32);
  background: linear-gradient(180deg, rgba(216, 181, 106, 0.14), rgba(216, 181, 106, 0.08));
  box-shadow: 0 0 0 1px rgba(216, 181, 106, 0.06);
}

.theme-cycle {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: rgba(244, 239, 228, 0.035);
  color: var(--text-2);
  transition: all 0.16s ease;
}

.theme-cycle svg {
  width: 12px;
  height: 12px;
  fill: currentColor;
}

.theme-cycle:hover {
  color: var(--text-primary);
  border-color: rgba(216, 181, 106, 0.28);
}

.setting-item {
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
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0;
}

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .app-stage {
    align-items: flex-start;
    padding: 0;
    overflow: hidden;
  }

  .stage-area {
    margin-top: 38px;
  }

  .bottom-dock {
    padding-left: 12px;
    padding-right: 12px;
    border-radius: 20px 20px 0 0;
  }
}

@media (min-height: 900px) {
  .app-stage {
    align-items: flex-start;
    overflow: hidden;
    padding: 0;
  }
}
</style>
