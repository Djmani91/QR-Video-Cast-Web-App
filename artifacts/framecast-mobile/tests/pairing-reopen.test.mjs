import test from 'node:test';
import assert from 'node:assert/strict';
import { createPairingResume } from '../lib/pairing-resume.ts';
import { createPhonePresence } from '../../framecast/src/lib/phone-presence.ts';
import { readFileSync } from 'node:fs';

const room = '12345678-1234-1234-1234-123456789abc';
function memory() {
  const values = new Map();
  return {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
    values,
  };
}
test('reopening restores a short-lived room pointer but no media or entitlement', async () => {
  let time = 100;
  const store = memory();
  await createPairingResume(store, () => time).save(room);
  time += 30 * 60 * 1000;
  assert.equal(await createPairingResume(store, () => time).read(), room);
  assert.deepEqual(Object.keys(JSON.parse([...store.values.values()][0])).sort(), ['expiresAt', 'roomId']);
  time += 4 * 60 * 60 * 1000;
  assert.equal(await createPairingResume(store, () => time).read(), null);
  assert.equal(store.values.size, 0);
});
test('disconnect cannot be undone by a pending save', async () => {
  const resume = createPairingResume(memory());
  const saving = resume.save(room);
  const clearing = resume.clear();
  await Promise.all([saving, clearing]);
  assert.equal(await resume.read(), null);
});
test('bad or tampered resume markers are discarded', async () => {
  for (const value of ['broken', JSON.stringify({ roomId: 'no', expiresAt: 1000 }),
    JSON.stringify({ roomId: room, expiresAt: Number.MAX_SAFE_INTEGER })]) {
    const store = memory();
    store.values.set('framecast-pairing-resume', value);
    assert.equal(await createPairingResume(store, () => 100).read(), null);
  }
});
test('saved pairing and stale messages never prove a phone is connected', () => {
  let time = 100;
  const presence = createPhonePresence(() => time);
  assert.equal(presence.status(), 'checking');
  assert.equal(presence.acknowledge('old-session'), false);
  time += 45_000;
  assert.equal(presence.status(), 'away');
  assert.equal(presence.acknowledge(presence.challenge), true);
  assert.equal(presence.status(), 'online');
  time += 44_999;
  assert.equal(presence.status(), 'online');
  time += 1;
  assert.equal(presence.status(), 'away');
  presence.acknowledge(presence.challenge);
  assert.equal(presence.status(), 'online');
});
test('browser and native senders answer TV challenges and local receiver preserves the room', () => {
  const phone = readFileSync(new URL('../app/index.tsx', import.meta.url), 'utf8');
  const web = readFileSync(new URL('../../framecast/src/App.tsx', import.meta.url), 'utf8');
  const local = readFileSync(new URL('../lib/local-receiver.ts', import.meta.url), 'utf8');
  for (const source of [phone, web]) {
    assert.match(source, /action === 'phone-presence-ping'/);
    assert.match(source, /action: 'phone-presence-pong'/);
  }
  assert.match(local, /m\.payload\.sessionId===phoneChallenge/);
  assert.match(local, /leave\(cursor,false\)/);
  assert.match(phone, /leaveRoom\(false\)/);
});
