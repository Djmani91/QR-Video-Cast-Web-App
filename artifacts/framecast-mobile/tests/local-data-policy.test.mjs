import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearFrameCastCache, isFrameCastCacheEntry } from '../lib/local-data-policy.ts';

const cache = 'file:///data/user/0/com.tvcast.com/cache/';
const transfer = 'framecast-transfer-1792454412345-abc1234.MP4';
const converted = 'framecast-converted-1792454412345-abc1234.mp4';
const receiver = 'framecast-receiver-mg12345abcdefghij';

test('only generated FrameCast items directly inside the app cache are removed', () => {
  const deleted = [];
  const item = (name, uri = cache + name) => ({ name, uri, delete: () => deleted.push(uri) });
  const entries = [
    item(transfer),
    item(converted),
    item(receiver, cache + receiver + '/'),
    item('original-video.mp4'),
    item('framecast-transfer-family-photo.jpg'),
    item(transfer, 'file:///storage/emulated/0/DCIM/' + transfer),
    item(transfer, 'content://photos/' + transfer),
    item(transfer, cache + 'another-folder/' + transfer),
    item('../' + transfer),
  ];
  assert.equal(clearFrameCastCache(cache, entries), 3);
  assert.deepEqual(deleted, [cache + transfer, cache + converted, cache + receiver + '/']);
});

test('original photo/library and browser URIs are not considered temporary app copies', () => {
  for (const uri of ['ph://library/item', 'content://media/123', 'blob:https://framecast/item', 'file:///DCIM/' + transfer]) {
    assert.equal(isFrameCastCacheEntry(cache, { name: transfer, uri }), false);
  }
});

test('only the app-scoped picker/preview cache directories are included', () => {
  for (const name of ['ImagePicker', 'ImageManipulator']) {
    assert.equal(isFrameCastCacheEntry(cache, { name, uri: cache + name + '/', directory: true }), true);
    assert.equal(isFrameCastCacheEntry(cache, { name, uri: cache + name, directory: false }), false);
    assert.equal(isFrameCastCacheEntry(cache, { name, uri: 'file:///DCIM/' + name, directory: true }), false);
  }
  assert.equal(isFrameCastCacheEntry(cache, { name: 'OtherApp', uri: cache + 'OtherApp/', directory: true }), false);
});

test('invalid or traversal cache roots fail instead of claiming successful cleanup', () => {
  for (const uri of ['', 'file:///', 'content://media/', 'file:///cache/../DCIM/']) {
    assert.throws(() => clearFrameCastCache(uri, []), /temporary folder is unavailable/);
  }
});

test('cleanup attempts all owned items and reports deletion failures', () => {
  let removed = false;
  assert.throws(() => clearFrameCastCache(cache, [
    { name: transfer, uri: cache + transfer, delete() { throw new Error('File locked'); } },
    { name: receiver, uri: cache + receiver, delete() { removed = true; } },
  ]), /could not be removed/);
  assert.equal(removed, true);
});
