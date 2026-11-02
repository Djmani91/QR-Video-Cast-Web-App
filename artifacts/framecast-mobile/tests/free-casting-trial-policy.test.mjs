import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createFreeCastingTrialRecord,
  FREE_CASTING_TRIAL_DURATION_MS,
  formatFreeCastingTrialTime,
  parseFreeCastingTrialRecord,
  remainingFreeCastingTrialMs,
} from '../lib/free-casting-trial-policy.ts';

test('new customers receive one full 30-minute trial', () => {
  assert.deepEqual(createFreeCastingTrialRecord(), {
    hasStarted: false,
    remainingMs: 30 * 60 * 1000,
  });
});

test('trial progress is based on connected foreground time and pauses on disconnect', () => {
  const record = { hasStarted: true, remainingMs: FREE_CASTING_TRIAL_DURATION_MS };
  assert.equal(remainingFreeCastingTrialMs(record, 1_000, 11_000), FREE_CASTING_TRIAL_DURATION_MS - 10_000);
  assert.equal(remainingFreeCastingTrialMs({ hasStarted: true, remainingMs: 42_000 }, null, 80_000), 42_000);
});

test('expired trial time never becomes negative or restarts on reconnect', () => {
  const record = { hasStarted: true, remainingMs: 5_000 };
  assert.equal(remainingFreeCastingTrialMs(record, 10_000, 20_000), 0);
  assert.equal(parseFreeCastingTrialRecord(JSON.stringify({ hasStarted: true, remainingMs: 0 })).remainingMs, 0);
});

test('stored trial values are validated and clamped to the original allowance', () => {
  assert.equal(parseFreeCastingTrialRecord(null).remainingMs, FREE_CASTING_TRIAL_DURATION_MS);
  assert.equal(parseFreeCastingTrialRecord('not-json'), null);
  assert.equal(parseFreeCastingTrialRecord(JSON.stringify({ hasStarted: false, remainingMs: 90_000_000 })).remainingMs, FREE_CASTING_TRIAL_DURATION_MS);
  assert.equal(parseFreeCastingTrialRecord(JSON.stringify({ hasStarted: false, remainingMs: -10 })).remainingMs, 0);
});

test('countdown displays minutes and seconds without showing extra time', () => {
  assert.equal(formatFreeCastingTrialTime(30 * 60 * 1000), '30:00');
  assert.equal(formatFreeCastingTrialTime(1_001), '0:02');
  assert.equal(formatFreeCastingTrialTime(0), '0:00');
});
