import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertBrowserFileReadable,
  preserveBrowserSelection,
  SELECTION_MEMORY_BUDGET,
  SelectedMediaAccessError,
  isSelectedMediaAccessError,
} from '../src/lib/browser-media.ts';

test('small video becomes an independent in-memory File before its picker permission expires', async () => {
  const source = new File([new Uint8Array([1, 2, 3, 4])], 'phone.mp4', { type: 'video/mp4', lastModified: 123 });
  const [safe] = await preserveBrowserSelection([source]);
  Object.defineProperty(source, 'arrayBuffer', { value: () => Promise.reject(new DOMException('Permission expired', 'NotReadableError')) });
  assert.notEqual(safe, source);
  assert.equal(safe.name, 'phone.mp4');
  assert.equal(safe.lastModified, 123);
  assert.deepEqual([...new Uint8Array(await safe.arrayBuffer())], [1, 2, 3, 4]);
  await assertBrowserFileReadable(safe);
});

test('large videos only read small head/tail probes and retain the original File', async () => {
  const reads = [];
  const size = SELECTION_MEMORY_BUDGET + 10_000_000;
  const source = {
    name: 'long-film.mp4', type: 'video/mp4', size,
    arrayBuffer() { throw Error('Must not load the whole video'); },
    slice(start, end) { reads.push([start, end]); return { arrayBuffer: async () => new ArrayBuffer(end - start) }; },
  };
  const [safe] = await preserveBrowserSelection([source]);
  assert.equal(safe, source);
  assert.equal(reads.length, 2);
  assert.ok(reads.every(([start, end]) => end - start <= 65536));
  assert.equal(reads[1][1], size);
});

test('memory budget applies to the entire photo queue, not independently to each file', async () => {
  const photo = new File([new Uint8Array(17 * 1024 * 1024)], 'one.jpg', { type: 'image/jpeg' });
  const another = new File([new Uint8Array(17 * 1024 * 1024)], 'two.jpg', { type: 'image/jpeg' });
  const safe = await preserveBrowserSelection([photo, another]);
  assert.notEqual(safe[0], photo);
  assert.equal(safe[1], another);
});

test('revoked picker access becomes an actionable selection error, not a Wi-Fi error', async () => {
  const unreadable = {
    size: 1024,
    arrayBuffer: async () => { throw new DOMException('Permission expired', 'NotReadableError'); },
    slice() { return { arrayBuffer: this.arrayBuffer }; },
  };
  await assert.rejects(preserveBrowserSelection([unreadable]), SelectedMediaAccessError);
  await assert.rejects(assertBrowserFileReadable(unreadable), /Choose the photo or video again/);
  assert.equal(isSelectedMediaAccessError(new DOMException('Unreadable', 'NotReadableError')), true);
  assert.equal(isSelectedMediaAccessError(new Error('Unsupported codec')), false);
});

test('cancellation never replaces a newer selection with a stale file', async () => {
  let cancel = false;
  const source = new File(['video'], 'one.mp4', { type: 'video/mp4' });
  const originalRead = source.arrayBuffer.bind(source);
  source.arrayBuffer = async () => { const bytes = await originalRead(); cancel = true; return bytes; };
  assert.equal(await preserveBrowserSelection([source], () => cancel), null);
});

test('a partial/empty provider read is rejected before connecting to the TV', async () => {
  const partial = { size: 100, arrayBuffer: async () => new ArrayBuffer(0) };
  await assert.rejects(preserveBrowserSelection([partial]), SelectedMediaAccessError);
});

test('live video selection never copies or probes the movie, regardless of size or MP4 index position', async () => {
  for (const size of [1_000_000, 12_000_000, 256_000_000, 8 * 1024 ** 3]) {
    const source = {
      name: 'original.mov', type: 'video/quicktime', size,
      arrayBuffer() { throw Error('A live video must not be copied'); },
      slice() { throw Error('A live video must not be probed at its tail'); },
    };
    const selected = await preserveBrowserSelection([source], () => false, { liveVideo: true });
    assert.equal(selected[0], source);
  }
});

test('on-demand live selection still rejects empty files and honors cancellation', async () => {
  await assert.rejects(preserveBrowserSelection([{ size: 0, type: 'video/mp4' }], () => false, { liveVideo: true }), SelectedMediaAccessError);
  assert.equal(await preserveBrowserSelection([{ size: 10, type: 'video/mp4' }], () => true, { liveVideo: true }), null);
});
