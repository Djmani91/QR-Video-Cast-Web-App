import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

test('Samsung URL entry uses the TV remote text-input Press command', () => {
  const sourcePath = new URL('../native/android/TvDiscovery.kt', import.meta.url);
  const nativeSource = fs.readFileSync(
    sourcePath,
    'utf8',
  );
  const generatedSource = fs.readFileSync(
    new URL('../android/app/src/main/java/com/tvcast/com/casting/TvDiscovery.kt', import.meta.url),
    'utf8',
  );
  assert.match(
    nativeSource,
    /remoteKey\("Press",\s*target\.toString\(\),\s*"SendInputString"\)/,
  );
  assert.match(nativeSource, /JSONObject\(\)[\s\S]*?put\("DataOfCmd", data\)/);
  assert.match(generatedSource, /remoteKey\("Press",\s*target\.toString\(\),\s*"SendInputString"\)/);
  assert.match(generatedSource, /JSONObject\(\)[\s\S]*?put\("DataOfCmd", data\)/);
});
