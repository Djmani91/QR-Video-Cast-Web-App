import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeRotation, orientationFromTrack, requiredVideoRotation } from '../src/lib/media-orientation.ts';

test('phone track rotation is kept separately from encoded pixel dimensions', () => {
  assert.deepEqual(orientationFromTrack({
    matrix: [0, 65536, 0, -65536, 0, 0, 1280, 0, 1073741824],
    video: { width: 720, height: 1280 },
  }), { rotation: 90, encodedWidth: 720, encodedHeight: 1280 });
});
test('clockwise and counterclockwise phone rotations retain their direction', () => {
  assert.equal(orientationFromTrack({ matrix: [0, -65536, 0, 65536, 0] }).rotation, 270);
  assert.equal(normalizeRotation(-90), 270);
  assert.equal(normalizeRotation(450), 90);
  assert.equal(normalizeRotation(Number.NaN), 0);
});
test('a TV ignoring original rotation gets the missing correction', () => {
  assert.equal(requiredVideoRotation({ rotation: 90, encodedWidth: 720, encodedHeight: 1280 }, 720, 1280), 90);
});
test('a TV already honoring original rotation does not get rotated twice', () => {
  assert.equal(requiredVideoRotation({ rotation: 90, encodedWidth: 720, encodedHeight: 1280 }, 1280, 720), 0);
});
test('normalized streaming pixels have exactly one explicit receiver rotation', () => {
  for (const rotation of [0, 90, 180, 270]) {
    assert.equal(requiredVideoRotation({ rotation, encodedWidth: 720, encodedHeight: 1280, orientationNormalized: true }, 720, 1280), rotation);
  }
});
test('genuine portrait and landscape files stay in their original orientation', () => {
  assert.equal(requiredVideoRotation({ rotation: 0, encodedWidth: 720, encodedHeight: 1280 }, 720, 1280), 0);
  assert.equal(requiredVideoRotation({ rotation: 0, encodedWidth: 1280, encodedHeight: 720 }, 1280, 720), 0);
  assert.equal(requiredVideoRotation(null, 720, 1280), 0);
});
