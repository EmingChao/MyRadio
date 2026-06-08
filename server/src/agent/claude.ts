import Anthropic from '@anthropic-ai/sdk';

// 支持小米 MiMo 代理或标准 Anthropic API
const client = new Anthropic({
  baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || undefined,
  timeout: 30_000, // 30 秒超时（单次调用）
});

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

interface ClaudeCallOptions {
  maxTokens?: number;
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * 判断 Claude/MiMo 代理错误是否适合在客户端层自动重试。
 */
export function isClaudeRetryableError(err: any): boolean {
  const status = err?.status || err?.statusCode;
  const message = String(err?.message || '').toLowerCase();

  return status === 502 || status === 503 || status === 429
    || err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT'
    || message.includes('timeout') || message.includes('timed out');
}

/**
 * 从 Claude/MiMo 返回内容中提取可解析文本，跳过 thinking 块。
 */
export function extractClaudeText(content: any[]): string {
  return (content || [])
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
    .trim();
}

/**
 * 调用 Claude API，返回结构化 JSON（含重试逻辑）
 */
export async function callClaude(systemPrompt: string, userMessage: string, options: ClaudeCallOptions = {}): Promise<any> {
  let lastError: Error | null = null;
  const start = Date.now();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: options.maxTokens || 2400,
        thinking: { type: 'disabled' },
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const elapsed = Date.now() - start;
      const text = extractClaudeText(response.content as any[]);

      // 尝试提取 JSON（兼容 markdown 代码块包裹）
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
      const jsonStr = jsonMatch[1].trim();

      console.log(`[Claude] 调用成功，耗时 ${elapsed}ms，第 ${attempt} 次`);
      return JSON.parse(jsonStr);
    } catch (err: any) {
      lastError = err;
      const isRetryable = isClaudeRetryableError(err);

      console.error(`[Claude] 第 ${attempt} 次调用失败 (${Date.now() - start}ms): ${err.message}${isRetryable ? ' 可重试' : ' 不可重试'}`);

      if (!isRetryable || attempt >= MAX_RETRIES) break;
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError || new Error('Claude API 调用失败');
}

export default client;
