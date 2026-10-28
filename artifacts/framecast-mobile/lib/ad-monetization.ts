import { Platform } from 'react-native';

const AD_LOAD_TIMEOUT_MS = 60_000;
const ANDROID_INTERSTITIAL_UNIT_ID = 'ca-app-pub-9928204391830083/9055409035';

export async function manageAdPrivacyOptions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { AdsConsent } = await import('react-native-google-mobile-ads');
  const consent = await AdsConsent.gatherConsent();
  if (consent.privacyOptionsRequirementStatus !== 'REQUIRED') return false;
  await AdsConsent.showPrivacyOptionsForm();
  return true;
}

export type PairingInterstitialResult = 'shown' | 'cancelled' | 'unavailable';

export async function showPairingInterstitialAd(
  canShow: () => boolean,
): Promise<PairingInterstitialResult> {
  if (Platform.OS === 'web') return 'unavailable';

  const {
    AdsConsent,
    AdEventType,
    InterstitialAd,
    TestIds,
    default: mobileAds,
  } = await import('react-native-google-mobile-ads');

  const consent = await AdsConsent.gatherConsent();
  if (!consent.canRequestAds) return 'unavailable';
  const adUnitId = __DEV__
    ? TestIds.INTERSTITIAL
    : Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_UNIT_ID
      : ANDROID_INTERSTITIAL_UNIT_ID;
  if (!adUnitId) return 'unavailable';
  await mobileAds().initialize();

  return new Promise<PairingInterstitialResult>((resolve) => {
    const ad = InterstitialAd.createForAdRequest(adUnitId);
    const subscriptions: Array<() => void> = [];
    let settled = false;
    let showStarted = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: PairingInterstitialResult) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      subscriptions.forEach((unsubscribe) => unsubscribe());
      resolve(result);
    };

    timeout = setTimeout(() => finish('unavailable'), AD_LOAD_TIMEOUT_MS);
    subscriptions.push(ad.addAdEventListener(AdEventType.LOADED, () => {
      if (showStarted || settled) return;
      if (!canShow()) {
        finish('cancelled');
        return;
      }
      showStarted = true;
      void ad.show().catch(() => finish('unavailable'));
    }));
    subscriptions.push(ad.addAdEventListener(AdEventType.CLOSED, () => finish('shown')));
    subscriptions.push(ad.addAdEventListener(AdEventType.ERROR, () => finish('unavailable')));

    try {
      ad.load();
    } catch {
      finish('unavailable');
    }
  });
}
