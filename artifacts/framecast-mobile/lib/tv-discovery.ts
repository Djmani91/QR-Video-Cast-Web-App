import { NativeModules, Platform } from 'react-native';
import type { TvLaunchRoom } from './tv-room-url';

export type NearbySamsungTv = {
  ip: string;
  name: string;
  model: string;
};

type FrameCastTvDiscoveryModule = {
  discoverSamsungTvs?: () => Promise<NearbySamsungTv[]>;
  openSamsungTvBrowser?: (ip: string, url: string) => Promise<void>;
};

const nativeDiscovery = NativeModules.FrameCastBackground as FrameCastTvDiscoveryModule | undefined;
const PRIVATE_IPV4 = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

function isPrivateIpv4(ip: string) {
  if (!PRIVATE_IPV4.test(ip)) return false;
  return ip.split('.').every((octet) => Number(octet) <= 255);
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
  if (target.protocol !== 'https:' || target.hostname !== '2tx1.com') {
    return Promise.reject(new Error('FrameCast can only open its own TV page on the television.'));
  }
  return nativeDiscovery.openSamsungTvBrowser(ip, target.toString());
}
