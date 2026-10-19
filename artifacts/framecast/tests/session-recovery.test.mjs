import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPeerProbe, createSessionRecovery, matchesSession, peerIsOpening } from '../src/lib/session-recovery.ts';

function fixture() {
  let active = true, visible = true, healthy = false;
  const timers = new Map();
  let id = 0, repairs = 0, checks = 0;
  const errors = [];
  const options = {
    active: () => active, visible: () => visible,
    healthy: async () => { checks++; return healthy; },
    recover: async () => { repairs++; },
    onError: error => errors.push(error),
  };
  const clock = {
    setTimeout(fn) { timers.set(++id, fn); return id; },
    clearTimeout(handle) { timers.delete(handle); },
  };
  const recovery = createSessionRecovery(options, clock);
  return { recovery, options, timers, errors, repairs: () => repairs, checks: () => checks,
    setActive: value => { active = value; }, setVisible: value => { visible = value; }, setHealthy: value => { healthy = value; } };
}

test('returning after any length of background suspension repairs the same pairing', async () => {
  const f = fixture();
  f.setVisible(false);
  await f.recovery.check();
  assert.equal(f.repairs(), 0);
  assert.equal(f.timers.size, 0);
  f.setVisible(true);
  await f.recovery.check();
  assert.equal(f.repairs(), 1);
  assert.equal(f.timers.size, 1);
  f.recovery.dispose();
});

test('a healthy existing peer is retained rather than interrupting its media', async () => {
  const f = fixture();
  f.setHealthy(true);
  await f.recovery.check();
  assert.equal(f.checks(), 1);
  assert.equal(f.repairs(), 0);
  f.recovery.dispose();
});

test('focus, online and visibility events cannot start overlapping reconnections', async () => {
  const f = fixture();
  let release;
  f.options.recover = () => new Promise(resolve => { release = resolve; });
  const first = f.recovery.check();
  await Promise.resolve();
  await f.recovery.check();
  assert.equal(f.checks(), 1);
  release();
  await first;
  f.recovery.dispose();
});

test('explicit Disconnect prevents a pending probe from reconnecting later', async () => {
  const f = fixture();
  let release;
  f.options.healthy = () => new Promise(resolve => { release = resolve; });
  const pending = f.recovery.check();
  f.setActive(false);
  f.recovery.cancel();
  release(false);
  await pending;
  assert.equal(f.repairs(), 0);
  assert.equal(f.timers.size, 0);
  f.recovery.dispose();
});

test('a new manual cast cancels an old recovery check even when pairing stays active', async () => {
  const f = fixture();
  let release;
  f.options.healthy = () => new Promise(resolve => { release = resolve; });
  const pending = f.recovery.check();
  f.recovery.cancel();
  release(false);
  await pending;
  assert.equal(f.repairs(), 0);
  f.recovery.dispose();
});

test('a failed repair is reported and schedules a retry without losing pairing', async () => {
  const f = fixture();
  f.options.recover = async () => { throw Error('Temporary network error'); };
  await f.recovery.check();
  assert.equal(f.errors.length, 1);
  assert.equal(f.timers.size, 1);
  f.recovery.dispose();
  assert.equal(f.timers.size, 0);
});

test('the matching receiver probe confirms that an apparently open channel really works', async () => {
  const probe = createPeerProbe();
  let packet;
  const checked = probe.check({ readyState: 'open', send: message => { packet = JSON.parse(message); } });
  probe.accept('old-response');
  probe.accept(packet.nonce);
  assert.equal(await checked, true);
});

test('a stale open channel times out so recovery can replace it automatically', async () => {
  const probe = createPeerProbe();
  assert.equal(await probe.check({ readyState: 'open', send() {} }, 5), false);
  assert.equal(await probe.check({ readyState: 'closed', send() { throw Error('must not send'); } }), false);
});

test('disconnect cancels the outstanding receiver probe immediately', async () => {
  const probe = createPeerProbe();
  const pending = probe.check({ readyState: 'open', send() {} });
  probe.cancel();
  assert.equal(await pending, false);
});

test('old SDP answers, ICE and closes cannot belong to a replacement connection', () => {
  assert.equal(matchesSession('old-session', 'new-session'), false);
  assert.equal(matchesSession('new-session', 'new-session'), true);
  assert.equal(matchesSession('old-session', null), false);
  assert.equal(matchesSession(undefined, 'new-session'), true); // legacy callers
});

test('initial ICE connection cannot be torn down while its data channels are still opening', () => {
  assert.equal(peerIsOpening('connected', 'connecting', 'connecting', 500), true);
  assert.equal(peerIsOpening('connected', 'open', 'open', 500), false);
  assert.equal(peerIsOpening('connected', 'closed', 'closed', 500), false);
  assert.equal(peerIsOpening('failed', 'connecting', 'connecting', 500), false);
  assert.equal(peerIsOpening('connecting', 'connecting', 'connecting', 25_000), false);
});
