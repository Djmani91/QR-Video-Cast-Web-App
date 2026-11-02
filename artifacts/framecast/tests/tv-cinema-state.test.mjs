import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const require = createRequire(new URL('../../framecast-mobile/package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../src/lib/tv-cinema-state.ts', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: module.exports, module });
const { shouldShowTvCinema } = module.exports;
const paired = {
  roomLive: true, paired: true, launchedFromPhone: false, status: 'connected',
  hasActiveMedia: false, waitingForPlayback: false, switchingVideo: false,
};

test('paired idle, resumed, and switching sessions show cinema instead of the QR landing', () => {
  assert.equal(shouldShowTvCinema(paired), true);
  assert.equal(shouldShowTvCinema({ ...paired, status: 'idle' }), true);
  assert.equal(shouldShowTvCinema({ ...paired, hasActiveMedia: true, switchingVideo: true }), true);
  assert.equal(shouldShowTvCinema({ ...paired, hasActiveMedia: true, waitingForPlayback: true }), true);
  assert.equal(shouldShowTvCinema({ ...paired, paired: false, launchedFromPhone: true, status: 'idle' }), true);
});

test('actual playback removes cinema; explicit fresh unpaired rooms show QR again', () => {
  assert.equal(shouldShowTvCinema({ ...paired, hasActiveMedia: true }), false);
  assert.equal(shouldShowTvCinema({ ...paired, roomLive: false, switchingVideo: true }), false);
  assert.equal(shouldShowTvCinema({ ...paired, paired: false, status: 'idle' }), false);
});

test('media-only close does not exit fullscreen or forget pairing', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const branch = app.slice(app.indexOf("} else if (signal.type === 'close') {"), app.indexOf('const startRoom ='));
  assert.match(branch, /setPhonePaired\(true\)/);
  assert.match(branch, /setStatus\('connected'\)/);
  assert.doesNotMatch(branch, /exitVideoFullscreen|exitFullscreen|setStatus\('idle'\)/);
});
