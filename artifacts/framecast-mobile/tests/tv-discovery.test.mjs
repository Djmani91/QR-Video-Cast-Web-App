import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildTvRoomUrl } from '../lib/tv-room-url.ts';

test('release manifest plugin permits the local HTTP descriptions used by TVs', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const withBackgroundCasting = require('../plugins/with-background-casting.cjs');
  const config = withBackgroundCasting({ name: 'FrameCast', slug: 'framecast', android: { package: 'com.tvcast.com' } });
  const result = await config.mods.android.manifest({
    modResults: { manifest: { application: [{ $: {}, service: [] }] } },
    modRequest: { introspect: true },
  });
  assert.equal(result.modResults.manifest.application[0].$['android:usesCleartextTraffic'], 'true');
});

test('empty scans distinguish rejected URLs, HTTP failures, and unrecognized devices', () => {
  const native = fs.readFileSync(new URL('../native/android/TvDiscovery.kt', import.meta.url), 'utf8');
  assert.match(native, /rejected addresses.*descriptionRejected\.get\(\)/);
  assert.match(native, /description failures.*descriptionFailed\.get\(\)/);
  assert.match(native, /unrecognized descriptions.*descriptionUnrecognized\.get\(\)/);
  assert.match(native, /HTTP blocked.*cleartextBlocked\.get\(\)/);
  assert.match(native, /\.followRedirects\(false\)/);
  assert.match(native, /TvDiscoveryProtocol\.descriptionUrl\(response, ip\)/);
});

test('discovery reads distinct descriptions and checks all resolved addresses', () => {
  const native = fs.readFileSync(new URL('../native/android/TvDiscovery.kt', import.meta.url), 'utf8');
  assert.match(native, /described\.add\(location\)/);
  assert.doesNotMatch(native, /described\.add\(ip\)/);
  assert.match(native, /service\.hostAddresses/);
  assert.match(native, /firstOrNull \{ isPrivateIpv4\(it\) \}/);
  assert.match(native, /LAN replies.*ssdpReplies\.get\(\)/);
  assert.match(native, /DNS start errors.*dnsFailed\.get\(\)/);
});

test('LAN discovery binds its own sockets to Wi-Fi rather than changing the app network', () => {
  const native = fs.readFileSync(new URL('../native/android/TvDiscovery.kt', import.meta.url), 'utf8');
  assert.match(native, /TRANSPORT_WIFI/);
  assert.match(native, /!caps\.hasTransport\(NetworkCapabilities\.TRANSPORT_VPN\)/);
  assert.match(native, /wifiNetwork\.bindSocket\(socket\)/);
  assert.match(native, /socket\.networkInterface = wifiInterface/);
  assert.match(native, /\.socketFactory\(wifiNetwork\.socketFactory\)/);
  assert.match(native, /NsdManager\.PROTOCOL_DNS_SD, wifiNetwork/);
  assert.match(native, /!repeated[\s\S]*repeated = true[\s\S]*search\(\)/);
  assert.doesNotMatch(native, /bindProcessToNetwork|setProcessDefaultNetwork/);
});

test('local media server binds to the same physical Wi-Fi address used for TV discovery', () => {
  const native = fs.readFileSync(new URL('../native/android/TvDiscovery.kt', import.meta.url), 'utf8');
  assert.match(native, /fun wifiLocalIpv4Address\(context: Context\): String/);
  assert.match(native, /TRANSPORT_WIFI/);
  assert.match(native, /wifiNetwork\.getLinkProperties|connectivity\.getLinkProperties\(wifiNetwork\)/);
  assert.match(native, /!caps\.hasTransport\(NetworkCapabilities\.TRANSPORT_VPN\)/);
  const module = fs.readFileSync(new URL('../native/android/BackgroundCastingModule.kt', import.meta.url), 'utf8');
  assert.match(module, /fun getWifiLocalIpv4Address\(promise: Promise\)/);
  assert.match(module, /TvDiscovery\.wifiLocalIpv4Address\(reactApplicationContext\)/);
  const client = fs.readFileSync(new URL('../lib/local-stream.ts', import.meta.url), 'utf8');
  assert.match(client, /getWifiLocalIpv4Address\(\)/);
  assert.match(client, /new Server\(\{[\s\S]*?\.\.\.\(hostname \? \{ hostname \} : \{\}\)/);
});

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

test('Samsung browser launch uses the native Tizen app launch event', () => {
  const sourcePath = new URL('../native/android/SamsungBrowserRemote.kt', import.meta.url);
  const nativeSource = fs.readFileSync(
    sourcePath,
    'utf8',
  );
  const generatedSource = fs.readFileSync(
    new URL('../android/app/src/main/java/com/tvcast/com/casting/SamsungBrowserRemote.kt', import.meta.url),
    'utf8',
  );
  for (const source of [nativeSource, generatedSource]) {
    assert.match(source, /\.put\("method",\s*"ms\.channel\.emit"\)/);
    assert.match(source, /\.put\("event",\s*"ed\.apps\.launch"\)/);
    assert.match(source, /\.put\("appId",\s*"org\.tizen\.browser"\)/);
    assert.match(source, /\.put\("action_type",\s*"NATIVE_LAUNCH"\)/);
    assert.match(source, /\.put\("metaTag",\s*url\)/);
    assert.doesNotMatch(source, /KEY_BROWSER/);
  }
});
