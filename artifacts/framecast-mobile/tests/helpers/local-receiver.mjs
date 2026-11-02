import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(new URL('../../package.json', import.meta.url));
const ts = require('typescript');
function evaluate(filename, imports = {}) {
  const module = { exports: {} };
  const source = readFileSync(new URL(filename, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module, exports: module.exports,
    require: name => {
      if (!(name in imports)) throw new Error(`Unexpected receiver import ${name}`);
      return imports[name];
    },
  });
  return module.exports;
}
const artwork = evaluate('../../lib/local-cinema-waiting.ts');
export const { LOCAL_RECEIVER_HTML } = evaluate('../../lib/local-receiver.ts', {
  './local-cinema-waiting': artwork,
});
