import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDirectTvRoom } from '../src/lib/direct-tv-room.ts';

test('direct TV launch can join a room created by the phone', () => {
  const search = new URLSearchParams({
    join: 'a4acb99b-6291-46dd-a412-6725109f7441',
    code: '12345',
    expiresAt: '2026-10-30T21:00:00.000Z',
  }).toString();

  assert.deepEqual(parseDirectTvRoom(`?${search}`), {
    id: 'a4acb99b-6291-46dd-a412-6725109f7441',
    code: '12345',
    expiresAt: '2026-10-30T21:00:00.000Z',
  });
});

test('direct TV launch rejects incomplete or malformed room addresses', () => {
  assert.equal(parseDirectTvRoom('?join=not-a-room&code=12345&expiresAt=2026-10-30'), null);
  assert.equal(parseDirectTvRoom('?join=a4acb99b-6291-46dd-a412-6725109f7441&code=12'), null);
});
