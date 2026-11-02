import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(new URL('../../framecast-mobile/package.json', import.meta.url));
const ts = require('typescript');
const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const start = source.indexOf('  useEffect(() => {\n    const params = new URLSearchParams(window.location.search);');
const end = source.indexOf('  useEffect(() => {\n    if (!roomId || !serverExpiry)', start);
assert.ok(start > 0 && end > start, 'Extract the actual TV auto-pair acknowledgement effect');
const effect = ts.transpileModule(source.slice(start, end), { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;

function run({ search = '?auto=1&join=room', success = true, messages = [] } = {}) {
  const sent = [];
  const history = [];
  vm.runInNewContext(effect, {
    useEffect: callback => callback(),
    window: { location: { search, pathname: '/', hash: '' },
      history: { replaceState: (...args) => history.push(args) } },
    URLSearchParams, roomId: 'room',
    messagesQuery: { isSuccess: success, data: { messages }, dataUpdatedAt: 1 },
    send: (...args) => sent.push(args),
  });
  return { sent, history };
}

test('TV acknowledges a phone-launched room only after its signaling read succeeds', () => {
  assert.equal(run({ success: false }).sent.length, 0);
  assert.equal(run({ search: '?join=room' }).sent.length, 0);
  const { sent } = run();
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], 'tv');
  assert.equal(sent[0][1], 'ready');
  assert.equal(sent[0][2].action, 'tv-browser-ready');
  assert.equal(sent[0][2].sessionId, 'room');
});

test('TV retires auto-pair marker only after its own matching acknowledgement is stored', () => {
  const message = { from: 'tv', type: 'ready', payload: { action: 'tv-browser-ready', sessionId: 'room' } };
  const { sent, history } = run({ messages: [message] });
  assert.equal(sent.length, 0);
  assert.equal(history.length, 1);
  assert.ok(!history[0][2].includes('auto='));
  assert.ok(history[0][2].includes('join=room'));
  assert.equal(run({ messages: [{ ...message, from: 'phone' }] }).sent.length, 1);
});
