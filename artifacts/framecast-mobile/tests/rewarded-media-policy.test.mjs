import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(name, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: module.exports, module, ...globals });
  return module.exports;
}
const policy = load('rewarded-media-policy');
const selection = load('media-selection');
async function scenario({ consent = true, canShow = true } = {}) {
  const listeners = new Map();
  const timers = new Map();
  let loaded = false;
  const emit = (event, value) => listeners.get(event)?.(value);
  const sdk = {
    __esModule: true,
    AdsConsent: { gatherConsent: async () => ({ canRequestAds: consent }) },
    AdEventType: { ERROR: 'error', CLOSED: 'closed', OPENED: 'opened' },
    RewardedAdEventType: { LOADED: 'loaded', EARNED_REWARD: 'earned' },
    TestIds: { REWARDED: 'test' },
    default: () => ({ initialize: async () => undefined }),
    RewardedAd: { createForAdRequest: () => ({
      addAdEventListener(event, fn) { listeners.set(event, fn); return () => listeners.delete(event); },
      load() { loaded = true; },
      show() { emit('opened'); return Promise.resolve(); },
    }) },
  };
  const ads = load('ad-monetization', {
    require(id) {
      if (id === 'react-native') return { Platform: { OS: 'android' } };
      if (id === 'react-native-google-mobile-ads') return sdk;
      if (id === './rewarded-media-policy') return policy;
      throw Error(`Unexpected module ${id}`);
    },
    __DEV__: false,
    process: { env: {} },
    setTimeout(fn, delay) { timers.set(delay, fn); return delay; },
    clearTimeout(id) { timers.delete(id); },
  });
  const result = ads.showSelectionRewardedAd(() => canShow);
  await new Promise(resolve => setImmediate(resolve));
  return { result, emit, timers, loaded };
}
test('AdMob namespaced no-fill without phase/reason unlocks the courtesy item', async () => {
  const s = await scenario();
  s.emit('error', { code: 'googleMobileAds/no-fill' });
  const result = await s.result;
  assert.equal(result, 'no-fill');
  assert.equal(policy.shouldUnlockExtraMedia(result), true);
});
test('provider network failure and load timeout do not trap the customer', async () => {
  const s = await scenario();
  s.emit('error', { code: 'googleMobileAds/network-error' });
  assert.equal(policy.shouldUnlockExtraMedia(await s.result), true);
  const timeout = await scenario();
  assert.ok(timeout.timers.has(15_000));
  timeout.timers.get(15_000)();
  assert.equal(policy.shouldUnlockExtraMedia(await timeout.result), true);
});
test('a displayed ad cannot time out into a courtesy reward or reward early closing', async () => {
  const s = await scenario();
  s.emit('loaded');
  assert.equal(s.timers.size, 0);
  s.emit('closed');
  assert.equal(await s.result, 'cancelled');
  assert.equal(policy.shouldUnlockExtraMedia('cancelled'), false);
});
test('a completed ad still unlocks the same single extra item', async () => {
  const s = await scenario();
  s.emit('loaded');
  s.emit('earned');
  s.emit('closed');
  assert.equal(await s.result, 'earned');
  assert.equal(selection.getRemainingMediaSelectionSlots(true, 1), 1);
  assert.equal(selection.getRemainingMediaSelectionSlots(true, 2), 0);
});
test('declined consent and a changed room do not fabricate a no-fill reward', async () => {
  const consent = await scenario({ consent: false });
  assert.equal(consent.loaded, false);
  assert.equal(await consent.result, 'cancelled');
  const stale = await scenario({ canShow: false });
  stale.emit('loaded');
  assert.equal(await stale.result, 'cancelled');
});
test('no-fill detection accepts documented code variants, not arbitrary errors', () => {
  assert.equal(policy.isRewardedNoFill({ code: 3 }), true);
  assert.equal(policy.isRewardedNoFill({ reason: 'mediation-no-fill' }), true);
  assert.equal(policy.isRewardedNoFill({ code: 'googleMobileAds/network-error' }), false);
});
