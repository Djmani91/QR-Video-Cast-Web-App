import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestVideoFullscreen, exitVideoFullscreen, isVideoFullscreen } from '../src/lib/video-fullscreen.ts';

test('prefers the TV native video player rather than fullscreening the webpage', async () => {
  const calls = [];
  const video = {
    webkitEnterFullscreen() { calls.push('native-video'); },
    requestFullscreen() { calls.push('standard-video'); },
  };
  assert.equal(await requestVideoFullscreen(video), true);
  assert.deepEqual(calls, ['native-video']);
});

test('falls back to video element fullscreen when a native API is exposed but rejects', async () => {
  const calls = [];
  const video = {
    webkitEnterFullscreen() { calls.push('native'); throw Error('Unsupported'); },
    requestFullscreen() { calls.push('video'); return Promise.resolve(); },
  };
  assert.equal(await requestVideoFullscreen(video), true);
  assert.deepEqual(calls, ['native', 'video']);
});

test('reports denied automatic fullscreen so the UI can offer a real remote-click button', async () => {
  assert.equal(await requestVideoFullscreen({ requestFullscreen: async () => { throw Error('User gesture needed'); } }), false);
  assert.equal(await requestVideoFullscreen({}), false);
});

test('Back exits the video player without pausing, disconnecting or navigating', async () => {
  const calls = [];
  const video = { webkitDisplayingFullscreen: true, webkitExitFullscreen() { calls.push('exit-video'); } };
  const document = { fullscreenElement: null, exitFullscreen() { calls.push('exit-document'); } };
  assert.equal(isVideoFullscreen(video, document), true);
  assert.equal(await exitVideoFullscreen(video, document), true);
  assert.deepEqual(calls, ['exit-video']);
});

test('standard Back exits element fullscreen', async () => {
  let exited = false;
  const video = {};
  const document = { fullscreenElement: video, exitFullscreen() { exited = true; } };
  assert.equal(await exitVideoFullscreen(video, document), true);
  assert.equal(exited, true);
});
