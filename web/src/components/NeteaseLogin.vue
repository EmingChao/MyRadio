<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { getNeteaseLoginStatus, createNeteaseQr, checkNeteaseQr, fetchNeteaseUrls } from '../api'
import { usePlayerStore } from '../stores/player'

const store = usePlayerStore()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'login-success'): void
}>()

// 登录状态
const loggedIn = ref(false)
const nickname = ref('')
const avatarUrl = ref('')

// 二维码状态
const qrimg = ref('')
const qrKey = ref('')
const qrStatus = ref<'idle' | 'loading' | 'waiting' | 'scanned' | 'success' | 'expired' | 'error'>('idle')
const statusText = ref('')
const fetchingUrls = ref(false)

let pollTimer: ReturnType<typeof setInterval> | null = null

// 检查当前登录状态
onMounted(async () => {
  try {
    const res = await getNeteaseLoginStatus()
    if (res.code === 0 && res.data.loggedIn) {
      loggedIn.value = true
      nickname.value = res.data.nickname
      avatarUrl.value = res.data.avatarUrl
    }
  } catch {
    // 静默
  }
})

onUnmounted(() => {
  stopPolling()
})

// 生成二维码
async function handleGenerateQr() {
  qrStatus.value = 'loading'
  statusText.value = '生成二维码中...'

  try {
    const res = await createNeteaseQr()
    if (res.code === 0) {
      qrimg.value = res.data.qrimg
      qrKey.value = res.data.key
      qrStatus.value = 'waiting'
      statusText.value = '请使用网易云音乐 APP 扫码登录'
      startPolling()
    } else {
      qrStatus.value = 'error'
      statusText.value = res.message || '生成失败'
    }
  } catch (e: any) {
    qrStatus.value = 'error'
    statusText.value = '网络错误: ' + e.message
  }
}

// 轮询扫码状态
function startPolling() {
  stopPolling()
  pollTimer = setInterval(async () => {
    if (!qrKey.value) return

    try {
      const res = await checkNeteaseQr(qrKey.value)
      if (res.code !== 0) return

      const status = res.data.status

      if (status === 800) {
        // 已过期
        qrStatus.value = 'expired'
        statusText.value = '二维码已过期，点击重新生成'
        stopPolling()
      } else if (status === 801) {
        // 等待扫码
        qrStatus.value = 'waiting'
        statusText.value = '请使用网易云音乐 APP 扫码登录'
      } else if (status === 802) {
        // 已扫码，待确认
        qrStatus.value = 'scanned'
        statusText.value = '已扫码，请在手机上确认登录'
      } else if (status === 803) {
        // 登录成功
        qrStatus.value = 'success'
        statusText.value = '登录成功！'
        stopPolling()
        loggedIn.value = true
        // 获取用户信息
        const statusRes = await getNeteaseLoginStatus()
        if (statusRes.code === 0 && statusRes.data.loggedIn) {
          nickname.value = statusRes.data.nickname
          avatarUrl.value = statusRes.data.avatarUrl
        }
        emit('login-success')
      }
    } catch {
      // 网络错误，继续轮询
    }
  }, 2000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// 获取播放地址
async function handleFetchUrls() {
  fetchingUrls.value = true
  statusText.value = '正在后台获取播放地址...'
  try {
    await fetchNeteaseUrls()
    // 后台获取需要一定时间，等待后刷新
    let attempts = 0
    const poll = setInterval(async () => {
      attempts++
      await store.refreshTracks()
      if (store.currentTrack?.playUrl || attempts >= 20) {
        clearInterval(poll)
        statusText.value = attempts >= 20 ? '获取完成，请重新播放' : '播放地址已更新！'
        fetchingUrls.value = false
      }
    }, 2000)
  } catch (e: any) {
    statusText.value = '获取失败: ' + e.message
    fetchingUrls.value = false
  }
}
</script>

<template>
  <div class="login-overlay" @click.self="emit('close')">
    <div class="login-modal">
      <div class="modal-header">
        <span class="modal-label">NETEASE</span>
        <span class="modal-title">网易云音乐登录</span>
        <button class="close-btn" @click="emit('close')">×</button>
      </div>

      <div class="modal-body">
        <!-- 已登录状态 -->
        <div v-if="loggedIn" class="logged-in">
          <div class="user-info">
            <img v-if="avatarUrl" :src="avatarUrl" class="avatar" />
            <div class="user-name">{{ nickname }}</div>
            <div class="user-status">已登录</div>
          </div>
          <button class="action-btn" :disabled="fetchingUrls" @click="handleFetchUrls">
            {{ fetchingUrls ? '获取中...' : '重新获取播放地址' }}
          </button>
          <div v-if="statusText" class="status success">{{ statusText }}</div>
          <p class="hint">VIP 歌曲需要重新获取完整播放地址</p>
        </div>

        <!-- 未登录状态 -->
        <div v-else class="login-content">
          <!-- 二维码区域 -->
          <div class="qr-area">
            <div v-if="qrStatus === 'idle'" class="qr-placeholder" @click="handleGenerateQr">
              <div class="qr-icon">[ ]</div>
              <p>点击生成登录二维码</p>
            </div>

            <div v-else-if="qrStatus === 'loading'" class="qr-placeholder">
              <div class="qr-icon">...</div>
              <p>生成中...</p>
            </div>

            <div v-else class="qr-container">
              <img :src="qrimg" class="qr-img" :class="{ expired: qrStatus === 'expired' }" />
              <button v-if="qrStatus === 'expired'" class="refresh-btn" @click="handleGenerateQr">
                重新生成
              </button>
            </div>
          </div>

          <!-- 状态文字 -->
          <div class="status" :class="qrStatus">
            {{ statusText }}
          </div>

          <p class="hint">使用网易云音乐 APP 扫码，登录后可获取 VIP 完整播放地址</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.login-modal {
  width: 360px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
}

.modal-label {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--red);
  letter-spacing: 1px;
  padding: 1px 4px;
  border: 1px solid var(--red-dim);
}

.modal-title {
  font-family: var(--font-pixel);
  font-size: 16px;
  color: var(--text-primary);
  flex: 1;
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
}

.close-btn:hover {
  color: var(--text-primary);
}

.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

/* 二维码区域 */
.qr-area {
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.qr-placeholder {
  width: 200px;
  height: 200px;
  border: 1px dashed var(--border-light);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  cursor: pointer;
  transition: border-color 0.15s;
}

.qr-placeholder:hover {
  border-color: var(--accent-dim);
}

.qr-placeholder .qr-icon {
  font-family: var(--font-mono);
  font-size: 32px;
  color: var(--text-muted);
}

.qr-placeholder p {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  margin: 0;
}

.qr-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.qr-img {
  width: 200px;
  height: 200px;
  image-rendering: pixelated;
}

.qr-img.expired {
  opacity: 0.3;
}

.refresh-btn {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 6px 16px;
  background: var(--accent-glow);
  border: 1px solid var(--accent-dim);
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 11px;
  cursor: pointer;
}

/* 状态文字 */
.status {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 1px;
  text-align: center;
}

.status.waiting { color: var(--text-secondary); }
.status.scanned { color: var(--warm); }
.status.success { color: var(--accent); }
.status.expired { color: var(--red-dim); }
.status.error { color: var(--red); }

/* 已登录 */
.logged-in {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.user-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1px solid var(--border);
}

.user-name {
  font-family: var(--font-pixel);
  font-size: 18px;
  color: var(--text-primary);
}

.user-status {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--accent);
  letter-spacing: 1px;
}

.action-btn {
  width: 100%;
  padding: 8px;
  background: var(--accent-glow);
  border: 1px solid var(--accent-dim);
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover:not(:disabled) {
  background: rgba(74, 222, 128, 0.25);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hint {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  text-align: center;
  margin: 0;
  line-height: 1.4;
}
</style>
