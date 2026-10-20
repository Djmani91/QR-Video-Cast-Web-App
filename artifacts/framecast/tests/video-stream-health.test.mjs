import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monitorVideoStream, readVideoStats } from '../src/lib/video-stream-health.ts';
import { phoneStreamProfile } from '../src/lib/video-stream-quality.ts';

function fixture({ maxHeight = 1080, sourceWidth = 1920, sourceHeight = 1080, measureRender = true } = {}) {
  let time = 0, drawn = 0, encoded = 0, received = 0, total = 0, dropped = 0;
  let encodeTime = 0, freezes = 0, reason = '', ceiling = 720, version = 0, paused = false, stopped = false;
  let drawTime = 0, availableBitrate = 0, encoderWidth, encoderHeight;
  const changes = [], samples = [];
  const source = {
    state: () => ({ paused, ended: false }), sourceVersion: () => version,
    profile: () => phoneStreamProfile(sourceWidth, sourceHeight, ceiling),
    maxHeight: () => Math.min(maxHeight, phoneStreamProfile(sourceWidth, sourceHeight, 2160).height),
    metrics: () => ({ drawnFrames: drawn, droppedFrames: dropped, totalFrames: total, ...(measureRender ? { drawTime } : {}) }),
    setResolutionCeiling(value) { ceiling = value; },
  };
  const peer = { getStats: async () => new Map([['video', {
    type: 'outbound-rtp', kind: 'video', timestamp: time, framesEncoded: encoded,
    totalEncodeTime: encodeTime, qualityLimitationReason: reason,
    frameWidth: encoderWidth ?? source.profile().width, frameHeight: encoderHeight ?? source.profile().height,
  }], ['pair', { id: 'pair', type: 'candidate-pair', state: 'succeeded', nominated: true, availableOutgoingBitrate: availableBitrate }]]) };
  const clock = { now: () => time, setInterval: () => 1, clearInterval() { stopped = true; } };
  const monitor = monitorVideoStream(peer, source, {
    onSample: sample => samples.push(sample), onProfileChanged: () => changes.push(ceiling),
  }, clock);
  return {
    monitor, changes, samples, height: () => ceiling, stopped: () => stopped,
    pause(value) { paused = value; },
    nextSource() { version++; ceiling = 720; },
    async step(options = {}) {
      time += 2000;
      drawn += options.drawn ?? 60; total += options.total ?? options.drawn ?? 60;
      encoded += options.encoded ?? 60; received += options.received ?? 60;
      dropped += options.dropped ?? 0; encodeTime += options.encodeTime ?? 0.3;
      drawTime += options.drawTime ?? 60;
      availableBitrate = options.availableBitrate ?? 0;
      encoderWidth = options.encoderWidth; encoderHeight = options.encoderHeight;
      freezes += options.freezes ?? 0; reason = options.reason ?? '';
      if (options.feedback !== false) monitor.receive({
        timestamp: time, frames: received, freezes,
        width: options.receiverWidth ?? encoderWidth ?? source.profile().width,
        height: options.receiverHeight ?? encoderHeight ?? source.profile().height,
      });
      await monitor.poll();
    },
  };
}

const uhd = () => fixture({ maxHeight: 2160, sourceWidth: 3840, sourceHeight: 2160 });
const headroom = { availableBitrate: 60_000_000, encodeTime: 0.12, drawTime: 30 };
async function reach(f, height) {
  for (let i = 0; i < 90 && f.height() < height; i++) await f.step(headroom);
  assert.equal(f.height(), height);
}

test('4K is qualified gradually through Full HD and QHD, never enabled directly by a 4K file', async () => {
  const f = uhd();
  assert.equal(f.height(), 720);
  await reach(f, 1080);
  for (let i = 0; i < 5; i++) await f.step(headroom);
  assert.equal(f.height(), 1080);
  await reach(f, 1440);
  for (let i = 0; i < 5; i++) await f.step(headroom);
  assert.equal(f.height(), 1440);
  await reach(f, 2160);
  assert.deepEqual(f.changes, [1080, 1440, 2160]);
  f.monitor.stop();
});

for (const [name, config, sample] of [
  ['missing Wi-Fi capacity estimate', {}, {}],
  ['insufficient Wi-Fi headroom', {}, { availableBitrate: 8_000_000 }],
  ['unmeasured phone rendering cost', { measureRender: false }, headroom],
  ['expensive phone rendering', {}, { ...headroom, drawTime: 1200 }],
  ['TV still decoding a lower resolution', {}, { ...headroom, receiverWidth: 1280, receiverHeight: 720 }],
]) {
  test(`${name} prevents upgrades above Full HD`, async () => {
    const f = fixture({ maxHeight: 2160, sourceWidth: 3840, sourceHeight: 2160, ...config });
    for (let i = 0; i < 65; i++) await f.step(sample);
    assert.deepEqual(f.changes, [1080]);
    f.monitor.stop();
  });
}

test('a Full HD source is never relabeled or upscaled to 4K even with abundant headroom', async () => {
  const f = fixture({ maxHeight: 2160 });
  for (let i = 0; i < 65; i++) await f.step(headroom);
  assert.deepEqual(f.changes, [1080]);
  f.monitor.stop();
});

test('severe loss at 4K rolls back to Full HD and does not immediately retry UHD', async () => {
  const f = uhd();
  await reach(f, 2160);
  await f.step({ encoded: 10, received: 10 });
  await f.step({ encoded: 10, received: 10 });
  assert.equal(f.height(), 1080);
  for (let i = 0; i < 20; i++) await f.step(headroom);
  assert.equal(f.height(), 1080);
  f.monitor.stop();
});

test('an encoder that cannot deliver the requested tier is not repeatedly retried for that movie', async () => {
  const f = uhd();
  await reach(f, 1440);
  for (let i = 0; i < 4; i++) await f.step({ ...headroom, encoderWidth: 1920, encoderHeight: 1080 });
  assert.equal(f.height(), 1080);
  for (let i = 0; i < 80; i++) await f.step(headroom);
  assert.equal(f.height(), 1080);
  f.monitor.stop();
});

test('the next playlist movie restarts at HD and reapplies its conservative sender budget', async () => {
  const f = uhd();
  await reach(f, 2160);
  f.nextSource();
  await f.step(headroom);
  assert.equal(f.height(), 720);
  assert.equal(f.changes.at(-1), 720);
  await reach(f, 1440);
  assert.equal(f.height(), 1440);
  f.monitor.stop();
});

test('healthy encoder and TV decode counters allow Full HD only after sustained smooth playback', async () => {
  const f = fixture();
  for (let i = 0; i < 6; i++) await f.step();
  assert.equal(f.height(), 720);
  await f.step();
  assert.deepEqual(f.changes, [1080]);
  assert.equal(f.samples.at(-1).encodedFps, 30);
  assert.equal(f.samples.at(-1).receivedFps, 30);
  f.monitor.stop();
});

test('default health-monitor timer calls browser timer methods with the Window receiver', () => {
  const previousWindow = globalThis.window;
  const intervals = [];
  const cleared = [];
  const windowStub = {
    setInterval(callback, delay) {
      assert.equal(this, windowStub);
      intervals.push({ callback, delay });
      return 73;
    },
    clearInterval(timer) {
      assert.equal(this, windowStub);
      cleared.push(timer);
    },
  };
  globalThis.window = windowStub;
  try {
    const source = {
      state: () => ({ paused: true, ended: false }),
      sourceVersion: () => 0,
      profile: () => phoneStreamProfile(1280, 720),
      maxHeight: () => 720,
      metrics: () => ({ drawnFrames: 0, droppedFrames: 0, totalFrames: 0 }),
      setResolutionCeiling() {},
    };
    const monitor = monitorVideoStream({ getStats: async () => new Map() }, source, {
      onSample() {},
      onProfileChanged() {},
    });
    assert.equal(intervals.length, 1);
    assert.equal(intervals[0].delay, 2000);
    monitor.stop();
    assert.deepEqual(cleared, [73]);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

for (const [name, pressure, expected] of [
  ['CPU limitation', { reason: 'cpu' }, 'phone'],
  ['encoder falling behind captured frames', { encoded: 24, received: 24 }, 'phone'],
  ['slow encoding', { encodeTime: 1.8 }, 'phone'],
  ['source decoder dropping pictures', { dropped: 12 }, 'phone'],
  ['phone rendering taking too long', { drawTime: 1800 }, 'phone'],
  ['canvas missing decoded pictures', { drawn: 24, total: 60, encoded: 24, received: 24 }, 'phone'],
  ['network congestion', { reason: 'bandwidth' }, 'Wi-Fi'],
  ['TV decoder falling behind', { received: 20 }, 'TV reception'],
  ['repeated TV freezes', { freezes: 1 }, 'TV reception'],
]) {
  test(`${name} lowers pixel work rather than reducing the 30fps target`, async () => {
    const f = fixture();
    await f.step(pressure);
    await f.step(pressure);
    assert.equal(f.height(), 720);
    await f.step(pressure);
    assert.deepEqual(f.changes, [540]);
    assert.equal(f.samples.at(-1).limitedBy, expected);
    f.monitor.stop();
  });
}

test('24fps source material is not mistaken for frame loss', async () => {
  const f = fixture();
  for (let i = 0; i < 7; i++) await f.step({ drawn: 48, encoded: 48, received: 48 });
  assert.equal(f.samples.at(-1).limitedBy, '');
  assert.equal(f.samples.at(-1).receivedFps, 24);
  assert.deepEqual(f.changes, [1080]);
  f.monitor.stop();
});

test('missing TV feedback keeps HD stable rather than guessing the TV supports 1080p', async () => {
  const f = fixture();
  for (let i = 0; i < 10; i++) await f.step({ feedback: false });
  assert.deepEqual(f.changes, []);
  assert.equal(f.samples.at(-1).receivedFps, null);
  f.monitor.stop();
});

test('a transient bad interval does not cause a quality change', async () => {
  const f = fixture();
  await f.step();
  await f.step({ reason: 'cpu' });
  await f.step();
  assert.deepEqual(f.changes, []);
  f.monitor.stop();
});

test('a downshift has a recovery cooldown, preventing rapid 540p/720p oscillation', async () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) await f.step({ reason: 'cpu' });
  for (let i = 0; i < 10; i++) await f.step();
  assert.equal(f.height(), 540);
  for (let i = 0; i < 20; i++) await f.step();
  assert.equal(f.height(), 720);
  assert.deepEqual(f.changes, [540, 720]);
  f.monitor.stop();
});

test('pausing resets measurement windows, and the next playlist source starts a fresh assessment', async () => {
  const f = fixture();
  await f.step(); await f.step({ reason: 'cpu' });
  f.pause(true);
  await f.step({ encoded: 0, drawn: 0, received: 0 });
  f.pause(false);
  await f.step(); await f.step();
  assert.deepEqual(f.changes, []);
  f.nextSource();
  await f.step();
  assert.equal(f.height(), 720);
  assert.deepEqual(f.changes, []);
  f.monitor.stop();
});

test('720p sources never trigger wasteful Full HD upscaling', async () => {
  const f = fixture({ maxHeight: 720 });
  for (let i = 0; i < 10; i++) await f.step();
  assert.deepEqual(f.changes, []);
  f.monitor.stop();
});

test('stopping the monitor releases its timer and ignores pending/future samples', async () => {
  const f = fixture();
  await f.step();
  f.monitor.stop();
  assert.equal(f.stopped(), true);
  await f.step({ reason: 'cpu' });
  assert.deepEqual(f.samples, []);
  assert.deepEqual(f.changes, []);
});

test('stats parsing uses actual decoded/encoded video frames, not clock or audio packets', () => {
  const report = new Map([
    ['audio', { type: 'inbound-rtp', kind: 'audio', timestamp: 2000, framesDecoded: 999 }],
    ['bad', { type: 'inbound-rtp', kind: 'video', timestamp: 2000, framesDecoded: NaN }],
    ['video', { type: 'inbound-rtp', kind: 'video', timestamp: 2000, framesDecoded: 48, freezeCount: 1 }],
  ]);
  assert.equal(readVideoStats(report, 'inbound').frames, 48);
  assert.equal(readVideoStats(report, 'inbound').freezes, 1);
  assert.equal(readVideoStats(report, 'outbound'), null);
});

test('only the selected connection contributes the Wi-Fi capacity estimate', () => {
  const report = new Map([
    ['video', { type: 'outbound-rtp', kind: 'video', timestamp: 2000, framesEncoded: 60 }],
    ['wrong', { id: 'wrong', type: 'candidate-pair', state: 'succeeded', nominated: true, availableOutgoingBitrate: 100_000_000 }],
    ['actual', { id: 'actual', type: 'candidate-pair', state: 'succeeded', availableOutgoingBitrate: 8_000_000 }],
    ['transport', { type: 'transport', selectedCandidatePairId: 'actual' }],
  ]);
  assert.equal(readVideoStats(report, 'outbound').availableBitrate, 8_000_000);
});
