import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const ANALYTICS_CONSENT_KEY = 'framecast.analyticsConsent.v1';

export type FrameCastCastMode = 'images' | 'video' | 'url' | 'screen_mirror';

let analyticsEnabled = false;
let consentInitialization: Promise<boolean> | null = null;

async function getAnalyticsModule() {
  return import('@react-native-firebase/analytics');
}

export function initializeAppAnalytics(): Promise<boolean> {
  if (consentInitialization) return consentInitialization;
  consentInitialization = (async () => {
    if (Platform.OS !== 'android') return false;
    try {
      const savedConsent = await AsyncStorage.getItem(ANALYTICS_CONSENT_KEY);
      analyticsEnabled = savedConsent === 'enabled';
      const module = await getAnalyticsModule();
      await module.setAnalyticsCollectionEnabled(module.getAnalytics(), analyticsEnabled);
      return analyticsEnabled;
    } catch (error) {
      analyticsEnabled = false;
      if (__DEV__) console.warn('FrameCast Analytics could not initialize.', error);
      return false;
    }
  })();
  return consentInitialization;
}

export async function setAppAnalyticsConsent(enabled: boolean): Promise<void> {
  if (Platform.OS !== 'android') return;
  await initializeAppAnalytics();

  if (enabled) {
    const module = await getAnalyticsModule();
    await module.setAnalyticsCollectionEnabled(module.getAnalytics(), true);
    await AsyncStorage.setItem(ANALYTICS_CONSENT_KEY, 'enabled');
    analyticsEnabled = true;
    return;
  }

  analyticsEnabled = false;
  await AsyncStorage.setItem(ANALYTICS_CONSENT_KEY, 'disabled');
  const module = await getAnalyticsModule();
  await module.setAnalyticsCollectionEnabled(module.getAnalytics(), false);
}

export async function trackPairingCompleted(): Promise<void> {
  if (Platform.OS !== 'android' || !(await initializeAppAnalytics())) return;
  if (!analyticsEnabled) return;
  try {
    const module = await getAnalyticsModule();
    await module.logEvent(module.getAnalytics(), 'framecast_pairing_completed');
  } catch (error) {
    if (__DEV__) console.warn('FrameCast pairing analytics event failed.', error);
  }
}

export async function trackCastStarted(mode: FrameCastCastMode): Promise<void> {
  if (Platform.OS !== 'android' || !(await initializeAppAnalytics())) return;
  if (!analyticsEnabled) return;
  try {
    const module = await getAnalyticsModule();
    await module.logEvent(module.getAnalytics(), 'framecast_cast_started', { cast_mode: mode });
  } catch (error) {
    if (__DEV__) console.warn('FrameCast casting analytics event failed.', error);
  }
}
