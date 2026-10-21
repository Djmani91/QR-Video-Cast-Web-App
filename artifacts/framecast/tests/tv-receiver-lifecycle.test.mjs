import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

test('cinema standby never unmounts the TV video receiver', () => {
  const source = ts.createSourceFile('App.tsx',
    readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let receiver;
  function find(node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === 'video'
      && node.attributes.properties.some(prop => ts.isJsxAttribute(prop)
        && prop.name.getText(source) === 'ref'
        && prop.initializer?.getText(source) === '{videoRef}')) receiver = node;
    ts.forEachChild(node, find);
  }
  find(source);
  assert.ok(receiver, 'find the actual TV playback video element');
  for (let parent = receiver.parent; parent; parent = parent.parent) {
    if (ts.isConditionalExpression(parent)) {
      assert.doesNotMatch(parent.condition.getText(source), /showCinemaStandby/,
        'standby must overlay, not replace, the receiver');
    }
  }
  assert.ok(receiver.attributes.properties.some(prop =>
    ts.isJsxAttribute(prop) && prop.name.getText(source) === 'playsInline' && !prop.initializer),
  'keep the receiver inline until explicitly entering safe fullscreen');
});
