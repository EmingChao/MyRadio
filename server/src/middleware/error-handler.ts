import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../utils/errors';

/**
 * Express 统一错误处理中间件
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.httpStatus).json({
      code: err.code,
      message: err.message,
      detail: err.detail,
    });
    return;
  }

  // 未知错误
  console.error('[ErrorHandler] 未捕获错误:', err);
  res.status(500).json({
    code: ErrorCode.INTERNAL,
    message: '服务内部错误',
    detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
}
