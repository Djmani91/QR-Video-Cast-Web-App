import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../lib/tv-discovery.ts', import.meta.url), 'utf8');
const roomSource = readFileSync(new URL('../lib/tv-room-url.ts', import.meta.url), 'utf8');
const room = { id: 'private-room-created-by-api', code: '12345', expiresAt: '2099-01-01T00:00:00Z' };
const samsung = { ip: '192.168.1.208', name: 'Living room', model: 'Samsung', type: 'samsung' };
const acknowledgement = { from: 'tv', type: 'ready', payload: { action: 'tv-browser-ready', sessionId: room.id } };

function load(overrides = {}) {
  const calls = { created: 0, launches: [], reads: 0 };
  const native = {
    discoverNearbyTvs: async () => [samsung],
    openSamsungTvBrowser: async (...args) => { calls.launches.push(args); },
    ...overrides.native,
  };
  const api = {
    createCastRoom: async () => { calls.created++; return room; },
    getCastRoomMessages: async () => { calls.reads++; return { messages: [acknowledgement] }; },
    ...overrides.api,
  };
  const compile = text => ts.transpileModule(text, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const roomModule = { exports: {} };
  vm.runInNewContext(compile(roomSource), { exports: roomModule.exports, module: roomModule, URL });
  const module = { exports: {} };
  vm.runInNewContext(compile(source), {
    module, exports: module.exports, URL, AbortController, setTimeout, clearTimeout,
    Date: overrides.Date ?? Date,
    require(specifier) {
      if (specifier === 'react-native') return {
        NativeModules: { FrameCastBackground: native }, Platform: { OS: overrides.platform ?? 'android' },
      };
      if (specifier === '@workspace/api-client-react') return api;
      if (specifier === './tv-room-url') return roomModule.exports;
      throw new Error(`Unexpected import ${specifier}`);
    },
  });
  return { discovery: module.exports, calls };
}

function options() {
  return { signal: new AbortController().signal, onProgress() {} };
}

test('expanded scan retains TV platforms and rejects unknown or public-IP devices', async () => {
  const types = ['webos', 'roku', 'dlna', 'appletv', 'chromecast', 'firetv', 'samsung'];
  const devices = types.map((type, i) => ({ ...samsung, ip: `192.168.1.${i + 10}`, type }));
  const { discovery } = load({ native: { discoverNearbyTvs: async () => [
    ...devices, devices[0], { ...samsung, type: 'router' }, { ...samsung, ip: '8.8.8.8' },
  ] } });
  const found = await discovery.discoverNearbyTvs();
  assert.deepEqual(Array.from(found, tv => tv.type), types);
});

test('discovery rejects malformed/public entries and deduplicates by protocol and IP', async () => {
  const { discovery } = load({ native: { discoverNearbyTvs: async () => [
    samsung, samsung, { ...samsung, type: 'chromecast' },
    { ...samsung, ip: '8.8.8.8' }, { ...samsung, ip: '192.168.1.999' },
    { ...samsung, type: 'fake' }, null, { ...samsung, name: undefined },
  ] } });
  const results = await discovery.discoverNearbyTvs();
  assert.equal(results.length, 2);
  assert.equal(results[0].type, 'samsung');
  assert.equal(results[1].type, 'chromecast');
});

test('web and older Android binaries do not claim native discovery is available', async () => {
  const web = load({ platform: 'web' }).discovery;
  assert.equal(web.nearbyDiscoveryAvailable, false);
  await assert.rejects(web.discoverNearbyTvs(), /updated Android/);
  assert.equal(load({ native: { discoverNearbyTvs: undefined } }).discovery.nearbyDiscoveryAvailable, false);
});

test('browser launch rejects credentials, foreign domains, public IPs and nonstandard ports', async () => {
  const { discovery, calls } = load();
  for (const url of ['http://2tx1.com/', 'https://evil.com/', 'https://2tx1.com.evil.com/',
    'https://user:password@2tx1.com/', 'https://2tx1.com:8443/']) {
    await assert.rejects(discovery.launchSamsungTvBrowser(samsung.ip, url));
  }
  await assert.rejects(discovery.launchSamsungTvBrowser('8.8.8.8', 'https://2tx1.com/'));
  assert.equal(calls.launches.length, 0);
});

test('Samsung pairs only after a matching TV acknowledgement, not a phone or stale response', async () => {
  let reads = 0;
  const progress = [];
  const { discovery, calls } = load({ api: { getCastRoomMessages: async () => ({
    messages: ++reads === 1 ? [
      { ...acknowledgement, from: 'phone' },
      { ...acknowledgement, payload: { action: 'tv-browser-ready', sessionId: 'another-room' } },
    ] : [acknowledgement],
  }) } });
  assert.equal(await discovery.connectSamsungTv(samsung, {
    ...options(), onProgress: value => progress.push(value),
  }), room.id);
  assert.equal(reads, 2);
  assert.equal(calls.created, 1);
  const target = new URL(calls.launches[0][1]);
  assert.equal(target.origin, 'https://2tx1.com');
  assert.equal(target.searchParams.get('join'), room.id);
  assert.equal(target.searchParams.get('auto'), '1');
  assert.ok(progress.some(value => value.includes('Allow')));
  assert.ok(progress.some(value => value.includes('Waiting')));
});

test('Cast and Fire TV never invoke Samsung launch or claim automatic pairing', async () => {
  const { discovery, calls } = load();
  for (const type of ['chromecast', 'firetv']) {
    await assert.rejects(discovery.connectSamsungTv({ ...samsung, type }, options()), /only.*Samsung/);
  }
  assert.equal(calls.created, 0);
  assert.equal(calls.launches.length, 0);
});

test('cancel during native approval prevents late pairing without releasing the busy promise early', async () => {
  let completeLaunch;
  let launchStarted;
  const started = new Promise(resolve => { launchStarted = resolve; });
  const { discovery, calls } = load({ native: { openSamsungTvBrowser: () => {
    launchStarted();
    return new Promise(resolve => { completeLaunch = resolve; });
  } } });
  const controller = new AbortController();
  let settled = false;
  const pending = discovery.connectSamsungTv(samsung, { signal: controller.signal, onProgress() {} });
  pending.then(() => { settled = true; }, () => { settled = true; });
  await started;
  controller.abort();
  await Promise.resolve();
  assert.equal(settled, false);
  completeLaunch();
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(calls.reads, 0);
});

test('a sent browser command without TV acknowledgement produces fallback instead of pairing', async () => {
  let now = 0;
  class Clock extends Date { static now() { return now += 50_000; } }
  const { discovery } = load({ Date: Clock, api: { getCastRoomMessages: async () => ({ messages: [] }) } });
  await assert.rejects(discovery.connectSamsungTv(samsung, options()), /did not confirm.*QR\/code/);
});
