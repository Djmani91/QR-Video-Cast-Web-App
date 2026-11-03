import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { localServerConfig } from '../lib/local-server-config.ts';
import { withOperationTimeout } from '../lib/operation-timeout.ts';

const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
function bridge(native = { connectDirect() {} }, os = 'android') {
  const source = readFileSync(new URL('../lib/direct-cast.ts', import.meta.url), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, {
    module, exports: module.exports,
    require: name => {
      assert.equal(name, 'react-native');
      return { Platform: { OS: os }, NativeModules: { FrameCastBackground: native } };
    },
  });
  return module.exports;
}

test('only devices with a playable direct receiver are offered a direct connection', () => {
  const { getDirectTarget } = bridge();
  const tv = { name: 'Living room', ip: '192.168.1.208' };
  assert.equal(getDirectTarget({ ...tv, type: 'firetv' }), null);
  assert.equal(getDirectTarget({ ...tv, type: 'firetv', flingId: 'receiver-123' }).protocol, 'amazonfling');
  assert.equal(getDirectTarget({ ...tv, type: 'roku' }), null);
  assert.equal(getDirectTarget({ ...tv, type: 'samsung' }), null);
  assert.equal(getDirectTarget({ ...tv, type: 'chromecast' }).protocol, 'googlecast');
  const renderer = getDirectTarget({ ...tv, type: 'samsung', rendererId: 'opaque-native-token' });
  assert.equal(renderer.protocol, 'dlna');
  assert.equal(renderer.receiver, 'opaque-native-token');
  assert.equal(bridge(undefined, 'web').getDirectTarget({ ...tv, type: 'chromecast' }), null);
  assert.equal(bridge({}).getDirectTarget({ ...tv, type: 'chromecast' }), null);
});

test('direct cast bridge forwards actual load/control/status/disconnect requests', async () => {
  const calls = [];
  const native = Object.fromEntries(['connectDirect', 'loadDirect', 'controlDirect', 'statusDirect', 'disconnectDirect']
    .map(name => [name, async (...args) => { calls.push([name, ...args]); return name === 'statusDirect' ? { state: 'PLAYING' } : undefined; }]));
  const direct = bridge(native);
  await direct.connectDirect({ protocol: 'dlna', receiver: 'opaque-token' });
  await direct.loadDirect('http://192.168.1.45:9000/private/media.mp4', 'video/mp4', 'Movie');
  await direct.controlDirect('seek', 42);
  assert.equal((await direct.statusDirect()).state, 'PLAYING');
  await direct.disconnectDirect();
  assert.equal(calls[0][1], 'dlna');
  assert.equal(calls[1][2], 'video/mp4');
  assert.equal(calls[2][2], 42);
  assert.equal(calls.at(-1)[0], 'disconnectDirect');
});

test('a stalled playback operation rejects on time and invokes its cancellation hook', async () => {
  let cancelled = 0;
  const neverCompletes = new Promise(() => {});
  await assert.rejects(
    withOperationTimeout(neverCompletes, 20, 'TV startup timed out.', () => { cancelled++; }),
    /TV startup timed out/,
  );
  assert.equal(cancelled, 1);
});

test('MIME detection does not confuse unknown webpages with videos', () => {
  const { directMediaMime } = bridge();
  assert.equal(directMediaMime('movie.MP4'), 'video/mp4');
  assert.equal(directMediaMime('movie.mkv'), 'video/x-matroska');
  assert.equal(directMediaMime('stream.m3u8'), 'application/x-mpegURL');
  assert.equal(directMediaMime('photo.jpeg'), 'image/jpeg');
  assert.equal(directMediaMime('movie', 'video/mp4'), 'video/mp4');
  assert.throws(() => directMediaMime('watch.html'), /unknown/);
});

test('Google receiver CORS is explicit and enabled only on the direct cast server', () => {
  const normal = localServerConfig('/private', '.mp4', '/receiver.html', '/video.mp4');
  assert.doesNotMatch(normal, /www\.gstatic\.com/);
  const cast = localServerConfig('/private', '.mp4', '/receiver.html', '/video.mp4', [], true);
  assert.match(cast, /Access-Control-Allow-Origin" => "https:\/\/www\.gstatic\.com"/);
  assert.doesNotMatch(cast, /Access-Control-Allow-Origin" => "\*"/);
  assert.match(cast, /server\.range-requests = "enable"/);
  assert.match(cast, /"\.jpg" => "image\/jpeg"/);
});

test('native direct receiver requires acknowledgment and preserves connection boundaries', () => {
  const dlna = readFileSync(new URL('../native/android/DlnaCasting.kt', import.meta.url), 'utf8');
  assert.match(dlna, /GetTransportInfo/);
  assert.match(dlna, /CurrentTransportState/);
  assert.match(dlna, /url\.host != ip/);
  assert.match(dlna, /followRedirects\(false\)/);
  assert.match(dlna, /DOCTYPE\|ENTITY/);
  assert.match(dlna, /SetAVTransportURI/);
  assert.match(dlna, /renderers\[id\]/);
  const fling = readFileSync(new URL('../native/android/AmazonFlingCasting.kt', import.meta.url), 'utf8');
  assert.match(fling, /amzn\.thin\.pl/);
  assert.match(fling, /setMediaSource/);
  const flingConnect = fling.match(/fun connect\(receiverId: String\)\s*\{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.doesNotMatch(flingConnect, /getStatus/);
  assert.match(fling, /player\.play\(\)\.get\(8, TimeUnit\.SECONDS\)/);
  assert.match(fling, /PlayerSeekMode\.Relative/);
  const nowPlayingPanel = readFileSync(new URL('../components/DirectCastPanel.tsx', import.meta.url), 'utf8');
  assert.match(nowPlayingPanel, /target\.protocol === 'amazonfling' && receiverSelectedRef\.current/);
  assert.match(nowPlayingPanel, /setNowPlayingVisible\(item\.kind === 'video'\)/);
  assert.match(nowPlayingPanel, /onRequestClose=\{\(\) => setNowPlayingVisible\(false\)\}/);
  assert.match(nowPlayingPanel, /Hide these controls at any time; playback continues on the TV\./);
  const google = readFileSync(new URL('../native/android/GoogleCasting.kt', import.meta.url), 'utf8');
  assert.match(google, /setReceiverApplicationId\(CastMediaControlIntent\.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID\)/);
  assert.match(google, /onSessionStarted/);
  assert.match(google, /s\.isConnected/);
  assert.match(google, /25_000/);
  assert.match(google, /IDLE_REASON_FINISHED/);
  assert.match(google, /CAST_LOAD_TIMEOUT/);
  assert.match(google, /LOAD_TIMEOUT_MS = 15_000L/);
  const localStream = readFileSync(new URL('../lib/local-stream.ts', import.meta.url), 'utf8');
  assert.match(localStream, /12_000/);
  const panel = readFileSync(new URL('../components/DirectCastPanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /direct-cast-cancel/);
  assert.match(panel, /try \{ await cleanup\(\); \}/);
});
