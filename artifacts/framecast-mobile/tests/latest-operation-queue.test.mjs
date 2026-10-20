import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LatestOperationQueue, SupersededOperationError } from '../lib/latest-operation-queue.ts';

test('serializes video-server operations and skips an older queued selection', async () => {
  const queue = new LatestOperationQueue();
  let markStarted;
  let releaseFirst;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const released = new Promise((resolve) => { releaseFirst = resolve; });
  const firstVersion = queue.issue();
  const first = queue.run(firstVersion, async () => {
    markStarted();
    await released;
    if (!queue.isCurrent(firstVersion)) throw new SupersededOperationError();
    return 'old video';
  });
  await started;

  const secondVersion = queue.issue();
  let secondStarted = false;
  const second = queue.run(secondVersion, async () => {
    secondStarted = true;
    return 'latest video';
  });

  releaseFirst();
  await assert.rejects(first, SupersededOperationError);
  assert.equal(await second, 'latest video');
  assert.equal(secondStarted, true);
});

test('a stop request superseded by a new selection does not stop the new server', async () => {
  const queue = new LatestOperationQueue();
  const stopVersion = queue.issue();
  const stop = queue.run(stopVersion, async () => 'stopped');
  const startVersion = queue.issue();
  const start = queue.run(startVersion, async () => 'started');

  await assert.rejects(stop, SupersededOperationError);
  assert.equal(await start, 'started');
});
