import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getRemainingMediaSelectionSlots,
  MAX_MEDIA_SELECTION_ITEMS,
} from '../lib/media-selection.ts';

test('each media type starts with one free selection', () => {
  assert.equal(getRemainingMediaSelectionSlots(false, 0), 1);
  assert.equal(getRemainingMediaSelectionSlots(false, 1), 0);
});

test('a rewarded unlock allows up to 20 items in that media queue', () => {
  assert.equal(getRemainingMediaSelectionSlots(true, 0), MAX_MEDIA_SELECTION_ITEMS);
  assert.equal(getRemainingMediaSelectionSlots(true, 1), 19);
  assert.equal(getRemainingMediaSelectionSlots(true, 19), 1);
  assert.equal(getRemainingMediaSelectionSlots(true, 20), 0);
  assert.equal(getRemainingMediaSelectionSlots(true, 21), 0);
});
