import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

const ANDROID_BANNER_UNIT_ID = 'ca-app-pub-9928204391830083/3220542702';

type BannerAdApi = {
  Component: typeof import('react-native-google-mobile-ads').BannerAd;
  size: string;
  unitId: string;
};

type CastingBannerAdProps = {
  backgroundColor: string;
  borderColor: string;
};

export function CastingBannerAd({ backgroundColor, borderColor }: CastingBannerAdProps) {
  const [bannerAd, setBannerAd] = useState<BannerAdApi | null>(null);

  useEffect(() => {
    let active = true;
    if (Platform.OS !== 'android') return () => { active = false; };

    void (async () => {
      try {
        const { AdsConsent, BannerAd, BannerAdSize, TestIds } = await import('react-native-google-mobile-ads');
        const consentInfo = await AdsConsent.getConsentInfo();
        if (!active || !consentInfo.canRequestAds) return;

        const unitId = __DEV__
          ? TestIds.BANNER
          : ANDROID_BANNER_UNIT_ID;

        setBannerAd({
          Component: BannerAd,
          size: BannerAdSize.BANNER,
          unitId,
        });
      } catch (error) {
        if (__DEV__) {
          console.warn('FrameCast could not prepare the banner ad.', error);
        }
      }
    })();

    return () => { active = false; };
  }, []);

  if (!bannerAd) return null;
  const Ad = bannerAd.Component;

  return (
    <View
      style={[styles.container, { backgroundColor, borderTopColor: borderColor }]}
      testID="casting-banner-ad"
    >
      <Ad
        unitId={bannerAd.unitId}
        size={bannerAd.size}
        onAdFailedToLoad={(error) => {
          if (__DEV__) console.warn('FrameCast banner ad failed to load.', error.message);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 58,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
