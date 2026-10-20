import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configureVideoSender, phoneStreamProfile, preferHardwareVideoCodec } from '../src/lib/video-stream-quality.ts';

test('profiles remain bounded to Full HD until a higher ceiling is explicitly qualified', () => {
  for (const [width, height] of [[1920, 1080], [1080, 1920], [3840, 2160]]) {
    assert.deepEqual(phoneStreamProfile(width, height), { width: 1920, height: 1080, frameRate: 30, maxBitrate: 6_000_000 });
  }
});

test('qualified QHD and UHD ceilings increase resolution and bitrate without sacrificing motion', () => {
  assert.deepEqual(phoneStreamProfile(3840, 2160, 1440), { width: 2560, height: 1440, frameRate: 30, maxBitrate: 10_000_000 });
  assert.deepEqual(phoneStreamProfile(3840, 2160, 2160), { width: 3840, height: 2160, frameRate: 30, maxBitrate: 20_000_000 });
  assert.equal(phoneStreamProfile(2160, 3840, 2160).height, 2160);
  assert.equal(phoneStreamProfile(7680, 4320, 4320).height, 2160);
  assert.equal(phoneStreamProfile(2560, 1440, 2160).height, 1440);
  assert.equal(phoneStreamProfile(1920, 1080, 2160).height, 1080);
  assert.equal(phoneStreamProfile(1280, 720, 2160).height, 720);
});

test('720p and smaller sources do not waste phone processing on a Full HD upscale', () => {
  for (const [width, height] of [[1280, 720], [720, 1280], [640, 360], [0, 0]]) {
    assert.deepEqual(phoneStreamProfile(width, height), { width: 1280, height: 720, frameRate: 30, maxBitrate: 3_000_000 });
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
    rid: 'video', active: true, maxBitrate: 6_000_000, maxFramerate: 30, scaleResolutionDownBy: 1,
  });
});

test('adaptive ceilings lower phone pixel work without lowering the motion target', () => {
  assert.equal(phoneStreamProfile(3840, 2160, 720).height, 720);
  assert.equal(phoneStreamProfile(3840, 2160, 540).height, 540);
  assert.equal(phoneStreamProfile(3840, 2160, 540).frameRate, 30);
  assert.equal(phoneStreamProfile(640, 360, 1080).height, 720);
});

test('H264 is preferred for video while mandatory fallback codecs and audio are retained', () => {
  const codecs = ['VP9', 'VP8', 'rtx', 'H264', 'AV1'].map(name => ({ mimeType: `video/${name}`, clockRate: 90000 }));
  let applied;
  const video = { sender: { track: { kind: 'video' } }, setCodecPreferences(value) { applied = value; } };
  const audio = { sender: { track: { kind: 'audio' } }, setCodecPreferences() { assert.fail('audio must not change'); } };
  assert.equal(preferHardwareVideoCodec({ getTransceivers: () => [audio, video] }, codecs), true);
  assert.deepEqual(applied.map(codec => codec.mimeType), ['video/H264', 'video/VP8', 'video/VP9', 'video/rtx', 'video/AV1']);
  assert.equal(applied.length, codecs.length);
  assert.equal(codecs[0].mimeType, 'video/VP9');
});

test('missing H264 or codec preference APIs do not remove working negotiated video', () => {
  const codecs = [{ mimeType: 'video/VP8', clockRate: 90000 }];
  assert.equal(preferHardwareVideoCodec({ getTransceivers: () => [] }, codecs), false);
  assert.equal(preferHardwareVideoCodec({ getTransceivers: () => [{ sender: { track: { kind: 'video' } } }] },
    [{ mimeType: 'video/H264', clockRate: 90000 }]), false);
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
