import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import {
  parseVideoBrowserMessage,
  VIDEO_BROWSER_DETECTION_SCRIPT,
} from '../lib/video-browser-detector.ts';

test('the injected browser scan reports normal video-element URLs and marks blob streams opaque', () => {
  const messages = [];
  const videoElements = [
    {
      currentSrc: 'https://cdn.example.test/live/master.m3u8?token=abc',
      src: '',
      querySelectorAll: () => [],
    },
    {
      currentSrc: 'blob:https://social.example.test/session/123',
      src: '',
      querySelectorAll: () => [],
    },
  ];
  const document = {
    title: 'Example video page',
    querySelectorAll(selector) {
      if (selector === 'video') return videoElements;
      return [];
    },
    addEventListener() {},
  };
  const window = {
    location: { href: 'https://example.test/watch' },
    ReactNativeWebView: {
      postMessage: (message) => messages.push(message),
    },
    setInterval() {},
    setTimeout() {},
  };

  runInNewContext(VIDEO_BROWSER_DETECTION_SCRIPT, {
    document,
    window,
    location: window.location,
    URL,
    JSON,
    Map,
    Array,
  });

  assert.equal(messages.length, 1);
  const scan = parseVideoBrowserMessage(messages[0]);
  assert.deepEqual(scan, {
    pageTitle: 'Example video page',
    videoCount: 2,
    opaqueVideoCount: 1,
    candidates: [{
      url: 'https://cdn.example.test/live/master.m3u8?token=abc',
      label: 'HLS stream',
    }],
  });
});

test('the native bridge accepts only bounded HTTP(S) candidates', () => {
  const result = parseVideoBrowserMessage(JSON.stringify({
    type: 'framecast_video_scan',
    pageTitle: 'A'.repeat(300),
    videoCount: 200,
    opaqueVideoCount: -1,
    candidates: [
      { url: 'https://media.example.test/clip.mp4?token=1', label: 'Video file' },
      { url: 'https://media.example.test/clip.mp4?token=1', label: 'Duplicate' },
      { url: 'blob:https://site.example.test/stream', label: 'Opaque' },
      { url: 'javascript:alert(1)', label: 'Unsafe' },
      { url: 'https://user:password@media.example.test/video.mp4', label: 'Credentials' },
    ],
  }));

  assert.equal(result?.pageTitle.length, 160);
  assert.equal(result?.videoCount, 100);
  assert.equal(result?.opaqueVideoCount, 0);
  assert.deepEqual(result?.candidates, [{
    url: 'https://media.example.test/clip.mp4?token=1',
    label: 'Video file',
  }]);
  assert.equal(parseVideoBrowserMessage('not-json'), null);
  assert.equal(parseVideoBrowserMessage(JSON.stringify({ type: 'other' })), null);
});
