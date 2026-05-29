/**
 * 结构化错误码和 AppError 类
 */

export enum ErrorCode {
  MODEL_TIMEOUT = 'MODEL_TIMEOUT',
  MODEL_UNAVAILABLE = 'MODEL_UNAVAILABLE',
  MODEL_BAD_JSON = 'MODEL_BAD_JSON',
  NO_CANDIDATES = 'NO_CANDIDATES',
  NO_PLAY_URL = 'NO_PLAY_URL',
  TTS_FAILED = 'TTS_FAILED',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  MISSING_PARAMS = 'MISSING_PARAMS',
  INTERNAL = 'INTERNAL',
}

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.MODEL_TIMEOUT]: 'DJ 暂时没接上，已切到本地编排模式',
  [ErrorCode.MODEL_UNAVAILABLE]: '模型服务暂不可用，已切到本地编排模式',
  [ErrorCode.MODEL_BAD_JSON]: 'DJ 返回格式异常，已重试',
  [ErrorCode.NO_CANDIDATES]: '当前条件没有匹配的歌曲',
  [ErrorCode.NO_PLAY_URL]: '这首歌暂时无法播放',
  [ErrorCode.TTS_FAILED]: '语音暂不可用，已显示文字',
  [ErrorCode.SESSION_NOT_FOUND]: '会话不存在',
  [ErrorCode.MISSING_PARAMS]: '缺少必要参数',
  [ErrorCode.INTERNAL]: '服务内部错误',
};

export class AppError extends Error {
  code: ErrorCode;
  httpStatus: number;
  detail?: string;

  constructor(code: ErrorCode, httpStatus?: number, detail?: string) {
    super(ERROR_MESSAGES[code] || '未知错误');
    this.code = code;
    this.httpStatus = httpStatus || codeToStatus(code);
    this.detail = detail;
  }
}

function codeToStatus(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.MISSING_PARAMS:
      return 400;
    case ErrorCode.SESSION_NOT_FOUND:
      return 404;
    case ErrorCode.MODEL_TIMEOUT:
    case ErrorCode.MODEL_UNAVAILABLE:
    case ErrorCode.MODEL_BAD_JSON:
      return 502;
    default:
      return 500;
  }
}

/**
 * 将未知错误包装为 AppError
 */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const message = err instanceof Error ? err.message : String(err);

  // 根据错误信息推断错误码
  if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
    return new AppError(ErrorCode.MODEL_TIMEOUT, 502, message);
  }
  if (message.includes('502') || message.includes('503') || message.includes('ECONNRESET')) {
    return new AppError(ErrorCode.MODEL_UNAVAILABLE, 502, message);
  }
  if (message.includes('JSON') || message.includes('SyntaxError')) {
    return new AppError(ErrorCode.MODEL_BAD_JSON, 502, message);
  }
  if (message.includes('没有候选歌曲') || message.includes('有效歌曲不足')) {
    return new AppError(ErrorCode.NO_CANDIDATES, 404, message);
  }
  if (message.includes('会话不存在')) {
    return new AppError(ErrorCode.SESSION_NOT_FOUND, 404, message);
  }

  return new AppError(ErrorCode.INTERNAL, 500, message);
}
