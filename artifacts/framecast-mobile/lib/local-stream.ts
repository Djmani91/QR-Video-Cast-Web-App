import { Directory, File, Paths } from 'expo-file-system';
import { LOCAL_RECEIVER_HTML } from './local-receiver';
import { LatestOperationQueue, SupersededOperationError } from './latest-operation-queue';

type RunningStream = {
  sessionId: string;
  receiverUrl: string;
  extension: string;
  stop(): Promise<void>;
};

let active: RunningStream | undefined;
const lifecycle = new LatestOperationQueue();

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

export async function startLocalStream(uri: string, name: string): Promise<RunningStream> {
  const version = lifecycle.issue();
  return lifecycle.run(version, async () => {
    await stopActiveStream();
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
      nonLocal: true,
      stopInBackground: false,
      extraConfig: `
        server.modules += ("mod_alias", "mod_access", "mod_setenv")
        dir-listing.activate = "disable"
        server.range-requests = "enable"
        mimetype.assign += (
          ".mp4" => "video/mp4", ".m4v" => "video/mp4",
          ".mov" => "video/quicktime", ".3gp" => "video/3gpp",
          ".webm" => "video/webm", ".mkv" => "video/x-matroska"
        )
        alias.url = (
          "${prefix}/receiver.html" => ${JSON.stringify(path(receiver.uri))},
          "${prefix}/media${extension}" => ${JSON.stringify(path(source.uri))}
        )
        $HTTP["url"] !~ "^${prefix}/(receiver[.]html|media[.]${extension.slice(1)})$" {
          url.access-deny = ("")
        }
        setenv.add-response-header = ("Cache-Control" => "no-store", "Referrer-Policy" => "no-referrer")
      `,
    });
    try {
      const origin = await server.start();
      const host = new URL(origin).hostname;
      if (!/^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(host)
        || host.split('.').some((part) => Number(part) > 255)) {
        throw new Error('Connect this phone to your home Wi-Fi before playing on the TV.');
      }
      if (!lifecycle.isCurrent(version)) throw new SupersededOperationError();

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
