import { Platform } from 'react-native';

const AD_LOAD_TIMEOUT_MS = 60_000;
const VIDEO_BREAK_AD_LOAD_TIMEOUT_MS = 15_000;
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
  reportIssue: (message: string) => void = () => undefined,
): Promise<PairingInterstitialResult> {
  return showInterstitialAdAtPlacement('pairing', canShow, reportIssue, AD_LOAD_TIMEOUT_MS);
}

export async function showBetweenVideoInterstitialAd(
  canShow: () => boolean,
  reportIssue: (message: string) => void = () => undefined,
): Promise<PairingInterstitialResult> {
  return showInterstitialAdAtPlacement('between-videos', canShow, reportIssue, VIDEO_BREAK_AD_LOAD_TIMEOUT_MS);
}

async function showInterstitialAdAtPlacement(
  placement: 'pairing' | 'between-videos',
  canShow: () => boolean,
  reportIssue: (message: string) => void,
  timeoutMs: number,
): Promise<PairingInterstitialResult> {
  if (Platform.OS === 'web') return 'unavailable';

  try {
    const {
      AdsConsent,
      AdEventType,
      InterstitialAd,
      TestIds,
      default: mobileAds,
    } = await import('react-native-google-mobile-ads');

    const consent = await AdsConsent.gatherConsent();
    if (!consent.canRequestAds) {
      reportIssue('Google ad consent is not complete, so no ad request was sent. Open Settings → Advertising privacy choices.');
      return 'unavailable';
    }
    const adUnitId = __DEV__
      ? TestIds.INTERSTITIAL
      : Platform.OS === 'ios'
        ? process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_UNIT_ID
        : ANDROID_INTERSTITIAL_UNIT_ID;
    if (!adUnitId) {
      reportIssue('This build does not have an ad unit configured.');
      return 'unavailable';
    }
    await mobileAds().initialize();

    return await new Promise<PairingInterstitialResult>((resolve) => {
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

      timeout = setTimeout(() => {
        reportIssue(placement === 'pairing'
          ? 'The ad request timed out. Check the phone’s internet connection and try pairing again.'
          : 'The ad request timed out. The next video will continue without an ad.');
        finish('unavailable');
      }, timeoutMs);
      subscriptions.push(ad.addAdEventListener(AdEventType.LOADED, () => {
        if (showStarted || settled) return;
        if (!canShow()) {
          finish('cancelled');
          return;
        }
        showStarted = true;
        void ad.show().catch((error: unknown) => {
          const detail = error instanceof Error ? error.message : '';
          reportIssue(detail ? `The ad loaded but could not open: ${detail}` : 'The ad loaded but could not open.');
          finish('unavailable');
        });
      }));
      subscriptions.push(ad.addAdEventListener(AdEventType.CLOSED, () => finish('shown')));
      subscriptions.push(ad.addAdEventListener(AdEventType.ERROR, (error) => {
        const errorCode = error.code || error.reason || 'unknown';
        reportIssue(`AdMob could not load the ad (error ${errorCode}). The app did contact the ad service.`);
        finish('unavailable');
      }));

      try {
        ad.load();
      } catch (error) {
        const detail = error instanceof Error ? error.message : '';
        reportIssue(detail ? `The ad request could not start: ${detail}` : 'The ad request could not start.');
        finish('unavailable');
      }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    reportIssue(detail ? `The ad service could not start: ${detail}` : 'The ad service could not start.');
    return 'unavailable';
  }
}
