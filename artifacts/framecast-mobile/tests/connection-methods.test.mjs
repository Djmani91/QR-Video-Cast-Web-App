import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const screen = fs.readFileSync(new URL('../app/index.tsx', import.meta.url), 'utf8');
const discovery = fs.readFileSync(new URL('../components/NearbyTvs.tsx', import.meta.url), 'utf8');
const inputCodeAt = screen.indexOf('testID="input-tv-code"');
const joinScreen = screen.slice(screen.indexOf('testID="connection-methods"'), inputCodeAt + 'testID="input-tv-code"'.length);

test('pairing puts Wi-Fi discovery and browser instructions above short code entry, with no QR scanner', () => {
  assert.match(joinScreen, /testID="button-find-tvs-on-wifi"/);
  assert.match(joinScreen, /setNearbyScanRequest\(\(request\) => request \+ 1\)/);
  assert.match(joinScreen, /testID="button-tv-browser-instructions"/);
  assert.match(joinScreen, /Alert\.alert\('Use your TV browser'/);
  assert.doesNotMatch(screen, /CameraView|useCameraPermissions|button-open-tv-qr-scanner/);
  assert.match(joinScreen, /<NearbyTvs onPaired=\{joinRoom\} scanRequest=\{nearbyScanRequest\} \/>/);
  assert.ok(inputCodeAt > 0, 'keep code entry available below the connection choices');
  assert.ok(joinScreen.indexOf('button-find-tvs-on-wifi') < joinScreen.indexOf('button-tv-browser-instructions'));
  assert.ok(joinScreen.indexOf('button-tv-browser-instructions') < joinScreen.indexOf('input-tv-code'));
  assert.match(discovery, /useEffect\(\(\) => \{\s*if \(scanRequest > 0\) runScan\(\);/);
});
