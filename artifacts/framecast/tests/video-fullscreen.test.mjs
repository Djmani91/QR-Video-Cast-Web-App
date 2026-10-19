import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestVideoFullscreen, exitVideoFullscreen, isVideoFullscreen, requestMediaFullscreen } from '../src/lib/video-fullscreen.ts';

test('prefers the TV native video player rather than fullscreening the webpage', async () => {
  const calls = [];
  const video = {
    webkitEnterFullscreen() { calls.push('native-video'); this.webkitDisplayingFullscreen = true; },
    requestFullscreen() { calls.push('standard-video'); },
  };
  assert.equal(await requestVideoFullscreen(video), true);
  assert.deepEqual(calls, ['native-video']);
});

test('falls back to video element fullscreen when a native API is exposed but rejects', async () => {
  const calls = [];
  const video = {
    ownerDocument: { fullscreenElement: null },
    webkitEnterFullscreen() { calls.push('native'); throw Error('Unsupported'); },
    requestFullscreen() { calls.push('video'); this.ownerDocument.fullscreenElement = this; return Promise.resolve(); },
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

test('photos request fullscreen for their gallery container, preserving zoom and navigation', async () => {
  let owner;
  const gallery = { ownerDocument: { fullscreenElement: null }, requestFullscreen() { owner = this; this.ownerDocument.fullscreenElement = this; } };
  assert.equal(await requestMediaFullscreen(gallery), true);
  assert.equal(owner, gallery);
});

test('gallery fullscreen falls back to the TV prefix and reports permission denial', async () => {
  let requested = false;
  assert.equal(await requestMediaFullscreen({
    ownerDocument: { fullscreenElement: null },
    requestFullscreen: async () => { throw Error('Unsupported'); },
    webkitRequestFullScreen() { requested = true; this.ownerDocument.fullscreenElement = this; },
  }), true);
  assert.equal(requested, true);
  assert.equal(await requestMediaFullscreen({ requestFullscreen: async () => { throw Error('Gesture required'); } }), false);
});

test('a native API that silently does nothing is not reported as fullscreen', async () => {
  const calls = [];
  const video = {
    ownerDocument: { fullscreenElement: null },
    webkitEnterFullscreen() { calls.push('native-no-op'); },
    requestFullscreen() { calls.push('chrome-fullscreen'); this.ownerDocument.fullscreenElement = this; },
  };
  assert.equal(await requestVideoFullscreen(video), true);
  assert.deepEqual(calls, ['native-no-op', 'chrome-fullscreen']);
  assert.equal(await requestVideoFullscreen({ webkitEnterFullscreen() {} }), false);
});

test('live WebRTC video prefers real element fullscreen over a TV file-only native player', async () => {
  const calls = [];
  const video = {
    srcObject: {},
    ownerDocument: { fullscreenElement: null },
    webkitEnterFullscreen() { calls.push('file-only-native'); },
    requestFullscreen() { calls.push('chrome-fullscreen'); this.ownerDocument.fullscreenElement = this; },
  };
  assert.equal(await requestVideoFullscreen(video), true);
  assert.deepEqual(calls, ['chrome-fullscreen']);
});

test('a no-op gallery fullscreen request keeps the fullscreen prompt available', async () => {
  assert.equal(await requestMediaFullscreen({ requestFullscreen() {} }), false);
});
