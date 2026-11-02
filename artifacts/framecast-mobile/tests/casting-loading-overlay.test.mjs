import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const source = await readFile(new URL('../components/CastingLoadingOverlay.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;

function render(visible) {
  let disconnects = 0;
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: { useEffect() {}, useRef: value => ({ current: value }), useState: value => [value, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@expo/vector-icons': { Feather: 'Feather' },
    '@/hooks/useColors': { useColors: () => ({ radius: 8 }) },
    'react-native': {
      AccessibilityInfo: {}, Platform: { OS: 'android' }, Easing: {},
      StyleSheet: { create: value => value },
      Animated: { Value: class { interpolate() { return 0; } }, View: 'AnimatedView' },
      ...Object.fromEntries(['ActivityIndicator', 'Modal', 'Pressable', 'Text', 'View'].map(name => [name, name])),
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  } });
  const tree = exports.default({
    visible, title: 'Opening your video on the TV…', detail: 'Keep FrameCast open.',
    onDisconnect: () => { disconnects++; },
  });
  const nodes = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    visit(node.props?.children);
  }
  visit(tree);
  return { tree, nodes, disconnects: () => disconnects };
}

test('video loading uses a blocking modal with a busy announcement and a disconnect escape', () => {
  const f = render(true);
  assert.equal(f.tree.type, 'Modal');
  assert.equal(f.tree.props.visible, true);
  assert.equal(f.tree.props.transparent, true);
  const status = f.nodes.find(node => node.props?.accessibilityRole === 'progressbar');
  assert.equal(status.props.accessibilityState.busy, true);
  assert.match(status.props.accessibilityLabel, /Opening your video/);
  const button = f.nodes.find(node => node.props?.testID === 'casting-loading-disconnect');
  button.props.onPress();
  f.tree.props.onRequestClose();
  assert.equal(f.disconnects(), 2, 'both explicit disconnect and Android Back must cancel the cast');
});

test('loading modal is hidden when the caller finishes playback startup', () => {
  assert.equal(render(false).tree.props.visible, false);
});
