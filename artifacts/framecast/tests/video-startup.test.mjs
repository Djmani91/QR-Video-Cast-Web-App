import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startReceiverVideo, tvVideoPresentation, waitForVideoStartup } from '../src/lib/video-startup.ts';

test('the real decoder remains full-sized and visible underneath the optional canvas', () => {
  assert.deepEqual(tvVideoPresentation('cover'), { objectFit: 'cover', width: '100%', height: '100%', opacity: 1 });
  assert.equal(tvVideoPresentation('contain').objectFit, 'contain');
});

async function start(error) {
  const events = [];
  await startReceiverVideo({ play: async () => { if (error) throw error; } }, {
    onPlaying: () => events.push('playing'),
    onBlocked: () => events.push('blocked'),
    onFailed: () => events.push('failed'),
  });
  return events;
}
test('successful playback is acknowledged as playing, never as blocked', async () => {
  assert.deepEqual(await start(), ['playing']);
});
test('autoplay denial produces a Play prompt rather than a codec or connection failure', async () => {
  assert.deepEqual(await start({ name: 'NotAllowedError' }), ['blocked']);
});
test('an actual decoder failure is not disguised as a Play prompt', async () => {
  assert.deepEqual(await start({ name: 'NotSupportedError' }), ['failed']);
});
test('TV playback starting after twenty seconds is accepted within the recovery minute', async () => {
  let now = 0;
  const result = await waitForVideoStartup({
    state: () => ({ status: now >= 25_000 ? 'playing' : 'waiting' }),
    active: () => true, now: () => now, delay: async ms => { now += ms; },
  });
  assert.equal(result.status, 'playing');
  assert.ok(now > 20_000 && now < 60_000);
});
test('a Play prompt completes readiness without falsely claiming playback or throwing', async () => {
  const result = await waitForVideoStartup({
    state: () => ({ status: 'blocked', message: 'Press Play on TV' }), active: () => true,
  });
  assert.equal(result.status, 'blocked');
});
test('the TV-specific failure is kept instead of being replaced by a generic timeout', async () => {
  await assert.rejects(waitForVideoStartup({
    state: () => ({ status: 'failed', message: 'The TV rejected this codec.' }), active: () => true,
  }), /TV rejected this codec/);
});
test('a new selection cancels the old wait without failing the new video', async () => {
  assert.deepEqual(await waitForVideoStartup({ state: () => ({ status: 'waiting' }), active: () => false }), { status: 'interrupted' });
});
test('a true startup timeout does not tell users their format must be unsupported', async () => {
  let now = 0;
  await assert.rejects(waitForVideoStartup({
    state: () => ({ status: 'waiting' }), active: () => true,
    now: () => now, delay: async ms => { now += ms; },
  }), /does not necessarily mean/);
  assert.ok(now >= 60_000);
});
