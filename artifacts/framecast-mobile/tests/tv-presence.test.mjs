import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(path) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: module.exports, module });
  return module.exports;
}
const { createTvPresence } = load('../lib/tv-presence.ts');
const { parseSavedTvRoom } = load('../../framecast/src/lib/tv-room-resume.ts');

test('a room ID or an old receiver reply is not proof of a live TV', () => {
  let now = 100;
  const presence = createTvPresence(() => now);
  assert.equal(presence.status(), 'checking');
  assert.equal(presence.acknowledge('previous-session'), false);
  now += 12_000;
  assert.equal(presence.status(), 'reconnecting');
  now += 33_000;
  assert.equal(presence.status(), 'lost');
});
test('fresh TV acknowledgements maintain and recover the connection', () => {
  let now = 100;
  const presence = createTvPresence(() => now);
  presence.acknowledge(presence.challenge);
  assert.equal(presence.status(), 'online');
  now += 20_000;
  assert.equal(presence.status(), 'reconnecting');
  assert.equal(presence.acknowledge(presence.challenge), true);
  assert.equal(presence.status(), 'online');
});
test('returning from a suspended free app gets a new grace period, not an unpair', () => {
  let now = 100;
  const presence = createTvPresence(() => now);
  presence.acknowledge(presence.challenge);
  now += 2 * 60 * 60 * 1000;
  presence.resume();
  assert.equal(presence.status(), 'checking');
  presence.acknowledge(presence.challenge);
  assert.equal(presence.status(), 'online');
});
test('a short permission dialog does not invalidate a fresh TV reply', () => {
  let now = 100;
  const presence = createTvPresence(() => now);
  presence.acknowledge(presence.challenge);
  now += 3_000;
  presence.resume();
  assert.equal(presence.status(), 'online');
});
test('refresh restores the same unexpired TV room and paired state', () => {
  const room = { id: '12345678-1234-1234-1234-123456789abc', code: '12345',
    expiresAt: new Date(Date.now() + 60_000).toISOString(), paired: true };
  const restored = parseSavedTvRoom(JSON.stringify(room));
  assert.equal(restored.id, room.id);
  assert.equal(restored.code, room.code);
  assert.equal(restored.paired, true);
  assert.equal(parseSavedTvRoom(JSON.stringify(room), Date.now() + 61_000), null);
  assert.equal(parseSavedTvRoom('broken JSON'), null);
});
test('both TV receiver pages answer challenges; background close preserves the room', () => {
  const tv = readFileSync(new URL('../../framecast/src/App.tsx', import.meta.url), 'utf8');
  const local = readFileSync(new URL('../lib/local-receiver.ts', import.meta.url), 'utf8');
  const phone = readFileSync(new URL('../app/index.tsx', import.meta.url), 'utf8');
  assert.match(tv, /action === 'connection-ping'/);
  assert.match(tv, /action: 'connection-pong'/);
  assert.match(local, /action==='connection-ping'/);
  assert.match(local, /action:'connection-pong'/);
  const backgroundHandler = phone.slice(phone.indexOf('const stopFreeCastingForBackground'), phone.indexOf('const startScreenMirror'));
  assert.match(backgroundHandler, /closePeer\(true\)/);
  assert.doesNotMatch(backgroundHandler, /leaveRoom\(|setRoomId\(''\)|closePeer\(true, true\)/);
  assert.match(local, /else\{target.searchParams.set\('resume','1'\)/);
});
