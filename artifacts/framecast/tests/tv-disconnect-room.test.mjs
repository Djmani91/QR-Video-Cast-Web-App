import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(new URL('../../framecast-mobile/package.json', import.meta.url));
const ts = require('typescript');
const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const initialRoomSource = source.slice(source.indexOf('function readInitialTvRoom()'), source.indexOf('function formatPlaybackTime'));
const initialRoomJs = ts.transpileModule(initialRoomSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

test('fresh receiver return clears saved pairing instead of restoring an old code', () => {
  const removed = [];
  const context = vm.createContext({
    URLSearchParams,
    window: { location: { search: '?fresh=1&resume=1&code=12345' } },
    sessionStorage: {
      removeItem: key => removed.push(key),
      getItem: () => { throw Error('must not load old room'); },
    },
    parseDirectTvRoom: () => { throw Error('must not restore a stale direct code'); },
  });
  vm.runInContext(initialRoomJs, context);
  assert.equal(context.readInitialTvRoom(), null);
  assert.deepEqual(removed, ['framecast-tv-resume']);
});

test('TV receives explicit disconnect before session filtering and requests a new room', () => {
  const marker = "} else if (signal.type === 'close') {";
  const start = source.indexOf(marker);
  const end = source.indexOf('if (!matchesSession', start);
  const actionHandler = source.slice(start + marker.length, end);
  let newRooms = 0;
  const context = vm.createContext({
    signal: { payload: { action: 'disconnect' } },
    startRoom: () => { newRooms++; },
  });
  vm.runInContext(`function handle(){${actionHandler}}\nhandle();`, context);
  assert.equal(newRooms, 1);
  context.signal.payload = {};
  vm.runInContext('handle();', context);
  assert.equal(newRooms, 1, 'media changes must not rotate pairing codes');
});
