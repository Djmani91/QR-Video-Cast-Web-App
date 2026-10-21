import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTemporaryMediaUris, shouldOfferPhoneConversion } from '../lib/video-compatibility.ts';

test('phone conversion is offered for unsupported Android video codecs only', () => {
  assert.equal(shouldOfferPhoneConversion(
    'android',
    'video',
    'This TV browser does not support this video format or codec. Try a standard H.264/AVC MP4.',
    false,
  ), true);
  assert.equal(shouldOfferPhoneConversion(
    'android',
    'video',
    'The TV is playing sound but has not decoded a picture. HEVC/H.265 may not be supported.',
    false,
  ), true);
  assert.equal(shouldOfferPhoneConversion('android', 'video', 'The TV connection was interrupted.', false), false);
  assert.equal(shouldOfferPhoneConversion('android', 'image', 'unsupported codec', false), false);
  assert.equal(shouldOfferPhoneConversion('ios', 'video', 'unsupported codec', false), false);
  assert.equal(shouldOfferPhoneConversion('android', 'video', 'unsupported codec', true), false);
});

test('temporary media cleanup keeps staged originals and their converted TV copies', () => {
  assert.deepEqual(getTemporaryMediaUris({
    uri: 'file:///cache/framecast-transfer-1792454412345-abc1234.mov',
    temporaryCopy: true,
    compatibleUri: 'file:///cache/framecast-converted-1792454412345-abc1234.mp4',
  }), [
    'file:///cache/framecast-transfer-1792454412345-abc1234.mov',
    'file:///cache/framecast-converted-1792454412345-abc1234.mp4',
  ]);
  assert.deepEqual(getTemporaryMediaUris({
    uri: 'content://photos/original.mp4',
    temporaryCopy: false,
  }), []);
});
