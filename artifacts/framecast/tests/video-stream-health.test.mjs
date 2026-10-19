import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monitorVideoStream, readVideoStats } from '../src/lib/video-stream-health.ts';
import { phoneStreamProfile } from '../src/lib/video-stream-quality.ts';

function fixture({ maxHeight = 1080 } = {}) {
  let time = 0, drawn = 0, encoded = 0, received = 0, total = 0, dropped = 0;
  let encodeTime = 0, freezes = 0, reason = '', ceiling = 720, version = 0, paused = false, stopped = false;
  const changes = [], samples = [];
  const source = {
    state: () => ({ paused, ended: false }), sourceVersion: () => version,
    profile: () => phoneStreamProfile(1920, 1080, ceiling), maxHeight: () => maxHeight,
    metrics: () => ({ drawnFrames: drawn, droppedFrames: dropped, totalFrames: total }),
    setResolutionCeiling(value) { ceiling = value; },
  };
  const peer = { getStats: async () => new Map([['video', {
    type: 'outbound-rtp', kind: 'video', timestamp: time, framesEncoded: encoded,
    totalEncodeTime: encodeTime, qualityLimitationReason: reason,
    frameWidth: source.profile().width, frameHeight: source.profile().height,
  }]]) };
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
      drawn += options.drawn ?? 60; total += options.drawn ?? 60;
      encoded += options.encoded ?? 60; received += options.received ?? 60;
      dropped += options.dropped ?? 0; encodeTime += options.encodeTime ?? 0.3;
      freezes += options.freezes ?? 0; reason = options.reason ?? '';
      if (options.feedback !== false) monitor.receive({ timestamp: time, frames: received, freezes });
      await monitor.poll();
    },
  };
}

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

for (const [name, pressure, expected] of [
  ['CPU limitation', { reason: 'cpu' }, 'phone'],
  ['encoder falling behind captured frames', { encoded: 24, received: 24 }, 'phone'],
  ['slow encoding', { encodeTime: 1.8 }, 'phone'],
  ['source decoder dropping pictures', { dropped: 12 }, 'phone'],
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
