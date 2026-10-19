import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startRotatedVideoCanvas, needsVideoCanvas } from '../src/lib/rotated-video-canvas.ts';

function fixture(extra = {}) {
  const video = Object.assign(new EventTarget(), {
    readyState: 2, videoWidth: 1024, videoHeight: 576, currentTime: 0, paused: false,
    pause() { this.paused = true; },
  });
  const calls = [];
  const errors = [];
  const context = Object.fromEntries(['save', 'restore', 'setTransform', 'clearRect', 'translate', 'rotate', 'drawImage']
    .map(name => [name, (...args) => { calls.push([name, ...args]); }]));
  const canvas = { width: 0, height: 0, parentElement: { clientWidth: 1920, clientHeight: 1080 }, getContext: () => context };
  let pending;
  let cancelled = false;
  const options = {
    rotation: 90, fitMode: 'cover', onError: message => errors.push(message),
    scheduleFrame(callback) { pending = callback; return 1; },
    cancelFrame() { cancelled = true; }, ...extra,
  };
  return { video, canvas, context, calls, errors, options, next(time) { pending?.(time); }, get cancelled() { return cancelled; } };
}

test('the actual phone-file dimensions are drawn upright into a wide TV-sized picture', () => {
  const f = fixture();
  const stop = startRotatedVideoCanvas(f.video, f.canvas, f.options);
  assert.equal(f.canvas.width, 1920);
  assert.equal(f.canvas.height, 1080);
  assert.equal(f.calls.find(c => c[0] === 'rotate')[1], Math.PI / 2);
  const draw = f.calls.find(c => c[0] === 'drawImage');
  assert.equal(draw[1], f.video);
  assert.ok(Math.abs(draw[4] - 1024 * (1920 / 576)) < 0.001);
  assert.equal(draw[5], 1920);
  assert.deepEqual(f.errors, []);
  stop();
});

test('Fit whole video restores the entire upright portrait without stretching', () => {
  const f = fixture({ fitMode: 'contain' });
  const stop = startRotatedVideoCanvas(f.video, f.canvas, f.options);
  assert.equal(f.canvas.width, 576);
  assert.equal(f.canvas.height, 1024);
  const draw = f.calls.find(c => c[0] === 'drawImage');
  assert.deepEqual(draw.slice(2), [-512, -288, 1024, 576]);
  stop();
});

test('already-wide normal videos keep their native playback path', () => {
  assert.equal(needsVideoCanvas(0, 'cover', 1920, 1080, 1920, 1080), false);
  assert.equal(needsVideoCanvas(0, 'cover', 720, 1280, 1920, 1080), true);
  assert.equal(needsVideoCanvas(0, 'contain', 720, 1280, 1920, 1080), false);
  assert.equal(needsVideoCanvas(90, 'contain', 1024, 576, 1920, 1080), true);
});

test('live drawing leaves source playback/seek controls intact and releases frame memory on stop', () => {
  const f = fixture();
  const stop = startRotatedVideoCanvas(f.video, f.canvas, f.options);
  const count = f.calls.filter(c => c[0] === 'drawImage').length;
  f.video.currentTime = 10;
  f.next(40);
  assert.equal(f.calls.filter(c => c[0] === 'drawImage').length, count + 1);
  assert.equal(f.video.currentTime, 10);
  stop();
  assert.equal(f.canvas.width, 0);
  assert.equal(f.canvas.height, 0);
  assert.equal(f.cancelled, true);
  assert.equal(f.video.paused, false);
});

test('known encoded dimensions survive temporary zero intrinsic video dimensions', () => {
  const f = fixture({ encodedWidth: 1024, encodedHeight: 576 });
  f.video.videoWidth = 0;
  f.video.videoHeight = 0;
  const stop = startRotatedVideoCanvas(f.video, f.canvas, f.options);
  assert.equal(f.canvas.width, 1920);
  assert.equal(f.canvas.height, 1080);
  assert.equal(f.calls.filter(c => c[0] === 'drawImage').length, 1);
  stop();
});

test('seeking while paused redraws the selected frame', () => {
  const f = fixture();
  f.video.paused = true;
  const stop = startRotatedVideoCanvas(f.video, f.canvas, f.options);
  const count = f.calls.filter(c => c[0] === 'drawImage').length;
  f.next(40);
  assert.equal(f.calls.filter(c => c[0] === 'drawImage').length, count);
  f.video.currentTime = 20;
  f.video.dispatchEvent(new Event('seeked'));
  assert.equal(f.calls.filter(c => c[0] === 'drawImage').length, count + 1);
  stop();
});

test('TV drawing failure reports a presentation error without pausing working playback', () => {
  const f = fixture();
  f.context.drawImage = () => { throw new Error('Decoder frame unavailable'); };
  startRotatedVideoCanvas(f.video, f.canvas, f.options);
  assert.equal(f.video.paused, false);
  assert.match(f.errors[0], /could not draw/);
});

test('missing canvas support never stops the standard TV video player', () => {
  const f = fixture();
  f.canvas.getContext = () => null;
  startRotatedVideoCanvas(f.video, f.canvas, f.options);
  assert.equal(f.video.paused, false);
  assert.match(f.errors[0], /cannot draw/);
});
