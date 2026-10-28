import { Platform } from 'react-native';

const AD_LOAD_TIMEOUT_MS = 60_000;

export type RewardedCastingAdResult = 'earned' | 'dismissed' | 'unavailable';

export async function manageAdPrivacyOptions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { AdsConsent } = await import('react-native-google-mobile-ads');
  const consent = await AdsConsent.gatherConsent();
  if (consent.privacyOptionsRequirementStatus !== 'REQUIRED') return false;
  await AdsConsent.showPrivacyOptionsForm();
  return true;
}

export async function showRewardedCastingAd(): Promise<RewardedCastingAdResult> {
  if (Platform.OS === 'web') return 'unavailable';

  const {
    AdsConsent,
    AdEventType,
    RewardedAd,
    RewardedAdEventType,
    TestIds,
    default: mobileAds,
  } = await import('react-native-google-mobile-ads');

  const consent = await AdsConsent.gatherConsent();
  if (!consent.canRequestAds) return 'unavailable';
  const adUnitId = __DEV__
    ? TestIds.REWARDED
    : Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED_UNIT_ID
      : process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_UNIT_ID;
  if (!adUnitId) return 'unavailable';
  await mobileAds().initialize();

  return new Promise<RewardedCastingAdResult>((resolve, reject) => {
    const ad = RewardedAd.createForAdRequest(adUnitId);
    const subscriptions: Array<() => void> = [];
    let earnedReward = false;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      subscriptions.forEach((unsubscribe) => unsubscribe());
      complete();
    };

    timeout = setTimeout(() => {
      finish(() => reject(new Error('The rewarded video took too long to load.')));
    }, AD_LOAD_TIMEOUT_MS);

    subscriptions.push(ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      void ad.show().catch((error: unknown) => {
        finish(() => reject(error instanceof Error ? error : new Error('The rewarded video could not be shown.')));
      });
    }));
    subscriptions.push(ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      earnedReward = true;
    }));
    subscriptions.push(ad.addAdEventListener(AdEventType.CLOSED, () => {
      finish(() => resolve(earnedReward ? 'earned' : 'dismissed'));
    }));
    subscriptions.push(ad.addAdEventListener(AdEventType.ERROR, (error) => {
      finish(() => reject(new Error(error.message || 'The rewarded video could not be loaded.')));
    }));

    try {
      ad.load();
    } catch (error) {
      finish(() => reject(error instanceof Error ? error : new Error('The rewarded video could not be loaded.')));
    }
  });
}
