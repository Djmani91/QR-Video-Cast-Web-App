import assert from 'node:assert/strict';
import { test } from 'node:test';
import { phoneFrameGeometry, startPhoneVideoStream, waitForPhoneVideoFrame } from '../src/lib/phone-video-stream.ts';

function setup({ decoderClock = false, manualFrames = true, zeroRejected = false, rejectAboveHeight = Infinity } = {}) {
  const original = { document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  const frames = new Map();
  let id = 0;
  const calls = [];
  const events = [];
  const track = kind => ({ kind, stopped: false, stop() { this.stopped = true; } });
  const videoTrack = track('video');
  videoTrack.contentHint = '';
  if (manualFrames) videoTrack.requestFrame = () => events.push(['request-frame']);
  const audioTrack = track('audio');
  const tracks = [videoTrack];
  const output = { getTracks: () => tracks, getVideoTracks: () => [videoTrack], addTrack: item => tracks.push(item) };
  const context = Object.fromEntries(['save', 'restore', 'setTransform', 'fillRect', 'translate', 'rotate', 'drawImage']
    .map(name => [name, (...args) => calls.push([name, ...args])]));
  const canvas = { width: 0, height: 0, getContext: () => context, captureStream: fps => {
    events.push(['capture', fps]);
    if (zeroRejected && fps === 0) throw Error('Zero-fps capture unsupported');
    if (!manualFrames && fps === 0) {
      const probe = track('video');
      return { getTracks: () => [probe], getVideoTracks: () => [probe] };
    }
    return output;
  } };
  const draw = context.drawImage;
  context.drawImage = (...args) => {
    if (canvas.height > rejectAboveHeight) throw Error('High-resolution drawing unavailable');
    draw(...args);
  };
  globalThis.document = { createElement: tag => { assert.equal(tag, 'canvas'); return canvas; } };
  globalThis.requestAnimationFrame = fn => { events.push(['raf']); frames.set(++id, fn); return id; };
  globalThis.cancelAnimationFrame = handle => frames.delete(handle);
  const video = Object.assign(new EventTarget(), {
    readyState: 2, videoWidth: 576, videoHeight: 1024, currentTime: 0, duration: 300, paused: true, ended: false,
    muted: true, volume: 1, playsInline: true,
    async play() { this.paused = false; this.dispatchEvent(new Event('play')); },
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')); },
    load() { this.currentTime = 0; this.ended = false; this.readyState = 2; },
  });
  if (decoderClock) {
    video.requestVideoFrameCallback = fn => { events.push(['decoder-frame']); frames.set(++id, fn); return id; };
    video.cancelVideoFrameCallback = handle => frames.delete(handle);
  }
  const monitor = { gain: { value: 0 }, connect() {}, disconnect() { events.push(['monitor-disconnect']); } };
  const graph = {
    video,
    source: { connect(destination) { events.push(['audio-connect', destination]); }, disconnect() { events.push(['audio-disconnect']); } },
    context: {
      destination: {},
      createGain: () => monitor,
      createMediaStreamDestination: () => ({ stream: { getAudioTracks: () => [audioTrack] } }),
      async resume() { events.push(['resume']); }, async suspend() { events.push(['suspend']); },
    },
  };
  const states = [];
  const errors = [];
  const live = startPhoneVideoStream(video, graph, { previewMuted: true, onState: state => states.push(state), onError: message => errors.push(message) });
  return {
    live, video, canvas, calls, events, monitor, states, errors, tracks, frames,
    step(now, mediaTime = now / 1000) {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(now, { mediaTime });
    },
    restore() { live.stop(); for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } },
  };
}

test('upright portrait Fill is composed into a landscape frame without rotating people sideways', () => {
  const fill = phoneFrameGeometry(576, 1024, 0, 'cover');
  assert.equal(fill.rotation, 0);
  assert.equal(fill.width, 1280);
  assert.ok(fill.height > 720);
  const fit = phoneFrameGeometry(576, 1024, 0, 'contain');
  assert.equal(fit.height, 720);
  assert.ok(fit.width < 1280);
});
test('phone output stays wide through all four manual rotations', () => {
  for (const rotation of [0, 90, 180, 270, 360]) {
    const geometry = phoneFrameGeometry(1024, 576, rotation, 'cover');
    assert.ok(geometry.width >= 720 && geometry.height >= 720);
    assert.equal(geometry.rotation, rotation % 360);
  }
});
test('rotation redraws on the phone without replacing or stopping the TV video/audio tracks', async () => {
  const f = setup();
  try {
    await f.live.ready;
    await f.live.command('play');
    f.video.currentTime = 42;
    const originalTracks = [...f.live.stream.getTracks()];
    await f.live.command('video:rotate');
    assert.equal(f.live.state().rotation, 90);
    assert.equal(f.video.currentTime, 42);
    assert.equal(f.video.paused, false);
    assert.deepEqual(f.live.stream.getTracks(), originalTracks);
    assert.ok(originalTracks.every(track => !track.stopped));
    assert.equal(f.calls.filter(call => call[0] === 'rotate').at(-1)[1], Math.PI / 2);
    assert.equal(f.canvas.width, 1280);
    assert.equal(f.canvas.height, 720);
  } finally { f.restore(); }
});
test('source seeking, pause, resume and Stop act on the phone file, not the TV live timeline', async () => {
  const f = setup();
  try {
    await f.live.ready;
    await f.live.command('video:seek:120');
    await f.live.command('video:seek-by:-10');
    assert.equal(f.video.currentTime, 110);
    await f.live.command('play');
    assert.equal(f.live.state().paused, false);
    await f.live.command('pause');
    assert.equal(f.live.state().paused, true);
    await f.live.command('stop');
    assert.equal(f.video.currentTime, 0);
  } finally { f.restore(); }
});
test('preview mute only changes the phone monitor, never removes TV sound', async () => {
  const f = setup();
  try {
    await f.live.ready;
    assert.deepEqual(f.tracks.map(track => track.kind), ['video', 'audio']);
    assert.equal(f.monitor.gain.value, 0);
    assert.equal(f.video.muted, false);
    f.live.setPreviewMuted(false);
    assert.equal(f.monitor.gain.value, 1);
    f.live.setPreviewMuted(true);
    assert.equal(f.monitor.gain.value, 0);
    assert.ok(f.tracks.every(track => !track.stopped));
  } finally { f.restore(); }
});
test('qualified UHD rendering keeps the same TV tracks and remains bounded to 4K', async () => {
  const f = setup();
  try {
    await f.live.ready;
    f.video.videoWidth = 3840;
    f.video.videoHeight = 2160;
    const original = [...f.live.stream.getTracks()];
    assert.equal(f.live.profile().height, 720);
    assert.equal(f.live.maxHeight(), 2160);
    f.live.setResolutionCeiling(2160);
    assert.equal(f.canvas.width, 3840);
    assert.equal(f.canvas.height, 2160);
    assert.equal(f.live.profile().frameRate, 30);
    assert.deepEqual(f.live.stream.getTracks(), original);
    assert.ok(original.every(track => !track.stopped));
    assert.deepEqual(f.errors, []);
  } finally { f.restore(); }
});

test('a rejected high-resolution renderer falls back without ending a working TV stream', async () => {
  const f = setup({ rejectAboveHeight: 1080 });
  try {
    await f.live.ready;
    f.video.videoWidth = 3840;
    f.video.videoHeight = 2160;
    f.live.setResolutionCeiling(2160);
    f.step(100);
    assert.equal(f.live.profile().height, 1080);
    assert.equal(f.live.maxHeight(), 1080);
    f.live.setResolutionCeiling(2160);
    assert.equal(f.live.profile().height, 1080);
    assert.ok(f.tracks.every(track => !track.stopped));
    assert.deepEqual(f.errors, []);
  } finally { f.restore(); }
});

test('casting fits the whole video by default and filling the TV remains opt-in', async () => {
  const f = setup();
  try {
    await f.live.ready;
    assert.equal(f.live.state().fitMode, 'contain');
    await f.live.command('video:fit:cover');
    assert.equal(f.live.state().fitMode, 'cover');
    await f.live.command('video:fit:contain');
    assert.equal(f.live.state().fitMode, 'contain');
  } finally { f.restore(); }
});

test('disconnect releases the single frame and both outgoing tracks', async () => {
  const f = setup();
  try {
    await f.live.ready;
    f.live.stop();
    assert.ok(f.tracks.every(track => track.stopped));
    assert.equal(f.canvas.width, 0);
    assert.equal(f.canvas.height, 0);
    assert.equal(f.video.paused, true);
    assert.ok(f.events.some(event => event[0] === 'suspend'));
  } finally { f.restore(); }
});

test('phone startup requires a decoded picture, not just resolved audio playback', async () => {
  const video = Object.assign(new EventTarget(), { readyState: 2, videoWidth: 0, videoHeight: 0 });
  let resolved = false;
  const ready = waitForPhoneVideoFrame(video, Promise.resolve(), new AbortController().signal).then(() => { resolved = true; });
  await Promise.resolve();
  assert.equal(resolved, false);
  video.videoWidth = 1920;
  video.videoHeight = 1080;
  video.dispatchEvent(new Event('resize'));
  await ready;
  assert.equal(resolved, true);
});

test('a phone decoder that never opens a frame gets bounded, actionable cloud-file guidance', async () => {
  const video = Object.assign(new EventTarget(), { readyState: 0, videoWidth: 0, videoHeight: 0 });
  await assert.rejects(waitForPhoneVideoFrame(video, new Promise(() => {}), new AbortController().signal, 5), /download it onto the phone first/i);
});

test('an unsupported phone codec is reported immediately, not as a Wi-Fi or MP4-index error', async () => {
  const video = Object.assign(new EventTarget(), { readyState: 0, videoWidth: 0, videoHeight: 0, error: null });
  const ready = waitForPhoneVideoFrame(video, new Promise(() => {}), new AbortController().signal);
  video.error = { code: 4 };
  video.dispatchEvent(new Event('error'));
  await assert.rejects(ready, /phone browser could not decode/i);
});

test('disconnect cancels a pending phone startup and its deadline', async () => {
  const video = Object.assign(new EventTarget(), { readyState: 0, videoWidth: 0, videoHeight: 0 });
  const controller = new AbortController();
  const ready = waitForPhoneVideoFrame(video, new Promise(() => {}), controller.signal);
  controller.abort();
  await assert.rejects(ready, { name: 'AbortError' });
});

test('60Hz fallback delivers thirty evenly spaced pictures per second, not twenty', async () => {
  const f = setup();
  try {
    await f.live.ready;
    await f.live.command('play');
    f.calls.length = 0;
    const draws = [];
    for (let i = 0; i < 60; i++) {
      const before = f.calls.filter(call => call[0] === 'drawImage').length;
      f.step(i * 1000 / 60);
      if (f.calls.filter(call => call[0] === 'drawImage').length > before) draws.push(i);
    }
    assert.equal(draws.length, 30);
    assert.ok(draws.slice(1).every((tick, index) => tick - draws[index] === 2));
    assert.equal(f.events.find(event => event[0] === 'capture')[1], 0);
    assert.equal(f.tracks[0].contentHint, 'motion');
  } finally { f.restore(); }
});

test('decoder-driven playback draws each actual 24fps picture with no competing display timer', async () => {
  const f = setup({ decoderClock: true });
  try {
    await f.live.ready;
    await f.live.command('play');
    f.calls.length = 0;
    for (let i = 0; i < 24; i++) f.step(i * 1000 / 24);
    assert.equal(f.calls.filter(call => call[0] === 'drawImage').length, 24);
    assert.equal(f.events.some(event => event[0] === 'raf'), false);
    assert.ok(f.frames.size === 1);
    f.live.stop();
    assert.equal(f.frames.size, 0);
  } finally { f.restore(); }
});

test('paused video avoids re-encoding the same picture over and over', async () => {
  const f = setup();
  try {
    await f.live.ready;
    f.calls.length = 0;
    for (let i = 0; i < 60; i++) f.step(i * 1000 / 60);
    assert.equal(f.calls.filter(call => call[0] === 'drawImage').length, 0);
    await f.live.command('video:rotate');
    assert.equal(f.calls.filter(call => call[0] === 'drawImage').length, 1);
  } finally { f.restore(); }
});

test('4K dimensions start at HD and can upgrade to bounded Full HD without replacing tracks', async () => {
  const f = setup();
  try {
    await f.live.ready;
    const originalTracks = [...f.live.stream.getTracks()];
    f.video.videoWidth = 3840;
    f.video.videoHeight = 2160;
    f.video.dispatchEvent(new Event('loadeddata'));
    assert.equal(f.canvas.height, 720);
    f.live.setResolutionCeiling(1080);
    assert.equal(f.canvas.width, 1920);
    assert.equal(f.canvas.height, 1080);
    assert.equal(f.live.profile().maxBitrate, 6_000_000);
    assert.deepEqual(f.calls.filter(call => call[0] === 'drawImage').at(-1).slice(-2), [1920, 1080]);
    assert.deepEqual(f.live.stream.getTracks(), originalTracks);
  } finally { f.restore(); }
});

test('decoded timestamps preserve every 30fps picture despite jittery JS callback delivery', async () => {
  const f = setup({ decoderClock: true });
  try {
    await f.live.ready;
    await f.live.command('play');
    f.calls.length = 0;
    f.events.length = 0;
    const delivery = [0, 35, 62, 113, 114, 170];
    delivery.forEach((now, index) => f.step(now, index / 30));
    assert.equal(f.calls.filter(call => call[0] === 'drawImage').length, delivery.length);
    assert.equal(f.events.filter(event => event[0] === 'request-frame').length, delivery.length);
  } finally { f.restore(); }
});

test('backward seeks reset the decoder clock rather than freezing until the old timestamp', async () => {
  const f = setup({ decoderClock: true });
  try {
    await f.live.ready;
    await f.live.command('play');
    f.step(1000, 1);
    f.video.currentTime = 0;
    f.video.dispatchEvent(new Event('seeked'));
    f.calls.length = 0;
    f.step(1016, 1 / 30);
    assert.equal(f.calls.filter(call => call[0] === 'drawImage').length, 1);
  } finally { f.restore(); }
});

test('ordinary variable-rate phone timestamps do not cause false skipped pictures', async () => {
  const f = setup({ decoderClock: true });
  try {
    await f.live.ready;
    await f.live.command('play');
    f.calls.length = 0;
    const timestamps = [0, 0.031, 0.067, 0.099, 0.134, 0.166, 0.201];
    timestamps.forEach((pts, index) => f.step(index * 35, pts));
    assert.equal(f.calls.filter(call => call[0] === 'drawImage').length, timestamps.length);
  } finally { f.restore(); }
});

test('a 60fps decoded source is capped evenly at thirty captured pictures', async () => {
  const f = setup({ decoderClock: true });
  try {
    await f.live.ready;
    await f.live.command('play');
    f.calls.length = 0;
    const drawnAt = [];
    for (let i = 0; i < 60; i++) {
      const before = f.calls.filter(call => call[0] === 'drawImage').length;
      f.step(i * 1000 / 60, i / 60);
      if (f.calls.filter(call => call[0] === 'drawImage').length > before) drawnAt.push(i);
    }
    assert.equal(drawnAt.length, 30);
    assert.ok(drawnAt.slice(1).every((value, index) => value - drawnAt[index] === 2));
  } finally { f.restore(); }
});

test('a browser rejecting zero-fps capture retains its working automatic stream', async () => {
  const f = setup({ decoderClock: true, zeroRejected: true });
  try {
    await f.live.ready;
    assert.deepEqual(f.events.filter(event => event[0] === 'capture').map(event => event[1]), [0, 30]);
    assert.ok(f.tracks.every(track => !track.stopped));
  } finally { f.restore(); }
});

test('older capture implementations retain automatic frames instead of a silent zero-fps stream', async () => {
  const f = setup({ decoderClock: true, manualFrames: false });
  try {
    await f.live.ready;
    assert.deepEqual(f.events.filter(event => event[0] === 'capture').map(event => event[1]), [0, 30]);
    assert.ok(f.tracks.every(track => !track.stopped));
    await f.live.command('play');
    f.step(100, 0.1);
    assert.ok(f.calls.some(call => call[0] === 'drawImage'));
  } finally { f.restore(); }
});

test('an already-queued decoder callback cannot redraw or reschedule after disconnect', async () => {
  const f = setup({ decoderClock: true });
  try {
    await f.live.ready;
    const late = [...f.frames.values()][0];
    f.live.stop();
    f.calls.length = 0;
    late(500);
    assert.equal(f.calls.length, 0);
    assert.equal(f.frames.size, 0);
  } finally { f.restore(); }
});

test('playlist switches reuse the same audio/video tracks and restart the source clock', async () => {
  const f = setup({ decoderClock: true });
  try {
    await f.live.ready;
    await f.live.command('play');
    await f.live.command('video:rotate');
    f.video.currentTime = 25;
    const tracks = [...f.live.stream.getTracks()];
    const oldCallback = [...f.frames.values()][0];
    await f.live.replaceVideo('blob:next-playlist-video');
    assert.equal(f.video.src, 'blob:next-playlist-video');
    assert.equal(f.video.currentTime, 0);
    assert.equal(f.video.paused, false);
    assert.equal(f.live.state().rotation, 0);
    assert.deepEqual(f.live.stream.getTracks(), tracks);
    assert.ok(tracks.every(track => !track.stopped));
    assert.equal(f.frames.size, 1);
    f.calls.length = 0;
    oldCallback(500);
    assert.equal(f.calls.length, 0);
    assert.equal(f.frames.size, 1);
    f.step(500);
    assert.equal(f.calls.filter(call => call[0] === 'drawImage').length, 1);
  } finally { f.restore(); }
});

test('disconnect aborts a playlist video that is still opening', async () => {
  const f = setup();
  try {
    await f.live.ready;
    f.video.play = () => new Promise(() => {});
    const loading = f.live.replaceVideo('blob:cloud-video');
    const rejected = assert.rejects(loading, { name: 'AbortError' });
    f.live.stop();
    await rejected;
    assert.equal(f.frames.size, 0);
    assert.ok(f.tracks.every(track => track.stopped));
  } finally { f.restore(); }
});

test('an unreadable playlist item reports its error without destroying the reusable TV tracks', async () => {
  const f = setup();
  try {
    await f.live.ready;
    f.video.error = { code: 4 };
    await assert.rejects(f.live.replaceVideo('blob:unsupported'), /could not decode/i);
    assert.ok(f.tracks.every(track => !track.stopped));
    f.video.error = null;
    await f.live.replaceVideo('blob:working-next-video');
    assert.equal(f.video.paused, false);
    assert.ok(f.tracks.every(track => !track.stopped));
    assert.equal(f.frames.size, 1);
  } finally { f.restore(); }
});
