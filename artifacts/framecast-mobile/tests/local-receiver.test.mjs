import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { LOCAL_RECEIVER_HTML } from './helpers/local-receiver.mjs';

function mp4WithRotationMatrix() {
  const box = (type, payload) => {
    const bytes = new Uint8Array(8 + payload.length);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, bytes.length);
    bytes.set([...type].map((character) => character.charCodeAt(0)), 4);
    bytes.set(payload, 8);
    return bytes;
  };
  const tkhd = new Uint8Array(84);
  const tkhdView = new DataView(tkhd.buffer);
  [0, 65536, 0, -65536, 0, 0, 0, 0, 1073741824].forEach((value, index) => tkhdView.setInt32(40 + index * 4, value));
  tkhdView.setUint32(76, 1920 * 65536);
  tkhdView.setUint32(80, 1080 * 65536);
  const handler = new Uint8Array(24);
  handler.set([118, 105, 100, 101], 8);
  const mdia = box('mdia', box('hdlr', handler));
  const trak = box('trak', new Uint8Array([...box('tkhd', tkhd), ...mdia]));
  const ftyp = box('ftyp', new Uint8Array(16));
  const mdat = box('mdat', new Uint8Array(1100000));
  const moov = box('moov', trak);
  return new Uint8Array([...ftyp, ...mdat, ...moov]);
}

function receiver({ headResponses = [], mediaBytes, windowSize = { width: 1920, height: 1080 }, videoSize = { width: 1920, height: 1080 } } = {}) {
  const requests = [];
  const timers = new Map();
  let messages = [];
  let headCount = 0;
  let now = 1_000;
  const elements = Object.fromEntries(['bar', 'notice', 'timer', 'play', 'mute', 'full', 'back', 'cinema-title', 'cinema-detail'].map((id) => [id, { style: {}, textContent: '' }]));
  const video = {
    currentTime: 12, duration: 3600, volume: 1, muted: false, paused: true,
    readyState: 0, videoWidth: videoSize.width, videoHeight: videoSize.height, error: null, style: {}, listeners: {}, loadCount: 0,
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
    body: { className: '' },
    getElementById(id) { return elements[id]; },
    documentElement: {},
  };
  const context = vm.createContext({
    URL, Number, JSON, Math, Infinity, isFinite, decodeURIComponent, encodeURIComponent,
    Date: { now: () => now },
    document, location,
    window: { innerWidth: windowSize.width, innerHeight: windowSize.height, addEventListener() {} },
    setInterval(fn, delay) { timers.set(delay, fn); },
    setTimeout(fn, delay) { timers.set(delay, fn); return delay; },
    clearTimeout(delay) { timers.delete(delay); },
    fetch: async (url, options = {}) => {
      requests.push({ url, ...options });
      if (mediaBytes && url.startsWith('./media')) {
        if (options.method === 'HEAD') return { ok: true, status: 200, headers: { get(name) { return name.toLowerCase() === 'content-length' ? String(mediaBytes.length) : null; } } };
        const match = options.headers?.Range?.match(/^bytes=(\d+)-(\d+)$/);
        if (match) {
          const start = Number(match[1]);
          const end = Math.min(Number(match[2]), mediaBytes.length - 1);
          const buffer = mediaBytes.slice(start, end + 1).buffer;
          return { status: 206, arrayBuffer: async () => buffer };
        }
      }
      if (url.startsWith('./media') && options.method === 'HEAD') {
        return { ok: true, status: 200, headers: { get() { return null; } } };
      }
      if (options.method === 'HEAD') {
        const result = headResponses[headCount++] ?? true;
        if (!result) throw new TypeError('Failed to fetch');
        return { type: 'opaque', status: 0, ok: false };
      }
      return { ok: true, json: async () => options.method === 'POST' ? { sequence: 99 } : { messages } };
    },
  });
  vm.runInContext(LOCAL_RECEIVER_HTML.match(/<script>([\s\S]*)<\/script>/)[1], context);
  return {
    video, elements, location, document, requests, timers,
    setMessages(value) { messages = value; },
    advanceTime(milliseconds) { now += milliseconds; },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('local TV shows animated cinema until playing and again after ending or changing videos', async () => {
  const r = receiver();
  assert.equal(r.document.body.className, 'cinema-waiting');
  assert.match(r.elements['cinema-title'].textContent, /Opening/);
  r.video.onplaying();
  assert.equal(r.document.body.className, '');
  r.video.onended();
  assert.equal(r.document.body.className, 'cinema-waiting');
  assert.match(r.elements['cinema-title'].textContent, /connected/);
  assert.match(LOCAL_RECEIVER_HTML, /lc-popcorn|lc-tub/);
});

test('starts the original local video immediately, without fetching or uploading its bytes in JS', async () => {
  const r = receiver();
  await flush();
  assert.equal(r.video.src, './media.mov');
  assert.equal(r.video.paused, false);
  assert.equal(r.video.style.objectFit, 'contain');
  assert.ok(r.requests.filter((request) => request.url.startsWith('https://framecast.example/api/')).length > 0);
  assert.ok(r.requests.filter((request) => request.url.startsWith('./media')).every((request) => request.method === 'HEAD'));
  const telemetry = JSON.parse(r.requests.find((request) => request.method === 'POST').body);
  assert.equal(telemetry.type, 'player-state');
  assert.equal(telemetry.payload.duration, 3600);
  assert.equal(telemetry.payload.sessionId, 'session1');
});

test('reports an active phone-server failure so the app can recover the TV session', async () => {
  const r = receiver();
  await flush();
  r.video.paused = false;
  r.video.onplaying();
  await flush();

  r.video.error = { code: 2 };
  r.video.onerror();
  await flush();
  assert.match(r.elements.notice.textContent, /Trying the phone connection again/);

  r.advanceTime(16_000);
  r.video.onerror();
  await flush();
  const recoveryState = r.requests
    .filter((request) => request.method === 'POST')
    .map((request) => JSON.parse(request.body))
    .find((request) => request.payload.message === 'TV_LOCAL_SERVER_UNREACHABLE');
  assert.ok(recoveryState);
  assert.equal(recoveryState.payload.playback, 'error');
});

test('preserves playback position when the phone restarts its local video server', async () => {
  const r = receiver();
  await flush();
  r.video.currentTime = 84;
  r.setMessages([{
    sequence: 11,
    from: 'phone',
    type: 'local-video',
    payload: {
      sessionId: 'session2',
      receiverUrl: 'http://192.168.1.46:4040/session2/receiver.html',
      extension: '.mp4',
      resumeAt: 84,
    },
  }]);
  r.timers.get(500)();
  await flush();
  await flush();
  assert.equal(r.location.next, undefined, 'keep the working receiver document open');
  assert.equal(r.video.src, 'http://192.168.1.46:4040/session2/media.mp4');
  r.video.listeners.loadedmetadata();
  assert.equal(r.video.currentTime, 84);
  const states = r.requests.filter(request => request.method === 'POST')
    .map(request => JSON.parse(request.body))
    .filter(request => request.payload?.sessionId === 'session2');
  assert.ok(states.length > 0, 'acknowledge the replacement session');
});

test('rotates portrait metadata and sizes it to fit inside the TV screen', async () => {
  const bytes = mp4WithRotationMatrix();
  const r = receiver({ mediaBytes: bytes });
  await flush();
  await flush();
  r.video.listeners.loadedmetadata();
  await flush();
  assert.equal(r.video.style.objectFit, 'contain');
  assert.equal(r.video.style.width, '1080px');
  assert.equal(r.video.style.height, '1920px');
  assert.equal(r.video.style.transform, 'translate(-50%,-50%) rotate(270deg)');
  assert.ok(r.requests.some((request) => request.headers?.Range === 'bytes=0-262143'));
  assert.ok(r.requests.some((request) => request.headers?.Range === `bytes=${bytes.length - 1024 * 1024}-${bytes.length - 1}`));
});

test('does not rotate a video when the TV already reports display-oriented dimensions', async () => {
  const r = receiver({ mediaBytes: mp4WithRotationMatrix(), videoSize: { width: 1080, height: 1920 } });
  await flush();
  await flush();
  r.video.listeners.loadedmetadata();
  await flush();
  assert.equal(r.video.style.width, '1920px');
  assert.equal(r.video.style.height, '1080px');
  assert.equal(r.video.style.transform, 'translate(-50%,-50%) rotate(0deg)');
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

test('local playback answers fresh presence challenges without navigating or restarting media', async () => {
  const r = receiver();
  await flush();
  const loads = r.video.loadCount;
  r.setMessages([{ sequence: 15, from: 'phone', type: 'ready',
    payload: { action: 'connection-ping', sessionId: 'fresh-phone-challenge' } }]);
  r.timers.get(500)();
  await flush();
  const replies = r.requests.filter(request => request.method === 'POST')
    .map(request => JSON.parse(request.body));
  assert.ok(replies.some(reply => reply.type === 'ready'
    && reply.payload.action === 'connection-pong'
    && reply.payload.sessionId === 'fresh-phone-challenge'));
  assert.equal(r.location.next, undefined);
  assert.equal(r.video.loadCount, loads);
});

test('a media-only close returns to the same pairing room without replaying old signals', async () => {
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

test('an explicit phone disconnect requests a fresh pairing room instead of resuming', async () => {
  const r = receiver();
  await flush();
  r.setMessages([{ sequence: 15, from: 'phone', type: 'close', payload: { action: 'disconnect' } }]);
  r.timers.get(500)();
  await flush();
  const target = new URL(r.location.next);
  assert.equal(target.origin, 'https://framecast.example');
  assert.equal(target.searchParams.get('fresh'), '1');
  assert.equal(target.searchParams.has('resume'), false);
  assert.equal(target.searchParams.has('after'), false);
});

test('playing status queued behind an opening acknowledgement is sent without a three-second wait', async () => {
  const requests = [];
  let finishFirst;
  const context = vm.createContext({
    exiting: false, stateBusy: false, stateAgain: false, session: 'session1',
    playback: 'opening', problem: '', fullscreenFeedback: '',
    isFinite, video: { currentTime: 0, duration: 10, muted: false, volume: 1, paused: true },
    post: (type, payload) => {
      requests.push({ type, payload });
      return requests.length === 1 ? new Promise(resolve => { finishFirst = resolve; }) : Promise.resolve();
    },
  });
  const start = LOCAL_RECEIVER_HTML.indexOf('function state(){');
  const end = LOCAL_RECEIVER_HTML.indexOf('function leave(', start);
  vm.runInContext(LOCAL_RECEIVER_HTML.slice(start, end), context);
  context.state();
  context.playback = 'playing';
  context.video.paused = false;
  context.state();
  assert.equal(requests.length, 1);
  finishFirst();
  await flush();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].payload.playback, 'playing');
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

test('checks the replacement server and changes media without navigating the working receiver', async () => {
  const r = receiver();
  await flush();
  r.setMessages([{ sequence: 21, from: 'phone', type: 'local-video', payload: {
    sessionId: 'session2',
    receiverUrl: 'http://192.168.1.45:45678/abc123/receiver.html',
    extension: '.mp4',
  } }]);
  r.timers.get(500)();
  await flush();
  await flush();
  const probe = r.requests.find((request) => request.method === 'HEAD' && request.url === 'http://192.168.1.45:45678/abc123/receiver.html');
  assert.equal(probe.url, 'http://192.168.1.45:45678/abc123/receiver.html');
  assert.equal(probe.mode, 'no-cors');
  assert.equal(r.location.next, undefined);
  assert.equal(r.video.src, 'http://192.168.1.45:45678/abc123/media.mp4');
  assert.ok(r.requests.some(request => request.method === 'HEAD' && request.url === r.video.src),
    'orientation metadata is read from the replacement media, not the stopped server');
  r.video.onerror();
  assert.equal(r.location.next, undefined, 'a failed media request must not become browser navigation');
});

test('keeps the current receiver alive and reports a phone-server failure after bounded retries', async () => {
  const r = receiver({ headResponses: [false, false, false] });
  await flush();
  r.setMessages([{ sequence: 22, from: 'phone', type: 'local-video', payload: {
    sessionId: 'session2',
    receiverUrl: 'http://192.168.1.45:45678/abc123/receiver.html',
    extension: '.mp4',
  } }]);
  r.timers.get(500)();
  await flush();
  r.timers.get(250)();
  await flush();
  r.timers.get(500)();
  await flush();
  assert.equal(r.requests.filter((request) => request.method === 'HEAD' && request.url === 'http://192.168.1.45:45678/abc123/receiver.html').length, 3);
  assert.equal(r.location.next, undefined);
  assert.match(r.elements.notice.textContent, /temporarily unreachable/i);
  const report = r.requests
    .filter((request) => request.method === 'POST')
    .map((request) => JSON.parse(request.body))
    .find((request) => request.payload.message === 'TV_LOCAL_SERVER_UNREACHABLE');
  assert.equal(report.payload.sessionId, 'session2');
});

test('several video changes keep one receiver document and acknowledge each new session', async () => {
  const r = receiver();
  await flush();
  for (let i = 2; i <= 4; i++) {
    r.setMessages([{ sequence: 30 + i, from: 'phone', type: 'local-video', payload: {
      sessionId: `session${i}`,
      receiverUrl: `http://192.168.1.45:${45678 + i}/session${i}/receiver.html`,
      extension: '.mp4',
    } }]);
    r.timers.get(500)();
    await flush();
    await flush();
    assert.equal(r.location.next, undefined);
    assert.equal(r.video.src, `http://192.168.1.45:${45678 + i}/session${i}/media.mp4`);
    const state = r.requests.filter(request => request.method === 'POST')
      .map(request => JSON.parse(request.body)).at(-1);
    assert.equal(state.payload.sessionId, `session${i}`);
    assert.equal(state.payload.playback, 'opening');
  }
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
