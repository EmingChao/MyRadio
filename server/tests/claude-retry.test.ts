import assert from 'node:assert/strict';
import { extractClaudeText, isClaudeRetryableError } from '../src/agent/claude';

assert.equal(
  isClaudeRetryableError(new Error('Request timed out.')),
  true,
  '模型请求 timed out 文案需要被识别为可重试错误',
);

assert.equal(
  isClaudeRetryableError({ status: 503, message: 'Service unavailable' }),
  true,
  '上游 503 需要被识别为可重试错误',
);

assert.equal(
  isClaudeRetryableError(new SyntaxError('Unexpected token')),
  false,
  'JSON 解析错误不应在 Claude 客户端层重试，业务层会单独处理',
);

assert.equal(
  extractClaudeText([
    { type: 'thinking', thinking: '内部思考不应参与 JSON 解析' },
    { type: 'text', text: '{"ok":true}' },
  ]),
  '{"ok":true}',
  'Claude/MiMo 返回 thinking + text 时需要提取真正的 text 内容',
);

console.log('claude retry tests passed');
