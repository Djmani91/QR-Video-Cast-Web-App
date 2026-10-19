import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAutoFullscreen } from '../src/lib/auto-fullscreen.ts';

function fixture() {
  const timers = new Map();
  let id = 0, requests = 0, ready = true, succeeds = true;
  const results = [];
  const fullscreen = createAutoFullscreen({
    setTimeout(fn, delay) { timers.set(++id, { fn, delay }); return id; },
    clearTimeout(handle) { timers.delete(handle); },
  });
  const options = {
    ready: () => ready,
    request: async () => { requests++; return succeeds; },
    onResult: value => results.push(value),
  };
  return { fullscreen, options, timers, results, requests: () => requests,
    ready: value => { ready = value; }, succeeds: value => { succeeds = value; },
    async fire() {
      const [key, timer] = timers.entries().next().value;
      timers.delete(key);
      timer.fn();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

test('unready video does not consume the fullscreen attempt before decoded frames exist', async () => {
  const f = fixture();
  f.ready(false);
  for (let i = 0; i < 4; i++) await f.fullscreen.start('live-video', f.options);
  assert.equal(f.requests(), 0);
  f.ready(true);
  await f.fullscreen.start('live-video', f.options);
  assert.equal(f.requests(), 1);
  assert.deepEqual(f.results, [true]);
});

test('a failed early request retries after decoder/native-player startup instead of being marked complete', async () => {
  const f = fixture();
  f.succeeds(false);
  await f.fullscreen.start('live-video', f.options);
  assert.deepEqual(f.results, [false]);
  assert.equal(f.timers.size, 1);
  f.succeeds(true);
  await f.fire();
  assert.equal(f.requests(), 2);
  assert.deepEqual(f.results, [false, true]);
  assert.equal(f.timers.size, 0);
});

test('browsers requiring a TV gesture get bounded attempts, not an endless fullscreen loop', async () => {
  const f = fixture();
  f.succeeds(false);
  await f.fullscreen.start('live-video', f.options);
  await f.fire();
  await f.fire();
  assert.equal(f.requests(), 3);
  assert.equal(f.timers.size, 0);
  await f.fullscreen.start('live-video', f.options);
  assert.equal(f.requests(), 3);
});

test('Back is respected, but an explicit phone fullscreen request can enable entry again', async () => {
  const f = fixture();
  await f.fullscreen.start('live-video', f.options);
  f.fullscreen.observe(true);
  f.fullscreen.observe(false);
  await f.fullscreen.start('live-video', f.options);
  assert.equal(f.requests(), 1);
  f.fullscreen.allow('live-video');
  await f.fullscreen.start('live-video', f.options);
  assert.equal(f.requests(), 2);
});

test('playing and resize events cannot overlap or repeat successful fullscreen across playlist items', async () => {
  const f = fixture();
  let release;
  f.options.request = () => new Promise(resolve => { release = resolve; });
  const first = f.fullscreen.start('same-playlist-stream', f.options);
  await f.fullscreen.start('same-playlist-stream', f.options);
  release(true);
  await first;
  await f.fullscreen.start('same-playlist-stream', f.options);
  assert.deepEqual(f.results, [true]);
  assert.equal(f.timers.size, 0);
});

test('disconnect cancels scheduled fullscreen attempts', async () => {
  const f = fixture();
  f.succeeds(false);
  await f.fullscreen.start('old-stream', f.options);
  f.fullscreen.reset();
  assert.equal(f.timers.size, 0);
  assert.equal(f.requests(), 1);
});

test('a late result from an old peer cannot update the new TV fullscreen state', async () => {
  const f = fixture();
  let release;
  const oldResults = [];
  const old = f.fullscreen.start('old-stream', {
    ready: () => true, request: () => new Promise(resolve => { release = resolve; }),
    onResult: value => oldResults.push(value),
  });
  await f.fullscreen.start('new-stream', f.options);
  release(false);
  await old;
  assert.deepEqual(oldResults, []);
  assert.deepEqual(f.results, [true]);
  assert.equal(f.timers.size, 0);
});
