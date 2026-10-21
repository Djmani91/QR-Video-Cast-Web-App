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
    readyState: 0, videoWidth: 1920, error: null, style: {}, listeners: {}, loadCount: 0,
    addEventListener(name, listener) { this.listeners[name] = listener; },
    load() { this.loadCount += 1; },
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
    setTimeout(fn, delay) { timers.set(delay, fn); return delay; },
    clearTimeout(delay) { timers.delete(delay); },
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
  assert.equal(r.video.style.objectFit, 'contain');
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

test('phone Fit whole video command restores the uncropped TV presentation', async () => {
  const r = receiver();
  await flush();
  r.video.style.objectFit = 'cover';
  r.setMessages([{ sequence: 11, from: 'phone', type: 'player-command', payload: { action: 'video:fit:contain', sessionId: 'session1' } }]);
  r.timers.get(500)();
  await flush();
  assert.equal(r.video.style.objectFit, 'contain');
});

test('phone full-screen command fullscreens the page containing the inline TV video', async () => {
  const r = receiver();
  let entered = false;
  r.document.documentElement.requestFullscreen = () => {
    entered = true;
    r.document.fullscreenElement = r.document.documentElement;
    return Promise.resolve();
  };
  await flush();
  r.setMessages([{ sequence: 11, from: 'phone', type: 'player-command', payload: { action: 'video:fullscreen', sessionId: 'session1' } }]);
  r.timers.get(500)();
  await flush();
  await flush();
  assert.equal(entered, true);
  assert.equal(r.document.fullscreenElement, r.document.documentElement);
});

test('phone full-screen command falls back to the TV document when video fullscreen is unavailable', async () => {
  const r = receiver();
  let entered = false;
  r.document.documentElement.requestFullscreen = () => {
    entered = true;
    r.document.fullscreenElement = r.document.documentElement;
    return Promise.resolve();
  };
  await flush();
  r.setMessages([{ sequence: 11, from: 'phone', type: 'player-command', payload: { action: 'video:fullscreen', sessionId: 'session1' } }]);
  r.timers.get(500)();
  await flush();
  assert.equal(entered, true);
  assert.equal(r.document.fullscreenElement, r.document.documentElement);
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

test('a temporary initial video request failure is retried and can recover', async () => {
  const r = receiver();
  await flush();
  r.video.error = { code: 2 };
  r.video.onerror();
  await flush();
  let states = r.requests.filter((request) => request.method === 'POST').map((request) => JSON.parse(request.body));
  assert.equal(states.at(-1).payload.playback, 'opening');
  assert.match(r.elements.notice.textContent, /reopening/i);

  r.timers.get(900)();
  assert.equal(r.video.loadCount, 2);
  r.video.readyState = 1;
  r.video.listeners.loadedmetadata();
  r.video.paused = false;
  r.video.onplaying();
  await flush();
  states = r.requests.filter((request) => request.method === 'POST').map((request) => JSON.parse(request.body));
  assert.equal(states.at(-1).payload.playback, 'playing');
});

test('an unsupported format still fails clearly after bounded startup retries', async () => {
  const r = receiver();
  await flush();
  r.video.error = { code: 4 };
  r.video.onerror();
  await flush();
  r.timers.get(900)();
  await flush();
  r.video.onerror();
  await flush();
  r.timers.get(1800)();
  await flush();
  r.video.onerror();
  await flush();
  const states = r.requests.filter((request) => request.method === 'POST').map((request) => JSON.parse(request.body));
  assert.equal(states.at(-1).payload.playback, 'error');
  assert.match(states.at(-1).payload.message, /format.*codec/i);
});

test('audio-only playback reports that the TV did not decode video frames', async () => {
  const r = receiver();
  await flush();
  r.video.paused = false;
  r.video.videoWidth = 0;
  r.video.currentTime = 2;
  r.video.onplaying();
  await flush();
  r.timers.get(2500)();
  await flush();
  const states = r.requests.filter((request) => request.method === 'POST').map((request) => JSON.parse(request.body));
  assert.equal(states.at(-1).payload.playback, 'error');
  assert.match(states.at(-1).payload.message, /sound.*picture.*HEVC/i);
});

test('remote Back exits fullscreen without leaving the room or stopping playback', async () => {
  const r = receiver();
  await flush();
  let exited = false;
  let prevented = false;
  r.document.fullscreenElement = r.video;
  r.document.exitFullscreen = () => { exited = true; r.document.fullscreenElement = null; };
  r.document.onkeydown({ keyCode: 10009, preventDefault() { prevented = true; } });
  assert.equal(exited, true);
  assert.equal(prevented, true);
  assert.equal(r.location.next, undefined);
  assert.equal(r.video.paused, false);
});

test('starting a video never probes Samsung native movie-player fullscreen', async () => {
  const r = receiver();
  await flush();
  let nativeCalls = 0;
  r.video.webkitEnterFullscreen = () => { nativeCalls++; throw Error('TV system dialog'); };
  r.video.webkitEnterFullScreen = r.video.webkitEnterFullscreen;
  r.video.requestFullscreen = r.video.webkitEnterFullscreen;
  r.document.documentElement.requestFullscreen = () => {
    r.document.fullscreenElement = r.document.documentElement;
  };
  r.video.onplaying();
  await flush();
  assert.equal(nativeCalls, 0);
  assert.equal(r.video.paused, false);
  assert.match(LOCAL_RECEIVER_HTML, /<video[^>]* playsinline webkit-playsinline/);
});
