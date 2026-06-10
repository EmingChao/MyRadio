import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  appendRuntimeLog,
  clearRuntimeLogs,
  createBufferedRuntimeLogger,
  getRuntimeLogDir,
  readRuntimeLogs,
  setRuntimeLogBroadcaster,
} from '../src/services/runtime-logs';

const logDir = getRuntimeLogDir();
clearRuntimeLogs();

const pushed: any[] = [];
setRuntimeLogBroadcaster((sessionId, entry) => {
  pushed.push({ sessionId, entry });
});

const first = appendRuntimeLog(101, {
  scope: 'radio',
  level: 'info',
  title: '开始创建电台',
  message: '准备召回曲库和构建上下文',
});
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
const since = Date.now();
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
const second = appendRuntimeLog(101, {
  scope: 'tts',
  level: 'success',
  title: 'Mimo TTS 完成',
  message: '第 1 段语音已生成',
  durationMs: 830,
  detail: {
    request: {
      maxTokens: 1200,
      headers: { 'api-key': 'secret-key' },
      audio: { voice: 'data:audio/mpeg;base64,abcdefg' },
      messages: [{ role: 'assistant', content: '准备朗读的 DJ 文案' }],
    },
    response: { status: 200, audioLength: 123456 },
    cookie: 'MUSIC_U=secret-cookie',
  },
});

assert.ok(fs.existsSync(path.join(logDir, 'session-101.jsonl')), '运行日志需要写入单独 session 文件');
assert.equal(readRuntimeLogs(101).length, 2, '需要能读取当前 session 的全部运行日志');
assert.deepEqual(readRuntimeLogs(101, { since }).map(item => item.id), [second.id], '需要支持从打开面板时间之后读取日志');
assert.equal(pushed.length, 2, '追加日志时需要实时广播给前端');
assert.equal(pushed[0].entry.title, first.title, '广播内容需要包含可读标题');
const detailLog = readRuntimeLogs(101).find(item => item.id === second.id);
assert.match(JSON.stringify(detailLog?.detail), /准备朗读的 DJ 文案/, '运行日志详情需要保留可读请求内容');
assert.match(JSON.stringify(detailLog?.detail), /1200/, 'maxTokens 是普通请求参数，不能被误判为敏感 token');
assert.doesNotMatch(JSON.stringify(detailLog?.detail), /secret-key|secret-cookie|abcdefg/, '运行日志详情不能泄露密钥、cookie 或音频 base64');
assert.match(JSON.stringify(detailLog?.detail), /已隐藏/, '敏感字段需要显示为已隐藏，方便理解为什么看不到完整内容');

const buffered = createBufferedRuntimeLogger();
buffered.info('radio', '上下文构建完成', '天气和时间已进入召回条件', { durationMs: 12 });
buffered.warn('claude', 'AI 编排降级', 'Claude 超时，进入本地编排');
assert.equal(readRuntimeLogs(202).length, 0, '缓冲日志绑定 session 前不能写入错误文件');
buffered.bindSession(202);
assert.equal(readRuntimeLogs(202).length, 2, '缓冲日志绑定 session 后需要一次性落盘');
assert.match(readRuntimeLogs(202)[1].message, /Claude 超时/, '缓冲日志需要保留失败原因');

clearRuntimeLogs();
assert.equal(readRuntimeLogs(101).length, 0, '清理运行日志后旧 session 日志应为空');
assert.equal(readRuntimeLogs(202).length, 0, '清理运行日志需要删除所有 session 日志');

console.log('runtime logs tests passed');
