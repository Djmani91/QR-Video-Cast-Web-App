import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  shouldAttemptBetweenVideoInterstitial,
  shouldShowPairingInterstitial,
  VIDEO_BREAK_AD_COOLDOWN_MS,
} from '../lib/pairing-ad.ts';

test('a pairing gets one interstitial, but rerenders of that room do not', () => {
  assert.equal(shouldShowPairingInterstitial('room-a', ''), true);
  assert.equal(shouldShowPairingInterstitial('room-a', 'room-a'), false);
});

test('a new room can show its own interstitial', () => {
  assert.equal(shouldShowPairingInterstitial('room-b', 'room-a'), true);
  assert.equal(shouldShowPairingInterstitial('', 'room-a'), false);
});

test('between-video interstitials wait for two completed videos', () => {
  assert.equal(shouldAttemptBetweenVideoInterstitial(1, null, 10_000), false);
  assert.equal(shouldAttemptBetweenVideoInterstitial(2, null, 10_000), true);
});

test('between-video interstitials are limited to one attempt per cooldown', () => {
  assert.equal(shouldAttemptBetweenVideoInterstitial(4, 10_000, 10_000 + VIDEO_BREAK_AD_COOLDOWN_MS - 1), false);
  assert.equal(shouldAttemptBetweenVideoInterstitial(4, 10_000, 10_000 + VIDEO_BREAK_AD_COOLDOWN_MS), true);
});
