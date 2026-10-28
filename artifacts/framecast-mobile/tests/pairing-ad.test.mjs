import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldShowPairingInterstitial } from '../lib/pairing-ad.ts';

test('a pairing gets one interstitial, but rerenders of that room do not', () => {
  assert.equal(shouldShowPairingInterstitial('room-a', ''), true);
  assert.equal(shouldShowPairingInterstitial('room-a', 'room-a'), false);
});

test('a new room can show its own interstitial', () => {
  assert.equal(shouldShowPairingInterstitial('room-b', 'room-a'), true);
  assert.equal(shouldShowPairingInterstitial('', 'room-a'), false);
});
