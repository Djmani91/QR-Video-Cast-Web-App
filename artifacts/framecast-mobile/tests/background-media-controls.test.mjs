import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { findAdjacentVideoIndex } from '../lib/video-playlist-controls.ts';

const service = readFileSync(
  new URL('../native/android/BackgroundCastingService.kt', import.meta.url),
  'utf8',
);
const app = readFileSync(new URL('../app/index.tsx', import.meta.url), 'utf8');

test('lock-screen previous and next skip photos and choose video queue entries', () => {
  const items = [
    { kind: 'video' },
    { kind: 'image' },
    { kind: 'video' },
    { kind: 'image' },
    { kind: 'video' },
  ];

  assert.equal(findAdjacentVideoIndex(items, 2, -1), 0);
  assert.equal(findAdjacentVideoIndex(items, 2, 1), 4);
  assert.equal(findAdjacentVideoIndex(items, 0, -1), null);
  assert.equal(findAdjacentVideoIndex(items, 4, 1), null);
});

test('background media actions navigate playlist videos rather than seeking', () => {
  assert.match(service, /onSkipToPrevious\(\) = control\("playlist:previous"\)/);
  assert.match(service, /onSkipToNext\(\) = control\("playlist:next"\)/);
  assert.match(app, /findAdjacentVideoIndex\(mediaQueueRef\.current/);
});

test('background notification has only previous, play-pause, and next controls', () => {
  const notificationStart = service.indexOf('private fun notification()');
  const notificationEnd = service.indexOf('override fun onDestroy()', notificationStart);
  const notification = service.slice(notificationStart, notificationEnd);

  assert.equal([...notification.matchAll(/\.addAction\(/g)].length, 3);
  assert.match(notification, /"Previous video"/);
  assert.match(notification, /"Next video"/);
  assert.match(notification, /setShowActionsInCompactView\(0, 1, 2\)/);
  assert.doesNotMatch(notification, /"Back 10 seconds"|"Forward 10 seconds"|"Disconnect"/);
});
