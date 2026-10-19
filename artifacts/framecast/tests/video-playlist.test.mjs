import assert from 'node:assert/strict';
import { test } from 'node:test';
import { movePlaylistItem, playlistNeighbour, MAX_PLAYLIST_ITEMS } from '../src/lib/video-playlist.ts';
import { preserveBrowserSelection } from '../src/lib/browser-media.ts';

test('playlist plays first then second then third and stops at the end rather than looping', () => {
  assert.equal(playlistNeighbour(3, 0, 1), 1);
  assert.equal(playlistNeighbour(3, 1, 1), 2);
  assert.equal(playlistNeighbour(3, 2, 1), null);
  assert.equal(playlistNeighbour(3, 0, -1), null);
  assert.equal(playlistNeighbour(3, 2, -1), 1);
  assert.equal(playlistNeighbour(0, 0, 1), null);
});

test('reordering preserves the exact File objects and lets the playing file keep its identity', () => {
  const files = [{ name: 'one.mp4' }, { name: 'two.mp4' }, { name: 'three.mp4' }];
  const moved = movePlaylistItem(files, 2, 0);
  assert.deepEqual(moved.map(item => item.name), ['three.mp4', 'one.mp4', 'two.mp4']);
  assert.equal(moved.indexOf(files[0]), 1);
  assert.deepEqual(files.map(item => item.name), ['one.mp4', 'two.mp4', 'three.mp4']);
  assert.equal(moved[0], files[2]);
  assert.deepEqual(movePlaylistItem(files, -1, 0), files);
  assert.deepEqual(movePlaylistItem(files, 0, 99), files);
});

test('a full video playlist retains on-demand handles without reading or buffering entire movies', async () => {
  const videos = Array.from({ length: MAX_PLAYLIST_ITEMS }, (_, index) => ({
    name: `${index + 1}.mp4`, type: 'video/mp4', size: 1024 * 1024 * 1024,
    arrayBuffer() { throw Error('Must not preload videos'); },
    slice() { throw Error('Must not probe movies before they play'); },
  }));
  const selected = await preserveBrowserSelection(videos, () => false, { liveVideo: true });
  assert.deepEqual(selected, videos);
  assert.equal(selected.length, 30);
  assert.ok(selected.every((file, index) => file === videos[index]));
});
