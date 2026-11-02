import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(path) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: module.exports, module, require, URLSearchParams });
  return module.exports;
}
const { allocatePairingCode } = load('../../api-server/src/lib/pairing-code.ts');
const { parseDirectTvRoom } = load('../../framecast/src/lib/direct-tv-room.ts');
const { parseSavedTvRoom } = load('../../framecast/src/lib/tv-room-resume.ts');

test('all 100 two-digit codes are used uniquely before allocating three digits', () => {
  const occupied = new Set();
  for (let i = 0; i < 100; i++) {
    const code = allocatePairingCode(occupied, () => 0);
    assert.match(code, /^\d{2}$/);
    assert.ok(!occupied.has(code));
    occupied.add(code);
  }
  const firstThree = allocatePairingCode(occupied, () => 0);
  assert.equal(firstThree, '000');
  occupied.add(firstThree);
  assert.equal(allocatePairingCode(occupied, () => 0), '001');
  occupied.delete('07');
  assert.equal(allocatePairingCode(occupied, () => 0), '07');
  assert.ok(occupied.has(firstThree), 'previous three-digit rooms stay unchanged');
});

test('allocation wraps around, never duplicates, and fails explicitly when every code is occupied', () => {
  const occupied = new Set(Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0')));
  occupied.delete('00');
  assert.equal(allocatePairingCode(occupied, capacity => capacity - 1), '00');
  occupied.add('00');
  for (let i = 0; i < 1000; i++) occupied.add(String(i).padStart(3, '0'));
  assert.throws(() => allocatePairingCode(occupied, () => 0), /unique pairing code/);
});

test('direct TV launch and refresh accept two and three digits, including leading zeroes', () => {
  const room = { id: '12345678-1234-1234-1234-123456789abc', expiresAt: '2099-01-01T00:00:00Z' };
  for (const code of ['00', '12', '000', '123']) {
    assert.equal(parseDirectTvRoom(`?${new URLSearchParams({ ...room, join: room.id, code })}`).code, code);
    assert.equal(parseSavedTvRoom(JSON.stringify({ ...room, code })).code, code);
  }
  for (const code of ['1', '1234', '12345', '1a']) {
    assert.equal(parseDirectTvRoom(`?${new URLSearchParams({ ...room, join: room.id, code })}`), null);
    assert.equal(parseSavedTvRoom(JSON.stringify({ ...room, code })), null);
  }
});
