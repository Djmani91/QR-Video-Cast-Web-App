import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const { patchScreenCaptureSource } = require('./plugins/with-screen-mirror-performance.cjs');
const fixture = `public class ScreenCaptureController {
private static final int DEFAULT_FPS = 30;
ScreenCaptureController(int width, int height) {
super(width, height, DEFAULT_FPS);
this.context = context;
final int width = displayMetrics.widthPixels;
                final int height = displayMetrics.heightPixels;
videoCapturer.changeCaptureFormat(width, height, DEFAULT_FPS);
}
}`;

test('capture patch limits work at source and guards unchanged dimensions before resize', () => {
  const patched = patchScreenCaptureSource(fixture);
  assert.match(patched, /1280\.0 \/ Math\.max\(width, height\)/);
  assert.match(patched, /super\(frameCastFitDimension\(width/);
  assert.ok(patched.indexOf('width == frameCastCaptureWidth') < patched.indexOf('videoCapturer.changeCaptureFormat'));
  assert.match(patched, /frameCastCaptureWidth = targetWidth = actualWidth = width/);
  assert.match(patched, /DEFAULT_FPS = 30/);
  assert.equal(patchScreenCaptureSource(patched), patched);
});

test('capture patch fails rather than silently shipping a changed upstream layout', () => {
  assert.throws(() => patchScreenCaptureSource(fixture.replace('DEFAULT_FPS = 30', 'DEFAULT_FPS = 60')), /capturer changed/);
});

function senderModule() {
  const source = readFileSync(new URL('../lib/screen-mirror-performance.ts', import.meta.url), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports });
  return module.exports;
}

test('sender retains frame cadence, adds adaptive bitrate headroom, and does not upscale small sources', async () => {
  const { configureLowLatencyScreenSender } = senderModule();
  for (const [width, height, scale] of [[1080, 2400, 1.875], [1280, 720, 1], [640, 480, 1]]) {
    const parameters = { transactionId: 'keep', encodings: [{ active: true }] };
    let sent;
    await configureLowLatencyScreenSender({
      getParameters: () => parameters, setParameters: async p => { sent = p; },
    }, { getSettings: () => ({ width, height }) });
    assert.equal(sent, parameters);
    assert.equal(sent.encodings[0].scaleResolutionDownBy, scale);
    assert.equal(sent.encodings[0].maxBitrate, 4_500_000);
    assert.equal(sent.encodings[0].maxFramerate, 30);
    assert.equal(sent.degradationPreference, 'maintain-framerate');
    assert.equal(sent.transactionId, 'keep');
  }
});

test('sender handles unavailable encodings without inventing invalid parameters', async () => {
  const { configureLowLatencyScreenSender } = senderModule();
  let called = false;
  await configureLowLatencyScreenSender({
    getParameters: () => ({}), setParameters: async () => { called = true; },
  }, {});
  assert.equal(called, false);
});
