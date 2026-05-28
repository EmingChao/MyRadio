import { ref, onUnmounted } from 'vue';

export type WsEventType = 'TRACK_CHANGED' | 'QUEUE_UPDATED' | 'DJ_CHAT' | 'PLAYBACK_REPORT' | 'TTS_READY';

export interface WsEvent {
  type: WsEventType;
  data: any;
}

type EventHandler = (event: WsEvent) => void;

/**
 * WebSocket 连接管理 composable
 * 自动连接、重连、按 sessionId 订阅事件
 */
export function useWebSocket() {
  const connected = ref(false);
  const handlers = new Map<WsEventHandlerId, EventHandler>();
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let subscribedSessionId: number | null = null;
  let handlerId = 0;

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws`;

    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      connected.value = true;
      console.log('WebSocket 已连接');
      // 重新订阅
      if (subscribedSessionId !== null) {
        subscribe(subscribedSessionId);
      }
    };

    ws.onmessage = (event) => {
      try {
        const data: WsEvent = JSON.parse(event.data);
        for (const handler of handlers.values()) {
          handler(data);
        }
      } catch {
        // 忽略无效消息
      }
    };

    ws.onclose = () => {
      connected.value = false;
      ws = null;
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 3000);
  }

  function subscribe(sessionId: number) {
    subscribedSessionId = sessionId;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'SUBSCRIBE', sessionId }));
    }
  }

  function onEvent(handler: EventHandler): number {
    const id = ++handlerId;
    handlers.set(id, handler);
    return id;
  }

  function offEvent(id: number) {
    handlers.delete(id);
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    connected.value = false;
  }

  // 自动连接
  connect();

  // 组件卸载时清理（但不断开连接，由调用方控制）
  onUnmounted(() => {
    // 不自动断开，因为多个组件可能共用
  });

  return {
    connected,
    subscribe,
    onEvent,
    offEvent,
    disconnect,
  };
}

type WsEventHandlerId = number;
