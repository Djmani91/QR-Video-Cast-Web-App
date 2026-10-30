import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTvRoomUrl } from '../lib/tv-room-url.ts';

test('nearby TV launch URL joins the room created by the phone', () => {
  const url = new URL(buildTvRoomUrl({
    id: 'a4acb99b-6291-46dd-a412-6725109f7441',
    code: '12345',
    expiresAt: '2026-10-30T21:00:00.000Z',
  }));
  assert.equal(url.origin, 'https://2tx1.com');
  assert.equal(url.searchParams.get('join'), 'a4acb99b-6291-46dd-a412-6725109f7441');
  assert.equal(url.searchParams.get('code'), '12345');
  assert.equal(url.searchParams.get('expiresAt'), '2026-10-30T21:00:00.000Z');
});
