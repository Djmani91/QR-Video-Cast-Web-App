import { Platform } from 'react-native';

const AD_LOAD_TIMEOUT_MS = 60_000;
const VIDEO_BREAK_AD_LOAD_TIMEOUT_MS = 15_000;
const ANDROID_INTERSTITIAL_UNIT_ID = 'ca-app-pub-9928204391830083/9055409035';
const ANDROID_REWARDED_UNIT_ID = 'ca-app-pub-9928204391830083/2258367710';
const IOS_REWARDED_UNIT_ID = process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED_UNIT_ID ?? '';

export async function manageAdPrivacyOptions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { AdsConsent } = await import('react-native-google-mobile-ads');
  const consent = await AdsConsent.gatherConsent();
  if (consent.privacyOptionsRequirementStatus !== 'REQUIRED') return false;
  await AdsConsent.showPrivacyOptionsForm();
  return true;
}

export type PairingInterstitialResult = 'shown' | 'cancelled' | 'unavailable';
export type RewardedAdResult = 'earned' | 'cancelled' | 'unavailable';

export async function showSelectionRewardedAd(
  canShow: () => boolean,
  reportIssue: (message: string) => void = () => undefined,
): Promise<RewardedAdResult> {
  if (Platform.OS === 'web') return 'unavailable';

  try {
    const {
      AdsConsent,
      AdEventType,
      RewardedAd,
      RewardedAdEventType,
      TestIds,
      default: mobileAds,
    } = await import('react-native-google-mobile-ads');

    const consent = await AdsConsent.gatherConsent();
    if (!consent.canRequestAds) {
      reportIssue('Google ad consent is not complete. You can still use one photo or video; update Advertising privacy choices to unlock more.');
      return 'unavailable';
    }

    const adUnitId = __DEV__
      ? TestIds.REWARDED
      : Platform.OS === 'android'
        ? ANDROID_REWARDED_UNIT_ID
        : IOS_REWARDED_UNIT_ID;
    if (!adUnitId) {
      reportIssue('Rewarded ads are not configured for this iPhone build yet. You can still choose one photo or video.');
      return 'unavailable';
    }

    await mobileAds().initialize();

    return await new Promise<RewardedAdResult>((resolve) => {
      const ad = RewardedAd.createForAdRequest(adUnitId);
      const subscriptions: Array<() => void> = [];
      let settled = false;
      let earned = false;
      let showStarted = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;

      const finish = (result: RewardedAdResult) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        subscriptions.forEach((unsubscribe) => unsubscribe());
        resolve(result);
      };

      timeout = setTimeout(() => {
        reportIssue('The rewarded ad took too long to load. Your current selection is unchanged; try again later.');
        finish('unavailable');
      }, AD_LOAD_TIMEOUT_MS);

      subscriptions.push(ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        if (showStarted || settled) return;
        if (!canShow()) {
          finish('cancelled');
          return;
        }
        showStarted = true;
        void ad.show().catch((error: unknown) => {
          const detail = error instanceof Error ? error.message : '';
          reportIssue(detail
            ? `The rewarded ad could not open: ${detail}`
            : 'The rewarded ad could not open. Your current selection is unchanged.');
          finish(earned ? 'earned' : 'unavailable');
        });
      }));
      subscriptions.push(ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      }));
      subscriptions.push(ad.addAdEventListener(AdEventType.CLOSED, () => {
        finish(earned ? 'earned' : 'cancelled');
      }));
      subscriptions.push(ad.addAdEventListener(AdEventType.ERROR, (error) => {
        const errorCode = error.code || error.reason || 'unknown';
        reportIssue(`AdMob could not load or show the rewarded ad (error ${errorCode}). Your current selection is unchanged.`);
        finish('unavailable');
      }));

      try {
        ad.load();
      } catch (error) {
        const detail = error instanceof Error ? error.message : '';
        reportIssue(detail
          ? `The rewarded ad request could not start: ${detail}`
          : 'The rewarded ad request could not start. Your current selection is unchanged.');
        finish('unavailable');
      }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    reportIssue(detail
      ? `The rewarded ad service could not start: ${detail}`
      : 'The rewarded ad service could not start. Your current selection is unchanged.');
    return 'unavailable';
  }
}

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
