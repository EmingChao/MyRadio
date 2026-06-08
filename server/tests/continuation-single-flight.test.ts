import assert from 'node:assert/strict';
import { getOrCreateSessionContinuationTask } from '../src/services/session-continuation-task';

const tasks = new Map<number, Promise<string[]>>();
let runCount = 0;

async function main() {
  const first = getOrCreateSessionContinuationTask(tasks, 57, async () => {
    runCount++;
    return ['track-a'];
  });
  const second = getOrCreateSessionContinuationTask(tasks, 57, async () => {
    runCount++;
    return ['track-b'];
  });

  assert.equal(first.owner, true, '第一个续播请求应该拥有后台生成和广播权');
  assert.equal(second.owner, false, '同一 session 的重复续播请求只能复用已有任务');
  assert.equal(first.promise, second.promise, '重复请求必须等待同一个续播 Promise');
  assert.deepEqual(await second.promise, ['track-a'], '重复请求应拿到首个任务的结果');
  assert.equal(runCount, 1, '同一 session 同时只能实际执行一次续播生成');

  await Promise.resolve();
  assert.equal(tasks.has(57), false, '续播任务完成后应释放锁，允许下一轮续播');

  console.log('continuation single flight tests passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
