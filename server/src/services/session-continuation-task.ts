export interface SessionContinuationTask<T> {
  promise: Promise<T>;
  owner: boolean;
}

/**
 * 获取或创建某个 session 的续播任务。
 * 同一 session 同时只允许一个真实续播生成，后来的请求复用同一个 Promise。
 */
export function getOrCreateSessionContinuationTask<T>(
  tasks: Map<number, Promise<T>>,
  sessionId: number,
  factory: () => Promise<T>,
): SessionContinuationTask<T> {
  const existing = tasks.get(sessionId);
  if (existing) {
    return { promise: existing, owner: false };
  }

  const promise = factory().finally(() => {
    if (tasks.get(sessionId) === promise) {
      tasks.delete(sessionId);
    }
  });
  tasks.set(sessionId, promise);
  return { promise, owner: true };
}
