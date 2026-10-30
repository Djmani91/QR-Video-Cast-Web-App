import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getRemainingMediaSelectionSlots,
  getRemainingPremiumMediaSelectionSlots,
  MAX_MEDIA_SELECTION_ITEMS,
  REWARDED_MEDIA_SELECTION_LIMIT,
} from '../lib/media-selection.ts';

test('each media type starts with one free selection', () => {
  assert.equal(getRemainingMediaSelectionSlots(false, 0), 1);
  assert.equal(getRemainingMediaSelectionSlots(false, 1), 0);
});

test('a rewarded ad unlocks one additional selection for that media type', () => {
  assert.equal(getRemainingMediaSelectionSlots(true, 0), REWARDED_MEDIA_SELECTION_LIMIT);
  assert.equal(getRemainingMediaSelectionSlots(true, 1), 1);
  assert.equal(getRemainingMediaSelectionSlots(true, 2), 0);
  assert.equal(getRemainingMediaSelectionSlots(true, 3), 0);
});

test('Premium allows up to 20 items in that media queue', () => {
  assert.equal(getRemainingPremiumMediaSelectionSlots(0), MAX_MEDIA_SELECTION_ITEMS);
  assert.equal(getRemainingPremiumMediaSelectionSlots(1), 19);
  assert.equal(getRemainingPremiumMediaSelectionSlots(19), 1);
  assert.equal(getRemainingPremiumMediaSelectionSlots(20), 0);
  assert.equal(getRemainingPremiumMediaSelectionSlots(21), 0);
});
