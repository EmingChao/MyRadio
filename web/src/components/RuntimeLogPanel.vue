<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRuntimeLogsStore, type RuntimeLogEntry } from '../stores/runtime-logs';

const store = useRuntimeLogsStore();
const listRef = ref<HTMLElement | null>(null);
const expandedLogId = ref<string | null>(null);
const autoFollow = ref(true);
const unseenCount = ref(0);

const statusText = computed(() => {
  if (!store.activeSessionId) return '还没有当前 session';
  if (store.loading) return '正在读取日志';
  if (!store.hasLogs) return '等待新的运行步骤';
  return `当前显示 ${store.logs.length} 条`;
});

/**
 * 根据日志级别返回中文标签。
 */
function levelLabel(level: RuntimeLogEntry['level']): string {
  if (level === 'success') return '完成';
  if (level === 'warn') return '注意';
  if (level === 'error') return '失败';
  return '进行中';
}

/**
 * 将 ISO 时间转成面板里的短时间。
 */
function formatTime(time: string): string {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * 格式化耗时，避免直接展示毫秒大数字。
 */
function formatDuration(durationMs?: number): string {
  if (!durationMs) return '';
  if (durationMs >= 1000) return `${(durationMs / 1000).toFixed(1)}s`;
  return `${durationMs}ms`;
}

/**
 * 手动清空当前面板展示，并从此刻重新观察。
 */
function handleReset() {
  store.resetForSession(store.activeSessionId);
  expandedLogId.value = null;
  unseenCount.value = 0;
  autoFollow.value = true;
}

/**
 * 展开或收起某条运行日志的详情。
 */
function toggleDetail(item: RuntimeLogEntry) {
  if (!item.detail) return;
  expandedLogId.value = expandedLogId.value === item.id ? null : item.id;
}

/**
 * 将详情对象格式化成便于排查的 JSON。
 */
function formatDetail(detail: any): string {
  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}

/**
 * 判断当前滚动位置是否接近日志底部。
 */
function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 56;
}

/**
 * 用户滚动时更新是否自动跟随新日志。
 */
function handleScroll() {
  const element = listRef.value;
  if (!element) return;
  autoFollow.value = isNearBottom(element);
  if (autoFollow.value) {
    unseenCount.value = 0;
  }
}

/**
 * 跳回最新日志。
 */
async function jumpToLatest() {
  autoFollow.value = true;
  unseenCount.value = 0;
  await nextTick();
  listRef.value?.scrollTo({ top: listRef.value.scrollHeight, behavior: 'smooth' });
}

watch(() => store.logs.length, async () => {
  await nextTick();
  if (autoFollow.value) {
    listRef.value?.scrollTo({ top: listRef.value.scrollHeight, behavior: 'smooth' });
  } else {
    unseenCount.value += 1;
  }
});
</script>

<template>
  <div class="runtime-log-panel">
    <div class="runtime-log-toolbar">
      <div>
        <span class="runtime-log-kicker">SESSION {{ store.activeSessionId || '-' }}</span>
        <strong class="runtime-log-title">{{ statusText }}</strong>
      </div>
      <button class="runtime-log-reset" @click="handleReset">从现在看</button>
    </div>

    <div ref="listRef" class="runtime-log-list" @scroll="handleScroll">
      <div v-if="!store.hasLogs" class="runtime-log-empty">
        当前 session 还没有可展示的运行步骤；新的编排、续播和 TTS 步骤会实时出现在这里。
      </div>

      <article
        v-for="item in store.logs"
        :key="item.id"
        class="runtime-log-item"
        :class="[`runtime-log-${item.level}`, { 'runtime-log-clickable': item.detail }]"
        @click="toggleDetail(item)"
      >
        <div class="runtime-log-dot" />
        <div class="runtime-log-content">
          <div class="runtime-log-head">
            <span class="runtime-log-time">{{ formatTime(item.time) }}</span>
            <span class="runtime-log-scope">{{ item.scope }}</span>
            <span class="runtime-log-level">{{ levelLabel(item.level) }}</span>
            <span v-if="item.durationMs" class="runtime-log-duration">{{ formatDuration(item.durationMs) }}</span>
          </div>
          <div class="runtime-log-name">{{ item.title }}</div>
          <p v-if="item.message" class="runtime-log-message">{{ item.message }}</p>
          <button v-if="item.detail" class="runtime-log-detail-toggle" type="button">
            {{ expandedLogId === item.id ? '收起详情' : '查看详情' }}
          </button>
          <pre v-if="item.detail && expandedLogId === item.id" class="runtime-log-detail">{{ formatDetail(item.detail) }}</pre>
        </div>
      </article>
    </div>

    <button v-if="unseenCount > 0" class="runtime-log-new" @click="jumpToLatest">
      {{ unseenCount }} 条新日志，跳到最新
    </button>
  </div>
</template>

<style scoped>
.runtime-log-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 420px;
}

.runtime-log-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: rgba(244, 239, 228, 0.04);
  border: 1px solid var(--line);
  border-radius: 12px;
}

.runtime-log-kicker {
  display: block;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
  letter-spacing: 0.6px;
}

.runtime-log-title {
  display: block;
  margin-top: 3px;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--text-primary);
}

.runtime-log-reset {
  flex-shrink: 0;
  padding: 7px 10px;
  background: rgba(56, 217, 120, 0.08);
  border: 1px solid rgba(56, 217, 120, 0.2);
  border-radius: 9px;
  color: var(--signal);
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.runtime-log-list {
  position: relative;
  flex: 1;
  max-height: min(58vh, 560px);
  overflow-y: auto;
  padding: 2px 2px 8px 10px;
}

.runtime-log-new {
  align-self: center;
  margin-top: -4px;
  padding: 7px 12px;
  background: rgba(56, 217, 120, 0.1);
  border: 1px solid rgba(56, 217, 120, 0.22);
  border-radius: 999px;
  color: var(--signal);
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
}

.runtime-log-empty {
  padding: 28px 14px;
  color: var(--text-3);
  font-size: 13px;
  line-height: 1.6;
  text-align: center;
}

.runtime-log-item {
  position: relative;
  display: flex;
  gap: 10px;
  padding: 0 0 13px;
}

.runtime-log-item::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 14px;
  bottom: -1px;
  width: 1px;
  background: rgba(244, 239, 228, 0.08);
}

.runtime-log-dot {
  width: 11px;
  height: 11px;
  margin-top: 7px;
  border-radius: 999px;
  background: rgba(241, 233, 216, 0.24);
  box-shadow: 0 0 0 4px rgba(241, 233, 216, 0.035);
  flex-shrink: 0;
}

.runtime-log-success .runtime-log-dot {
  background: var(--signal);
  box-shadow: 0 0 0 4px rgba(56, 217, 120, 0.08);
}

.runtime-log-warn .runtime-log-dot {
  background: var(--warm);
  box-shadow: 0 0 0 4px rgba(216, 181, 106, 0.09);
}

.runtime-log-error .runtime-log-dot {
  background: #ff6b6b;
  box-shadow: 0 0 0 4px rgba(255, 107, 107, 0.1);
}

.runtime-log-content {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  background: rgba(244, 239, 228, 0.035);
  border: 1px solid rgba(244, 239, 228, 0.055);
  border-radius: 10px;
}

.runtime-log-clickable .runtime-log-content {
  cursor: pointer;
}

.runtime-log-head {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  margin-bottom: 5px;
}

.runtime-log-time,
.runtime-log-scope,
.runtime-log-level,
.runtime-log-duration {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-3);
}

.runtime-log-level {
  color: var(--text-secondary);
}

.runtime-log-duration {
  margin-left: auto;
  color: var(--warm);
}

.runtime-log-name {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.35;
}

.runtime-log-message {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.runtime-log-detail-toggle {
  margin-top: 8px;
  padding: 5px 8px;
  background: rgba(216, 181, 106, 0.08);
  border: 1px solid rgba(216, 181, 106, 0.16);
  border-radius: 8px;
  color: var(--warm);
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.runtime-log-detail {
  max-height: 260px;
  overflow: auto;
  margin: 8px 0 0;
  padding: 9px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(244, 239, 228, 0.07);
  border-radius: 9px;
  color: rgba(241, 233, 216, 0.78);
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
