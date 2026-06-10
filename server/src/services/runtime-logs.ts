import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type RuntimeLogLevel = 'info' | 'success' | 'warn' | 'error';

export interface RuntimeLogInput {
  scope: string;
  level?: RuntimeLogLevel;
  title: string;
  message?: string;
  durationMs?: number;
  meta?: Record<string, any>;
  detail?: any;
}

export interface RuntimeLogEntry extends Required<Omit<RuntimeLogInput, 'durationMs' | 'meta' | 'detail'>> {
  id: string;
  sessionId: number;
  time: string;
  timestamp: number;
  durationMs?: number;
  meta?: Record<string, any>;
  detail?: any;
}

interface RuntimeLogReadOptions {
  since?: number;
  limit?: number;
}

type RuntimeLogBroadcaster = (sessionId: number, entry: RuntimeLogEntry) => void;

const RUNTIME_LOG_DIR = path.resolve(__dirname, '../../data/runtime-logs');
let broadcaster: RuntimeLogBroadcaster | null = null;

/**
 * 获取运行日志目录，供启动脚本和测试定位独立日志文件夹。
 */
export function getRuntimeLogDir(): string {
  return RUNTIME_LOG_DIR;
}

/**
 * 设置运行日志广播器，避免日志服务直接依赖具体 WebSocket 实例。
 */
export function setRuntimeLogBroadcaster(nextBroadcaster: RuntimeLogBroadcaster | null): void {
  broadcaster = nextBroadcaster;
}

/**
 * 追加一条当前 session 的结构化运行日志，并实时推送给订阅前端。
 */
export function appendRuntimeLog(sessionId: number, input: RuntimeLogInput): RuntimeLogEntry {
  ensureRuntimeLogDir();
  const entry = buildRuntimeLogEntry(sessionId, input);
  fs.appendFileSync(getSessionLogFile(sessionId), `${JSON.stringify(entry)}\n`, 'utf-8');
  broadcaster?.(sessionId, entry);
  return entry;
}

/**
 * 读取某个 session 的运行日志，可按前端打开面板的时间游标过滤。
 */
export function readRuntimeLogs(sessionId: number, options: RuntimeLogReadOptions = {}): RuntimeLogEntry[] {
  const filePath = getSessionLogFile(sessionId);
  if (!fs.existsSync(filePath)) return [];

  const since = Number(options.since || 0);
  const limit = Math.max(1, Math.min(500, Number(options.limit || 200)));
  const entries = fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(line => safeParseRuntimeLog(line))
    .filter((entry): entry is RuntimeLogEntry => Boolean(entry))
    .filter(entry => !since || entry.timestamp >= since);

  return entries.slice(-limit);
}

/**
 * 清理所有临时运行日志，通常在 start.sh 重新启动前执行。
 */
export function clearRuntimeLogs(): void {
  if (!fs.existsSync(RUNTIME_LOG_DIR)) return;
  for (const file of fs.readdirSync(RUNTIME_LOG_DIR)) {
    fs.rmSync(path.join(RUNTIME_LOG_DIR, file), { force: true, recursive: true });
  }
}

/**
 * 创建会话创建阶段使用的缓冲 logger，解决保存 session 前没有 sessionId 的问题。
 */
export function createBufferedRuntimeLogger() {
  const pending: RuntimeLogInput[] = [];
  let sessionId: number | null = null;

  /**
   * 记录一条日志；绑定 session 前先进入内存缓冲。
   */
  function log(input: RuntimeLogInput): void {
    if (sessionId) {
      appendRuntimeLog(sessionId, input);
      return;
    }
    pending.push(input);
  }

  return {
    /**
     * 绑定真实 sessionId，并把创建阶段的缓冲日志一次性落盘和推送。
     */
    bindSession(nextSessionId: number): void {
      sessionId = nextSessionId;
      for (const item of pending.splice(0)) {
        appendRuntimeLog(nextSessionId, item);
      }
    },

    /**
     * 记录普通信息日志。
     */
    info(scope: string, title: string, message = '', extra?: Pick<RuntimeLogInput, 'durationMs' | 'meta' | 'detail'>): void {
      log({ scope, level: 'info', title, message, ...extra });
    },

    /**
     * 记录成功结果日志。
     */
    success(scope: string, title: string, message = '', extra?: Pick<RuntimeLogInput, 'durationMs' | 'meta' | 'detail'>): void {
      log({ scope, level: 'success', title, message, ...extra });
    },

    /**
     * 记录可恢复的警告日志。
     */
    warn(scope: string, title: string, message = '', extra?: Pick<RuntimeLogInput, 'durationMs' | 'meta' | 'detail'>): void {
      log({ scope, level: 'warn', title, message, ...extra });
    },

    /**
     * 记录失败日志。
     */
    error(scope: string, title: string, message = '', extra?: Pick<RuntimeLogInput, 'durationMs' | 'meta' | 'detail'>): void {
      log({ scope, level: 'error', title, message, ...extra });
    },
  };
}

/**
 * 确保运行日志目录存在。
 */
function ensureRuntimeLogDir(): void {
  fs.mkdirSync(RUNTIME_LOG_DIR, { recursive: true });
}

/**
 * 获取某个 session 对应的 JSONL 文件路径。
 */
function getSessionLogFile(sessionId: number): string {
  return path.join(RUNTIME_LOG_DIR, `session-${Number(sessionId)}.jsonl`);
}

/**
 * 构建结构化日志实体，并裁剪可能过长或敏感的调试信息。
 */
function buildRuntimeLogEntry(sessionId: number, input: RuntimeLogInput): RuntimeLogEntry {
  const timestamp = Date.now();
  return {
    id: `${timestamp}-${crypto.randomUUID().slice(0, 8)}`,
    sessionId,
    time: new Date(timestamp).toISOString(),
    timestamp,
    scope: sanitizeText(input.scope, 32) || 'runtime',
    level: input.level || 'info',
    title: sanitizeText(input.title, 80) || '运行步骤',
    message: sanitizeText(input.message || '', 260),
    durationMs: Number.isFinite(input.durationMs) ? Math.max(0, Math.round(Number(input.durationMs))) : undefined,
    meta: sanitizeMeta(input.meta),
    detail: sanitizeDetail(input.detail),
  };
}

/**
 * 解析 JSONL 单行，坏行直接跳过，避免日志文件局部损坏影响页面。
 */
function safeParseRuntimeLog(line: string): RuntimeLogEntry | null {
  try {
    return JSON.parse(line) as RuntimeLogEntry;
  } catch {
    return null;
  }
}

/**
 * 清洗文本字段，防止敏感 token 或超长响应体进入运行日志。
 */
function sanitizeText(value: string, maxLength: number): string {
  const text = String(value || '')
    .replace(/api-key\s*[:=]\s*[^,\s}]+/gi, 'api-key=***')
    .replace(/cookie\s*[:=]\s*[^,\s}]+/gi, 'cookie=***')
    .replace(/data:audio\/[^;]+;base64,[a-z0-9+/=]+/gi, 'data:audio/***')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

/**
 * 清洗元信息对象，只保留少量可读摘要字段。
 */
function sanitizeMeta(meta?: Record<string, any>): Record<string, any> | undefined {
  if (!meta) return undefined;
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(meta).slice(0, 12)) {
    if (/key|token|cookie|authorization|audio|base64/i.test(key)) continue;
    if (typeof value === 'string') cleaned[key] = sanitizeText(value, 120);
    else if (typeof value === 'number' || typeof value === 'boolean') cleaned[key] = value;
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

/**
 * 清洗详情对象，保留请求/响应的可读内容，同时递归隐藏敏感字段。
 */
function sanitizeDetail(value: any, depth = 0): any {
  if (value === undefined || value === null) return undefined;
  if (depth > 6) return '[已截断过深详情]';
  if (typeof value === 'string') return sanitizeDetailText(value, 16000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 80).map(item => sanitizeDetail(item, depth + 1));
  if (typeof value !== 'object') return String(value);

  const cleaned: Record<string, any> = {};
  for (const [key, item] of Object.entries(value).slice(0, 80)) {
    if (isSensitiveDetailKey(key)) {
      cleaned[key] = '[已隐藏敏感内容]';
      continue;
    }
    cleaned[key] = sanitizeDetail(item, depth + 1);
  }
  return cleaned;
}

/**
 * 判断详情字段名是否可能包含密钥、Cookie、认证头或音频 base64。
 */
function isSensitiveDetailKey(key: string): boolean {
  return /api[-_]?key|(?:^|[_-])token(?:$|[_-])|accessToken|cookie|authorization|secret|password|base64/i.test(key);
}

/**
 * 清洗详情文本，长 prompt 可保留较多内容，但仍隐藏敏感片段和 data URL。
 */
function sanitizeDetailText(value: string, maxLength: number): string {
  const text = sanitizeText(value, maxLength)
    .replace(/Bearer\s+[a-z0-9._-]+/gi, 'Bearer ***')
    .replace(/MUSIC_U=[^;\s]+/gi, 'MUSIC_U=***')
    .replace(/data:audio\/[^;]+;base64,[a-z0-9+/=]+/gi, '[已隐藏音频 base64]');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}
