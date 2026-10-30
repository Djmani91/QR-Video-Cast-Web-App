import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../app/index.tsx', import.meta.url), 'utf8');

test('signals the TV to stay on its playback screen before the next-video ad break', () => {
  assert.match(source, /framecast: 'playlist-next-loading'/);
  assert.match(source, /packet\.framecast === 'playlist-next-loading-ack'/);

  const start = source.indexOf('const continueVideoQueue = async');
  const end = source.indexOf('continueVideoQueueRef.current =', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const queueFlow = source.slice(start, end);
  assert.ok(
    queueFlow.indexOf('await requestTvPlaylistTransition()') < queueFlow.indexOf('showBetweenVideoInterstitialAd'),
    'the TV receives its loading-screen signal before the ad break and next connection',
  );
});
