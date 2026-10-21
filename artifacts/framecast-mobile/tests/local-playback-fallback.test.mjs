import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  BUFFERED_VIDEO_FALLBACK_MAX_BYTES,
  LOCAL_PLAYBACK_FALLBACK_TIMEOUT_MS,
  shouldUseBufferedVideoFallback,
} from '../lib/local-playback-fallback.ts';

test('small videos can fall back when the TV cannot open the direct player', () => {
  assert.equal(shouldUseBufferedVideoFallback(31 * 1024 * 1024), true);
});

test('large, missing, or invalid videos never trigger a whole-file fallback', () => {
  assert.equal(shouldUseBufferedVideoFallback(BUFFERED_VIDEO_FALLBACK_MAX_BYTES + 1), false);
  assert.equal(shouldUseBufferedVideoFallback(0), false);
  assert.equal(shouldUseBufferedVideoFallback(Number.NaN), false);
});

test('direct playback fallback starts after a bounded TV-open wait', () => {
  assert.equal(LOCAL_PLAYBACK_FALLBACK_TIMEOUT_MS, 3_000);
});

test('an unreachable phone-hosted receiver triggers the phone compatibility fallback', async () => {
  const app = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
  const start = app.indexOf("if (signal.type === 'player-state'");
  const end = app.indexOf('setRemoteVideoPosition({', start);
  const handler = app.slice(start, end);
  assert.match(handler, /state\.message === 'TV_LOCAL_SERVER_UNREACHABLE'/);
  assert.match(handler, /localFallbackRef\.current\?\.\(\)/);
});
