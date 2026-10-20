import { cp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'generated-artifacts', 'android-build-source');
const domain = process.argv[2];
if (!domain || !/^[a-z0-9.-]+$/i.test(domain) || domain.includes('..')) {
  throw new Error('Provide the verified published API hostname, without a protocol or path.');
}
try {
  await stat(output);
  throw new Error(`Refusing to overwrite an existing export: ${output}`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(output, { recursive: true });

// Explicit allowlist: never copy the workspace root, git history, uploaded
// media, .agents, .conversation, .replit, .config, credentials, or .env files.
const files = [
  'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.base.json', '.npmrc',
  'artifacts/framecast-mobile/app',
  'artifacts/framecast-mobile/components',
  'artifacts/framecast-mobile/constants',
  'artifacts/framecast-mobile/hooks',
  'artifacts/framecast-mobile/lib',
  'artifacts/framecast-mobile/assets',
  'artifacts/framecast-mobile/plugins',
  'artifacts/framecast-mobile/native',
  'artifacts/framecast-mobile/app.json',
  'artifacts/framecast-mobile/index.js',
  'artifacts/framecast-mobile/metro.config.js',
  'artifacts/framecast-mobile/tsconfig.json',
  'lib/api-client-react/src',
  'lib/api-client-react/package.json',
  'lib/api-client-react/tsconfig.json',
];
for (const file of files) {
  const destination = path.join(output, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(root, file), destination, {
    recursive: true,
    dereference: false,
    filter: source => !path.basename(source).startsWith('.'),
  });
}
// .npmrc is allowlisted above but dotfiles inside source trees are excluded.
await cp(path.join(root, '.npmrc'), path.join(output, '.npmrc'));
const mobile = JSON.parse(await readFile(path.join(root, 'artifacts/framecast-mobile/package.json'), 'utf8'));
mobile.scripts = { start: 'expo start', typecheck: 'tsc -p tsconfig.json --noEmit' };
await writeFile(path.join(output, 'artifacts/framecast-mobile/package.json'), `${JSON.stringify(mobile, null, 2)}\n`);
const originalRoot = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await writeFile(path.join(output, 'package.json'), `${JSON.stringify({
  name: 'framecast-android-build',
  private: true,
  packageManager: 'pnpm@10.26.1',
  devDependencies: { typescript: originalRoot.devDependencies.typescript },
}, null, 2)}\n`);
await writeFile(path.join(output, '.gitignore'), [
  'node_modules', '.expo/', 'dist/', '*.tsbuildinfo', '.env', '.env.*',
  '*.keystore', '*.jks', 'credentials.json', '/artifacts/framecast-mobile/android/',
  '/artifacts/framecast-mobile/ios/', '*.apk', '*.aab', '',
].join('\n'));
const workflow = await readFile(new URL('./android-apk.yml', import.meta.url), 'utf8');
await mkdir(path.join(output, '.github/workflows'), { recursive: true });
await writeFile(path.join(output, '.github/workflows/android-apk.yml'), workflow.replaceAll('__API_DOMAIN__', domain));
await writeFile(path.join(output, 'README.md'), `# FrameCast Android test build

This private repository contains only the FrameCast mobile app, its API client,
and the files needed to build a standalone Android test APK.
No user photos, videos, credentials, conversations, or prior Git history are included.

## Build and download
Open **Actions → Build FrameCast Android APK**. A push to main or a manual run builds
the APK. Download **framecast-android-apk** from the successful run's artifacts.
The standalone release-mode APK uses the generated Android template's test
signing key: this is for device testing, not a Google Play production release.

The app connects to the existing FrameCast service at https://${domain}.
It does not require Expo Go, Metro, an EAS account, or a computer on the Wi-Fi.

## On-device testing
Open FrameCast on the TV and join from this app by QR or five-digit code.
Keep the phone and TV on the same Wi-Fi. Choose local media in the app.
To keep casting while using other apps, enable **Background casting** after
pairing and allow notifications. The casting notification has play/pause,
back/forward ten seconds, and disconnect controls. Background casting is opt-in.
Force-stopping the app, switching Wi-Fi, or manufacturer battery restrictions
can still interrupt a session. Keep battery use unrestricted if Android requires it.

Phone files remain on the phone and are served directly to the paired TV.
The TV must support the source media codec; no app can guarantee every format.
YouTube links use the official player and remain subject to YouTube restrictions.
`);
console.log(`Clean Android build source prepared at ${output}`);
