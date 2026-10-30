import { Platform } from 'react-native';

const AD_LOAD_TIMEOUT_MS = 60_000;
const VIDEO_BREAK_AD_LOAD_TIMEOUT_MS = 15_000;
const APPODEAL_INIT_TIMEOUT_MS = 20_000;
const IOS_REWARDED_UNIT_ID = process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED_UNIT_ID ?? '';
let appodealInitialization: Promise<void> | null = null;

type AppodealModule = typeof import('react-native-appodeal');

export async function initializeAppodealAds(): Promise<AppodealModule | null> {
  if (Platform.OS !== 'android') return null;

  const appKey = process.env.EXPO_PUBLIC_APPODEAL_APP_KEY?.trim();
  if (!appKey) {
    throw new Error('The Appodeal app key is not configured for this Android build.');
  }

  const sdk = await import('react-native-appodeal');
  const adTypes = sdk.AppodealAdType.BANNER
    | sdk.AppodealAdType.INTERSTITIAL
    | sdk.AppodealAdType.REWARDED_VIDEO;

  if (sdk.default.isInitialized(adTypes)) return sdk;

  if (!appodealInitialization) {
    appodealInitialization = (async () => {
      sdk.default.setTesting(__DEV__);
      sdk.default.initialize(appKey, adTypes);

      const deadline = Date.now() + APPODEAL_INIT_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (sdk.default.isInitialized(adTypes)) return;
        await new Promise<void>((resolve) => setTimeout(resolve, 200));
      }
      throw new Error('Appodeal did not finish initializing in time.');
    })();
  }

  try {
    await appodealInitialization;
  } catch (error) {
    appodealInitialization = null;
    throw error;
  }

  return sdk;
}

export async function manageAdPrivacyOptions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    const sdk = await initializeAppodealAds();
    if (!sdk) return false;
    const appKey = process.env.EXPO_PUBLIC_APPODEAL_APP_KEY?.trim();
    if (!appKey) throw new Error('The Appodeal app key is not configured for this Android build.');
    await sdk.default.requestConsentInfoUpdate(appKey);
    if (sdk.default.privacyOptionsRequirementStatus() !== sdk.AppodealPrivacyOptionsStatus.REQUIRED) {
      return false;
    }
    await sdk.default.showPrivacyOptionsForm();
    return true;
  }
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
  if (Platform.OS === 'android') {
    return showAppodealRewardedAd(canShow, reportIssue);
  }

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
  if (Platform.OS === 'android') {
    return showAppodealInterstitialAd(canShow, reportIssue, timeoutMs);
  }

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
      : process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_UNIT_ID;
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

async function showAppodealRewardedAd(
  canShow: () => boolean,
  reportIssue: (message: string) => void,
): Promise<RewardedAdResult> {
  let sdk: AppodealModule;
  try {
    const initializedSdk = await initializeAppodealAds();
    if (!initializedSdk) return 'unavailable';
    sdk = initializedSdk;
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    reportIssue(detail
      ? `The Appodeal rewarded ad service could not start: ${detail}`
      : 'The Appodeal rewarded ad service could not start. Your selection is unchanged.');
    return 'unavailable';
  }

  const { default: appodeal, AppodealAdType, AppodealRewardedEvents } = sdk;
  const adType = AppodealAdType.REWARDED_VIDEO;

  return new Promise<RewardedAdResult>((resolve) => {
    const subscriptions: Array<{ remove: () => void }> = [];
    let settled = false;
    let showStarted = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: RewardedAdResult) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      subscriptions.forEach((subscription) => subscription.remove());
      resolve(result);
    };

    const showLoadedAd = () => {
      if (settled || showStarted) return;
      if (!canShow()) {
        finish('cancelled');
        return;
      }
      if (!appodeal.canShow(adType)) {
        reportIssue('Appodeal has no rewarded ad available right now. Your selection is unchanged.');
        finish('unavailable');
        return;
      }
      showStarted = true;
      try {
        appodeal.show(adType);
      } catch (error) {
        const detail = error instanceof Error ? error.message : '';
        reportIssue(detail
          ? `The Appodeal rewarded ad could not open: ${detail}`
          : 'The Appodeal rewarded ad could not open. Your selection is unchanged.');
        finish('unavailable');
      }
    };

    timeout = setTimeout(() => {
      reportIssue('The Appodeal rewarded ad timed out. Your selection is unchanged; try again later.');
      finish('unavailable');
    }, AD_LOAD_TIMEOUT_MS);

    subscriptions.push(
      appodeal.addEventListener(AppodealRewardedEvents.LOADED, showLoadedAd),
      appodeal.addEventListener(AppodealRewardedEvents.FAILED_TO_LOAD, () => {
        reportIssue('Appodeal could not find a rewarded ad right now. Your selection is unchanged.');
        finish('unavailable');
      }),
      appodeal.addEventListener(AppodealRewardedEvents.FAILED_TO_SHOW, () => {
        reportIssue('The Appodeal rewarded ad could not open. Your selection is unchanged.');
        finish('unavailable');
      }),
      appodeal.addEventListener(AppodealRewardedEvents.REWARD, () => finish('earned')),
      appodeal.addEventListener(AppodealRewardedEvents.CLOSED, () => {
        finish(showStarted ? 'cancelled' : 'unavailable');
      }),
      appodeal.addEventListener(AppodealRewardedEvents.EXPIRED, () => {
        reportIssue('The Appodeal rewarded ad expired before it could be shown. Your selection is unchanged.');
        finish('unavailable');
      }),
    );

    try {
      if (appodeal.isLoaded(adType)) {
        showLoadedAd();
      } else {
        appodeal.cache(adType);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      reportIssue(detail
        ? `The Appodeal rewarded ad request could not start: ${detail}`
        : 'The Appodeal rewarded ad request could not start. Your selection is unchanged.');
      finish('unavailable');
    }
  });
}

async function showAppodealInterstitialAd(
  canShow: () => boolean,
  reportIssue: (message: string) => void,
  timeoutMs: number,
): Promise<PairingInterstitialResult> {
  let sdk: AppodealModule;
  try {
    const initializedSdk = await initializeAppodealAds();
    if (!initializedSdk) return 'unavailable';
    sdk = initializedSdk;
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    reportIssue(detail
      ? `The Appodeal ad service could not start: ${detail}`
      : 'The Appodeal ad service could not start.');
    return 'unavailable';
  }

  const { default: appodeal, AppodealAdType, AppodealInterstitialEvents } = sdk;
  const adType = AppodealAdType.INTERSTITIAL;

  return new Promise<PairingInterstitialResult>((resolve) => {
    const subscriptions: Array<{ remove: () => void }> = [];
    let settled = false;
    let showStarted = false;
    let shown = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: PairingInterstitialResult) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      subscriptions.forEach((subscription) => subscription.remove());
      resolve(result);
    };

    const showLoadedAd = () => {
      if (settled || showStarted) return;
      if (!canShow()) {
        finish('cancelled');
        return;
      }
      if (!appodeal.canShow(adType)) {
        reportIssue('Appodeal has no interstitial ad available right now. Continuing without an ad.');
        finish('unavailable');
        return;
      }
      showStarted = true;
      try {
        appodeal.show(adType);
      } catch (error) {
        const detail = error instanceof Error ? error.message : '';
        reportIssue(detail
          ? `The Appodeal ad could not open: ${detail}`
          : 'The Appodeal ad could not open. Continuing without an ad.');
        finish('unavailable');
      }
    };

    timeout = setTimeout(() => {
      reportIssue('The Appodeal ad request timed out. Continuing without an ad.');
      finish('unavailable');
    }, timeoutMs);

    subscriptions.push(
      appodeal.addEventListener(AppodealInterstitialEvents.LOADED, showLoadedAd),
      appodeal.addEventListener(AppodealInterstitialEvents.FAILED_TO_LOAD, () => {
        reportIssue('Appodeal could not find an interstitial ad right now. Continuing without an ad.');
        finish('unavailable');
      }),
      appodeal.addEventListener(AppodealInterstitialEvents.FAILED_TO_SHOW, () => {
        reportIssue('The Appodeal ad could not open. Continuing without an ad.');
        finish('unavailable');
      }),
      appodeal.addEventListener(AppodealInterstitialEvents.SHOWN, () => {
        shown = true;
      }),
      appodeal.addEventListener(AppodealInterstitialEvents.CLOSED, () => {
        finish(shown ? 'shown' : 'unavailable');
      }),
      appodeal.addEventListener(AppodealInterstitialEvents.EXPIRED, () => {
        reportIssue('The Appodeal ad expired before it could be shown. Continuing without an ad.');
        finish('unavailable');
      }),
    );

    try {
      if (appodeal.isLoaded(adType)) {
        showLoadedAd();
      } else {
        appodeal.cache(adType);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      reportIssue(detail
        ? `The Appodeal ad request could not start: ${detail}`
        : 'The Appodeal ad request could not start. Continuing without an ad.');
      finish('unavailable');
    }
  });
}
