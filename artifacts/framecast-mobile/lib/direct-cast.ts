import { NativeModules, Platform } from 'react-native';
import type { NearbyTv } from './tv-discovery';

export type DirectTarget = { protocol: 'googlecast' | 'dlna' | 'amazonfling'; receiver: string; name: string };
export type DirectStatus = { state: string; position: number; duration: number };
type DirectNative = {
  connectDirect(protocol: string, receiver: string): Promise<void>;
  loadDirect(url: string, mime: string, title: string): Promise<void>;
  statusDirect(): Promise<DirectStatus>;
  controlDirect(action: string, position: number): Promise<void>;
  disconnectDirect(): Promise<void>;
};
const native = Platform.OS === 'android' ? NativeModules.FrameCastBackground as DirectNative | undefined : undefined;
export const directCastingAvailable = Boolean(native?.connectDirect);

export function getDirectTarget(tv: NearbyTv): DirectTarget | null {
  if (!directCastingAvailable) return null;
  if (tv.type === 'firetv' && tv.flingId) return { protocol: 'amazonfling', receiver: tv.flingId, name: tv.name };
  if (tv.type === 'chromecast' && tv.ip) return { protocol: 'googlecast', receiver: tv.ip, name: tv.name };
  if (tv.rendererId) return { protocol: 'dlna', receiver: tv.rendererId, name: tv.name };
  return null;
}
function requireNative() {
  if (!native?.connectDirect) throw new Error('Direct casting requires the updated installed Android app, not Expo Go.');
  return native;
}
export const connectDirect = (target: DirectTarget) => requireNative().connectDirect(target.protocol, target.receiver);
export const loadDirect = (url: string, mime: string, title: string) => requireNative().loadDirect(url, mime, title);
export const statusDirect = () => requireNative().statusDirect();
export const controlDirect = (action: string, position = 0) => requireNative().controlDirect(action, position);
export const disconnectDirect = () => requireNative().disconnectDirect();

export function directMediaMime(name: string, supplied?: string | null): string {
  if (supplied && /^(video|image)\/[a-z0-9.+-]+$/i.test(supplied)) return supplied;
  const extension = name.split(/[?#]/)[0].split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska',
    webm: 'video/webm', '3gp': 'video/3gpp', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', webp: 'image/webp', m3u8: 'application/x-mpegURL', mpd: 'application/dash+xml',
  };
  const mime = extension ? types[extension] : undefined;
  if (!mime) throw new Error('This media type is unknown. Choose an MP4 video or JPEG/PNG photo.');
  return mime;
}
