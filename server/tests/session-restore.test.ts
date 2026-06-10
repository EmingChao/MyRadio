import assert from 'node:assert/strict';
import { formatSqliteLocalDateTime, shouldRestoreSessionCreatedInCurrentBoot } from '../src/stores/session';

const bootTime = '2026-06-09 20:30:00';

assert.equal(
  shouldRestoreSessionCreatedInCurrentBoot('2026-06-09 20:29:59', bootTime),
  false,
  '服务重启前创建的旧 session 不应该被 /api/radio/now 自动恢复',
);

assert.equal(
  shouldRestoreSessionCreatedInCurrentBoot('2026-06-09 20:30:00', bootTime),
  true,
  '服务启动同一秒内创建的新 session 可以恢复，避免刚创建后刷新页面丢失',
);

assert.equal(
  shouldRestoreSessionCreatedInCurrentBoot('2026-06-09 20:31:00', bootTime),
  true,
  '服务启动后创建的 session 应该支持页面刷新恢复',
);

assert.equal(
  formatSqliteLocalDateTime(new Date(2026, 5, 9, 8, 7, 6)),
  '2026-06-09 08:07:06',
  '服务启动时间需要使用 SQLite datetime(localtime) 同款格式，才能和 create_time 稳定比较',
);

console.log('session restore tests passed');
