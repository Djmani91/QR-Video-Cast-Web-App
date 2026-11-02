import { NativeModules, Platform } from 'react-native';
import { createCastRoom, getCastRoomMessages } from '@workspace/api-client-react';
import { buildTvRoomUrl } from './tv-room-url';
import type { TvLaunchRoom } from './tv-room-url';

export type NearbySamsungTv = {
  ip: string;
  name: string;
  model: string;
};

export type NearbyTv = NearbySamsungTv & { type: 'samsung' | 'chromecast' | 'firetv' | 'webos' | 'roku' | 'dlna' | 'appletv'; rendererId?: string };

type FrameCastTvDiscoveryModule = {
  discoverNearbyTvs?: () => Promise<NearbyTv[]>;
  discoverSamsungTvs?: () => Promise<NearbySamsungTv[]>;
  getWifiLocalIpv4Address?: () => Promise<string>;
  openSamsungTvBrowser?: (ip: string, url: string) => Promise<void>;
};

const nativeDiscovery = NativeModules.FrameCastBackground as FrameCastTvDiscoveryModule | undefined;
export const nearbyDiscoveryAvailable = Platform.OS === 'android' && Boolean(nativeDiscovery?.discoverNearbyTvs);
const PRIVATE_IPV4 = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

function isPrivateIpv4(ip: string) {
  if (!PRIVATE_IPV4.test(ip)) return false;
  return ip.split('.').every((octet) => Number(octet) <= 255);
}

/**
 * Use the phone's Wi-Fi interface for its media server too. The static-server
 * library's default address lookup returns the first interface Android
 * enumerates, which can be mobile data or a VPN even during Wi-Fi TV discovery.
 */
export async function getWifiLocalIpv4Address(): Promise<string> {
  if (Platform.OS !== 'android' || !nativeDiscovery?.getWifiLocalIpv4Address) {
    throw new Error('Direct Wi-Fi playback needs the updated Android FrameCast app.');
  }
  const address = await nativeDiscovery.getWifiLocalIpv4Address();
  if (typeof address !== 'string' || !isPrivateIpv4(address)) {
    throw new Error('Android did not provide a valid home Wi-Fi address. Reconnect both devices to the same Wi-Fi and try again.');
  }
  return address;
}

export async function discoverNearbyTvs(): Promise<NearbyTv[]> {
  if (!nearbyDiscoveryAvailable || !nativeDiscovery?.discoverNearbyTvs) {
    throw new Error('Nearby TV scanning needs the updated Android FrameCast app.');
  }
  const results = await nativeDiscovery.discoverNearbyTvs();
  const unique = new Map<string, NearbyTv>();
  for (const tv of results) {
    if (!tv || !['samsung', 'chromecast', 'firetv', 'webos', 'roku', 'dlna', 'appletv'].includes(tv.type)
      || typeof tv.ip !== 'string' || !isPrivateIpv4(tv.ip)
      || typeof tv.name !== 'string' || typeof tv.model !== 'string') continue;
    unique.set(`${tv.type}:${tv.ip}`, {
      ...tv, name: tv.name.slice(0, 100), model: tv.model.slice(0, 100),
      rendererId: typeof tv.rendererId === 'string' && /^[a-f0-9-]{36}$/i.test(tv.rendererId) ? tv.rendererId : undefined,
    });
  }
  return [...unique.values()].slice(0, 32);
}

function throwIfCancelled(signal: AbortSignal) {
  if (!signal.aborted) return;
  const error = new Error('TV connection cancelled.');
  error.name = 'AbortError';
  throw error;
}

async function boundedRequest<T>(signal: AbortSignal, request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  throwIfCancelled(signal);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 8_000);
  try {
    return await request(controller.signal);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}

function waitForPoll(signal: AbortSignal): Promise<void> {
  throwIfCancelled(signal);
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      const error = new Error('TV connection cancelled.');
      error.name = 'AbortError';
      reject(error);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, 750);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Only a TV-page acknowledgement is success, never SSDP or a remote handshake. */
export async function connectSamsungTv(
  tv: NearbyTv,
  { signal, onProgress }: { signal: AbortSignal; onProgress: (message: string) => void },
): Promise<string> {
  if (tv.type !== 'samsung') throw new Error('Automatic browser launch is available only for compatible Samsung TVs.');
  throwIfCancelled(signal);
  onProgress('Preparing a private pairing room…');
  const room = await boundedRequest(signal, requestSignal => createCastRoom({ signal: requestSignal }));
  throwIfCancelled(signal);
  const target = new URL(buildTvRoomUrl(room));
  target.searchParams.set('auto', '1');
  onProgress('Look at your TV. If it asks, choose Allow for FrameCast using the TV remote.');
  // Native requests settle within a bounded approval window. Do not release the
  // caller's busy lock early if cancelled while the TV is still asking approval.
  await launchSamsungTvBrowser(tv.ip, target.toString());
  throwIfCancelled(signal);
  onProgress('Browser request sent. Waiting for the FrameCast page on your TV to confirm…');
  const deadline = Date.now() + 45_000;
  let networkFailures = 0;
  while (Date.now() < deadline) {
    throwIfCancelled(signal);
    try {
      const response = await boundedRequest(signal, requestSignal => getCastRoomMessages(room.id, { signal: requestSignal }));
      networkFailures = 0;
      throwIfCancelled(signal);
      if (response.messages.some(message => message.from === 'tv' && message.type === 'ready'
        && message.payload.action === 'tv-browser-ready' && message.payload.sessionId === room.id)) {
        return room.id;
      }
    } catch (error) {
      throwIfCancelled(signal);
      if (++networkFailures >= 3) {
        throw new Error('Could not confirm the TV connection. Check internet access on both devices, or enter the TV browser code.');
      }
    }
    await waitForPoll(signal);
  }
  throw new Error('The TV did not confirm opening FrameCast. Open its Internet browser at 2tx1.com and enter its code in this app. This model may not support remote browser launch.');
}

export async function discoverNearbySamsungTvs(): Promise<NearbySamsungTv[]> {
  if (Platform.OS !== 'android' || !nativeDiscovery?.discoverSamsungTvs) {
    throw new Error('Nearby TV scanning needs the updated Android FrameCast app.');
  }
  const results = await nativeDiscovery.discoverSamsungTvs();
  return results.filter((tv) =>
    typeof tv.ip === 'string'
    && isPrivateIpv4(tv.ip)
    && typeof tv.name === 'string'
    && typeof tv.model === 'string');
}

export function launchSamsungTvBrowser(ip: string, targetUrl: string): Promise<void> {
  if (!isPrivateIpv4(ip)) return Promise.reject(new Error('That TV is not on a private Wi-Fi network.'));
  if (Platform.OS !== 'android' || !nativeDiscovery?.openSamsungTvBrowser) {
    return Promise.reject(new Error('Automatic TV browser launch needs the updated Android FrameCast app.'));
  }
  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    return Promise.reject(new Error('The FrameCast TV address is invalid.'));
  }
  if (target.protocol !== 'https:' || target.hostname !== '2tx1.com'
    || target.username || target.password || (target.port && target.port !== '443')) {
    return Promise.reject(new Error('FrameCast can only open its own TV page on the television.'));
  }
  return nativeDiscovery.openSamsungTvBrowser(ip, target.toString());
}
