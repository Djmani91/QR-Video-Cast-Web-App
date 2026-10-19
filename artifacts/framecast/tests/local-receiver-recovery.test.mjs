import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { LOCAL_RECEIVER_HTML } from '../../framecast-mobile/lib/local-receiver.ts';

function setup() {
  const start = LOCAL_RECEIVER_HTML.indexOf('var networkRetryDeadline=');
  const end = LOCAL_RECEIVER_HTML.indexOf("video.src='./media");
  assert.ok(start >= 0 && end > start, 'exercise the actual local receiver recovery handlers');
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  const listeners = new Map();
  let loads = 0;
  let plays = 0;
  const context = {
    video: {
      currentTime: 23, error: { code: 2 },
      load() { loads++; this.currentTime = 0; },
      addEventListener(name, fn) { listeners.set(name, fn); },
    },
    Date: { now: () => now },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    exiting: false, playback: 'playing', problem: '', notice: { textContent: '' },
    state() {}, reveal() {}, fullscreen() {}, play() { plays++; }, fullscreenAttempted: true,
  };
  vm.createContext(context);
  vm.runInContext(LOCAL_RECEIVER_HTML.slice(start, end), context);
  return {
    context, listeners,
    tick(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } },
    get loads() { return loads; }, get plays() { return plays; },
  };
}
test('temporary phone network failure keeps the room alive and retries playback', () => {
  const f = setup();
  f.context.video.onerror();
  assert.equal(f.context.playback, 'opening');
  assert.equal(f.context.problem, '');
  assert.match(f.context.notice.textContent, /one minute/);
  f.tick(2000);
  assert.equal(f.loads, 1);
  assert.equal(f.plays, 1);
  f.listeners.get('loadedmetadata')();
  assert.equal(f.context.video.currentTime, 23);
});
test('native playback failure is not reported until the full grace period has elapsed', () => {
  const f = setup();
  f.context.video.onerror();
  f.tick(59_999);
  f.context.video.onerror();
  assert.equal(f.context.playback, 'opening');
  f.tick(1);
  f.context.video.onerror();
  assert.equal(f.context.playback, 'error');
});
test('a recovered phone cancels retries and keeps normal playback', () => {
  const f = setup();
  f.context.video.onerror();
  f.context.video.onplaying();
  f.tick(60_000);
  assert.equal(f.loads, 0);
  assert.equal(f.context.playback, 'playing');
  assert.equal(f.context.notice.textContent, '');
});
test('a genuinely unsupported format is still reported immediately', () => {
  const f = setup();
  f.context.video.error.code = 4;
  f.context.video.onerror();
  assert.equal(f.context.playback, 'error');
  f.tick(60_000);
  assert.equal(f.loads, 0);
});
test('a source that already played can recover when a TV labels lost Wi-Fi as unsupported', () => {
  const f = setup();
  f.context.video.onplaying();
  f.context.video.error.code = 4;
  f.context.video.onerror();
  assert.equal(f.context.playback, 'opening');
  assert.equal(f.context.problem, '');
});
