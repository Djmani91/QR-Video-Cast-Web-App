import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const source = await readFile(new URL('../components/AppSettings.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function settingsFixture(premiumActive = false) {
  const events = [];
  let hookIndex = 0;
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: {
      useRef: value => ({ current: value }),
      useState: initial => {
        const index = hookIndex++;
        return [initial, value => {
          if (index === 0) events.push(`settings:${value}`);
        }];
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': {
      Platform: { OS: 'android' },
      StyleSheet: { create: value => value, absoluteFill: {} },
      ...Object.fromEntries(['ActivityIndicator', 'Modal', 'Pressable', 'ScrollView', 'Switch', 'Text', 'View'].map(name => [name, name])),
    },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-constants': { default: { expoConfig: { version: 'test' } } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@/hooks/useColors': { useColors: () => ({}) },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: name => {
      assert.ok(name in modules, `Unexpected dependency: ${name}`);
      return modules[name];
    },
  });
  const tree = exports.AppSettings({
    premiumActive,
    showBackgroundCasting: true,
    analyticsEnabled: false,
    onAnalyticsChange: async () => {},
    onClearLocalData: async () => {},
    onManageAdPrivacy: async () => {},
    onOpenPremium: () => events.push('open-paywall'),
    onManagePremium: () => events.push('manage-premium'),
  });
  function find(node, testID) {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) return node.map(child => find(child, testID)).find(Boolean);
    if (node.props?.testID === testID) return node;
    return find(node.props?.children, testID);
  }
  return { events, button: id => {
    const button = find(tree, id);
    assert.ok(button, `Missing button: ${id}`);
    return button;
  } };
}

for (const id of ['button-premium-settings', 'button-background-casting-premium']) {
  test(`${id} dismisses the native settings modal before opening Premium`, () => {
    const f = settingsFixture();
    f.button(id).props.onPress();
    assert.deepEqual(f.events, ['settings:false', 'open-paywall']);
  });
}

test('active subscribers go to management instead of another purchase offer', () => {
  const f = settingsFixture(true);
  f.button('button-premium-settings').props.onPress();
  assert.deepEqual(f.events, ['settings:false', 'manage-premium']);
});
