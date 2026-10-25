import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getTemporaryMediaUris,
  getUnsupportedTvVideoHelp,
  isUnsupportedTvVideoError,
} from '../lib/video-compatibility.ts';

test('only unsupported TV codec errors trigger conversion guidance', () => {
  assert.equal(isUnsupportedTvVideoError(
    'This TV browser does not support this video format or codec. Try a standard H.264/AVC MP4.',
  ), true);
  assert.equal(isUnsupportedTvVideoError(
    'The TV is playing sound but has not decoded a picture. HEVC/H.265 may not be supported.',
  ), true);
  assert.equal(isUnsupportedTvVideoError('The TV connection was interrupted.'), false);
  assert.equal(isUnsupportedTvVideoError('Press Play on the TV remote to start this video.'), false);
});

test('converter guidance names the recommended format and warns about third-party uploads', () => {
  const message = getUnsupportedTvVideoHelp('The TV could not decode this video.');
  assert.match(message, /did not identify the exact video codec/i);
  assert.match(message, /MP4 with H\.264\/AVC video and AAC audio/i);
  assert.match(message, /FrameCast will not upload your video/i);
  assert.match(message, /CloudConvert.*receives and processes it/i);
});

test('temporary media cleanup keeps only the staged original file', () => {
  assert.deepEqual(getTemporaryMediaUris({
    uri: 'file:///cache/framecast-transfer-1792454412345-abc1234.mov',
    temporaryCopy: true,
  }), [
    'file:///cache/framecast-transfer-1792454412345-abc1234.mov',
  ]);
  assert.deepEqual(getTemporaryMediaUris({
    uri: 'content://photos/original.mp4',
    temporaryCopy: false,
  }), []);
});
