import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { LOCAL_RECEIVER_HTML } from '../lib/local-receiver.ts';

function receiver() {
  const requests = [];
  const timers = new Map();
  let messages = [];
  const elements = Object.fromEntries(['bar', 'notice', 'timer', 'play', 'mute', 'full', 'back'].map((id) => [id, { style: {}, textContent: '' }]));
  const video = {
    currentTime: 12, duration: 3600, volume: 1, muted: false, paused: true,
    load() {},
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
  };
  elements.video = video;
  const config = {
    endpoint: 'https://framecast.example/api/cast/rooms/test/messages',
    returnUrl: 'https://framecast.example/framecast/tv',
    sessionId: 'session1', extension: '.mov', after: 10,
  };
  const location = {
    hash: `#${encodeURIComponent(JSON.stringify(config))}`,
    replace(url) { this.next = url; },
  };
  const document = {
    getElementById(id) { return elements[id]; },
    documentElement: {},
  };
  const context = vm.createContext({
    URL, Number, JSON, Math, Infinity, isFinite, decodeURIComponent, encodeURIComponent,
    document, location,
    setInterval(fn, delay) { timers.set(delay, fn); },
    fetch: async (url, options = {}) => {
      requests.push({ url, ...options });
      return { ok: true, json: async () => options.method === 'POST' ? { sequence: 99 } : { messages } };
    },
  });
  vm.runInContext(LOCAL_RECEIVER_HTML.match(/<script>([\s\S]*)<\/script>/)[1], context);
  return { video, elements, location, document, requests, timers, setMessages(value) { messages = value; } };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('starts the original local video immediately, without fetching or uploading its bytes in JS', async () => {
  const r = receiver();
  await flush();
  assert.equal(r.video.src, './media.mov');
  assert.equal(r.video.paused, false);
  assert.ok(r.requests.every((request) => request.url.startsWith('https://framecast.example/api/')));
  const telemetry = JSON.parse(r.requests.find((request) => request.method === 'POST').body);
  assert.equal(telemetry.type, 'player-state');
  assert.equal(telemetry.payload.duration, 3600);
  assert.equal(telemetry.payload.sessionId, 'session1');
});

test('phone controls seek, pause, volume and mute on the TV', async () => {
  const r = receiver();
  await flush();
  r.setMessages([
    ['video:seek-by:10', 11], ['video:volume:0.3', 12], ['video:mute', 13], ['pause', 14],
  ].map(([action, sequence]) => ({ sequence, from: 'phone', type: 'player-command', payload: { action, sessionId: 'session1' } })));
  r.timers.get(500)();
  await flush();
  assert.equal(r.video.currentTime, 22);
  assert.equal(r.video.volume, 0.3);
  assert.equal(r.video.muted, true);
  assert.equal(r.video.paused, true);
});

test('controls hide after five seconds and return on a remote key', () => {
  const r = receiver();
  for (let i = 0; i < 5; i++) r.timers.get(1000)();
  assert.equal(r.elements.bar.style.display, 'none');
  r.document.onkeydown({ key: 'ArrowRight' });
  assert.equal(r.elements.bar.style.display, 'flex');
  assert.equal(r.elements.timer.textContent, '5');
});

test('a phone disconnect returns to the same pairing room without replaying old signals', async () => {
  const r = receiver();
  await flush();
  r.setMessages([{ sequence: 15, from: 'phone', type: 'close', payload: {} }]);
  r.timers.get(500)();
  await flush();
  const target = new URL(r.location.next);
  assert.equal(target.origin, 'https://framecast.example');
  assert.equal(target.searchParams.get('resume'), '1');
  assert.equal(target.searchParams.get('after'), '15');
});

test('switching back to photos preserves the pending WebRTC offer', async () => {
  const r = receiver();
  await flush();
  r.setMessages([{ sequence: 18, from: 'phone', type: 'offer', payload: {} }]);
  r.timers.get(500)();
  await flush();
  assert.equal(new URL(r.location.next).searchParams.get('after'), '17');
});

test('rejects public hosts disguised as a private address when switching videos', async () => {
  const r = receiver();
  await flush();
  r.setMessages([{ sequence: 20, from: 'phone', type: 'local-video', payload: {
    sessionId: 'other', receiverUrl: 'http://192.168.evil.example/token/receiver.html',
  } }]);
  r.timers.get(500)();
  await flush();
  assert.equal(r.location.next, undefined);
});

test('codec or network failure reports a useful error rather than successful playback', async () => {
  const r = receiver();
  await flush();
  r.video.onerror();
  await flush();
  const states = r.requests.filter((request) => request.method === 'POST').map((request) => JSON.parse(request.body));
  assert.equal(states.at(-1).payload.playback, 'error');
  assert.match(states.at(-1).payload.message, /format.*not.*supported/);
});
