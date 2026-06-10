import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { getSessionRuntimeLogs } from '../api';

export interface RuntimeLogEntry {
  id: string;
  sessionId: number;
  time: string;
  timestamp: number;
  scope: string;
  level: 'info' | 'success' | 'warn' | 'error';
  title: string;
  message: string;
  durationMs?: number;
  meta?: Record<string, any>;
  detail?: any;
}

export const useRuntimeLogsStore = defineStore('runtime-logs', () => {
  const visible = ref(false);
  const activeSessionId = ref<number | null>(null);
  const openedAt = ref<number>(Date.now());
  const logs = ref<RuntimeLogEntry[]>([]);
  const loading = ref(false);

  const hasLogs = computed(() => logs.value.length > 0);

  /**
   * 打开运行日志面板，并读取当前 session 已有的轻量步骤日志。
   */
  async function open(sessionId: number | null | undefined) {
    visible.value = true;
    logs.value = [];
    openedAt.value = 0;
    activeSessionId.value = sessionId || null;
    if (sessionId) {
      await fetchLogs();
    }
  }

  /**
   * 关闭运行日志面板。
   */
  function close() {
    visible.value = false;
  }

  /**
   * 当前 session 变化时清理旧展示，避免刷新电台后混入上一组日志。
   */
  function resetForSession(sessionId: number | null | undefined) {
    activeSessionId.value = sessionId || null;
    logs.value = [];
    openedAt.value = 0;
  }

  /**
   * 从后端拉取打开面板之后产生的日志。
   */
  async function fetchLogs() {
    if (!activeSessionId.value) return;
    loading.value = true;
    try {
      const res = await getSessionRuntimeLogs(activeSessionId.value, openedAt.value);
      if (res.code === 0 && Array.isArray(res.data?.logs)) {
        mergeLogs(res.data.logs);
      }
    } finally {
      loading.value = false;
    }
  }

  /**
   * 接收 WebSocket 推送的运行日志。
   */
  function appendFromWs(sessionId: number, entry: RuntimeLogEntry) {
    if (!visible.value) return;
    if (!activeSessionId.value || activeSessionId.value !== sessionId) return;
    if (openedAt.value && entry.timestamp < openedAt.value) return;
    mergeLogs([entry]);
  }

  /**
   * 合并日志并按时间排序，避免接口补拉和 WebSocket 推送重复。
   */
  function mergeLogs(nextLogs: RuntimeLogEntry[]) {
    const map = new Map(logs.value.map(item => [item.id, item]));
    for (const item of nextLogs) {
      map.set(item.id, item);
    }
    logs.value = Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp).slice(-240);
  }

  return {
    visible,
    activeSessionId,
    openedAt,
    logs,
    loading,
    hasLogs,
    open,
    close,
    resetForSession,
    fetchLogs,
    appendFromWs,
  };
});
