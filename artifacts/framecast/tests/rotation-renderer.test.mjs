import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyRotationRenderer, ROTATION_RENDERER_VERSION } from '../src/lib/rotation-renderer.ts';

class Channel extends EventTarget {
  sent = [];
  send(packet) { this.sent.push(JSON.parse(packet)); }
  reply(packet) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(packet) })); }
}

test('confirms the current TV player before sending a local video', async () => {
  const channel = new Channel();
  const ready = verifyRotationRenderer(channel, 100);
  assert.deepEqual(channel.sent, [{ framecast: 'receiver-info' }]);
  channel.reply({ framecast: 'receiver-info', rotationRenderer: ROTATION_RENDERER_VERSION });
  await ready;
});
test('an old TV page explicitly asks for refresh instead of showing a sideways video', async () => {
  const channel = new Channel();
  const ready = verifyRotationRenderer(channel, 100);
  channel.reply({ framecast: 'receiver-info', rotationRenderer: 1 });
  await assert.rejects(ready, /Refresh the TV browser page/);
});
test('a TV opened before the handshake existed also asks for refresh', async () => {
  await assert.rejects(verifyRotationRenderer(new Channel(), 10), /older video player/);
});
test('unrelated stream messages do not satisfy the player version check', async () => {
  const channel = new Channel();
  const ready = verifyRotationRenderer(channel, 100);
  channel.reply({ framecast: 'streaming' });
  channel.reply({ framecast: 'receiver-info', rotationRenderer: ROTATION_RENDERER_VERSION });
  await ready;
});
test('disconnect while checking the TV rejects the pending check', async () => {
  const channel = new Channel();
  const ready = verifyRotationRenderer(channel, 100);
  channel.dispatchEvent(new Event('close'));
  await assert.rejects(ready, /disconnected/);
});
