import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FREE_CASTING_DURATION_MS,
  REWARDED_CASTING_EXTENSION_MS,
  extendCastingDeadline,
  formatCastingTime,
  getCastingTimeRemaining,
  startCastingDeadline,
} from '../lib/casting-session.ts';

test('a new pairing starts with one free hour', () => {
  assert.equal(startCastingDeadline(1000), 1000 + FREE_CASTING_DURATION_MS);
});

test('a completed rewarded ad adds one hour from now or the current deadline', () => {
  assert.equal(extendCastingDeadline(1000, 500), 1000 + REWARDED_CASTING_EXTENSION_MS);
  assert.equal(extendCastingDeadline(1000, 2000), 2000 + REWARDED_CASTING_EXTENSION_MS);
});

test('casting time never becomes negative and displays as a countdown', () => {
  assert.equal(getCastingTimeRemaining(1000, 2000), 0);
  assert.equal(formatCastingTime(3_600_000), '1:00:00');
  assert.equal(formatCastingTime(65_000), '1:05');
  assert.equal(formatCastingTime(0), '0:00');
});
