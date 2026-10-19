import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONNECTION_GRACE_MS, createConnectionGrace } from '../src/lib/connection-grace.ts';

function setup() {
  let callback;
  let delay;
  let cleared = false;
  const grace = createConnectionGrace({
    setTimeout(fn, ms) { callback = fn; delay = ms; return 1; },
    clearTimeout() { cleared = true; callback = undefined; },
  });
  return { grace, fire() { callback?.(); }, get delay() { return delay; }, get cleared() { return cleared; } };
}
test('a temporary interruption waits a full minute, not five seconds', () => {
  const f = setup();
  let expired = false;
  f.grace.hold(() => { expired = true; });
  assert.equal(CONNECTION_GRACE_MS, 60_000);
  assert.equal(f.delay, 60_000);
  assert.equal(expired, false);
  assert.equal(f.grace.pending, true);
  f.fire();
  assert.equal(expired, true);
  assert.equal(f.grace.pending, false);
});
test('recovering or disconnecting deliberately cancels the old session timer', () => {
  const f = setup();
  let expired = false;
  f.grace.hold(() => { expired = true; });
  f.grace.cancel();
  f.fire();
  assert.equal(expired, false);
  assert.equal(f.cleared, true);
  assert.equal(f.grace.pending, false);
});
test('repeated disconnect events cannot restart or extend a recovery window', () => {
  const f = setup();
  let calls = 0;
  f.grace.hold(() => { calls += 1; });
  f.grace.hold(() => { calls += 10; });
  f.fire();
  assert.equal(calls, 1);
  f.grace.hold(() => { calls += 100; });
  assert.equal(f.grace.pending, false);
  f.grace.cancel();
  f.grace.hold(() => { calls += 1000; });
  f.fire();
  assert.equal(calls, 1001);
});
