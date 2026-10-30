import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { initializeAppodealAds } from '@/lib/ad-monetization';

type AppodealBannerComponent = typeof import('react-native-appodeal').AppodealBanner;

type CastingBannerAdProps = {
  backgroundColor: string;
  borderColor: string;
};

export function CastingBannerAd({ backgroundColor, borderColor }: CastingBannerAdProps) {
  const [AppodealBanner, setAppodealBanner] = useState<AppodealBannerComponent | null>(null);

  useEffect(() => {
    let active = true;
    if (Platform.OS !== 'android') return () => { active = false; };

    void initializeAppodealAds()
      .then((sdk) => {
        if (active && sdk) setAppodealBanner(() => sdk.AppodealBanner);
      })
      .catch((error: unknown) => {
        if (__DEV__) console.warn('FrameCast could not prepare the Appodeal banner.', error);
      });

    return () => { active = false; };
  }, []);

  if (Platform.OS !== 'android' || !AppodealBanner) return null;

  return (
    <View
      style={[styles.container, { backgroundColor, borderTopColor: borderColor }]}
      testID="casting-banner-ad"
    >
      <AppodealBanner
        adSize="phone"
        onAdFailedToLoad={() => {
          if (__DEV__) console.warn('FrameCast Appodeal banner failed to load.');
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
