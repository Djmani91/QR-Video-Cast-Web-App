import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(new URL('../../framecast-mobile/package.json', import.meta.url));
const ts = require('typescript');
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/lib/screen-mirror-latency.ts', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports });
const { configureScreenMirrorReceiver } = module.exports;

test('live receiver hints use correct units and a small jitter cushion', () => {
  const receiver = { jitterBufferTarget: null, playoutDelayHint: null };
  assert.equal(configureScreenMirrorReceiver(receiver), true);
  assert.equal(receiver.jitterBufferTarget, 50);
  assert.equal(receiver.playoutDelayHint, 0.05);
});

test('unsupported or read-only TV receiver properties do not break screen playback', () => {
  const unsupported = {};
  assert.equal(configureScreenMirrorReceiver(unsupported), false);
  assert.deepEqual(unsupported, {});
  const readonly = Object.defineProperty({}, 'jitterBufferTarget', {
    get: () => 200, set: () => { throw new Error('unsupported'); },
  });
  assert.equal(configureScreenMirrorReceiver(readonly), false);
  assert.equal(readonly.jitterBufferTarget, 200);
});

test('receiver tuning is gated to screen-video tracks, not ordinary media', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /if \(screenMirroringRef\.current && event\.track\.kind === 'video'\) \{\s*configureScreenMirrorReceiver\(event\.receiver\)/);
});
