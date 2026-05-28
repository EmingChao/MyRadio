import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

/**
 * WebSocket 事件类型
 */
export type WsEvent =
  | { type: 'TRACK_CHANGED'; data: { sessionId: number; currentIndex: number; track: any } }
  | { type: 'QUEUE_UPDATED'; data: { sessionId: number; tracks: any[] } }
  | { type: 'DJ_CHAT'; data: { sessionId: number; reply: string; intent: string } }
  | { type: 'PLAYBACK_REPORT'; data: { sessionId: number; trackId: number; action: string } }
  | { type: 'TTS_READY'; data: { sessionId: number; ttsItems: Array<{ text: string; hash: string; audioUrl: string }> } };

/**
 * WebSocket 连接管理器
 */
class WsManager {
  private wss: WebSocketServer | null = null;
  // sessionId -> Set<WebSocket>
  private sessionClients = new Map<number, Set<WebSocket>>();

  /**
   * 初始化 WebSocket 服务
   */
  init(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws) => {
      console.log('WebSocket 客户端已连接');

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'SUBSCRIBE' && msg.sessionId) {
            this.subscribe(ws, msg.sessionId);
          }
        } catch {
          // 忽略无效消息
        }
      });

      ws.on('close', () => {
        this.unsubscribeAll(ws);
      });

      ws.on('error', () => {
        this.unsubscribeAll(ws);
      });
    });

    console.log('WebSocket 服务已启动: /ws');
  }

  /**
   * 客户端订阅某个会话的事件
   */
  private subscribe(ws: WebSocket, sessionId: number) {
    if (!this.sessionClients.has(sessionId)) {
      this.sessionClients.set(sessionId, new Set());
    }
    this.sessionClients.get(sessionId)!.add(ws);
    console.log(`客户端订阅会话 #${sessionId}，当前 ${this.sessionClients.get(sessionId)!.size} 个连接`);
  }

  /**
   * 取消客户端的所有订阅
   */
  private unsubscribeAll(ws: WebSocket) {
    for (const [sessionId, clients] of this.sessionClients) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.sessionClients.delete(sessionId);
      }
    }
  }

  /**
   * 向订阅了指定会话的所有客户端广播事件
   */
  broadcast(sessionId: number, event: WsEvent) {
    const clients = this.sessionClients.get(sessionId);
    if (!clients || clients.size === 0) return;

    const message = JSON.stringify(event);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }
}

export const wsManager = new WsManager();
