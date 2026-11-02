import { Directory, File, Paths } from 'expo-file-system';
import { LOCAL_RECEIVER_HTML } from './local-receiver';
import { localServerConfig } from './local-server-config';
import { LatestOperationQueue, SupersededOperationError } from './latest-operation-queue';
import { Platform } from 'react-native';
import { getWifiLocalIpv4Address } from './tv-discovery';

type RunningStream = {
  sessionId: string;
  receiverUrl: string;
  extension: string;
  stop(): Promise<void>;
};

let active: RunningStream | undefined;
const lifecycle = new LatestOperationQueue();
// The first receiver document can remain open through several server/port
// changes. Permit its metadata reads on subsequent selected-file servers,
// without granting wildcard CORS or persisting any network addresses.
const receiverOrigins = new Set<string>();

async function stopActiveStream(): Promise<void> {
  const previous = active;
  active = undefined;
  if (previous) await previous.stop();
}

export function stopLocalStream(): Promise<void> {
  const version = lifecycle.issue();
  return lifecycle.run(version, stopActiveStream).catch((error) => {
    if (error instanceof SupersededOperationError) return;
    throw error;
  });
}

export async function startLocalStream(uri: string, name: string, googleCast = false): Promise<RunningStream> {
  const version = lifecycle.issue();
  return lifecycle.run(version, async () => {
    await stopActiveStream();
    if (!lifecycle.isCurrent(version)) throw new SupersededOperationError();
    // The static-server library otherwise binds its first enumerated IPv4
    // address; that may be VPN/cellular while discovery correctly finds Wi-Fi.
    const hostname = Platform.OS === 'android' ? await getWifiLocalIpv4Address() : undefined;
    if (!lifecycle.isCurrent(version)) throw new SupersededOperationError();

    let Server;
    try {
      Server = (await import('@dr.pogodin/react-native-static-server')).default;
    } catch {
      throw new Error('Direct Wi-Fi playback needs the updated native FrameCast app build. It is not available in Expo Go or the phone browser.');
    }
    const sessionId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    const extension = name.match(/\.[a-z0-9]{1,8}$/i)?.[0].toLowerCase() || '.mp4';
    const source = new File(uri);
    if (!source.exists || !source.size) throw new Error('This video is no longer readable. Select it again.');
    const directory = new Directory(Paths.cache, `framecast-receiver-${sessionId}`);
    directory.create({ intermediates: true, idempotent: true });
    const receiver = new File(directory, 'receiver.html');
    receiver.write(LOCAL_RECEIVER_HTML);
    const path = (value: string) => decodeURIComponent(value.replace(/^file:\/\//, ''));
    const prefix = `/${sessionId}`;
    // Alias only the selected file: no extra copy of a multi-GB video and no
    // exposure of the phone's photo library/cache directory.
    const server = new Server({
      fileDir: path(directory.uri),
      ...(hostname ? { hostname } : {}),
      nonLocal: true,
      stopInBackground: false,
      extraConfig: localServerConfig(prefix, extension, path(receiver.uri), path(source.uri), [...receiverOrigins], googleCast),
    });
    try {
      const origin = await server.start();
      const host = new URL(origin).hostname;
      if (!/^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(host)
        || host.split('.').some((part) => Number(part) > 255)) {
        throw new Error('Connect this phone to your home Wi-Fi before playing on the TV.');
      }
      if (!lifecycle.isCurrent(version)) throw new SupersededOperationError();
      receiverOrigins.add(new URL(origin).origin);

      const running: RunningStream = {
        sessionId, extension,
        receiverUrl: `${origin}${prefix}/receiver.html`,
        async stop() {
          try { await server.stop(); } finally { if (directory.exists) directory.delete(); }
        },
      };
      active = running;
      return running;
    } catch (error) {
      await server.stop().catch(() => undefined);
      if (directory.exists) directory.delete();
      throw error;
    }
  });
}
