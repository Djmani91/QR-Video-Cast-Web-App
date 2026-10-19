import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configureVideoSender, phoneStreamProfile } from '../src/lib/video-stream-quality.ts';

test('Full HD and 4K sources get bounded 1080p/30fps, including upright phone videos', () => {
  for (const [width, height] of [[1920, 1080], [1080, 1920], [3840, 2160]]) {
    assert.deepEqual(phoneStreamProfile(width, height), { width: 1920, height: 1080, frameRate: 30, maxBitrate: 8_000_000 });
  }
});

test('720p and smaller sources do not waste phone processing on a Full HD upscale', () => {
  for (const [width, height] of [[1280, 720], [720, 1280], [640, 360], [0, 0]]) {
    assert.deepEqual(phoneStreamProfile(width, height), { width: 1280, height: 720, frameRate: 30, maxBitrate: 4_000_000 });
  }
});

test('encoder settings permit HD while preserving smooth-motion adaptation and negotiated identity', async () => {
  const parameters = { transactionId: 'negotiated', encodings: [{ rid: 'video', active: true, maxBitrate: 300_000 }] };
  let applied;
  const sender = { getParameters: () => parameters, async setParameters(value) { applied = value; } };
  assert.equal(await configureVideoSender(sender, phoneStreamProfile(1920, 1080)), true);
  assert.equal(applied.transactionId, 'negotiated');
  assert.equal(applied.degradationPreference, 'maintain-framerate');
  assert.deepEqual(applied.encodings[0], {
    rid: 'video', active: true, maxBitrate: 8_000_000, maxFramerate: 30, scaleResolutionDownBy: 1,
  });
});

test('a browser awaiting SDP is allowed to negotiate before applying its HD settings', async () => {
  let writes = 0;
  const sender = { getParameters: () => ({ encodings: [] }), async setParameters() { writes++; } };
  assert.equal(await configureVideoSender(sender, phoneStreamProfile(1920, 1080)), false);
  assert.equal(writes, 0);
});

test('unsupported encoder tuning is reported to its caller rather than silently succeeding', async () => {
  const sender = { getParameters: () => ({ encodings: [{}] }), async setParameters() { throw Error('Not supported'); } };
  await assert.rejects(configureVideoSender(sender, phoneStreamProfile(1920, 1080)), /Not supported/);
});
